/** Document fields are a snapshot of the project at submission time. */
export interface SubmissionRevision {
  revision: string;
  date: string;
  details: string;
}

export interface SubmissionContent {
  title: string;
  page: string;
}

export interface MaterialSubmission {
  document_no: string;
  revision: string;
  submission_date: string;
  submission_purpose: string;
  manufacturer: string;
  project_title: string;
  location: string;
  owner: string;
  pmc: string;
  contractor: string;
  subcontractor: string;
  prepared_by: string;
  checked_by: string;
  reviewed_by: string;
  approved_by: string;
  history: SubmissionRevision[];
  contents: SubmissionContent[];
}

export interface SubmissionProject {
  name: string;
  location: string | null;
  client: string | null;
}

export function blankMaterialSubmission(project: SubmissionProject, date: string, preparer = ""): MaterialSubmission {
  return {
    document_no: "", revision: "R0", submission_date: date, submission_purpose: "For Approval",
    manufacturer: "", project_title: project.name, location: project.location || "", owner: project.client || "",
    pmc: "", contractor: "", subcontractor: "CMG Engineering & Construction Co., Ltd.",
    prepared_by: preparer, checked_by: "", reviewed_by: "", approved_by: "",
    history: [],
    contents: ["OBJECTIVE", "COMPANY PROFILE AND CATALOGUE OF PRODUCT", "QUALITY ASSURANCE", "PRODUCT DATASHEET", "MATERIAL TEST REPORT", "PROJECT REFERENCE"].map((title) => ({ title, page: "" })),
  };
}

/** Older requests intentionally have no submission; do not invent their signatories or history. */
export function normalizeMaterialSubmission(value: unknown): MaterialSubmission | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const base = blankMaterialSubmission({ name: "", location: null, client: null }, "");
  const text = (v: unknown) => typeof v === "string" ? v : "";
  for (const key of Object.keys(base) as (keyof MaterialSubmission)[]) {
    if (key !== "history" && key !== "contents") base[key] = text(input[key]);
  }
  base.history = Array.isArray(input.history) ? input.history.filter((v) => v && typeof v === "object").map((v) => ({ revision: text(v.revision), date: text(v.date), details: text(v.details) })) : [];
  base.contents = Array.isArray(input.contents) ? input.contents.filter((v) => v && typeof v === "object").map((v) => ({ title: text(v.title), page: text(v.page) })) : [];
  return base;
}

export function isSubmissionDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export type MaterialFieldErrors = Record<string, string>;

export class MaterialFieldValidationError extends Error {
  constructor(public fields: MaterialFieldErrors) {
    super(Object.values(fields)[0] || "กรุณาตรวจสอบข้อมูล");
  }
}

/** Return every invalid field, including the exact row of repeatable sections. */
export function materialSubmissionFieldErrors(value: MaterialSubmission): MaterialFieldErrors {
  const errors: MaterialFieldErrors = {};
  if (!value.project_title.trim()) errors.project_title = "กรุณาระบุชื่อโครงการ";
  if (!value.revision.trim()) errors.revision = "กรุณาระบุ Revision";
  if (!isSubmissionDate(value.submission_date)) errors.submission_date = "กรุณาระบุวันที่ยื่นเอกสารให้ถูกต้อง";
  const limits: Partial<Record<keyof MaterialSubmission, number>> = {
    document_no: 100, revision: 20, submission_purpose: 100, manufacturer: 200,
    project_title: 200, location: 240, owner: 200, pmc: 200, contractor: 200, subcontractor: 200,
    prepared_by: 80, checked_by: 80, reviewed_by: 80, approved_by: 80,
  };
  for (const [key, max] of Object.entries(limits)) {
    if (String(value[key as keyof MaterialSubmission]).length > max) errors[key] = `กรอกได้ไม่เกิน ${max} ตัวอักษร`;
  }
  if (value.history.length > 30) errors.history = "ประวัติการยื่นได้ไม่เกิน 30 รายการ";
  if (value.contents.length > 60) errors.contents = "สารบัญได้ไม่เกิน 60 หัวข้อ";
  value.history.forEach((r, i) => {
    if (!r.revision.trim() || r.revision.length > 20) errors[`history.${i}.revision`] = "ระบุ Revision ไม่เกิน 20 ตัวอักษร";
    if (!isSubmissionDate(r.date)) errors[`history.${i}.date`] = "กรุณาระบุวันที่ให้ถูกต้อง";
    if (!r.details.trim() || r.details.length > 500) errors[`history.${i}.details`] = "ระบุรายละเอียดการยื่น ไม่เกิน 500 ตัวอักษร";
  });
  value.contents.forEach((r, i) => {
    if (!r.title.trim() || r.title.length > 200) errors[`contents.${i}.title`] = "ระบุหัวข้อสารบัญ ไม่เกิน 200 ตัวอักษร";
    if (r.page.trim() && !/^[1-9]\d{0,3}(?:\s*-\s*[1-9]\d{0,3})?$/.test(r.page.trim())) errors[`contents.${i}.page`] = "เลขหน้าไม่ถูกต้อง เช่น 4 หรือ 4-10 หรือเว้นว่าง";
  });
  return errors;
}

/** Existing callers can still request the first message. */
export function validateMaterialSubmission(value: MaterialSubmission): string | null {
  return Object.values(materialSubmissionFieldErrors(value))[0] || null;
}

export function materialRequestFieldErrors(value: { description: string; unit: string; quantity: string | number; require_schedule: string; spec?: string; area?: string; remark?: string; submission?: MaterialSubmission | null }, preview = false): MaterialFieldErrors {
  const errors: MaterialFieldErrors = {};
  if ((value.area?.length ?? 0) > 50) errors.area = "พื้นที่ กรอกได้ไม่เกิน 50 ตัวอักษร";
  if ((value.spec?.length ?? 0) > 20) errors.spec = "Spec กรอกได้ไม่เกิน 20 ตัวอักษร";
  if ((value.remark?.length ?? 0) > 50) errors.remark = "Remark กรอกได้ไม่เกิน 50 ตัวอักษร";
  if (!value.description.trim()) errors.description = "กรุณาระบุชื่อวัสดุ / Description";
  else if (value.description.length > 20) errors.description = "Description / ชื่อวัสดุบนหน้าปก กรอกได้ไม่เกิน 20 ตัวอักษร";
  if (!preview) {
    if (!value.unit.trim()) errors.unit = "กรุณาระบุหน่วย / Unit";
    if (!Number.isFinite(Number(value.quantity)) || Number(value.quantity) <= 0) errors.quantity = "จำนวนต้องเป็นตัวเลขที่มากกว่า 0";
    if (!isSubmissionDate(value.require_schedule)) errors.require_schedule = "กรุณาระบุวันที่ต้องการใช้วัสดุให้ถูกต้อง";
  }
  return { ...errors, ...(value.submission ? materialSubmissionFieldErrors(value.submission) : {}) };
}

export function materialReceiptFieldErrors(value: { quantity: string | number; receive_date: string; approval: string }, remaining: number): MaterialFieldErrors {
  const errors: MaterialFieldErrors = {};
  const quantity = Number(value.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = "จำนวนรับต้องเป็นตัวเลขที่มากกว่า 0";
  else if (value.approval !== "rejected" && quantity > remaining) errors.quantity = `รับเกินยอดคงเหลือ — รับได้อีก ${remaining.toLocaleString("th-TH")}`;
  if (!isSubmissionDate(value.receive_date)) errors.receive_date = "กรุณาระบุวันที่รับของให้ถูกต้อง";
  return errors;
}

export function cleanMaterialSubmission(value: MaterialSubmission): MaterialSubmission {
  const clean = normalizeMaterialSubmission(value)!;
  for (const key of Object.keys(clean) as (keyof MaterialSubmission)[]) {
    if (key !== "history" && key !== "contents") clean[key] = clean[key].trim();
  }
  clean.history = clean.history.map((r) => ({ revision: r.revision.trim(), date: r.date, details: r.details.trim() }));
  clean.contents = clean.contents.map((r) => ({ title: r.title.trim(), page: r.page.trim() }));
  return clean;
}
