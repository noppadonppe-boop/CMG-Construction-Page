import { readFile } from "node:fs/promises";
import path from "node:path";
import { appendMaterialRequestAttachments, buildMaterialRequestPdf } from "../../src/lib/material-request-pdf";
import type { SubmissionDocumentRequest } from "../../src/lib/material-submission-document";
import type { SubmissionProject } from "../../src/lib/material-submission";
import { normalizeMaterialDocSetup, selectMaterialDocProfile } from "../../src/lib/material-doc-setup";
import { materialCoverHtml } from "../../src/lib/material-cover-html";
import { renderReportPdf } from "./pdf";
import { PDFDocument } from "pdf-lib";

export async function renderMaterialRequestPdf(request: SubmissionDocumentRequest, project: SubmissionProject, setup?: unknown): Promise<Buffer> {
  const [template, font] = await Promise.all([
    readFile(path.resolve(__dirname, "../../Form/Request Rebar Materials 01.pdf")),
    readFile(path.resolve(__dirname, "../../public/material-request/Sarabun-Regular.ttf")),
  ]);
  const config = selectMaterialDocProfile(normalizeMaterialDocSetup(setup), request.document_profile_id);
  let output: PDFDocument;
  if (config.pages) {
    if (!config.pages.length || config.pages.length > 20 || config.pages.some(p => p.slots.length > 100)) throw new Error("กำหนดใบปะหน้า 1–20 หน้า และไม่เกิน 100 กล่องต่อหน้า");
    for (const slot of config.pages.flatMap(page => page.slots)) {
      if (slot.image) {
        const url = new URL(slot.image.url);
        if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") throw new Error("รูปภาพต้องมาจาก Storage ของโครงการ");
      }
    }
    const document = materialCoverHtml(project, request, config, font.toString("base64"));
    const cover = await renderReportPdf({ ...document, inlineStyles: [document.css], stylesheets: [], htmlClass: "", bodyClass: "", lang: "th", baseUrl: "https://cmg-construction-page.web.app" });
    output = await PDFDocument.load(cover);
    const form = await PDFDocument.load(await buildMaterialRequestPdf(request, template, font));
    for (const page of await output.copyPages(form, form.getPageIndices())) output.addPage(page);
  } else {
    output = await PDFDocument.load(await buildMaterialRequestPdf(request, template, font, { project, setup: config }));
  }
  await appendMaterialRequestAttachments(output, request.files || []);
  return Buffer.from(await output.save());
}
