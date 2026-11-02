import { strict as assert } from "node:assert";
import { test } from "node:test";
import { manpowerVariables } from "../src/lib/dcr-manpower-variables.ts";

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
