// รายงานประจำวันงานก่อสร้าง (Daily Construction Report — DCR)
// โครงสร้างข้อมูล + ค่าเริ่มต้น + การคำนวณ — ไม่ผูกกับ Firebase จึงใช้ได้ทั้งฟอร์ม รายงาน และสคริปต์

import type { DailyReportStandardSnapshot } from "./daily-report-standard";
import type { ReportLang } from "./dcr-i18n";
import { normalizeLayoutPages, type LayoutPage } from "./dcr-layout";

export type StoredImage = { path: string; url: string };

/** บริษัทที่เกี่ยวข้องกับโครงการ — โลโก้แสดงบนหัวรายงาน */
export interface Company {
  id: string;
  name: string;
  logo: StoredImage | null;
}

/** ตั้งค่ารายงานของโครงการ: projects/{id}/settings/dcr */
export interface DcrSettings {
  /** ชื่อ / เลขที่โครงการบนหัวรายงาน — ว่าง = ใช้ข้อมูลโครงการหลัก */
  project_name: string;
  project_no: string;
  client: Company;
  contractor: Company;
  consultants: Company[];
  /** แสดง Consultant / PMC บนหัวรายงานและส่วน A */
  show_consultant: boolean;
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
  /** รูปแบบ Doc. no. เช่น GMTP-CAZ-CMG-DR- + 180 + -R0 — prefix และ suffix ว่าง = รูปแบบระบบ DCR-xxx-0000 */
  doc_format: DocFormat;
  /** ภาษาเริ่มต้นของหน้ารายงาน (ผู้ใช้สลับเองได้) */
  report_lang: ReportLang;
  version: number;
}

export type DocFormat = { prefix: string; digits: number; suffix: string };

export const SKY = ["clear", "cloudy", "light_rain", "heavy_rain", "storm"] as const;
export type Sky = (typeof SKY)[number];
export const SKY_LABEL: Record<Sky, string> = {
  clear: "แจ่มใส",
  cloudy: "มีเมฆ",
  light_rain: "ฝนเล็กน้อย",
  heavy_rain: "ฝนหนัก",
  storm: "พายุ",
};
export const SKY_ICON: Record<Sky, string> = { clear: "☀️", cloudy: "⛅", light_rain: "🌦️", heavy_rain: "🌧️", storm: "⛈️" };

export const WORK_STATUS = ["workable", "partial", "stopped"] as const;
export type WorkStatus = (typeof WORK_STATUS)[number];
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = { workable: "ทำงานได้", partial: "ทำได้บางส่วน", stopped: "หยุดงาน" };

export const SITE_CONDITIONS = ["แห้ง / ปกติ", "เปียก", "เป็นโคลน", "น้ำท่วมขัง"] as const;

export const EQUIPMENT_STATUS = ["working", "idle", "breakdown"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[number];
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = { working: "ใช้งาน", idle: "Standby", breakdown: "เสีย" };

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
/** total = จำนวนคนทั้งหมดของตำแหน่ง, present = มาทำงานวันนี้ (ขาด/ลา = total − present) */
export type HeadcountRow = { label: string; total: number; present: number };
export type EquipmentRow = { name: string; owner: string; quantity: number; status: EquipmentStatus; remark: string };
export type MaterialRow = { item: string; unit: string; quantity: number; remark: string };
export type Photo = StoredImage & { caption: string };
export type ProgressItem = { id: string; zone: string; category: string; description: string; quantity: string; cumulative: string; photos: Photo[] };
export type IssueRow = { description: string; cause: string; impact_hours: number; responsible: string; action: string };
export type PlanRow = { task: string; manpower: number; resources: string };
export type Signature = { name: string; email: string | null; at: string } | null;

/** ข้อมูลรายงาน 1 ฉบับ: projects/{id}/daily_reports/{YYYY-MM-DD} (schema 2) */
export interface DcrData {
  report_date: string;
  report_no: number;
  /** Doc. no. ที่ออกตอนบันทึกครั้งแรก (รายงานเดิมไม่มี → คำนวณจากรหัสโครงการ) */
  doc_no?: string;
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
  /** H: หน้าเอกสารแนบแบบจัดหน้าเอง (รายงานเดิมไม่มี = []) */
  layout_pages: LayoutPage[];
  signatures: { prepared: Signature; reviewed: Signature; acknowledged: Signature };
}

export const DEFAULT_INDIRECT = ["PM / CM", "วิศวกรสนาม", "จป. (Safety)", "QA / QC", "Surveyor", "โฟร์แมน", "ธุรการ / Store"];
export const DEFAULT_TRADES = ["ช่างไม้แบบ", "ช่างเหล็ก", "ช่างปูน / ก่อฉาบ", "ช่างคอนกรีต", "ช่างเชื่อม", "ช่างไฟฟ้า", "ช่างประปา", "ช่างสี", "กรรมกร / ทั่วไป"];

export const newCompany = (name = ""): Company => ({ id: crypto.randomUUID(), name, logo: null });

export function defaultSettings(projectClient: string | null): DcrSettings {
  return {
    project_name: "",
    project_no: "",
    client: newCompany(projectClient ?? ""),
    contractor: newCompany("CMG Construction"),
    consultants: [],
    show_consultant: true,
    subcontractors: [],
    indirect_roles: DEFAULT_INDIRECT,
    trades: DEFAULT_TRADES,
    equipment: [],
    working_hours: { start: "08:00", end: "17:00" },
    report_counter: 0,
    doc_format: { prefix: "", digits: 3, suffix: "" },
    report_lang: "th",
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
      indirect: settings.indirect_roles.map((label) => ({ label, total: 0, present: 0 })),
      direct: settings.trades.map((label) => ({ label, total: 0, present: 0 })),
    },
    equipment: settings.equipment.map((e) => ({ ...e, quantity: 1, status: "working" as const, remark: "" })),
    materials: [],
    progress: [newProgressItem()],
    safety: { toolbox_topic: "", toolbox_attendees: 0, incidents: 0, near_miss: 0, remark: "" },
    quality: { inspections: "", ncr: "" },
    issues: [],
    tomorrow: [],
    layout_pages: [],
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

export const sumRows = (rows: HeadcountRow[]) => rows.reduce((s, r) => ({ total: s.total + r.total, present: s.present + r.present }), { total: 0, present: 0 });

/** total = คนที่มาทำงานวันนี้ (ใช้คิดชั่วโมงงาน), registered = จำนวนคนทั้งหมด */
export function manpowerTotals(m: DcrData["manpower"], hoursPerDay = 8) {
  const indirect = sumRows(m.indirect);
  const direct = sumRows(m.direct);
  const total = indirect.present + direct.present;
  return { indirect, direct, total, registered: indirect.total + direct.total, manHours: total * hoursPerDay };
}

// ───── แปลงรายงานรูปแบบเดิม (Main/Sub, ชั่วโมงเครื่องจักร, ปริมาณวัสดุเป็นข้อความ) ขณะอ่าน ─────

type Loose = Record<string, unknown>;
const toNum = (v: unknown) => Number(v) || 0;
const toStr = (v: unknown) => (v == null ? "" : String(v));

function toHeadcount(r: Loose): HeadcountRow {
  if ("present" in r || "total" in r) return { label: toStr(r.label), total: toNum(r.total), present: toNum(r.present) };
  const present = toNum(r.main) + toNum(r.sub);
  return { label: toStr(r.label), total: present, present };
}

function toEquipment(r: Loose): EquipmentRow {
  const status = (EQUIPMENT_STATUS as readonly unknown[]).includes(r.status) ? (r.status as EquipmentStatus) : "working";
  if ("quantity" in r) return { name: toStr(r.name), owner: toStr(r.owner), quantity: toNum(r.quantity), status, remark: toStr(r.remark) };
  const hours = [toNum(r.work_hours) ? `ทำงาน ${toNum(r.work_hours)} ชม.` : "", toNum(r.idle_hours) ? `ว่าง ${toNum(r.idle_hours)} ชม.` : ""].filter(Boolean).join(" · ");
  return { name: toStr(r.name), owner: toStr(r.owner), quantity: 1, status, remark: hours };
}

function toMaterial(r: Loose): MaterialRow {
  if ("unit" in r) return { item: toStr(r.item), unit: toStr(r.unit), quantity: toNum(r.quantity), remark: toStr(r.remark) };
  // เดิม quantity เป็นข้อความ เช่น "42 ลบ.ม." → แยกตัวเลขกับหน่วย
  const text = toStr(r.quantity).trim();
  const m = text.match(/^([\d.,]+)\s*(.*)$/);
  return {
    item: toStr(r.item),
    unit: m ? m[2].trim() : "",
    quantity: m ? toNum(m[1].replace(/,/g, "")) : 0,
    remark: [m ? "" : text, toStr(r.status)].filter(Boolean).join(" · "),
  };
}

export function normalizeDcrRows<T extends Pick<DcrData, "manpower" | "equipment" | "materials" | "layout_pages">>(d: T): T {
  const rows = (v: unknown) => (Array.isArray(v) ? (v as Loose[]) : []);
  return {
    ...d,
    manpower: { indirect: rows(d.manpower?.indirect).map(toHeadcount), direct: rows(d.manpower?.direct).map(toHeadcount) },
    equipment: rows(d.equipment).map(toEquipment),
    materials: rows(d.materials).map(toMaterial),
    layout_pages: normalizeLayoutPages(d.layout_pages),
  };
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

/** Doc. no. ตามรูปแบบของโครงการ */
export function formatDocNo(format: DocFormat | undefined, projectCode: string, no: number) {
  if (!format || (!format.prefix && !format.suffix)) return reportCode(projectCode, no);
  return `${format.prefix}${String(no).padStart(Math.max(1, format.digits || 1), "0")}${format.suffix}`;
}

/** Doc. no. ของรายงาน — ใช้ค่าที่บันทึกไว้ตอนออกเลข เพื่อไม่ให้เปลี่ยนตามการแก้รูปแบบภายหลัง */
export const reportDocNo = (r: Pick<DcrData, "doc_no" | "report_no">, projectCode: string) => r.doc_no || reportCode(projectCode, r.report_no);

/** สภาพอากาศแบบสรุปคำเดียว — ใช้กับหน้าสรุปเดิม (ฝนตกช่วงใดช่วงหนึ่ง = ฝนตก) */
export function summarizeWeather(w: DcrData["weather"]): "sunny" | "cloudy" | "rain" {
  const rainy = (s: Sky) => s === "light_rain" || s === "heavy_rain" || s === "storm";
  if (rainy(w.am.sky) || rainy(w.pm.sky)) return "rain";
  return w.am.sky === "cloudy" || w.pm.sky === "cloudy" ? "cloudy" : "sunny";
}
