// รายงานประจำวันงานก่อสร้าง (Daily Construction Report — DCR)
// โครงสร้างข้อมูล + ค่าเริ่มต้น + การคำนวณ — ไม่ผูกกับ Firebase จึงใช้ได้ทั้งฟอร์ม รายงาน และสคริปต์

import type { DailyReportStandardSnapshot } from "./daily-report-standard";

export type StoredImage = { path: string; url: string };

/** บริษัทที่เกี่ยวข้องกับโครงการ — โลโก้แสดงบนหัวรายงาน */
export interface Company {
  id: string;
  name: string;
  logo: StoredImage | null;
}

/** ตั้งค่ารายงานของโครงการ: projects/{id}/settings/dcr */
export interface DcrSettings {
  client: Company;
  contractor: Company;
  consultants: Company[];
  subcontractors: Company[];
  /** ตำแหน่ง Indirect / Staff ที่ใช้เป็นแถวตั้งต้นของตารางกำลังคน */
  indirect_roles: string[];
  /** ประเภทช่าง Direct labor */
  trades: string[];
  /** เครื่องจักรประจำไซต์ */
  equipment: { name: string; owner: string }[];
  working_hours: { start: string; end: string };
  /** เลขที่รายงานล่าสุดที่ออกไปแล้ว */
  report_counter: number;
  version: number;
}

export const SKY = ["clear", "cloudy", "light_rain", "heavy_rain", "storm"] as const;
export type Sky = (typeof SKY)[number];
export const SKY_LABEL: Record<Sky, string> = {
  clear: "แจ่มใส",
  cloudy: "มีเมฆ",
  light_rain: "ฝนเล็กน้อย",
  heavy_rain: "ฝนหนัก",
  storm: "พายุ",
};

export const WORK_STATUS = ["workable", "partial", "stopped"] as const;
export type WorkStatus = (typeof WORK_STATUS)[number];
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = { workable: "ทำงานได้", partial: "ทำได้บางส่วน", stopped: "หยุดงาน" };

export const SITE_CONDITIONS = ["แห้ง / ปกติ", "เปียก", "เป็นโคลน", "น้ำท่วมขัง"] as const;

export const EQUIPMENT_STATUS = ["working", "idle", "breakdown"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[number];
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = { working: "ใช้งาน", idle: "ว่าง / สแตนด์บาย", breakdown: "เสีย" };

export const DELAY_CAUSES = ["สภาพอากาศ", "วัสดุ", "แบบ / RFI", "แรงงาน", "เครื่องจักร", "เจ้าของงาน / ที่ปรึกษา", "อื่น ๆ"] as const;

export const DCR_STATUS = ["draft", "submitted", "reviewed", "acknowledged"] as const;
export type DcrStatus = (typeof DCR_STATUS)[number];
export const DCR_STATUS_LABEL: Record<DcrStatus, string> = {
  draft: "ร่าง",
  submitted: "ส่งตรวจแล้ว",
  reviewed: "ตรวจแล้ว",
  acknowledged: "รับทราบแล้ว",
};

export type HalfDay = { sky: Sky; status: WorkStatus };
export type HeadcountRow = { label: string; main: number; sub: number };
export type EquipmentRow = { name: string; owner: string; work_hours: number; idle_hours: number; status: EquipmentStatus };
export type MaterialRow = { item: string; quantity: string; status: string };
export type Photo = StoredImage & { caption: string };
export type ProgressItem = { id: string; zone: string; category: string; description: string; quantity: string; cumulative: string; photos: Photo[] };
export type IssueRow = { description: string; cause: string; impact_hours: number; responsible: string; action: string };
export type PlanRow = { task: string; manpower: number; resources: string };
export type Signature = { name: string; email: string | null; at: string } | null;

/** ข้อมูลรายงาน 1 ฉบับ: projects/{id}/daily_reports/{YYYY-MM-DD} (schema 2) */
export interface DcrData {
  report_date: string;
  report_no: number;
  /** snapshot ของมาตรฐานที่ใช้กับรายงานฉบับนี้ — ป้องกันรายงานเก่าเปลี่ยนตามมาตรฐานใหม่ */
  form_standard: DailyReportStandardSnapshot | null;
  status: DcrStatus;
  working_hours: { start: string; end: string; overtime: string };
  subcontractors_today: string[];
  weather: {
    am: HalfDay;
    pm: HalfDay;
    temp_high: number | null;
    temp_low: number | null;
    rain_mm: number;
    lost_hours: number;
    site_condition: string;
    remark: string;
  };
  manpower: { indirect: HeadcountRow[]; direct: HeadcountRow[] };
  equipment: EquipmentRow[];
  materials: MaterialRow[];
  progress: ProgressItem[];
  safety: { toolbox_topic: string; toolbox_attendees: number; incidents: number; near_miss: number; remark: string };
  quality: { inspections: string; ncr: string };
  issues: IssueRow[];
  tomorrow: PlanRow[];
  signatures: { prepared: Signature; reviewed: Signature; acknowledged: Signature };
}

export const DEFAULT_INDIRECT = ["PM / CM", "วิศวกรสนาม", "จป. (Safety)", "QA / QC", "Surveyor", "โฟร์แมน", "ธุรการ / Store"];
export const DEFAULT_TRADES = ["ช่างไม้แบบ", "ช่างเหล็ก", "ช่างปูน / ก่อฉาบ", "ช่างคอนกรีต", "ช่างเชื่อม", "ช่างไฟฟ้า", "ช่างประปา", "ช่างสี", "กรรมกร / ทั่วไป"];

export const newCompany = (name = ""): Company => ({ id: crypto.randomUUID(), name, logo: null });

export function defaultSettings(projectClient: string | null): DcrSettings {
  return {
    client: newCompany(projectClient ?? ""),
    contractor: newCompany("CMG Construction"),
    consultants: [],
    subcontractors: [],
    indirect_roles: DEFAULT_INDIRECT,
    trades: DEFAULT_TRADES,
    equipment: [],
    working_hours: { start: "08:00", end: "17:00" },
    report_counter: 0,
    version: 0,
  };
}

export function blankReport(date: string, settings: DcrSettings, formStandard: DailyReportStandardSnapshot | null = null): DcrData {
  return {
    report_date: date,
    report_no: 0,
    form_standard: formStandard,
    status: "draft",
    working_hours: { ...settings.working_hours, overtime: "" },
    subcontractors_today: settings.subcontractors.map((s) => s.id),
    weather: {
      am: { sky: "clear", status: "workable" },
      pm: { sky: "clear", status: "workable" },
      temp_high: null,
      temp_low: null,
      rain_mm: 0,
      lost_hours: 0,
      site_condition: SITE_CONDITIONS[0],
      remark: "",
    },
    manpower: {
      indirect: settings.indirect_roles.map((label) => ({ label, main: 0, sub: 0 })),
      direct: settings.trades.map((label) => ({ label, main: 0, sub: 0 })),
    },
    equipment: settings.equipment.map((e) => ({ ...e, work_hours: 0, idle_hours: 0, status: "working" as const })),
    materials: [],
    progress: [newProgressItem()],
    safety: { toolbox_topic: "", toolbox_attendees: 0, incidents: 0, near_miss: 0, remark: "" },
    quality: { inspections: "", ncr: "" },
    issues: [],
    tomorrow: [],
    signatures: { prepared: null, reviewed: null, acknowledged: null },
  };
}

export const newProgressItem = (): ProgressItem => ({
  id: crypto.randomUUID(),
  zone: "",
  category: "",
  description: "",
  quantity: "",
  cumulative: "",
  photos: [],
});

/** ข้อมูลที่ยกมาจากรายงานวันก่อน: กำลังคน เครื่องจักร ผู้รับเหมาช่วง เวลาทำงาน และแผนพรุ่งนี้ → งานวันนี้ */
export function carryOver(previous: DcrData, today: DcrData): DcrData {
  return {
    ...today,
    working_hours: { ...previous.working_hours },
    // รายงานเดิมไม่ได้บันทึกผู้รับเหมาช่วง → คงรายการของวันนี้ไว้
    subcontractors_today: previous.subcontractors_today.length ? [...previous.subcontractors_today] : today.subcontractors_today,
    manpower: structuredClone(previous.manpower),
    equipment: previous.equipment.map((e) => ({ ...e })),
    progress: previous.tomorrow.length
      ? previous.tomorrow.map((t) => ({ ...newProgressItem(), description: t.task }))
      : today.progress,
  };
}

export const sumRows = (rows: HeadcountRow[]) => rows.reduce((s, r) => ({ main: s.main + r.main, sub: s.sub + r.sub }), { main: 0, sub: 0 });

export function manpowerTotals(m: DcrData["manpower"], hoursPerDay = 8) {
  const indirect = sumRows(m.indirect);
  const direct = sumRows(m.direct);
  const total = indirect.main + indirect.sub + direct.main + direct.sub;
  return { indirect, direct, total, manHours: total * hoursPerDay };
}

/** ชั่วโมงทำงานจากเวลาเริ่ม–เลิก (หักพักเที่ยง 1 ชม. เมื่อคร่อมเที่ยง) */
export function workingHours(start: string, end: string) {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const minutes = toMin(end) - toMin(start);
  if (!Number.isFinite(minutes) || minutes <= 0) return 8;
  return Math.round(((minutes - (toMin(start) < 12 * 60 && toMin(end) > 13 * 60 ? 60 : 0)) / 60) * 10) / 10;
}

/** เลขที่รายงาน เช่น DCR-004-0186 (ใช้เลขท้ายของรหัสโครงการ) */
export function reportCode(projectCode: string, no: number) {
  const tail = projectCode.match(/(\d+)$/)?.[1] ?? projectCode;
  return `DCR-${tail.padStart(3, "0").slice(-3)}-${String(no).padStart(4, "0")}`;
}

/** สภาพอากาศแบบสรุปคำเดียว — ใช้กับหน้าสรุปเดิม (ฝนตกช่วงใดช่วงหนึ่ง = ฝนตก) */
export function summarizeWeather(w: DcrData["weather"]): "sunny" | "cloudy" | "rain" {
  const rainy = (s: Sky) => s === "light_rain" || s === "heavy_rain" || s === "storm";
  if (rainy(w.am.sky) || rainy(w.pm.sky)) return "rain";
  return w.am.sky === "cloudy" || w.pm.sky === "cloudy" ? "cloudy" : "sunny";
}
