import type { Express } from "express";
import type { SubmissionDocumentRequest } from "../../src/lib/material-submission-document";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { nextMaterialStatus, type RequestStatus } from "./material-workflow-state";
import { mailFrom, transporter } from "./mail";
import { renderMaterialRequestPdf } from "./material-request-pdf";
import type { SubmissionProject } from "../../src/lib/material-submission";

const root = "Cmg-Cons-Page-Claude/root";
const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Uses only the saved Material email configuration and the approved document. */
async function sendMaterialEmail(projectId: string, requestId: string) {
  const db = getAdminDb();
  const ref = db.doc(`${root}/projects/${projectId}/material_requests/${requestId}`);
  const locked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || data.workflow_status !== "approved") throw new Error("Request ยังไม่ได้รับอนุมัติจาก PM");
    if (data.email_status === "sent" || data.email_status === "sending") return false;
    tx.update(ref, { email_status: "sending", email_error: "", email_started_at: FieldValue.serverTimestamp() });
    return true;
  });
  if (!locked) return;
  try {
    const [requestSnap, setupSnap, projectSnap] = await Promise.all([ref.get(), db.doc(`${root}/projects/${projectId}/email_setup/material`).get(), db.doc(`${root}/projects/${projectId}`).get()]);
    const request = requestSnap.data()!;
    const setup = setupSnap.data();
    const project = projectSnap.data()!;
    if (!setup) throw new Error("กรุณาตั้งค่า Setup Email แท็บ Material");
    const contacts = new Map<string, string>((setup.contacts || []).map((c: { id: string; email: string }) => [c.id, c.email.trim().toLowerCase()]));
    const resolve = (ids: string[]) => [...new Set(ids.map((id) => contacts.get(id)).filter((email): email is string => Boolean(email)))];
    const to = resolve(setup.to || []);
    const cc = resolve(setup.cc || []).filter((email) => !to.includes(email));
    if (!to.length) throw new Error("ยังไม่ได้ตั้งค่าผู้รับใน Setup Email แท็บ Material");
    if (to.length > 20 || cc.length > 20 || [...to, ...cc].some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("รายชื่อผู้รับอีเมลไม่ถูกต้อง");
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    const replace = (value: string) => value.replaceAll("{code}", project.code || "").replaceAll("{project}", project.name || "").replaceAll("{date}", date);
    const profile = setup.subject_mode === "custom" ? (setup.profiles || []).find((p: { id: string }) => p.id === setup.selected_profile_id) : undefined;
    const subject = setup.subject_mode === "custom" ? replace(profile?.subject || setup.subject || request.no) : `[${project.code}] Material Request ${request.no} - ${project.name}`;
    const items: { area?: string; description: string; spec: string; quantity: number; unit: string; require_schedule: string; remark: string }[] = request.items?.length ? request.items : [request];
    const text = [profile ? replace(profile.title || "") + "\n" + replace(profile.body || "") : `Material Request ${request.no} ได้รับอนุมัติแล้ว`, `โครงการ: ${project.name}`, `CM: ${request.submission?.checked_by || ""}`, `PM: ${request.submission?.approved_by || ""}`, ...items.map((item) => `${item.description} / ${item.spec} — พื้นที่: ${item.area || "–"} — ${item.quantity} ${item.unit} — ${item.require_schedule} — ${item.remark}`)].join("\n");
    const html = `<h2>${esc(request.no)} · ${esc(project.name)}</h2><p style="white-space:pre-wrap">${esc(text)}</p>`;
    const attachments: { filename: string; path?: string; content?: Buffer; contentType?: string }[] = (setup.files || []).map((file: { file_name: string; url: string }) => {
      const url = new URL(file.url);
      if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") throw new Error("URL ไฟล์แนบไม่ถูกต้อง");
      return { filename: file.file_name, path: file.url };
    });
    if (attachments.length > 20) throw new Error("แนบไฟล์ได้ไม่เกิน 20 ไฟล์");
    if (setup.attach_report_pdf !== false) {
      const docSetup = await db.doc(`${root}/projects/${projectId}/document_setup/material`).get();
      attachments.unshift({ filename: `${request.no}.pdf`, contentType: "application/pdf", content: await renderMaterialRequestPdf({ ...request, created_at: request.created_at?.toDate?.().toISOString() || "" } as SubmissionDocumentRequest, project as SubmissionProject, docSetup.data()) });
    }
    const result = await transporter.sendMail({ from: mailFrom, to, cc, subject, text, html, attachments });
    await ref.update({ email_status: "sent", email_sent_at: FieldValue.serverTimestamp(), email_message_id: result.messageId, email_error: "" });
  } catch (error) {
    await ref.update({ email_status: "failed", email_error: error instanceof Error ? error.message : "ส่งอีเมลไม่สำเร็จ" });
    throw error;
  }
}

export function registerMaterialWorkflow(app: Express) {
  app.post("/api/material-document-preview", async (req, res) => {
    try {
      const { projectId, request, setup } = req.body;
      if (typeof projectId !== "string" || !projectId || projectId.includes("/")) throw new Error("รหัสโครงการไม่ถูกต้อง");
      const token = req.header("authorization") || "";
      if (!token.startsWith("Bearer ")) throw new Error("Unauthorized");
      const decoded = await getAdminAuth().verifyIdToken(token.slice(7));
      const email = decoded.email?.toLowerCase();
      if (!email) throw new Error("Unauthorized");
      const db = getAdminDb();
      const [profileSnap, projectSnap] = await Promise.all([db.doc(`${root}/users/${email}`).get(), db.doc(`${root}/projects/${projectId}`).get()]);
      const profile = profileSnap.data();
      if (profile?.status !== "approved" || !projectSnap.exists || (!profile.role?.some((role: string) => ["MasterAdmin", "Admin"].includes(role)) && !profile.assignedProjects?.includes(projectId))) throw new Error("ไม่มีสิทธิ์ในโครงการนี้");
      if (!request || typeof request.created_at !== "string" || typeof request.no !== "string") throw new Error("ข้อมูล Request ไม่ถูกต้อง");
      const pdf = await renderMaterialRequestPdf(request, projectSnap.data() as SubmissionProject, setup);
      res.type("application/pdf").send(pdf);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "สร้าง PDF ไม่สำเร็จ" }); }
  });
  /**
   * Proxies one PDF attachment from this project's Storage folder so the browser can render its pages
   * (direct browser fetches from Firebase Storage are blocked by bucket CORS).
   */
  app.post("/api/material-attachment", async (req, res) => {
    try {
      const { projectId, url } = req.body;
      if (typeof projectId !== "string" || !projectId || projectId.includes("/")) throw new Error("รหัสโครงการไม่ถูกต้อง");
      const token = req.header("authorization") || "";
      if (!token.startsWith("Bearer ")) throw new Error("Unauthorized");
      const decoded = await getAdminAuth().verifyIdToken(token.slice(7));
      const email = decoded.email?.toLowerCase();
      if (!email) throw new Error("Unauthorized");
      const db = getAdminDb();
      const [profileSnap, projectSnap] = await Promise.all([db.doc(`${root}/users/${email}`).get(), db.doc(`${root}/projects/${projectId}`).get()]);
      const profile = profileSnap.data();
      if (profile?.status !== "approved" || !projectSnap.exists || (!profile.role?.some((role: string) => ["MasterAdmin", "Admin"].includes(role)) && !profile.assignedProjects?.includes(projectId))) throw new Error("ไม่มีสิทธิ์ในโครงการนี้");
      // Only Firebase Storage download URLs for objects inside this project's folder (no open proxy / SSRF).
      if (typeof url !== "string") throw new Error("URL ไฟล์แนบไม่ถูกต้อง");
      const parsed = new URL(url);
      const objectPath = decodeURIComponent(parsed.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/)?.[1] || "");
      if (parsed.protocol !== "https:" || parsed.hostname !== "firebasestorage.googleapis.com" || !objectPath.startsWith(`${root}/projects/${projectId}/`) || objectPath.includes("..")) throw new Error("URL ไฟล์แนบไม่ถูกต้อง");
      const response = await fetch(parsed, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("โหลดไฟล์แนบไม่สำเร็จ");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("ไฟล์แนบมีขนาดเกิน 20 MB");
      if (!bytes.subarray(0, 1024).includes("%PDF")) throw new Error("ไฟล์แนบไม่ใช่ PDF");
      res.type("application/pdf").set("Cache-Control", "private, max-age=300").send(bytes);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "โหลดไฟล์แนบไม่สำเร็จ" }); }
  });
  app.post("/api/material-workflow", async (req, res) => {
    try {
      const { projectId, requestId, action, version, reason = "" } = req.body;
      if (![projectId, requestId].every((value) => typeof value === "string" && value.length > 0 && !value.includes("/"))) throw new Error("รหัสโครงการหรือ Request ไม่ถูกต้อง");
      if (!["approve", "reject", "retry_email"].includes(action)) throw new Error("คำสั่งไม่ถูกต้อง");
      const token = req.header("authorization") || "";
      if (!token.startsWith("Bearer ")) throw new Error("Unauthorized");
      const decoded = await getAdminAuth().verifyIdToken(token.slice(7));
      const email = decoded.email?.toLowerCase();
      if (!email) throw new Error("Unauthorized");
      const db = getAdminDb();
      const ref = db.doc(`${root}/projects/${projectId}/material_requests/${requestId}`);
      const result = await db.runTransaction(async (tx) => {
        const [profileSnap, snap] = await Promise.all([tx.get(db.doc(`${root}/users/${email}`)), tx.get(ref)]);
        const profile = profileSnap.data();
        const data = snap.data();
        if (!profile || profile.status !== "approved" || !data) throw new Error("Forbidden");
        const roles: string[] = Array.isArray(profile.role) ? profile.role : [];
        if (!roles.some((role) => ["MasterAdmin", "Admin"].includes(role)) && !profile.assignedProjects?.includes(projectId)) throw new Error("ไม่มีสิทธิ์ในโครงการนี้");
        if (action === "retry_email") {
          if ((!roles.includes("ProjectManager") && !roles.includes("MasterAdmin")) || data.workflow_status !== "approved") throw new Error("Forbidden");
          return "approved";
        }
        if (data.workflow_version !== version) throw new Error("รายการเปลี่ยนไปแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
        const status = nextMaterialStatus(data.workflow_status as RequestStatus, action, roles);
        if (typeof reason !== "string" || reason.length > 500 || (action === "reject" && !reason.trim())) throw new Error("กรุณาระบุเหตุผล Reject ไม่เกิน 500 ตัวอักษร");
        const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || email;
        const submission = { ...data.submission, reviewed_by: "" };
        if (status === "draft") { submission.checked_by = ""; submission.approved_by = ""; }
        else if (status === "pending_pm") submission.checked_by = name;
        else submission.approved_by = name;
        tx.update(ref, { workflow_status: status, workflow_version: version + 1, submission, rejection_reason: action === "reject" ? reason.trim() : "", approval_history: FieldValue.arrayUnion({ stage: data.workflow_status === "pending_cm" ? "CM" : "PM", action, email, name, reason: reason.trim(), at: new Date().toISOString() }), ...(status === "approved" ? { email_status: "pending" } : {}), updated_at: FieldValue.serverTimestamp(), updated_by: email });
        return status;
      });
      let emailError = "";
      if (result === "approved") {
        try { await sendMaterialEmail(projectId, requestId); } catch (error) { emailError = error instanceof Error ? error.message : "ส่งอีเมลไม่สำเร็จ"; }
      }
      res.json({ success: true, status: result, emailError });
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ" });
    }
  });
}
