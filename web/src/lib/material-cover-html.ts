import { tableColumnWidths, tableRowHeights, isCovered, mergeAt, paperMm, TEXT_SIZE_MM, type LayoutSlot } from "./dcr-layout";
import { textRuns } from "./dcr-text-format";
import { materialCoverVariables } from "./material-cover-layout";
import type { MaterialDocSetup } from "./material-doc-setup";
import type { SubmissionProject } from "./material-submission";
import type { SubmissionDocumentRequest } from "./material-submission-document";

const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fonts = { default: "Sarabun, sans-serif", sans: "Arial, Sarabun, sans-serif", serif: "Georgia, Sarabun, serif", tahoma: "Tahoma, Sarabun, sans-serif", monospace: "monospace" };
/** Standalone print document using the same paper/body geometry as the section H editor. */
export function materialCoverHtml(project: SubmissionProject, request: SubmissionDocumentRequest, setup: MaterialDocSetup, fontBase64: string) {
  const variables = new Map(materialCoverVariables(project, request).map(v => [v.key, v.value]));
  function content(s: LayoutSlot) {
    const title = s.title ? `<b>${esc(s.title)}</b>` : "";
    const text = s.variable ? esc(variables.get(s.variable) || "—") : textRuns(s.text, s.text_marks).map(run => `<span style="${run.size ? `font-size:${run.size}pt;` : ""}${run.color ? `color:${run.color};` : ""}">${esc(run.text)}</span>`).join("");
    const image = s.image ? `<img src="${esc(s.image.url)}" style="width:100%;height:100%;object-fit:${s.fit}">` : "";
    if (s.kind === "shape") return `<div style="width:100%;height:100%;background:${s.shape_color};opacity:${1 - s.shape_transparency / 100};border-radius:${s.shape_type === "ellipse" ? "50%" : "0"}"></div>`;
    if (s.kind === "text") return `<div class="pad pre">${title ? title + "<br>" : ""}${text}</div>`;
    if (s.kind === "image") return `<div class="picture">${image}${title ? `<div class="caption">${esc(s.title)}</div>` : ""}</div>`;
    if (s.kind === "table") return `<div class="pad">${title}<table><colgroup>${tableColumnWidths(s.column_widths, s.cells[0]?.length || 1).map(w => `<col style="width:${w}%">`).join("")}</colgroup>${s.cells.map((row, r) => `<tr style="height:${tableRowHeights(s.row_heights, s.cells.length, TEXT_SIZE_MM[s.size] * 1.9)[r]}mm">${row.map((cell, c) => {
      if (isCovered(s.merges, r, c)) return "";
      const m = mergeAt(s.merges, r, c);
      return `<td rowspan="${m?.rs || 1}" colspan="${m?.cs || 1}" style="${s.header && r === 0 ? "background:#f1f5f9;font-weight:600;" : ""}">${esc(cell)}</td>`;
    }).join("")}</tr>`).join("")}</table></div>`;
    if (s.kind === "calendar") {
      const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(s.calendar_month);
      const [y, m] = s.calendar_month.split("-").map(Number);
      const offset = valid ? new Date(y, m - 1, 1).getDay() : 0, days = valid ? new Date(y, m, 0).getDate() : 0;
      return `<div class="pad"><b style="display:block;text-align:center">${valid ? s.calendar_month : "เลือกเดือน"}</b><div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center">${["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map(day => `<b>${day}</b>`).join("")}${Array.from({ length: offset + days }, (_, i) => `<span>${i >= offset ? i - offset + 1 : ""}</span>`).join("")}</div></div>`;
    }
    if (s.custom === "caption") return `<div class="column"><div style="flex:1;min-height:0;overflow:hidden">${image}</div><div class="pad" style="border-top:0.3mm solid #aaa">${esc(s.title) || "&nbsp;"}</div></div>`;
    if (s.custom === "sign") return `<div class="column pad" style="text-align:center"><b>${esc(s.title) || "ลงนาม"}</b><div style="flex:1"></div><div style="border-bottom:0.3mm dotted #888;width:80%;margin:auto"></div><div>( ${esc(s.text) || ".............................."} )</div><small>วันที่ ....../....../......</small></div>`;
    return `<div class="column"><b class="pad" style="background:#eff6ff">${esc(s.title) || "หมายเหตุ"}</b><div class="pad pre">${text}</div></div>`;
  }
  const pages = setup.pages || [];
  return { css: `@font-face{font-family:Sarabun;src:url(data:font/ttf;base64,${fontBase64})}*{box-sizing:border-box}body{margin:0;font-family:Sarabun,sans-serif;color:#000;line-height:1.35}section{position:relative;break-after:page;overflow:hidden}section:last-child{break-after:auto}.body{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden}.slot{position:absolute}.inner,.picture,.column{width:100%;height:100%;overflow:hidden}.picture{position:relative}.column{display:flex;flex-direction:column}.pad{padding:1.2mm 1.6mm}.pre,td{white-space:pre-wrap;overflow-wrap:anywhere}.caption{position:absolute;bottom:0;left:0;right:0;background:#ffffffd9;padding:0.6mm 1.6mm}table{width:100%;table-layout:fixed;border-collapse:collapse}td{border:0.3mm solid #aaa;vertical-align:top;padding:0.5mm 1mm}b{font-weight:600}${pages.map((p, i) => `@page cover${i}{size:${p.size} ${p.orientation};margin:10mm}`).join("")}`,
    html: pages.map((p, i) => {
      const size = paperMm(p.size, p.orientation);
      return `<section style="page:cover${i};width:${size.w - 20}mm;height:${size.h - 21}mm"><div class="body">${p.slots.map(s => `<div class="slot" style="left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%;padding:${s.kind === "text" || s.kind === "shape" ? .15 : .75}mm"><div class="inner" style="font-size:${s.kind === "text" && s.text_font_size ? `${s.text_font_size}pt` : `${TEXT_SIZE_MM[s.size]}mm`};font-family:${fonts[s.text_font]};color:${s.text_color || "#000"};text-align:${s.align};${s.kind !== "shape" && s.border ? "border:0.3mm solid #aaa;" : ""}${s.kind !== "shape" && s.shade ? "background:#f1f5f9;" : ""}">${content(s)}</div></div>`).join("")}</div></section>`;
    }).join("") };
}
