// ช่วงเวลาของรายงาน — คำนวณจากสตริงวันที่ YYYY-MM-DD ตรง ๆ (ไม่ขึ้นกับ timezone ของเครื่อง)

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export const isIsoDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v);
export const isIsoMonth = (v: unknown): v is string => typeof v === "string" && MONTH.test(v);

export function addDays(iso: string, days: number) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** สัปดาห์จันทร์–อาทิตย์ที่มีวันนี้อยู่ */
export function weekRange(iso: string) {
  const mondayOffset = (toDate(iso).getUTCDay() + 6) % 7;
  const from = addDays(iso, -mondayOffset);
  return { from, to: addDays(from, 6) };
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toIso(d).slice(0, 7);
}

export function monthLabel(month: string) {
  return toDate(`${month}-01`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
}
