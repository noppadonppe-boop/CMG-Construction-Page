import type {
  DocumentCategory,
  DocumentStatus,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  ProjectStatus,
  Weather,
} from "./types";

export type Tone = "ok" | "warn" | "bad" | "info";

/** เทียบผลจริงกับแผน: ช้าไม่เกิน 2% = ตามแผน, ไม่เกิน 5% = ช้าเล็กน้อย, มากกว่านั้น = ล่าช้า */
export function scheduleStatus(actual: number, planned: number): { tone: Tone; label: string } {
  const diff = actual - planned;
  if (diff >= -2) return { tone: "ok", label: "ตามแผน" };
  if (diff >= -5) return { tone: "warn", label: "ช้าเล็กน้อย" };
  return { tone: "bad", label: "ล่าช้า" };
}

export function formatMillions(value: number) {
  return "฿" + (value / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "M";
}

export function formatDate(iso: string, style: "short" | "medium" = "medium") {
  return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    ...(style === "medium" ? { year: "2-digit" } : {}),
  });
}

export function formatPct(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "%";
}

export const weatherLabel: Record<Weather, string> = {
  sunny: "☀️ แจ่มใส",
  cloudy: "⛅ มีเมฆ",
  rain: "🌧️ ฝนตก",
};

export const statusLabel: Record<ProjectStatus, string> = {
  planning: "เตรียมงาน",
  active: "กำลังก่อสร้าง",
  on_hold: "หยุดชั่วคราว",
  completed: "ส่งมอบแล้ว",
};

export const issueCategoryLabel: Record<IssueCategory, string> = {
  issue: "ปัญหาหน้างาน",
  safety: "ความปลอดภัย",
  rfi: "RFI",
};

export const issueCategoryIcon: Record<IssueCategory, string> = { issue: "🔧", safety: "⛑️", rfi: "❓" };

export const issuePriority: Record<IssuePriority, { label: string; tone: Tone }> = {
  low: { label: "ต่ำ", tone: "info" },
  normal: { label: "ปกติ", tone: "info" },
  high: { label: "สูง", tone: "warn" },
  urgent: { label: "ด่วนมาก", tone: "bad" },
};

export const issueStatusLabel: Record<IssueStatus, string> = {
  open: "เปิดใหม่",
  in_progress: "กำลังแก้ไข",
  closed: "ปิดแล้ว",
};

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export function todayInBangkok() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

export function isOverdue(issue: { status: IssueStatus; due_date: string | null }, today: string) {
  return issue.status !== "closed" && !!issue.due_date && issue.due_date < today;
}

export const documentCategory: Record<DocumentCategory, { label: string; badge: string; tone: Tone }> = {
  drawing: { label: "แบบก่อสร้าง", badge: "DWG", tone: "info" },
  contract: { label: "สัญญา / VO", badge: "CON", tone: "ok" },
  submittal: { label: "Submittal / วัสดุ", badge: "SUB", tone: "warn" },
  qc: { label: "ตรวจสอบคุณภาพ", badge: "QC", tone: "bad" },
  meeting: { label: "บันทึกการประชุม", badge: "MOM", tone: "info" },
  invoice: { label: "งวดงาน / ใบแจ้งหนี้", badge: "INV", tone: "ok" },
  other: { label: "อื่น ๆ", badge: "DOC", tone: "info" },
};

export const documentStatus: Record<DocumentStatus, { label: string; tone: Tone }> = {
  pending: { label: "รอตรวจ", tone: "warn" },
  approved: { label: "อนุมัติ", tone: "ok" },
  rejected: { label: "ไม่อนุมัติ / แก้ไข", tone: "bad" },
  for_info: { label: "เพื่อทราบ", tone: "info" },
};

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
