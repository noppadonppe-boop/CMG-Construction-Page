/** รูปแบบรายงานประจำวันในระบบ — เพิ่มรูปแบบใหม่ (CMG2, ...) ที่นี่ แล้วจะขึ้นเป็นตัวเลือกในหน้าเพิ่มแบบฟอร์ม */
export const DAILY_REPORT_TEMPLATES = {
  cmg1: { label: "รูปแบบมาตรฐาน CMG1", detail: "Daily report A–G สำเร็จรูปของระบบ" },
} as const;
export type DailyReportTemplate = keyof typeof DAILY_REPORT_TEMPLATES;
export const DAILY_REPORT_TEMPLATE_KEYS = Object.keys(DAILY_REPORT_TEMPLATES) as DailyReportTemplate[];

/** รหัสรูปแบบเดิมก่อนมี CMG1 — ข้อมูลเก่าที่เก็บรหัสนี้ถือเป็น CMG1 */
const LEGACY_TEMPLATES: Record<string, DailyReportTemplate> = { "construction-dcr-v1": "cmg1" };

export function normalizeDailyTemplate(value: unknown): DailyReportTemplate | null {
  if (typeof value !== "string") return null;
  if (value in DAILY_REPORT_TEMPLATES) return value as DailyReportTemplate;
  return LEGACY_TEMPLATES[value] ?? null;
}

/** หัวข้อของรูปแบบ CMG1 ตามลำดับ — "project" (A) บังคับใช้ ที่เหลือเปิด/ปิดได้ในแบบฟอร์มมาตรฐาน */
export const DAILY_REPORT_STANDARD_SECTIONS = [
  { key: "project", number: "A", title: "ข้อมูลโครงการ", en: "Project information", detail: "Project Name, Project No., Client, Main Contractor, Subcontractor, Date, Doc. no." },
  { key: "weather", number: "B", title: "รายงานสภาพอากาศ", en: "Weather report", detail: "เช้า–บ่าย สถานะการทำงาน อุณหภูมิ ปริมาณฝน ชั่วโมงสูญเสีย และสภาพพื้นที่" },
  { key: "manpower", number: "C", title: "กำลังคนและเครื่องจักร", en: "Manpower & equipment on site", detail: "Indirect และ Direct manpower (ซ้าย) · Equipment on site (ขวา)" },
  { key: "activities", number: "D", title: "งานที่ดำเนินการวันนี้", en: "Today's activities", detail: "พื้นที่ หมวดงาน รายละเอียด ปริมาณวันนี้และยอดสะสม" },
  { key: "issues", number: "E", title: "ปัญหาและอุปสรรค", en: "Problems & obstacles", detail: "สาเหตุ ผลกระทบ ผู้รับผิดชอบ และแนวทางแก้ไข" },
  { key: "tomorrow", number: "F", title: "งานที่วางแผนวันพรุ่งนี้", en: "Tomorrow's plan", detail: "งาน กำลังคน และทรัพยากร/การขอตรวจที่ต้องเตรียม" },
  { key: "attachments", number: "G", title: "เอกสารแนบ / ภาพประกอบ", en: "Attachments", detail: "รูปถ่ายพร้อมคำบรรยาย อ้างอิงกับรายการงานในหัวข้อ D" },
  { key: "layout", number: "H", title: "เอกสารแนบ (จัดหน้า)", en: "Attachment pages", detail: "หน้า A4/A3 ตั้ง/นอน แบ่งช่องข้อความ รูปภาพ หรือ Custom style จัดวางเอง บันทึกเป็นแม่แบบของโครงการ" },
] as const;
export type DailySectionKey = (typeof DAILY_REPORT_STANDARD_SECTIONS)[number]["key"];
/** หัวข้อที่เปิด/ปิดได้ */
export type DailySection = Exclude<DailySectionKey, "project">;
export const OPTIONAL_DAILY_SECTIONS = DAILY_REPORT_STANDARD_SECTIONS.map((s) => s.key).filter((k): k is DailySection => k !== "project");

/** อ่านรายการหัวข้อที่เปิดใช้ — null = เปิดทุกหัวข้อ (ข้อมูลเดิมก่อนมีตัวเลือกนี้) */
export function normalizeDailySections(value: unknown): DailySection[] | null {
  if (!Array.isArray(value)) return null;
  return OPTIONAL_DAILY_SECTIONS.filter((k) => value.includes(k));
}

/** ตัวอักษรของแต่ละหัวข้อหลังตัดหัวข้อที่ปิดออก (เรียง A, B, C ... ใหม่) — หัวข้อที่ปิดไม่มีในผลลัพธ์ */
export function sectionLetters(enabled: readonly DailySection[] | null | undefined): Partial<Record<DailySectionKey, string>> {
  const on = DAILY_REPORT_STANDARD_SECTIONS.filter((s) => s.key === "project" || !enabled || enabled.includes(s.key));
  return Object.fromEntries(on.map((s, i) => [s.key, String.fromCharCode(65 + i)]));
}

export type DailyReportStandardSnapshot = {
  id: string;
  code: string;
  name: string;
  rev: string;
  template: DailyReportTemplate;
  /** หัวข้อที่เปิดใช้ ณ ตอนออกรายงาน (null / ไม่มี = ทุกหัวข้อ) */
  sections?: DailySection[] | null;
};
