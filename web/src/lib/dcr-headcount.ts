import type { HeadcountRow } from "./dcr";

/** Attendance is the minimum known total. Counts are whole, non-negative people. */
export const headcountNumber = (value: number) => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
export function normalizeHeadcount(row: HeadcountRow): HeadcountRow {
  const present = headcountNumber(row.present);
  return { ...row, present, total: Math.max(headcountNumber(row.total), present) };
}
export function sumHeadcounts(rows: HeadcountRow[]) {
  return rows.reduce((sum, raw) => {
    const row = normalizeHeadcount(raw);
    return { total: sum.total + row.total, present: sum.present + row.present };
  }, { total: 0, present: 0 });
}
