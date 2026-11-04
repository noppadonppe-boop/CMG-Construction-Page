import { strict as assert } from "node:assert";
import { test } from "node:test";
import { manpowerSummaryVariables, manpowerVariables } from "../src/lib/dcr-manpower-variables.ts";

test("individual manpower fields remain bound to the role after reordering", () => {
  const pm = { label: "PM", total: 8, present: 5 };
  const engineer = { label: "Site Engineer", total: 3, present: 2 };
  const first = manpowerVariables("indirect", [pm, engineer]);
  const reordered = manpowerVariables("indirect", [engineer, pm]);
  const variables = first.filter(x => x.label.startsWith("C_PM_"));
  assert.deepEqual(variables.map(x => x.value), ["8", "5", "3"]);
  assert.deepEqual(variables.map(x => x.label.split(" · ")[0]), ["C_PM_Total", "C_PM_Work", "C_PM_Leave"]);
  for (const v of variables) assert.equal(reordered.find(x => x.key === v.key)?.value, v.value);
  assert.notEqual(manpowerVariables("direct", [pm])[0].key, variables[0].key);
  assert.equal(manpowerVariables("indirect", [{ ...pm, present: 10 }])[2].value, "0");
});

test("summary variables include each zone and follow stable column IDs", () => {
  const rows = [
    { label: "ช่างไม้", total: 5, present: 4, cols: { a: 2, b: 3 } },
    { label: "ช่างเหล็ก", total: 4, present: 3, cols: { a: 4 } },
  ];
  const columns = [{ id: "a", name: "Zone A" }, { id: "b", name: "Zone B" }, { id: "c", name: "Zone C" }];
  const result = manpowerSummaryVariables("direct", rows, columns);
  const get = (key) => result.find((v) => v.key === `C.manpower.direct.sum.${key}`)?.value;
  assert.deepEqual([get("Total"), get("Work"), get("Leave")], ["9", "7", "2"]);
  assert.deepEqual([get("Col.a"), get("Col.b"), get("Col.c")], ["6", "3", "0"]);
  const renamed = manpowerSummaryVariables("direct", rows, [{ id: "a", name: "พื้นที่ A" }]);
  assert.equal(renamed[3].key, result[3].key);
  assert.equal(renamed[3].value, "6");
  assert.match(renamed[3].label, /พื้นที่ A/);
});
