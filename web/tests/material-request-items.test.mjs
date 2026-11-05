import { strict as assert } from "node:assert";
import { test } from "node:test";
import { materialRequestRows } from "../src/lib/material-request-items.ts";
import { buildMaterialSubmissionDocument } from "../src/lib/material-submission-document.ts";

const base = { id: "request-1", no: "MR-001", description: "Steel", spec: "", quantity: 10, unit: "pcs", require_schedule: "2026-11-10", remark: "", files: [], receipts: [], created_at: "2026-11-05", created_by: "" };
const items = [{ ...base, id: "steel" }, { ...base, id: "cement", description: "Cement", area: "Building A", quantity: 20, unit: "bags", remark: "Keep dry" }];

test("items share one request number but isolate receipt history and row identity", () => {
  const request = { ...base, items, receipts: [{ id: "a", item_id: "steel", quantity: 3 }, { id: "b", item_id: "cement", quantity: 7 }] };
  const rows = materialRequestRows(request);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.no), ["MR-001", "MR-001"]);
  assert.deepEqual(rows.map((row) => row.request_id), ["request-1", "request-1"]);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.deepEqual(rows.map((row) => row.receipts.map((receipt) => receipt.id)), [["a"], ["b"]]);
  assert.equal(rows[1].unit, "bags");
  assert.equal(request.receipts.length, 2);
});

test("legacy requests preserve identity and untagged receipts", () => {
  const request = { ...base, receipts: [{ id: "legacy", quantity: 2 }] };
  assert.equal(materialRequestRows(request)[0], request);
});

test("one PDF includes every item and its operational details", () => {
  const html = buildMaterialSubmissionDocument({ name: "Project", location: "", client: "" }, { ...base, items });
  for (const text of ["Steel", "Cement", "Building A", "Keep dry", "bags", "MATERIAL ITEMS", "MR-001"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/class="page"/g) || []).length, 4);
  assert.ok(html.includes("4 of 4"));
});
