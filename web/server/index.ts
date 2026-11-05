import "dotenv/config";

import cors from "cors";
import { registerMaterialWorkflow } from "./lib/material-workflow";
import express, { type Request, type Response } from "express";
import { getAdminAuth, getAdminDb } from "./lib/firebase-admin";
import { mailFrom, transporter, verifyMailer } from "./lib/mail";
import { renderReportPdf, type ReportPdfInput } from "./lib/pdf";

export const app = express();
const port = Number(process.env.PORT || 3001);
const frontendAppUrl = process.env.FRONTEND_APP_URL || "http://localhost:3000";

const allowedOrigins = new Set(
  [
    frontendAppUrl,
    "https://cmg-construction-page.web.app",
    "https://cmg-construction-page.firebaseapp.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(!process.env.K_SERVICE && !process.env.FUNCTION_TARGET ? ["http://192.168.1.108:3000"] : []),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);
// รับ HTML ของรายงานเพื่อทำ PDF — เพดาน request ของ Cloud Functions คือ 10 MB
app.use(express.json({ limit: "8mb" }));

type EmailAttachment = {
  filename: string;
  path: string;
  contentType?: string;
};

function normalizeEmails(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);

  const emails = value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error(`${fieldName} contains an invalid email address`);
  }
  return [...new Set(emails)];
}

function normalizeAttachments(value: unknown): EmailAttachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("attachments must be an array");
  if (value.length > 20) throw new Error("attachments cannot contain more than 20 files");

  return value.map((item, index) => {
    const attachment = item as Partial<EmailAttachment>;
    const filename = String(attachment.filename || `attachment-${index + 1}`).trim();
    const path = String(attachment.path || "").trim();
    if (!path) throw new Error(`attachments[${index}].path is required`);
    let attachmentUrl: URL;
    try {
      attachmentUrl = new URL(path);
    } catch {
      throw new Error(`attachments[${index}].path must be a valid URL`);
    }
    if (attachmentUrl.protocol !== "https:" || attachmentUrl.hostname !== "firebasestorage.googleapis.com") {
      throw new Error(`attachments[${index}].path must use http or https`);
    }
    return {
      filename: filename.slice(0, 255),
      path,
      ...(attachment.contentType ? { contentType: String(attachment.contentType).slice(0, 100) } : {}),
    };
  });
}

type PdfRequest = ReportPdfInput & { filename: string };

function normalizePdfRequest(value: unknown): PdfRequest | null {
  if (value === undefined || value === null) return null;
  const pdf = value as Partial<Record<keyof PdfRequest, unknown>>;
  const html = String(pdf.html || "");
  if (!html) throw new Error("pdf.html is required");
  const baseUrl = String(pdf.baseUrl || "");
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    throw new Error("pdf.baseUrl must be a valid URL");
  }
  if (!allowedOrigins.has(origin)) throw new Error("pdf.baseUrl origin is not allowed");
  const list = (item: unknown, max: number) => (Array.isArray(item) ? item.map(String).slice(0, max) : []);
  const filename = String(pdf.filename || "daily-report.pdf").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return {
    filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
    html,
    htmlClass: String(pdf.htmlClass || "").slice(0, 500),
    bodyClass: String(pdf.bodyClass || "").slice(0, 500),
    lang: String(pdf.lang || "th").slice(0, 10),
    baseUrl: origin,
    stylesheets: list(pdf.stylesheets, 30),
    inlineStyles: list(pdf.inlineStyles, 30),
  };
}

async function authorizeSend(req: Request, projectId: string) {
  const authorization = req.header("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Unauthorized");

  const decoded = await getAdminAuth().verifyIdToken(authorization.slice("Bearer ".length));
  const email = decoded.email?.trim().toLowerCase();
  if (!email) throw new Error("Authenticated user has no email");

  const profile = await getAdminDb().doc(`Cmg-Cons-Page-Claude/root/users/${email}`).get();
  const data = profile.data() as { status?: unknown; role?: unknown; assignedProjects?: unknown } | undefined;
  const roles = Array.isArray(data?.role) ? data.role.map(String) : typeof data?.role === "string" ? [data.role] : [];
  const canSend = roles.some((role) => ["MasterAdmin", "Admin", "Executive", "ProjectManager", "Engineer", "QS"].includes(role));
  const canSeeProject = roles.some((role) => ["MasterAdmin", "Admin"].includes(role))
    || (Array.isArray(data?.assignedProjects) && data.assignedProjects.map(String).includes(projectId));

  if (data?.status !== "approved" || !canSend || !canSeeProject) throw new Error("Forbidden");
}

app.get(["/health", "/api/health"], async (_req: Request, res: Response) => {
  try {
    await verifyMailer();
    res.json({ ok: true, mailer: "ready" });
  } catch (error) {
    console.error("SMTP health check failed:", error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "SMTP health check failed" });
  }
});

app.post(["/send-email", "/api/send-email"], async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      projectId?: unknown;
      to?: unknown;
      cc?: unknown;
      subject?: unknown;
      text?: unknown;
      html?: unknown;
      attachments?: unknown;
      pdf?: unknown;
    };
    const projectId = String(body.projectId || "").trim();
    if (!projectId) throw new Error("projectId is required");
    await authorizeSend(req, projectId);
    const to = normalizeEmails(body.to, "to");
    const cc = normalizeEmails(body.cc, "cc").filter((email) => !to.includes(email));
    const subject = String(body.subject || "").trim();
    const text = String(body.text || "");
    const html = String(body.html || "");

    if (to.length === 0) throw new Error("At least one recipient is required");
    if (to.length > 20 || cc.length > 20) throw new Error("A maximum of 20 recipients is allowed per field");
    if (!subject) throw new Error("subject is required");
    if (!text && !html) throw new Error("text or html is required");
    if (subject.length > 500 || text.length > 100000 || html.length > 200000) {
      throw new Error("Email content is too large");
    }

    const pdfRequest = normalizePdfRequest(body.pdf);
    const pdfAttachment = pdfRequest
      ? { filename: pdfRequest.filename, content: await renderReportPdf(pdfRequest), contentType: "application/pdf" }
      : null;

    const info = await transporter.sendMail({
      from: mailFrom,
      to,
      ...(cc.length ? { cc } : {}),
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      attachments: [...(pdfAttachment ? [pdfAttachment] : []), ...normalizeAttachments(body.attachments)],
    });

    res.json({
      success: true,
      messageId: info.messageId,
      recipients: to.length + cc.length,
    });
  } catch (error) {
    console.error("SMTP send failed:", error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Email send failed" });
  }
});

registerMaterialWorkflow(app);

if (!process.env.K_SERVICE && !process.env.FUNCTION_TARGET) app.listen(port, () => {
  console.log(`SMTP email backend listening on http://localhost:${port}`);
});
