import type { ProgressSnapshot, ProjectInput, ProjectStatus } from "./types";

// ตรวจข้อมูลโครงการ / ความคืบหน้า — ใช้ทั้งใน server action และฝั่งเบราว์เซอร์

export const STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "completed"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseProjectForm(form: FormData): { data: ProjectInput } | { error: string } {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const data: ProjectInput = {
    code: text("code").toUpperCase(),
    name: text("name"),
    client: text("client") || null,
    location: text("location") || null,
    manager_name: text("manager_name") || null,
    contract_value: Number(text("contract_value").replace(/,/g, "")),
    start_date: text("start_date"),
    end_date: text("end_date"),
    status: text("status") as ProjectStatus,
  };

  if (!data.code) return { error: "กรุณากรอกรหัสโครงการ" };
  if (!data.name) return { error: "กรุณากรอกชื่อโครงการ" };
  if (!Number.isFinite(data.contract_value) || data.contract_value < 0) return { error: "มูลค่าสัญญาไม่ถูกต้อง" };
  if (!DATE.test(data.start_date) || !DATE.test(data.end_date)) return { error: "กรุณาเลือกวันเริ่มและวันสิ้นสุดสัญญา" };
  if (data.end_date < data.start_date) return { error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา" };
  if (!STATUSES.includes(data.status)) return { error: "สถานะโครงการไม่ถูกต้อง" };
  return { data };
}

/**
 * จุดตัดยอดรายเดือนของ S-Curve: วันที่ 1 ของทุกเดือน ตั้งแต่เดือนที่เริ่มสัญญา
 * ถึงเดือนถัดจากเดือนที่สิ้นสุดสัญญา (จุดแรก = 0%, จุดสุดท้าย = ปิดงาน)
 */
export function progressMonths(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);
  const count = (ey - sy) * 12 + (em - sm) + 2;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const m0 = sm - 1 + i;
    const y = sy + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  });
}

/** คืนข้อความผิดพลาด หรือ undefined ถ้าผ่าน */
export function validateProgress(points: ProgressSnapshot[], months: string[]): string | undefined {
  if (points.length !== months.length || points.some((p, i) => p.as_of !== months[i])) {
    return "ช่วงเดือนไม่ตรงกับวันที่ของสัญญา กรุณาโหลดหน้าใหม่";
  }
  const inRange = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
  for (let i = 0; i < points.length; i++) {
    const { planned_pct, actual_pct } = points[i];
    if (!inRange(planned_pct)) return `แผนสะสมเดือนที่ ${i + 1} ต้องอยู่ระหว่าง 0–100`;
    if (actual_pct !== null && !inRange(actual_pct)) return `ผลงานจริงเดือนที่ ${i + 1} ต้องอยู่ระหว่าง 0–100`;
    if (i > 0 && planned_pct < points[i - 1].planned_pct) return `แผนสะสมเดือนที่ ${i + 1} ต้องไม่น้อยกว่าเดือนก่อนหน้า`;
    if (i > 0 && actual_pct !== null) {
      const prev = points[i - 1].actual_pct;
      if (prev === null) return `กรอกผลงานจริงให้ต่อเนื่อง — เดือนที่ ${i} ยังว่างอยู่`;
      if (actual_pct < prev) return `ผลงานจริงเดือนที่ ${i + 1} ต้องไม่น้อยกว่าเดือนก่อนหน้า`;
    }
  }
  return undefined;
}
