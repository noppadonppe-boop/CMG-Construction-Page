import type { DailyReport, Issue, ProgressSnapshot, Project } from "./types";

// ข้อมูลจำลองสำหรับ demo mode (ยังไม่ได้เชื่อม Firebase)

export const mockProjects: Project[] = [
  { id: "p-004", code: "PRJ-2569-004", name: "อาคารสำนักงาน 8 ชั้น – บางนา", client: "บจ. บางนา พร็อพเพอร์ตี้", location: "บางนา กรุงเทพฯ", contract_value: 128_500_000, start_date: "2026-02-01", end_date: "2027-01-31", status: "active", manager_name: "สมชาย" },
  { id: "p-002", code: "PRJ-2569-002", name: "คอนโด The Rise 24 ชั้น", client: "บจ. ไรส์ เรสซิเดนซ์", location: "ลาดพร้าว กรุงเทพฯ", contract_value: 212_000_000, start_date: "2026-01-15", end_date: "2028-01-15", status: "active", manager_name: "วิภา" },
  { id: "p-006", code: "PRJ-2569-006", name: "โรงงานบางปู เฟส 2", client: "บจ. สยามแพ็ค", location: "บางปู สมุทรปราการ", contract_value: 64_300_000, start_date: "2026-01-05", end_date: "2026-12-20", status: "active", manager_name: "ธนา" },
  { id: "p-007", code: "PRJ-2569-007", name: "ถนน ทล.32 ช่วง กม.12–18", client: "กรมทางหลวง", location: "อยุธยา", contract_value: 48_900_000, start_date: "2026-06-01", end_date: "2027-09-30", status: "active", manager_name: "ประเสริฐ" },
  { id: "p-009", code: "PRJ-2569-009", name: "ศูนย์กระจายสินค้า วังน้อย", client: "บจ. โลจิสติกส์ไทย", location: "วังน้อย อยุธยา", contract_value: 32_500_000, start_date: "2026-03-01", end_date: "2026-11-30", status: "active", manager_name: "กมล" },
];

/** สร้างจุด S-curve รายเดือนจาก % ที่กำหนด */
function curve(start: string, planned: number[], actual: number[]): ProgressSnapshot[] {
  const [y, m] = start.split("-").map(Number);
  return planned.map((p, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { as_of: d.toISOString().slice(0, 10), planned_pct: p, actual_pct: actual[i] ?? null };
  });
}

export const mockProgress: Record<string, ProgressSnapshot[]> = {
  "p-004": curve("2026-02-01", [0, 3, 8, 15, 24, 34, 45, 56, 65, 76, 86, 94, 100], [0, 2, 7, 13, 21, 31, 41, 52, 61.4]),
  "p-002": curve("2026-01-01", [0, 2, 5, 9, 14, 19, 24, 29, 32, 36], [0, 2, 5, 9, 15, 20, 25, 30, 34, 38]),
  "p-006": curve("2026-01-01", [0, 6, 14, 24, 35, 46, 57, 66, 74, 81, 90, 96, 100], [0, 5, 12, 20, 29, 38, 47, 56, 64, 72]),
  "p-007": curve("2026-06-01", [0, 4, 9, 15, 22], [0, 5, 10, 16, 24]),
  "p-009": curve("2026-03-01", [0, 8, 18, 30, 44, 58, 71, 83, 94, 100], [0, 7, 16, 28, 41, 54, 67, 79, 90]),
};

export const mockDailyReports: DailyReport[] = [
  { id: "d-5", project_id: "p-004", project_name: "อาคารสำนักงาน 8 ชั้น – บางนา", report_date: "2026-10-28", weather: "sunny", workers: 84, work_done: "เทพื้นชั้น 6 โซน B (42 ลบ.ม.), ผูกเหล็กเสา ชั้น 7", equipment: ["ทาวเวอร์เครน", "ปั๊มคอนกรีต"], issues: null, photos: [] },
  { id: "d-4", project_id: "p-004", project_name: "อาคารสำนักงาน 8 ชั้น – บางนา", report_date: "2026-10-27", weather: "cloudy", workers: 79, work_done: "ผูกเหล็กชั้น 7, ติดตั้งท่องานระบบชั้น 4", equipment: ["ทาวเวอร์เครน"], issues: null, photos: [] },
  { id: "d-3", project_id: "p-002", project_name: "คอนโด The Rise 24 ชั้น", report_date: "2026-10-27", weather: "sunny", workers: 132, work_done: "หล่อเสาชั้น 10, ก่อผนังชั้น 5–6", equipment: ["ทาวเวอร์เครน", "ลิฟต์ขนของ"], issues: null, photos: [] },
  { id: "d-2", project_id: "p-004", project_name: "อาคารสำนักงาน 8 ชั้น – บางนา", report_date: "2026-10-26", weather: "rain", workers: 62, work_done: "งานแบบหล่อชั้น 6 (ครึ่งวัน)", equipment: ["ทาวเวอร์เครน"], issues: "ฝนตกหนักช่วงบ่าย หยุดงานเทคอนกรีต", photos: [] },
  { id: "d-1", project_id: "p-006", project_name: "โรงงานบางปู เฟส 2", report_date: "2026-10-26", weather: "sunny", workers: 45, work_done: "ติดตั้งโครงหลังคาเหล็ก แนว C–F", equipment: ["รถเครน 25 ตัน"], issues: "เหล็กรูปพรรณส่งไม่ครบ ขาด 12 ท่อน", photos: [] },
];

export const mockIssues: Issue[] = [
  { id: "i-1", code: "RFI-031", project_id: "p-004", project_name: "อาคารสำนักงาน 8 ชั้น – บางนา", category: "rfi", title: "รายละเอียดเหล็กเสริมคาน B12", description: "แบบ S-115 ไม่ระบุระยะทาบเหล็กบนของคาน B12 ช่วงต่อกับเสา C4 ขอให้ผู้ออกแบบยืนยัน", priority: "high", status: "open", assignee: "วิศวกรโครงสร้าง", due_date: "2026-10-26", photos: [], created_at: "2026-10-20T09:15:00.000Z", closed_at: null },
  { id: "i-2", code: "SAF-007", project_id: "p-004", project_name: "อาคารสำนักงาน 8 ชั้น – บางนา", category: "safety", title: "นั่งร้านชั้น 7 ไม่มีราวกันตก", description: "ด้านทิศเหนือ ช่วงแกน 3–5 ราวกันตกถูกถอดออกระหว่างติดตั้งแบบหล่อ", priority: "urgent", status: "open", assignee: "จป. ประจำไซต์", due_date: "2026-10-29", photos: [], created_at: "2026-10-28T02:30:00.000Z", closed_at: null },
  { id: "i-3", code: "ISS-015", project_id: "p-002", project_name: "คอนโด The Rise 24 ชั้น", category: "issue", title: "ท่อประปาชั้น 3 รั่ว", description: "ข้อต่อท่อ PPR ห้อง 305 ซึมหลังทดสอบแรงดัน", priority: "normal", status: "in_progress", assignee: "ผู้รับเหมาระบบ", due_date: "2026-11-02", photos: [], created_at: "2026-10-25T04:00:00.000Z", closed_at: null },
  { id: "i-4", code: "ISS-014", project_id: "p-006", project_name: "โรงงานบางปู เฟส 2", category: "issue", title: "เหล็กรูปพรรณส่งไม่ครบ", description: "ขาดเหล็ก H-beam 12 ท่อน ทำให้ติดตั้งโครงหลังคาแนว F ไม่ได้", priority: "high", status: "in_progress", assignee: "ฝ่ายจัดซื้อ", due_date: "2026-10-30", photos: [], created_at: "2026-10-26T08:00:00.000Z", closed_at: null },
  { id: "i-5", code: "SAF-006", project_id: "p-007", project_name: "ถนน ทล.32 ช่วง กม.12–18", category: "safety", title: "อบรม Toolbox talk ประจำเดือน", description: "จัดอบรมความปลอดภัยการทำงานใกล้รถสัญจร", priority: "low", status: "closed", assignee: "จป. ประจำไซต์", due_date: "2026-10-15", photos: [], created_at: "2026-10-10T01:00:00.000Z", closed_at: "2026-10-15T09:00:00.000Z" },
];
