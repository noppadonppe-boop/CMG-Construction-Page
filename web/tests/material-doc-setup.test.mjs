import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PageSizes, PDFName } from "pdf-lib";
import { buildMaterialRequestPdf } from "../src/lib/material-request-pdf.ts";
import { DEFAULT_MATERIAL_DOC_SETUP, normalizeMaterialDocSetup, selectMaterialDocProfile } from "../src/lib/material-doc-setup.ts";
import { blankMaterialSubmission } from "../src/lib/material-submission.ts";
const template = readFileSync(new URL("../Form/Request Rebar Materials 01.pdf", import.meta.url));
const font = readFileSync(new URL("../public/material-request/Sarabun-Regular.ttf", import.meta.url));
const project = { name: "โครงการก่อสร้างอาคารสำนักงาน", location: "กรุงเทพมหานคร", client: "บริษัท ตัวอย่าง จำกัด" };
const request = { no: "MR-001", description: "เหล็กเส้น", spec: "SD40", unit: "เส้น", quantity: 100, require_schedule: "2026-11-10", remark: "", created_at: "2026-11-05", submission: { ...blankMaterialSubmission(project, "2026-11-05", "วิศวกรโครงการ"), checked_by: "ผู้จัดการก่อสร้าง", approved_by: "ผู้จัดการโครงการ" } };
test("cover precedes filled template and follows configured paper and orientation", async () => {
  for (const paper of ["A4", "A3", "Letter"]) for (const orientation of ["portrait", "landscape"]) {
    const bytes = await buildMaterialRequestPdf(request, template, font, { project, setup: { ...DEFAULT_MATERIAL_DOC_SETUP, paper, orientation } });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    const expected = [...PageSizes[paper]];
    if (orientation === "landscape") expected.reverse();
    assert.deepEqual(pdf.getPage(0).getSize(), { width: expected[0], height: expected[1] });
    assert.equal(pdf.catalog.has(PDFName.of("AcroForm")), false);
    assert.equal(pdf.getPage(1).node.Annots()?.size() || 0, 0);
    if (paper === "A4" && orientation === "portrait") writeFileSync(new URL("../../tmp/pdfs/material-setup-check.pdf", import.meta.url), bytes);
  }
});
test("long cover content continues before all form pages without lost fields", async () => {
  const bytes = await buildMaterialRequestPdf({ ...request, items: Array.from({ length: 20 }, () => request), submission: { ...request.submission, location: "รายละเอียดสถานที่ ".repeat(100) } }, template, font, { project, setup: { ...DEFAULT_MATERIAL_DOC_SETUP, orientation: "landscape", font_size: 16, margin_top: 40, margin_bottom: 40 } });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 4);
  assert.equal(pdf.catalog.has(PDFName.of("AcroForm")), false);
  for (const page of pdf.getPages()) assert.equal(page.node.Annots()?.size() || 0, 0);
  writeFileSync(new URL("../../tmp/pdfs/material-setup-long-check.pdf", import.meta.url), bytes);
});
test("malformed saved settings use safe defaults and bounds", () => {
  const config = normalizeMaterialDocSetup({ paper: "bad", margin_left: -5, font_size: NaN, title: "  " });
  assert.equal(config.paper, "A4"); assert.equal(config.margin_left, 5); assert.equal(config.font_size, 11);
  assert.equal(config.title, DEFAULT_MATERIAL_DOC_SETUP.title);
});
test("named profiles normalize and override the active setup", () => {
  const config = normalizeMaterialDocSetup({ ...DEFAULT_MATERIAL_DOC_SETUP, title: "Base", profiles: [{ id: "cover-a", name: "Cover A", title: "Profile title", orientation: "landscape" }] });
  assert.equal(config.profiles.length, 1);
  assert.equal(config.profiles[0].name, "Cover A");
  const selected = selectMaterialDocProfile(config, "cover-a");
  assert.equal(selected.title, "Profile title");
  assert.equal(selected.orientation, "landscape");
  assert.equal(selected.profiles.length, 1);
});
