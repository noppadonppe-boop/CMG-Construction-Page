import { PDFDocument, PDFName, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { addMaterialCover } from "./material-cover-pdf";
import type { MaterialDocSetup } from "./material-doc-setup";
import type { SubmissionProject } from "./material-submission";
import type { SubmissionDocumentRequest } from "./material-submission-document";

export const MATERIAL_TEMPLATE_URL = "/material-request/Request%20Rebar%20Materials%2001.pdf";
export const MATERIAL_FONT_URL = "/material-request/Sarabun-Regular.ttf";
const ROWS_PER_PAGE = 9;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const STORAGE_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);

export type MaterialRequestAttachment = { file_name?: string; url: string; path?: string };

/** Append supported Request attachments as real pages in the same PDF. */
export async function appendMaterialRequestAttachments(pdf: PDFDocument, files: MaterialRequestAttachment[], options: { allowLocalUrls?: boolean; timeoutMs?: number } = {}) {
  for (const file of files) {
    const url = new URL(file.url);
    const localUrl = url.protocol === "blob:" || url.protocol === "data:";
    if (!((url.protocol === "https:" && STORAGE_HOSTS.has(url.hostname)) || (options.allowLocalUrls && localUrl))) {
      throw new Error("URL ไฟล์แนบต้องมาจาก Firebase Storage");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw new Error(`โหลดไฟล์แนบ ${file.file_name || "ไม่ทราบชื่อ"} หมดเวลา`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`โหลดไฟล์แนบ ${file.file_name || "ไม่ทราบชื่อ"} ไม่สำเร็จ`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error(`ไฟล์แนบ ${file.file_name || "ไม่ทราบชื่อ"} มีขนาดเกิน 20 MB`);
    const label = file.file_name || "ไม่ทราบชื่อ";
    const type = (response.headers.get("content-type") || "").toLowerCase();
    const name = (file.file_name || "").toLowerCase();
    const pathname = decodeURIComponent(url.pathname).toLowerCase();
    // Storage often serves application/octet-stream, so trust the file signature first.
    const startsWith = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte);
    const sniffedPdf = bytes.subarray(0, 1024).some((_, i, a) => a[i] === 0x25 && a[i + 1] === 0x50 && a[i + 2] === 0x44 && a[i + 3] === 0x46);
    const sniffedPng = startsWith(0x89, 0x50, 0x4e, 0x47);
    const sniffedJpg = startsWith(0xff, 0xd8, 0xff);
    if (sniffedPdf || type.includes("pdf") || /\.pdf$/i.test(name) || /\.pdf$/i.test(pathname)) {
      try {
        // ignoreEncryption: PDFs with owner-password/permission flags (common for scanned or exported docs) would otherwise throw.
        const attached = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await pdf.copyPages(attached, attached.getPageIndices());
        copied.forEach((page) => pdf.addPage(page));
      } catch (error) {
        throw new Error(`รวมไฟล์แนบ ${label} ไม่ได้: ${error instanceof Error ? error.message : "ไฟล์ PDF เสียหายหรือมีการเข้ารหัส"}`);
      }
      continue;
    }
    const isPng = sniffedPng || type.includes("png") || /\.png$/i.test(name) || /\.png$/i.test(pathname);
    const isJpg = sniffedJpg || type.includes("jpeg") || type.includes("jpg") || /\.jpe?g$/i.test(name) || /\.jpe?g$/i.test(pathname);
    if (isPng || isJpg) {
      const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([792, 612]);
      const margin = 28;
      const scale = Math.min((792 - margin * 2) / image.width, (612 - margin * 2) / image.height, 1);
      const width = image.width * scale, height = image.height * scale;
      page.drawImage(image, { x: (792 - width) / 2, y: (612 - height) / 2, width, height });
      continue;
    }
    throw new Error(`ไฟล์แนบ ${label} ไม่ใช่ PDF หรือรูปภาพ จึงต่อท้าย PDF ไม่ได้`);
  }
}

export async function buildMaterialRequestPdfWithAttachments(
  request: SubmissionDocumentRequest,
  template: Uint8Array,
  fontBytes: Uint8Array,
  cover: { project: SubmissionProject; setup: MaterialDocSetup } | undefined,
  files: MaterialRequestAttachment[],
  options: { allowLocalUrls?: boolean; timeoutMs?: number } = {},
) {
  const base = await buildMaterialRequestPdf(request, template, fontBytes, cover);
  const pdf = await PDFDocument.load(base);
  await appendMaterialRequestAttachments(pdf, files, options);
  return pdf.save();
}

function date(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    ? value.split("-").reverse().join("/") : "";
}

/** The current template has nine rows, then document number (73) and date (74). */
export function materialRequestFieldPages(request: SubmissionDocumentRequest): Record<string, string>[] {
  const items = request.items?.length ? request.items : request.description?.trim() ? [request] : [];
  return Array.from({ length: Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE)) }, (_, page) => {
    const fields: Record<string, string> = Object.fromEntries(Array.from({ length: 75 }, (_, i) => [`fill_${i + 1}`, ""]));
    fields.fill_73 = request.submission?.document_no || request.no || "";
    fields.fill_74 = date(request.submission?.submission_date || request.created_at.slice(0, 10));
    items.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE).forEach((item, row) => {
      const values = [String(page * ROWS_PER_PAGE + row + 1), item.description, item.spec, item.unit,
        Number.isFinite(item.quantity) && item.quantity > 0 ? String(item.quantity) : "", date(item.require_schedule), item.area || "", item.remark];
      values.forEach((value, col) => { fields[`fill_${row * 8 + col + 1}`] = value || ""; });
    });
    return fields;
  });
}

/** Shared by the browser download and email attachment; exports a static PDF without viewer field highlighting. */
export async function buildMaterialRequestPdf(request: SubmissionDocumentRequest, template: Uint8Array, fontBytes: Uint8Array, cover?: { project: SubmissionProject; setup: MaterialDocSetup }): Promise<Uint8Array> {
  const source = await PDFDocument.load(template);
  const sourceFields = source.getForm().getFields();
  const expected = Array.from({ length: 75 }, (_, i) => `fill_${i + 1}`);
  if (source.getPageCount() !== 1 || sourceFields.length !== expected.length || expected.some((name) => !sourceFields.some((field) => field.getName() === name))) {
    throw new Error("แบบฟอร์ม Material Request ไม่ตรงกับฟิลด์ที่กำหนด กรุณาตรวจไฟล์ใน Form");
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Include shaped Thai glyphs and their widths, including glyphs without Unicode entries.
  const font = await pdf.embedFont(fontBytes, { subset: true });
  if (cover) addMaterialCover(pdf, font, request, cover.project, cover.setup);
  // Embed the original artwork, including its printed labels and signatures.
  // Recreate widgets at their original positions so continuation pages have independent fields.
  const background = await pdf.embedPage(source.getPage(0));
  const form = pdf.getForm();
  for (const [pageIndex, values] of materialRequestFieldPages(request).entries()) {
    const page = pdf.addPage([background.width, background.height]);
    page.drawPage(background);
    for (const original of sourceFields) {
      const name = original.getName();
      const widgets = original.acroField.getWidgets();
      if (widgets.length !== 1) throw new Error(`ชื่อฟิลด์ซ้ำในแบบฟอร์ม: ${name}`);
      const rect = widgets[0].getRectangle();
      const field = form.createTextField(pageIndex ? `page_${pageIndex + 1}_${name}` : name);
      const value = values[name].replace(/\s+/g, " ").trim();
      field.setText(value);
      field.addToPage(page, { ...rect, borderWidth: 0, backgroundColor: undefined, borderColor: undefined, textColor: rgb(0, 0, 0), font });
      const width = value ? font.widthOfTextAtSize(value, 1) : 1;
      field.setFontSize(Math.min(8, (rect.width - 4) / width, (rect.height - 2) / font.heightAtSize(1)));
      field.updateAppearances(font);
    }
  }
  // Bake the already-generated Thai appearances into page content before removing fields.
  form.flatten({ updateFieldAppearances: false });
  for (const page of pdf.getPages()) page.node.delete(PDFName.of("Annots"));
  pdf.catalog.delete(PDFName.of("AcroForm"));
  pdf.setTitle(request.submission?.document_no || request.no || "Material Request");
  return pdf.save();
}
