import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nextMaterialStatus } from "../server/lib/material-workflow-state.ts";

test("CM must approve before PM can approve", () => {
  assert.equal(nextMaterialStatus("pending_cm", "approve", ["CM"]), "pending_pm");
  assert.equal(nextMaterialStatus("pending_pm", "approve", ["ProjectManager"]), "approved");
  assert.throws(() => nextMaterialStatus("pending_cm", "approve", ["ProjectManager"]));
  assert.throws(() => nextMaterialStatus("pending_pm", "approve", ["CM"]));
});
test("either rejection returns Draft and cannot be approved without resubmission", () => {
  assert.equal(nextMaterialStatus("pending_cm", "reject", ["CM"]), "draft");
  assert.equal(nextMaterialStatus("pending_pm", "reject", ["ProjectManager"]), "draft");
  assert.throws(() => nextMaterialStatus("draft", "approve", ["CM", "ProjectManager"]));
});
test("unrelated roles cannot bypass review and approved requests cannot be reviewed again", () => {
  for (const role of ["Engineer", "Admin", "Staff"]) {
    assert.throws(() => nextMaterialStatus("pending_cm", "approve", [role]));
    assert.throws(() => nextMaterialStatus("pending_pm", "reject", [role]));
  }
  assert.throws(() => nextMaterialStatus("approved", "approve", ["CM", "ProjectManager"]));
  assert.throws(() => nextMaterialStatus("approved", "reject", ["ProjectManager"]));
});

test("MasterAdmin can approve or reject either stage while preserving workflow order", () => {
  assert.equal(nextMaterialStatus("pending_cm", "approve", ["MasterAdmin"]), "pending_pm");
  assert.equal(nextMaterialStatus("pending_pm", "approve", ["MasterAdmin"]), "approved");
  assert.equal(nextMaterialStatus("pending_cm", "reject", ["MasterAdmin"]), "draft");
  assert.equal(nextMaterialStatus("pending_pm", "reject", ["MasterAdmin"]), "draft");
  assert.throws(() => nextMaterialStatus("draft", "approve", ["MasterAdmin"]));
  assert.throws(() => nextMaterialStatus("approved", "approve", ["MasterAdmin"]));
});
