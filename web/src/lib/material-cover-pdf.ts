import { PageSizes, rgb, type PDFDocument, type PDFFont } from "pdf-lib";
import { normalizeMaterialDocSetup, type MaterialDocSetup } from "./material-doc-setup";
import { blankMaterialSubmission, type SubmissionProject } from "./material-submission";
import type { SubmissionDocumentRequest } from "./material-submission-document";

/** Draw cover pages before the populated Request Form in the same PDF. */
export function addMaterialCover(pdf: PDFDocument, font: PDFFont, request: SubmissionDocumentRequest, project: SubmissionProject, setup: MaterialDocSetup) {
  const c = normalizeMaterialDocSetup(setup);
  const mm = 72 / 25.4;
  const size = [...PageSizes[c.paper]] as [number, number];
  if (c.orientation === "landscape") size.reverse();
  const left = c.margin_left * mm, top = c.margin_top * mm;
  const width = size[0] - left - c.margin_right * mm;
  const bottom = c.margin_bottom * mm + 24;
  let page = pdf.addPage(size), y = size[1] - top;
  const s = { ...blankMaterialSubmission(project, request.created_at.slice(0, 10)), ...request.submission };
  const docNo = s.document_no || request.no || "DRAFT";
  const footer = () => page.drawText(`${docNo}  |  ${s.revision}  |  Cover ${pdf.getPageCount()}`, { x: left, y: c.margin_bottom * mm, font, size: 8, color: rgb(.4, .4, .4), maxWidth: width });
  function line(text: string, fontSize = c.font_size, centered = false) {
    if (y - fontSize * 1.5 < bottom) { footer(); page = pdf.addPage(size); y = size[1] - top; }
    y -= fontSize * 1.5;
    page.drawText(text, { x: centered ? left + (width - font.widthOfTextAtSize(text, fontSize)) / 2 : left, y, font, size: fontSize });
  }
  function text(value: string, fontSize = c.font_size, centered = false) {
    for (const paragraph of value.replace(/\r/g, "").replace(/\t/g, " ").split("\n")) {
      let chunk = "";
      for (const { segment: char } of new Intl.Segmenter("th", { granularity: "grapheme" }).segment(paragraph)) {
        if (chunk && font.widthOfTextAtSize(chunk + char, fontSize) > width) { line(chunk, fontSize, centered); chunk = ""; }
        chunk += char;
      }
      line(chunk, fontSize, centered);
    }
  }
  text(c.company, 10);
  text(`Doc. No.: ${docNo}    Rev.: ${s.revision}`, 10);
  text(`Date: ${s.submission_date || "-"}`, 10);
  y -= 20;
  text(c.title, c.font_size + 6, true);
  text(request.items && request.items.length > 1 ? `รายการวัสดุ ${request.items.length} รายการ` : request.items?.[0]?.description || request.description || "-", c.font_size + 2, true);
  if (s.manufacturer) text(s.manufacturer, c.font_size, true);
  y -= 20;
  for (const [label, value] of [["Project Title", s.project_title], ["Location", s.location], ["Owner", s.owner], ["PMC", s.pmc], ["Contractor", s.contractor], ["Sub Contractor", s.subcontractor], ["Purpose", s.submission_purpose]]) {
    text(`${label}: ${value || "-"}`); y -= 8;
  }
  y -= 16;
  for (const [label, value] of [["Prepared", s.prepared_by], ["Checked / CM", s.checked_by], ["Reviewed", s.reviewed_by], ["Approved / PM", s.approved_by]]) text(`${label}: ${value || "-"}`);
  footer();
}
