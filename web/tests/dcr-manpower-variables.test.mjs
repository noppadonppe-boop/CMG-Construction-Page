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
import { blankReport, defaultSettings, manpowerTotals, normalizeDcrRows } from "../src/lib/dcr.ts";
import { layoutVariables } from "../src/lib/dcr-layout-variables.ts";
import { normalizeHeadcount } from "../src/lib/dcr-headcount.ts";

test("screenshot regression: 18 staff attending with zero stored totals agree everywhere", () => {
  const report = blankReport("2026-11-04", defaultSettings(null));
  report.manpower.indirect = Array.from({ length: 18 }, (_, i) => ({ label: `Staff ${i + 1}`, total: 0, present: 1 }));
  const normalized = normalizeDcrRows(report);
  assert.deepEqual(manpowerTotals(normalized.manpower), {
    indirect: { total: 18, present: 18 }, direct: { total: 0, present: 0 }, total: 18, registered: 18, manHours: 144,
  });
  const vars = layoutVariables(report, {});
  const get = key => vars.find(v => v.key === key)?.value;
  assert.equal(get("C.manpower.indirect.sum.Total"), "18");
  assert.equal(get("C.manpower.indirect.sum.Work"), "18");
  assert.equal(get("C.manpower.indirect.sum.Leave"), "0");
  assert.equal(get("C.manpower.sum.total"), "18");
  assert.equal(get("C.manpower.sum.present"), "18");
  assert.equal(get("C.manpower.sum.leave"), "0");
  assert.equal(get("C.indirect_total"), Array(18).fill("1").join("\n"));
  assert.equal(get("C.indirect_leave"), Array(18).fill("0").join("\n"));
  assert.equal(get("C.manpower.indirect.staff%201.1.Total"), "1");
  assert.equal(report.manpower.indirect[0].total, 0, "reading variables must not mutate the report");
});

test("absences are summed per row and all H fields include custom columns", () => {
  const report = blankReport("2026-11-04", defaultSettings(null));
  report.manpower = {
    indirect: [{ label: "PM", total: 0, present: 1 }, { label: "Admin", total: 5, present: 2 }],
    direct: [{ label: "Labor", total: 7, present: 5, cols: { a: 3, b: 4 } }],
    direct_columns: [{ id: "a", name: "Zone A" }, { id: "b", name: "Zone B" }],
  };
  const vars = layoutVariables(report, {});
  const get = key => vars.find(v => v.key === key)?.value;
  assert.equal(new Set(vars.map(v => v.key)).size, vars.length);
  assert.equal(get("C.manpower.sum.total"), "13");
  assert.equal(get("C.manpower.sum.present"), "8");
  assert.equal(get("C.manpower.sum.leave"), "5");
  assert.equal(get("C.manpower.indirect.sum.Leave"), "3");
  assert.equal(get("C.direct_leave"), "2");
  for (const [id, value] of [["a", "3"], ["b", "4"]]) {
    assert.equal(get(`C.direct_col_${id}`), value);
    assert.equal(get(`C.manpower.direct.labor.1.Col.${id}`), value);
    assert.equal(get(`C.manpower.direct.sum.Col.${id}`), value);
  }
});

test("headcounts preserve existing absences and sanitize invalid counts", () => {
  assert.deepEqual(normalizeHeadcount({ label: "PM", total: 5, present: 2 }), { label: "PM", total: 5, present: 2 });
  assert.deepEqual(normalizeHeadcount({ label: "PM", total: -1, present: 2.8 }), { label: "PM", total: 2, present: 2 });
  assert.deepEqual(normalizeHeadcount({ label: "PM", total: NaN, present: Infinity }), { label: "PM", total: 0, present: 0 });
});
