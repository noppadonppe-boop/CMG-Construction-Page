import { blankMaterialSubmission, type MaterialSubmission, type SubmissionProject } from "./material-submission";

export interface SubmissionDocumentRequest {
  files?: { file_name?: string; url: string; path?: string }[];
  document_profile_id?: string;
  document_profile_name?: string;
  area?: string;
  items?: { area?: string; description: string; spec: string; unit: string; quantity: number; require_schedule: string; remark: string }[];
  no: string;
  description: string;
  spec: string;
  unit: string;
  quantity: number;
  require_schedule: string;
  remark: string;
  created_at: string;
  submission?: MaterialSubmission | null;
}

const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const show = (value: unknown) => escape(value || "—");
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/** Conservative line budgets keep long rows together and repeat headers on continuation pages. */
function paginate<T>(rows: T[], cost: (row: T) => number, budget = 24): T[][] {
  const pages: T[][] = [[]];
  let used = 0;
  for (const row of rows) {
    const lines = cost(row);
    if (used + lines > budget && pages.at(-1)!.length) { pages.push([]); used = 0; }
    pages.at(-1)!.push(row);
    used += lines;
  }
  return pages;
}

export function materialSubmissionFilename(request: SubmissionDocumentRequest) {
  return `${request.submission?.document_no || request.no || "Material-Request"}_${request.submission?.revision || "R0"}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 150);
}

/** Self-contained escaped HTML also works on static hosting, without a PDF server. */
export function buildMaterialSubmissionDocument(project: SubmissionProject, request: SubmissionDocumentRequest, draft = false) {
  const s = request.submission ?? { ...blankMaterialSubmission(project, request.created_at.slice(0, 10)), contents: [], history: [] };
  const docNo = s.document_no || request.no || "DRAFT";
  const description = request.items?.length ? request.items.length === 1 ? request.items[0].description : `รายการวัสดุ ${request.items.length} รายการ (Material Items)` : request.description;
  const coverLength = [description, s.manufacturer, s.project_title, s.location, s.owner, s.pmc, s.contractor, s.subcontractor, s.submission_purpose, s.prepared_by, s.checked_by, s.reviewed_by, s.approved_by].join("").length;
  const area = request.items?.length === 1 ? request.items[0].area : !request.items?.length ? request.area : "";
  const title = `<div class="cover-title"><h1>Material Submission for Approval</h1><h2>${show(description)}</h2>${s.manufacturer ? `<p>${escape(s.manufacturer)}</p>` : ""}${area ? `<p>พื้นที่: ${escape(area)}</p>` : ""}<p>For use in project</p></div>`;
  const projectRows = [["Project Title", s.project_title], ["Location", s.location], ["Owner", s.owner], ["PMC", s.pmc], ["Contractor", s.contractor], ["Sub Contractor", s.subcontractor]];
  const details = (rows: string[][]) => `<dl class="project">${rows.map(([label, value]) => `<dt>${label}</dt><dd>${show(value)}</dd>`).join("")}</dl>`;
  const signatures = `<table class="signatures"><colgroup><col style="width:7%"><col style="width:14%"><col style="width:19%"><col span="4" style="width:15%"></colgroup><tbody><tr class="sign-space">${Array.from({ length: 7 }, () => "<td></td>").join("")}</tr><tr>${[s.revision, date(s.submission_date), s.submission_purpose, s.prepared_by, s.checked_by, s.reviewed_by, s.approved_by].map((v) => `<td>${show(v)}</td>`).join("")}</tr><tr>${["REV.", "DATE", "DESCRIPTION", "PREPARED", "CHECKED", "REVIEWED", "APPROVED"].map((v) => `<th>${v}</th>`).join("")}</tr></tbody></table>`;
  const bodies = coverLength > 1100
    ? [title + details(projectRows.slice(0, 3)), '<h1 class="section-title">PROJECT DETAILS (continued)</h1>' + details(projectRows.slice(3)) + signatures]
    : [title + details(projectRows) + signatures];
  const coverPages = bodies.length;
  const history = s.history;
  for (const [index, rows] of paginate(history, (r) => 2 + Math.ceil(r.details.length / 40) + (r.details.match(/\n/g)?.length || 0)).entries()) {
    bodies.push(`<h1 class="section-title">HISTORY OF SUBMISSION${index ? " (continued)" : ""}</h1><table class="history"><colgroup><col style="width:18%"><col style="width:24%"><col style="width:58%"></colgroup><thead><tr><th>Revision</th><th>Revision Date</th><th>Revision Details</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td>${show(r.revision)}</td><td>${date(r.date)}</td><td>${show(r.details)}</td></tr>`).join("") : '<tr><td colspan="3">—</td></tr>'}</tbody></table>`);
  }
  let item = 0;
  for (const [index, rows] of paginate(s.contents, (r) => 1 + Math.ceil(r.title.length / 48) + (r.title.match(/\n/g)?.length || 0)).entries()) {
    bodies.push(`<h1 class="section-title">TABLE OF CONTENT${index ? " (continued)" : ""}</h1><table class="contents"><colgroup><col style="width:7%"><col style="width:80%"><col style="width:13%"></colgroup><thead><tr><th>No.</th><th>Section</th><th>Page</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td>${++item}</td><td>${show(r.title)}</td><td>${show(r.page)}</td></tr>`).join("") : '<tr><td colspan="3">—</td></tr>'}</tbody></table>`);
  }
  if (request.items && request.items.length > 1) {
    for (const [index, rows] of paginate(request.items, (row) => 2 + Math.ceil((row.description.length + row.spec.length + (row.area?.length || 0) + row.remark.length) / 35), 20).entries()) {
      bodies.push(`<h1 class="section-title">MATERIAL ITEMS${index ? " (continued)" : ""}</h1><table class="history"><thead><tr><th>Description / Spec</th><th>พื้นที่</th><th>Quantity / Unit</th><th>Require Schedule</th><th>Remark</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${show(row.description)}<br>${show(row.spec)}</td><td>${show(row.area)}</td><td>${show(row.quantity)} ${show(row.unit)}</td><td>${date(row.require_schedule)}</td><td>${show(row.remark)}</td></tr>`).join("")}</tbody></table>`);
    }
  }
  // Multi-item requests append their item schedule after the three submission sections.
  const header = (page: number) => `<header><div class="brand"><b>CMG</b><span>${show(s.subcontractor)}</span></div><dl><dt>Doc. Title</dt><dd>Material Approval Request</dd><dt>Doc. No.</dt><dd>${escape(docNo)}</dd><dt>Rev. No.</dt><dd>${show(s.revision)}</dd><dt>Page</dt><dd>${page} of ${bodies.length}</dd></dl></header>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escape(materialSubmissionFilename(request))}</title><style>
    *{box-sizing:border-box}html{background:#e5e7eb}body{margin:0;color:#111;font-family:Tahoma,Arial,sans-serif;font-size:11pt;line-height:1.55}
    @page{size:A4 portrait;margin:0}.page{width:210mm;min-height:297mm;margin:8mm auto;padding:18mm 16mm 14mm;background:#fff;display:flex;flex-direction:column;break-after:page;position:relative}.page:last-child{break-after:auto}
    header{border:1px solid #111;display:grid;grid-template-columns:34% 66%;min-height:25mm;font-size:9pt;flex-shrink:0}header .brand{border-right:1px solid #111;padding:3mm;display:flex;flex-direction:column;justify-content:center}.brand b{font:700 23pt Arial;letter-spacing:2px}.brand span{font-size:7pt;line-height:1.4}
    header dl{display:grid;grid-template-columns:24% minmax(0,1fr);gap:0 2mm;margin:0;padding:2mm 3mm}dt,dd{margin:0}header dd{text-align:right;font-weight:600}dd,td,th,.brand span,h2,.cover-title p{overflow-wrap:anywhere;white-space:pre-wrap}h1,h2,p{margin:0}.cover-title{text-align:center;margin:24mm 0 20mm}.cover-title h1{font-size:17pt}.cover-title h2{font-size:15pt;margin:5mm 0 2mm;line-height:1.45}.cover-title p{font-size:12pt;margin-top:2mm}
    .project{display:grid;grid-template-columns:29mm 1fr;gap:3mm 4mm;margin:0 2mm 10mm;font-size:11pt}.project dd:before{content:':';display:inline-block;width:4mm;margin-left:-4mm}.project dd{padding-left:4mm}
    table{border-collapse:collapse;table-layout:fixed;width:100%;break-inside:auto}td,th{border:1px solid #222;padding:3mm 2mm;vertical-align:middle}thead{display:table-header-group}tr{break-inside:avoid}th{font-weight:600}.signatures{margin-top:auto;font-size:7.5pt;text-align:center}.signatures td{padding:2mm 1mm}.signatures th{padding:2mm 0.5mm;font-size:6.7pt}.sign-space{height:12mm}
    .section-title{text-align:center;font-size:17pt;margin:24mm 0 13mm}.history{text-align:center;font-size:10.5pt}.history td:last-child{text-align:left}.history th{padding:5mm 2mm}.contents th,.contents td{border:0;padding:3mm 1mm;text-align:left}.contents th{font-size:9pt;color:#555;border-bottom:1px solid #bbb}.contents td{font-size:11pt;font-weight:600}.contents td:last-child,.contents th:last-child{text-align:right}
    .draft{font-size:9pt;color:#9b1c1c;text-align:right;margin:2mm 0 -6mm}footer{margin-top:auto;padding-top:5mm;font-size:7pt;color:#666;text-align:right;overflow-wrap:anywhere}
    [data-compact="true"]{padding-top:14mm;padding-bottom:10mm}[data-compact="true"] .cover-title{margin:5mm 0}[data-compact="true"] .cover-title h1{font-size:14pt}[data-compact="true"] .cover-title h2{font-size:12pt;margin:2mm 0;line-height:1.3}[data-compact="true"] .cover-title p{font-size:10pt;line-height:1.3}[data-compact="true"] .project{font-size:8.5pt;line-height:1.35;gap:1.5mm 4mm;margin-bottom:4mm}[data-compact="true"] .signatures{font-size:7pt}[data-compact="true"] .sign-space{height:8mm}[data-compact="true"] header{font-size:8pt}[data-compact="true"] .brand span{font-size:6.5pt}[data-compact="true"] footer{padding-top:3mm}
    @media print{html,body{background:white}.page{margin:0;box-shadow:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media screen{.page{box-shadow:0 2px 12px #0002}}
  </style></head><body>${bodies.map((body, i) => `<section class="page"${i < coverPages && coverLength > 700 ? ' data-compact="true"' : ""}>${header(i + 1)}${draft ? '<div class="draft">DRAFT / ยังไม่ได้บันทึก</div>' : ""}${body}<footer>${escape(docNo)} · ${show(s.revision)} · ${i + 1} / ${bodies.length}</footer></section>`).join("")}</body></html>`;
}
