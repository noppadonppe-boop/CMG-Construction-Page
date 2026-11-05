import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { buildMaterialRequestPdf, materialRequestFieldPages } from "../src/lib/material-request-pdf.ts";

const template = readFileSync(new URL("../Form/Request Rebar Materials 01.pdf", import.meta.url));
const font = readFileSync(new URL("../public/material-request/Sarabun-Regular.ttf", import.meta.url));
const request = { no: "MR-001", description: "เหล็กเส้น", spec: "SD40 DB16", unit: "เส้น", quantity: 120, require_schedule: "2026-11-10", remark: "", created_at: "2026-11-05T00:00:00Z", submission: { document_no: "CMG-MR-001", submission_date: "2026-11-05" } };

test("current form maps header separately, fills Thai rows, and clears all unused cells", async () => {
  const bytes = await buildMaterialRequestPdf(request, template, font);
  const pdf = await PDFDocument.load(bytes);
  const [fields] = materialRequestFieldPages(request);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.catalog.has(PDFName.of("AcroForm")), false);
  assert.equal(pdf.getPage(0).node.Annots()?.size() || 0, 0);
  for (const [name, value] of Object.entries({ fill_1: "1", fill_2: "เหล็กเส้น", fill_3: "SD40 DB16", fill_4: "เส้น", fill_5: "120", fill_6: "10/11/2026", fill_73: "CMG-MR-001", fill_74: "05/11/2026" })) {
    assert.equal(fields[name], value);
  }
  for (const name of ["fill_7", "fill_8", "fill_9", "fill_65", "fill_70", "fill_75"]) assert.equal(fields[name], "");
});

test("10 and 20 items continue in static pages without dropped rows", async () => {
  for (const count of [9, 10, 20]) {
    const items = Array.from({ length: count }, (_, i) => ({ ...request, description: `วัสดุ ${i + 1}`, remark: i % 2 ? `หมายเหตุ ${i + 1}` : "", area: i % 2 ? `อาคาร A ชั้น ${i + 1}` : "" }));
    const pdf = await PDFDocument.load(await buildMaterialRequestPdf({ ...request, items }, template, font));
    const pages = Math.ceil(count / 9);
    assert.equal(pdf.getPageCount(), pages);
    assert.equal(pdf.catalog.has(PDFName.of("AcroForm")), false);
    for (const page of pdf.getPages()) assert.equal(page.node.Annots()?.size() || 0, 0);
    const fieldPages = materialRequestFieldPages({ ...request, items });
    for (let i = 0; i < count; i++) {
      const fields = fieldPages[Math.floor(i / 9)];
      assert.equal(fields[`fill_${(i % 9) * 8 + 1}`], String(i + 1));
      assert.equal(fields[`fill_${(i % 9) * 8 + 2}`], `วัสดุ ${i + 1}`);
      assert.equal(fields[`fill_${(i % 9) * 8 + 8}`] || "", items[i].remark);
      assert.equal(fields[`fill_${(i % 9) * 8 + 7}`] || "", items[i].area);
    }
  }
});

test("legacy and draft requests use sensible headers and leave missing quantities/dates blank", () => {
  const [fields] = materialRequestFieldPages({ ...request, submission: null, quantity: 0, require_schedule: "" });
  assert.equal(fields.fill_73, "MR-001");
  assert.equal(fields.fill_74, "05/11/2026");
  assert.equal(fields.fill_5, "");
  assert.equal(fields.fill_6, "");
});
