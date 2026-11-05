import { newPage, newSlot, type LayoutPage } from "./dcr-layout";
import { blankMaterialSubmission, type SubmissionProject } from "./material-submission";
import type { SubmissionDocumentRequest } from "./material-submission-document";
import type { MaterialDocSetup } from "./material-doc-setup";

export function materialCoverVariables(project: SubmissionProject, request: SubmissionDocumentRequest) {
  const defaults = blankMaterialSubmission(project, request.created_at.slice(0, 10));
  const s = { ...defaults, ...request.submission };
  const fields = [
    ["document_no", "เลขที่เอกสาร", s.document_no || request.no], ["revision", "Revision", s.revision],
    ["submission_date", "วันที่", s.submission_date], ["project_title", "ชื่อโครงการ", s.project_title],
    ["location", "สถานที่", s.location], ["owner", "เจ้าของโครงการ", s.owner], ["pmc", "PMC", s.pmc],
    ["contractor", "ผู้รับเหมาหลัก", s.contractor], ["subcontractor", "ผู้รับเหมาช่วง", s.subcontractor],
    ["submission_purpose", "วัตถุประสงค์", s.submission_purpose], ["manufacturer", "ผู้ผลิต", s.manufacturer],
    ["prepared_by", "ผู้จัดทำ", s.prepared_by], ["checked_by", "CM", s.checked_by],
    ["reviewed_by", "ผู้ตรวจทาน", s.reviewed_by], ["approved_by", "PM", s.approved_by],
    ["description", "รายการวัสดุ", request.items?.map(item => item.description).join("\n") || request.description],
  ];
  const variables = fields.map(([key, label, value]) => ({ key: `request.${key}`, label, value: value || "" }));
  // หน้า 3 · Table of Content — expose the six standard topics and their page
  // numbers as independent draggable variables, so a whiteboard can place the
  // title and page columns in separate boxes.
  const contents = Array.from({ length: 6 }, (_, index) => {
    const row = s.contents?.[index] ?? defaults.contents[index];
    const title = row?.title || `หัวข้อ ${index + 1}`;
    const page = row?.page?.trim();
    return {
      key: `request.contents.${index + 1}`,
      label: `หน้า 3 · Table of Content · ${index + 1}. ${title}`,
      value: title,
    };
  });
  const contentPages = Array.from({ length: 6 }, (_, index) => {
    const row = s.contents?.[index] ?? defaults.contents[index];
    return {
      key: `request.contents.${index + 1}.page`,
      label: `หน้า 3 · Table of Content · ${index + 1}. หน้า`,
      value: row?.page?.trim() || "",
    };
  });
  return [...variables, ...contents, ...contentPages];
}

/** Convert the old automatic cover into editable boxes with live request bindings. */
export function defaultMaterialCoverPages(config: MaterialDocSetup): LayoutPage[] {
  const page = newPage(config.paper === "A3" ? "A3" : "A4", config.orientation, 0);
  const text = (value: string, x: number, y: number, w: number, h: number, size = config.font_size) => newSlot({ kind: "text", text: value, x, y, w, h, border: false, text_font_size: size });
  page.slots = [text(config.company, 0, 0, 100, 6), { ...text(config.title, 0, 13, 100, 10, 20), align: "center" }];
  const rows: [string, string][] = [["Doc. No.", "document_no"], ["Date", "submission_date"], ["วัสดุ", "description"], ["Project Title", "project_title"], ["Location", "location"], ["Owner", "owner"], ["PMC", "pmc"], ["Contractor", "contractor"], ["Sub Contractor", "subcontractor"], ["Purpose", "submission_purpose"], ["Prepared", "prepared_by"], ["Checked / CM", "checked_by"], ["Approved / PM", "approved_by"]];
  rows.forEach(([label, key], i) => {
    const y = i < 2 ? 6 + i * 4 : 25 + (i - 2) * 6;
    page.slots.push(text(label, 0, y, 26, 6), { ...text("", 27, y, 73, 6), variable: `request.${key}` });
  });
  return [page];
}
