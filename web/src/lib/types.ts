export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";
export type Weather = "sunny" | "cloudy" | "rain";

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string | null;
  location: string | null;
  contract_value: number;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  manager_name: string | null;
}

export type ProjectInput = Omit<Project, "id">;

export interface ProgressSnapshot {
  as_of: string;
  planned_pct: number;
  actual_pct: number | null;
}

/** โครงการพร้อมความคืบหน้าล่าสุด สำหรับตาราง/การ์ด */
export interface ProjectSummary extends Project {
  planned_pct: number;
  actual_pct: number;
}

export interface DailyReport {
  id: string;
  project_id: string;
  project_name: string;
  report_date: string;
  weather: Weather;
  workers: number;
  work_done: string;
  equipment: string[];
  issues: string | null;
  /** URL สำหรับแสดงรูป */
  photos: string[];
  /** เฉพาะรายงานรูปแบบใหม่ (DCR) */
  code?: string;
  status?: "draft" | "submitted" | "reviewed" | "acknowledged";
  lost_hours?: number;
}

export type NewDailyReport = Omit<DailyReport, "id" | "project_name" | "photos">;

export type IssueCategory = "issue" | "safety" | "rfi";
export type IssuePriority = "low" | "normal" | "high" | "urgent";
export type IssueStatus = "open" | "in_progress" | "closed";

export interface Issue {
  id: string;
  /** เลขรันตามหมวด เช่น RFI-001, SAF-012 */
  code: string;
  project_id: string;
  project_name: string;
  category: IssueCategory;
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  assignee: string | null;
  /** วันที่ต้องแก้เสร็จ (YYYY-MM-DD) */
  due_date: string | null;
  photos: string[];
  /** ISO datetime */
  created_at: string;
  closed_at: string | null;
}

export type NewIssue = Pick<Issue, "project_id" | "category" | "title" | "description" | "priority" | "assignee" | "due_date">;

export type DocumentCategory = "drawing" | "contract" | "submittal" | "qc" | "meeting" | "invoice" | "other";
export type DocumentStatus = "pending" | "approved" | "rejected" | "for_info";

export interface DocumentRevision {
  /** ชื่อ revision เช่น A, B, 0, 1 */
  rev: string;
  file_name: string;
  /** path ใน Storage (ใช้ลบไฟล์) */
  path: string;
  url: string;
  size: number;
  content_type: string;
  note: string | null;
  /** ISO datetime */
  uploaded_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  project_name: string;
  category: DocumentCategory;
  /** เลขที่เอกสาร/แบบ เช่น A-201 */
  doc_no: string;
  title: string;
  status: DocumentStatus;
  /** เรียงจากเก่าไปใหม่ — ตัวสุดท้ายคือฉบับปัจจุบัน */
  revisions: DocumentRevision[];
  updated_at: string;
}
