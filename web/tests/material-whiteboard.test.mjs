import { strict as assert } from "node:assert";
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { defaultMaterialCoverPages, materialCoverVariables } from "../src/lib/material-cover-layout.ts";
import { materialCoverHtml } from "../src/lib/material-cover-html.ts";
import { DEFAULT_MATERIAL_DOC_SETUP, normalizeMaterialDocSetup } from "../src/lib/material-doc-setup.ts";
import { layoutPagesForStore, newSlot } from "../src/lib/dcr-layout.ts";
import { renderMaterialRequestPdf } from "../server/lib/material-request-pdf.ts";
const project = { name: "โครงการทดสอบ Whiteboard", location: "กรุงเทพมหานคร", client: "เจ้าของโครงการ" };
const request = { no: "MR-WB-001", description: "เหล็กเส้น", spec: "SD40", unit: "เส้น", quantity: 100, require_schedule: "2026-11-10", remark: "", created_at: "2026-11-05" };

test("whiteboard settings round-trip nested table cells and variable geometry through Firestore format", () => {
 const pages = defaultMaterialCoverPages(DEFAULT_MATERIAL_DOC_SETUP);
 pages[0].slots.push(newSlot({ kind: "table", cells: [["A", "B"], ["1", "2"]], x: 25, y: 40, w: 50, h: 20 }));
 const normalized = normalizeMaterialDocSetup({ ...DEFAULT_MATERIAL_DOC_SETUP, pages: layoutPagesForStore(pages) });
 assert.deepEqual(normalized.pages, pages);
 assert.equal(materialCoverVariables(project, request).find(v => v.key === "request.document_no").value, "MR-WB-001");
 const variables = materialCoverVariables(project, { ...request, submission: { contents: [
   { title: "หัวข้อหนึ่ง", page: "4-10" }, { title: "หัวข้อสอง", page: "11" },
   { title: "หัวข้อสาม", page: "12" }, { title: "หัวข้อสี่", page: "13" },
   { title: "หัวข้อห้า", page: "14" }, { title: "หัวข้อหก", page: "15" },
 ] } });
 const toc = variables.filter(v => /^request\.contents\.\d+$/.test(v.key));
 const contentPages = variables.filter(v => /^request\.contents\.\d+\.page$/.test(v.key));
 assert.equal(toc.length, 6);
 assert.equal(contentPages.length, 6);
 assert.deepEqual(toc.map(v => v.value), ["หัวข้อหนึ่ง", "หัวข้อสอง", "หัวข้อสาม", "หัวข้อสี่", "หัวข้อห้า", "หัวข้อหก"]);
 assert.deepEqual(contentPages.map(v => v.value), ["4-10", "11", "12", "13", "14", "15"]);
 const html = materialCoverHtml(project, { ...request, no: "<script>alert(1)</script>" }, normalized, "");
 assert.ok(!html.html.includes("<script>"));
 assert.ok(html.html.includes("&lt;script&gt;"));
 assert.ok(html.html.includes("left:25%;top:40%;width:50%;height:20%"));
});

test("saved whiteboard renders before populated Request Form, including mixed paper orientations", async () => {
 const pages = defaultMaterialCoverPages(DEFAULT_MATERIAL_DOC_SETUP);
 pages.push({ id: "details", size: "A3", orientation: "landscape", slots: [
   newSlot({ kind: "shape", x: 5, y: 5, w: 30, h: 15, shape_color: "#aaddff" }),
   newSlot({ kind: "text", x: 5, y: 5, w: 50, h: 15, text: "ข้อความจัดวางอิสระ", text_font_size: 24, border: false }),
   newSlot({ kind: "table", x: 5, y: 25, w: 80, h: 35, cells: [["รายการ", "จำนวน"], ["ทดสอบตาราง", "100"]] }),
   newSlot({ kind: "custom", custom: "sign", x: 5, y: 65, w: 35, h: 25, title: "ผู้อนุมัติ", text: "ผู้จัดการโครงการ" }),
 ] });
 const bytes = await renderMaterialRequestPdf(request, project, { ...DEFAULT_MATERIAL_DOC_SETUP, pages });
 const pdf = await PDFDocument.load(bytes);
 assert.equal(pdf.getPageCount(), 3);
 assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595) < 2);
 assert.ok(Math.abs(pdf.getPage(1).getWidth() - 1191) < 2);
 writeFileSync(new URL("../../tmp/pdfs/material-whiteboard-check.pdf", import.meta.url), bytes);
});

test("Request attachments are appended after the Request Form pages", async () => {
 const attached = await PDFDocument.create();
 attached.addPage([400, 300]);
 const attachedBytes = await attached.save();
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async () => new Response(attachedBytes, { status: 200, headers: { "content-type": "application/pdf" } });
 try {
  const bytes = await renderMaterialRequestPdf({ ...request, files: [{ file_name: "catalogue.pdf", url: "https://firebasestorage.googleapis.com/v0/b/test/o/catalogue.pdf?alt=media" }] }, project);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 3);
  assert.deepEqual(pdf.getPage(2).getSize(), { width: 400, height: 300 });
 } finally {
  globalThis.fetch = originalFetch;
 }
});
