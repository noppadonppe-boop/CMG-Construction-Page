import { strict as assert } from "node:assert";
import { test } from "node:test";
import { blankMaterialSubmission, cleanMaterialSubmission, normalizeMaterialSubmission, validateMaterialSubmission, materialRequestFieldErrors, materialReceiptFieldErrors, MaterialFieldValidationError } from "../src/lib/material-submission.ts";
import { buildMaterialSubmissionDocument, materialSubmissionFilename } from "../src/lib/material-submission-document.ts";

const project = { name: "โครงการทดสอบ", location: "ระยอง", client: "เจ้าของโครงการ" };
const request = { no: "MR-078-001", description: "ข้อต่อเหล็ก / Rebar coupler", spec: "SD40", unit: "ชิ้น", quantity: 120, require_schedule: "2026-11-10", remark: "", created_at: "2026-11-04T01:00:00Z" };

test("submit reports all missing fields and the exact history/content row together", () => {
  const submission = blankMaterialSubmission({ ...project, name: " " }, "");
  submission.revision = "";
  submission.history = [{ revision: "", date: "2026-02-30", details: " " }];
  submission.contents = [{ title: "", page: "zero" }];
  const errors = materialRequestFieldErrors({ description: " ", unit: "", quantity: "", require_schedule: "", submission });
  assert.deepEqual(Object.keys(errors).sort(), ["description", "unit", "quantity", "require_schedule", "project_title", "revision", "submission_date", "history.0.revision", "history.0.date", "history.0.details", "contents.0.title", "contents.0.page"].sort());
  assert.deepEqual(new MaterialFieldValidationError(errors).fields, errors);
});

test("corrections and row removals clear errors without stale row indexes", () => {
  const submission = blankMaterialSubmission(project, "2026-11-04");
  submission.contents = [{ title: "Bad page", page: "0" }, { title: "Good page", page: "4-10" }];
  assert.ok(materialRequestFieldErrors({ ...request, submission })["contents.0.page"]);
  submission.contents.splice(0, 1);
  assert.deepEqual(materialRequestFieldErrors({ ...request, submission }), {});
  assert.deepEqual(materialRequestFieldErrors({ ...request, quantity: Infinity }), { quantity: "จำนวนต้องเป็นตัวเลขที่มากกว่า 0" });
});

test("PDF preview validates document fields without requiring operational fields", () => {
  const value = { ...request, unit: "", quantity: "", require_schedule: "" };
  assert.equal(Object.keys(materialRequestFieldErrors(value)).length, 3);
  assert.deepEqual(materialRequestFieldErrors(value, true), {});
  assert.ok(materialRequestFieldErrors({ ...value, description: " " }, true).description);
});

test("receipt validation maps over-receipt and invalid dates to their fields", () => {
  const value = { quantity: 12, receive_date: "", approval: "pending" };
  assert.deepEqual(Object.keys(materialReceiptFieldErrors(value, 10)), ["quantity", "receive_date"]);
  assert.deepEqual(materialReceiptFieldErrors({ ...value, approval: "rejected", receive_date: "2026-11-04" }, 10), {});
  assert.ok(materialReceiptFieldErrors({ ...value, quantity: NaN }, 10).quantity);
});

test("submission snapshots round-trip without changing project data or inventing legacy approval", () => {
  const value = blankMaterialSubmission(project, "2026-11-04", "ผู้จัดทำ");
  value.document_no = " MAR-CMG-J78-001 ";
  value.history = [{ revision: "R0", date: "2026-11-04", details: "ยื่นขอพิจารณา" }];
  const clean = cleanMaterialSubmission(value);
  assert.deepEqual(normalizeMaterialSubmission(JSON.parse(JSON.stringify(clean))), clean);
  assert.equal(clean.document_no, "MAR-CMG-J78-001");
  assert.equal(validateMaterialSubmission(clean), null);
  assert.equal(normalizeMaterialSubmission(undefined), null);
  assert.equal(value.document_no, " MAR-CMG-J78-001 ");
  const legacy = buildMaterialSubmissionDocument(project, request);
  assert.equal((legacy.match(/class="page"/g) || []).length, 3);
  assert.ok(legacy.includes("MR-078-001"));
  assert.ok(!legacy.includes("Submitted for consideration"));
});

test("invalid revision dates and contents fail before saving", () => {
  const value = blankMaterialSubmission(project, "2026-02-30");
  assert.ok(validateMaterialSubmission(value));
  value.submission_date = "2026-11-04";
  value.history = [{ revision: "R0", date: "2026-11-04", details: "" }];
  assert.ok(validateMaterialSubmission(value));
  value.history[0].details = "ส่งขออนุมัติ";
  value.contents = [{ title: "PRODUCT DATASHEET", page: "0" }];
  assert.ok(validateMaterialSubmission(value));
  value.contents[0].page = "4-10";
  assert.equal(validateMaterialSubmission(value), null);
});

test("PDF content is escaped, filenames are safe and every generated page has accurate numbering", () => {
  const submission = blankMaterialSubmission(project, "2026-11-04");
  submission.document_no = '<script>alert("x")</script>';
  submission.contents = [{ title: '<img src=x onerror="alert(1)">', page: "4" }];
  const r = { ...request, submission };
  const html = buildMaterialSubmissionDocument(project, r, true);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("DRAFT / ยังไม่ได้บันทึก"));
  for (const n of [1, 2, 3]) assert.ok(html.includes(`${n} of 3`));
  assert.ok(!/[<>:"/\\|?*]/.test(materialSubmissionFilename(r)));
});

test("large history and contents continue with headers and retain every row", () => {
  const submission = blankMaterialSubmission(project, "2026-11-04");
  submission.history = Array.from({ length: 30 }, (_, i) => ({ revision: `R${i}`, date: "2026-11-04", details: `${i} ${"รายละเอียด ".repeat(30)}` }));
  submission.contents = Array.from({ length: 60 }, (_, i) => ({ title: `Section ${i + 1}`, page: String(i + 4) }));
  const html = buildMaterialSubmissionDocument(project, { ...request, submission });
  const pages = (html.match(/class="page"/g) || []).length;
  assert.ok(pages > 3);
  assert.ok(html.includes(`${pages} of ${pages}`));
  assert.ok(html.includes("Section 60"));
  assert.ok(html.includes("R29"));
});

test("long project details receive a numbered continuation instead of an unnumbered overflow", () => {
  const submission = blankMaterialSubmission(project, "2026-11-04");
  for (const key of ["project_title", "owner", "pmc", "contractor", "subcontractor", "manufacturer"]) submission[key] = "W".repeat(200);
  const html = buildMaterialSubmissionDocument(project, { ...request, submission });
  assert.equal((html.match(/class="page"/g) || []).length, 4);
  assert.ok(html.includes("PROJECT DETAILS (continued)"));
  assert.ok(html.includes("4 of 4"));
});
