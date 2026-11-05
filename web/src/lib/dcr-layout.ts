// หัวข้อ H: หน้าเอกสารแนบแบบจัดหน้าเอง — 1 หน้า = กระดาษ A4/A3 ตั้ง/นอน แบ่งเป็นช่อง (Shrink) วางตำแหน่งอิสระ
// ตำแหน่ง/ขนาดช่องเก็บเป็น % ของพื้นที่ Body ของหน้า จึงแสดงได้ทุกขนาดจอและพิมพ์ได้ตรงขนาดกระดาษ

import type { StoredImage } from "./dcr";
import { normalizeTextMarks, type TextMark } from "./dcr-text-format.ts";

export const PAPER_SIZES = ["A4", "A3"] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];
export type Orientation = "portrait" | "landscape";

/** ขนาดกระดาษ (มม.) แนวตั้ง */
const PAPER_MM: Record<PaperSize, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
/** ขอบกระดาษตอนพิมพ์ (มม.) — ต้องตรงกับ @page dcr-* ใน globals.css */
export const PAGE_MARGIN_MM = 10;

export function paperMm(size: PaperSize, orientation: Orientation) {
  const p = PAPER_MM[size];
  return orientation === "portrait" ? p : { w: p.h, h: p.w };
}

export const SLOT_KINDS = { text: "ข้อความ", image: "รูปภาพ", shape: "Shape / ไฮไลต์", table: "ตาราง", calendar: "ปฏิทิน", custom: "Custom style" } as const;
export type SlotKind = keyof typeof SLOT_KINDS;
export const CUSTOM_STYLES = { caption: "รูป + คำบรรยาย", sign: "ช่องลงนาม", note: "กล่องหมายเหตุ" } as const;
export type CustomStyle = keyof typeof CUSTOM_STYLES;
export const TEXT_SIZES = { s: "เล็ก", m: "กลาง", l: "ใหญ่" } as const;
export type TextSize = keyof typeof TEXT_SIZES;
/** แบบอักษรสำหรับกล่องข้อความ — ใช้ชื่อที่มี fallback ภาษาไทย */
export const TEXT_FONTS = { default: "ค่าเริ่มต้น", sans: "Arial / sans-serif", serif: "Georgia / serif", tahoma: "Tahoma", monospace: "Monospace" } as const;
export type TextFont = keyof typeof TEXT_FONTS;
export const TEXT_FONT_FAMILIES: Record<TextFont, string> = {
  default: "var(--font-sans)", sans: "Arial, Tahoma, sans-serif", serif: "Georgia, Tahoma, serif", tahoma: "Tahoma, sans-serif", monospace: "monospace",
};
/** ขนาดตัวอักษรเป็นมม. บนกระดาษจริง (≈ 7.5 / 9 / 12 pt) */
export const TEXT_SIZE_MM: Record<TextSize, number> = { s: 2.6, m: 3.2, l: 4.2 };
export type Align = "left" | "center" | "right";
/** เซลล์ที่รวมกัน: มุมซ้ายบน (r, c) กินพื้นที่ rs แถว × cs คอลัมน์ */
export type CellMerge = { r: number; c: number; rs: number; cs: number };
export const MAX_TABLE_ROWS = 15;
export const MAX_TABLE_COLS = 8;

export interface LayoutSlot {
  id: string;
  /** ตำแหน่ง/ขนาดเป็น % ของ Body */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SlotKind;
  custom: CustomStyle;
  variable: string;
  calendar_month: string;
  /** หัวข้อ / คำบรรยาย / ตำแหน่งผู้ลงนาม */
  title: string;
  /** ข้อความ (text, note) / ชื่อผู้ลงนาม (sign) */
  text: string;
  text_marks: TextMark[];
  image: StoredImage | null;
  fit: "contain" | "cover";
  /** ตาราง (kind = table): ข้อความแต่ละเซลล์ แถว × คอลัมน์ — เซลล์ที่ถูกรวมเก็บค่าว่าง */
  cells: string[][];
  column_widths?: number[];
  row_heights?: number[];
  merges: CellMerge[];
  /** แถวแรกเป็นหัวตาราง */
  header: boolean;
  border: boolean;
  shade: boolean;
  align: Align;
  size: TextSize;
  text_font: TextFont;
  /** ขนาดตัวอักษรหน่วย pt; null ใช้ขนาดเดิมของช่อง */
  text_font_size: number | null;
  text_color: string;
  shape_type: "rectangle" | "ellipse";
  shape_color: string;
  /** ความโปร่งใส 0 = ทึบ, 100 = โปร่งใส */
  shape_transparency: number;
}

export interface LayoutPage {
  id: string;
  size: PaperSize;
  orientation: Orientation;
  slots: LayoutSlot[];
}

/** แม่แบบจัดหน้าของโครงการ: projects/{id}/settings/dcr_layouts */
export interface LayoutTemplate {
  id: string;
  name: string;
  pages: LayoutPage[];
  updated_by: string;
  updated_at: string;
}

export const KEYBOARD_STEP = 0.5;
export const MIN_SLOT = 10;
/** กล่องข้อความย่อได้ละเอียดเพื่อวางตัวอักษรในช่องตาราง */
export const MIN_TEXT_SLOT = 1;
export const MAX_SLOTS = 100;
export const SLOT_COUNTS = [1, 2, 3, 4, 5, 6, 8, 9, 12];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function newSlot(patch: Partial<LayoutSlot> = {}): LayoutSlot {
  return {
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    w: 50,
    h: 50,
    kind: "image",
    custom: "caption",
    variable: "",
    calendar_month: "",
    title: "",
    text: "",
    text_marks: [],
    image: null,
    fit: "contain",
    cells: [["", "", ""], ["", "", ""], ["", "", ""]],
    merges: [],
    header: true,
    border: true,
    shade: false,
    align: "left",
    size: "m",
    text_font: "default",
    text_font_size: null,
    text_color: "",
    shape_type: "rectangle",
    shape_color: "#ffff00",
    shape_transparency: 50,
    ...patch,
  };
}

/** แบ่ง Body เป็นตาราง n ช่อง — จำนวนคอลัมน์ตามแนวกระดาษ */
export function gridRects(n: number, orientation: Orientation) {
  const cols = orientation === "portrait" ? (n <= 3 ? 1 : n <= 8 ? 2 : 3) : n <= 3 ? n : n === 4 ? 2 : n <= 6 || n === 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    // แถวสุดท้ายไม่เต็ม → ขยายช่องให้เต็มแถว
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = i - r * cols;
    return { x: (c * 100) / inRow, y: (r * 100) / rows, w: 100 / inRow, h: 100 / rows };
  });
}

/** เปลี่ยนจำนวนช่อง: ช่องเดิมเรียงตามลำดับ ได้ตำแหน่งใหม่แต่คงเนื้อหา — ช่องที่เกินถูกตัดออก */
export function relayout(page: LayoutPage, n: number): LayoutPage {
  const rects = gridRects(n, page.orientation);
  return { ...page, slots: rects.map((r, i) => ({ ...(page.slots[i] ?? newSlot({ title: `ภาพที่ ${i + 1}` })), ...r })) };
}

export function newPage(size: PaperSize = "A4", orientation: Orientation = "portrait", count = 4): LayoutPage {
  return relayout({ id: crypto.randomUUID(), size, orientation, slots: [] }, count);
}

/** ย้าย/ขยายช่องอย่างอิสระ โดยจำกัดขอบเขตตามชนิดของช่อง */
export function placeSlot(s: LayoutSlot, rect: { x: number; y: number; w: number; h: number }): LayoutSlot {
  const image = s.kind === "image" || (s.kind === "custom" && s.custom === "caption");
  const min = s.kind === "text" || s.kind === "shape" ? MIN_TEXT_SLOT : MIN_SLOT;
  const w = clamp(rect.w, min, image ? 300 : 100);
  const h = clamp(rect.h, min, image ? 300 : 100);
  return { ...s, w, h, x: clamp(rect.x, image ? MIN_SLOT - w : 0, image ? 100 - MIN_SLOT : 100 - w), y: clamp(rect.y, image ? MIN_SLOT - h : 0, image ? 100 - MIN_SLOT : 100 - h) };
}

export const hasContent = (s: LayoutSlot) => Boolean(s.kind === "shape" || s.variable || s.image || s.text.trim() || s.cells.some((r) => r.some((c) => c.trim())));

/** แม่แบบเก็บรูปและตำแหน่งไว้; keepText ควบคุมข้อความที่พิมพ์เอง */
export function toTemplatePages(pages: LayoutPage[], keepText: boolean): LayoutPage[] {
  return pages.map((p) => ({
    ...p,
    slots: p.slots.map((s) => ({
      ...s,
      ...(keepText ? {} : { title: "", text: "", text_marks: [], cells: s.cells.map((r) => r.map(() => "")) }),
    })),
  }));
}

/** นำแม่แบบมาใช้กับรายงาน: สร้าง id ใหม่ แต่เก็บรูปที่ใช้ร่วมกัน */
export const fromTemplate = (pages: LayoutPage[]): LayoutPage[] =>
  pages.map((p) => ({ ...p, id: crypto.randomUUID(), slots: p.slots.map((s) => ({ ...s, id: crypto.randomUUID() })) }));

// ───── อ่านข้อมูลจาก Firestore (ค่าไม่ครบ / ผิดชนิด → ค่าเริ่มต้น) ─────

type Loose = Record<string, unknown>;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const pct = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? clamp(Number(v), 0, 100) : fallback);

function toSlot(v: Loose): LayoutSlot {
  const base = newSlot();
  const image = v.image && typeof v.image === "object" ? (v.image as Loose) : null;
  // ตารางรุ่นแรกอยู่ใน Custom style → แปลงเป็นชนิด "ตาราง"
  const legacyTable = v.kind === "custom" && v.custom === "table";
  const cells: string[][] = Array.isArray(v.cells) && v.cells.length
    ? (v.cells as unknown[]).map((r) => (Array.isArray(r) ? r : Array.isArray((r as Loose)?.c) ? ((r as Loose).c as unknown[]) : []).map((c) => String(c ?? "")))
    : base.cells;
  const imageKind = v.kind === "image" || (v.kind === "custom" && v.custom === "caption");
  const position = (value: unknown, fallback: number, min: number, max: number) => Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback;
  return {
    id: typeof v.id === "string" ? v.id : base.id,
    x: imageKind ? position(v.x, 0, -290, 90) : pct(v.x, 0),
    y: imageKind ? position(v.y, 0, -290, 90) : pct(v.y, 0),
    w: imageKind ? position(v.w, 50, MIN_SLOT, 300) : pct(v.w, 50) || 50,
    h: imageKind ? position(v.h, 50, MIN_SLOT, 300) : pct(v.h, 50) || 50,
    kind: legacyTable ? "table" : pick(v.kind, Object.keys(SLOT_KINDS) as SlotKind[], "image"),
    custom: pick(v.custom, Object.keys(CUSTOM_STYLES) as CustomStyle[], "caption"),
    variable: typeof v.variable === "string" ? v.variable : "",
    calendar_month: typeof v.calendar_month === "string" ? v.calendar_month : "",
    title: String(v.title ?? ""),
    text: String(v.text ?? ""),
    text_marks: normalizeTextMarks(v.text_marks, String(v.text ?? "").length),
    image: image?.path && image?.url ? { path: String(image.path), url: String(image.url) } : null,
    fit: v.fit === "cover" ? "cover" : "contain",
    // Firestore เก็บ array ซ้อนไม่ได้ → บันทึกเป็น [{c: [...]}]
    ...normalizeTable(cells, Array.isArray(v.merges) ? (v.merges as CellMerge[]) : []),
    ...(Array.isArray(v.column_widths) ? { column_widths: tableColumnWidths(v.column_widths, cells[0]?.length || 1) } : {}),
    ...(Array.isArray(v.row_heights) ? { row_heights: tableRowHeights(v.row_heights, cells.length, TEXT_SIZE_MM[pick(v.size, Object.keys(TEXT_SIZES) as TextSize[], "m")] * 1.9) } : {}),
    header: v.header !== false,
    border: v.border !== false,
    shade: v.shade === true,
    align: pick(v.align, ["left", "center", "right"] as const, "left"),
    size: pick(v.size, Object.keys(TEXT_SIZES) as TextSize[], "m"),
    text_font: pick(v.text_font, Object.keys(TEXT_FONTS) as TextFont[], "default"),
    text_font_size: typeof v.text_font_size === "number" && Number.isFinite(v.text_font_size) ? clamp(v.text_font_size, 6, 72) : null,
    text_color: typeof v.text_color === "string" && /^#[0-9a-fA-F]{6}$/.test(v.text_color) ? v.text_color : "",
    shape_type: pick(v.shape_type, ["rectangle", "ellipse"] as const, "rectangle"),
    shape_color: typeof v.shape_color === "string" && /^#[0-9a-fA-F]{6}$/.test(v.shape_color) ? v.shape_color : "#ffff00",
    shape_transparency: typeof v.shape_transparency === "number" && Number.isFinite(v.shape_transparency) ? clamp(v.shape_transparency, 0, 100) : 50,
  };
}

export function normalizeLayoutPages(v: unknown): LayoutPage[] {
  if (!Array.isArray(v)) return [];
  return (v as Loose[]).map((p) => ({
    id: typeof p.id === "string" ? p.id : crypto.randomUUID(),
    size: pick(p.size, PAPER_SIZES, "A4"),
    orientation: p.orientation === "landscape" ? "landscape" : "portrait",
    slots: Array.isArray(p.slots) ? (p.slots as Loose[]).map(toSlot) : [],
  }));
}

// ───── ตาราง: ขนาด / รวมเซลล์ ─────

export type CellRange = { r0: number; r1: number; c0: number; c1: number };

export const mergeAt = (merges: CellMerge[], r: number, c: number) => merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);
/** เซลล์ถูกเซลล์อื่นรวมทับ (ไม่ต้องวาด) */
export const isCovered = (merges: CellMerge[], r: number, c: number) => {
  const m = mergeAt(merges, r, c);
  return !!m && (m.r !== r || m.c !== c);
};

/** ช่วงเซลล์ที่เลือก ขยายจนครอบเซลล์ที่รวมไว้ทั้งก้อน */
export function expandRange(merges: CellMerge[], a: { r: number; c: number }, b: { r: number; c: number }): CellRange {
  let g = { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of merges) {
      if (m.r > g.r1 || m.r + m.rs - 1 < g.r0 || m.c > g.c1 || m.c + m.cs - 1 < g.c0) continue;
      const n = { r0: Math.min(g.r0, m.r), r1: Math.max(g.r1, m.r + m.rs - 1), c0: Math.min(g.c0, m.c), c1: Math.max(g.c1, m.c + m.cs - 1) };
      if (n.r0 !== g.r0 || n.r1 !== g.r1 || n.c0 !== g.c0 || n.c1 !== g.c1) {
        g = n;
        changed = true;
      }
    }
  }
  return g;
}

/** รวมเซลล์ในช่วง — ข้อความของเซลล์อื่นต่อท้ายเซลล์มุมซ้ายบน ไม่ทิ้ง */
export function mergeCells(cells: string[][], merges: CellMerge[], g: CellRange) {
  const texts: string[] = [];
  const next = cells.map((row, r) =>
    row.map((v, c) => {
      if (r < g.r0 || r > g.r1 || c < g.c0 || c > g.c1) return v;
      if (v.trim()) texts.push(v.trim());
      return "";
    }),
  );
  next[g.r0][g.c0] = texts.join(" ");
  const kept = merges.filter((m) => m.r < g.r0 || m.r > g.r1 || m.c < g.c0 || m.c > g.c1);
  return { cells: next, merges: [...kept, { r: g.r0, c: g.c0, rs: g.r1 - g.r0 + 1, cs: g.c1 - g.c0 + 1 }] };
}

/** ปรับขนาดตาราง — เซลล์ที่รวมไว้หดตาม ถ้าเหลือเซลล์เดียวถือว่าไม่ได้รวม */
export function normalizeTable(cells: string[][], merges: CellMerge[], rows = cells.length, cols = cells[0]?.length ?? 1) {
  const R = clamp(Math.round(rows), 1, MAX_TABLE_ROWS);
  const C = clamp(Math.round(cols), 1, MAX_TABLE_COLS);
  const grid = Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => cells[i]?.[j] ?? ""));
  const taken = new Set<string>();
  const kept: CellMerge[] = [];
  for (const m of merges) {
    const r = Math.floor(Number(m.r)), c = Math.floor(Number(m.c));
    if (!(r >= 0 && r < R && c >= 0 && c < C)) continue;
    const rs = clamp(Math.floor(Number(m.rs)) || 1, 1, R - r);
    const cs = clamp(Math.floor(Number(m.cs)) || 1, 1, C - c);
    const keys = Array.from({ length: rs * cs }, (_, k) => `${r + Math.floor(k / cs)}:${c + (k % cs)}`);
    // ข้อมูลเสีย (รวมทับกัน) → ข้ามก้อนที่ซ้อน
    if (rs * cs < 2 || keys.some((k) => taken.has(k))) continue;
    keys.forEach((k) => taken.add(k));
    kept.push({ r, c, rs, cs });
  }
  return { cells: grid, merges: kept };
}

/** แปลงเป็นรูปแบบที่ Firestore เก็บได้ (ไม่มี array ซ้อน array) */
export const layoutPagesForStore = (pages: LayoutPage[]) =>
  pages.map((p) => ({ ...p, slots: p.slots.map((s) => ({ ...s, cells: s.cells.map((c) => ({ c })) })) }));

export function tableColumnWidths(values: unknown, count: number): number[] {
  const input = Array.isArray(values) ? values : [];
  const widths = Array.from({ length: count }, (_, i) => typeof input[i] === "number" && Number.isFinite(input[i]) && input[i] > 0 ? input[i] : 100 / count);
  const sum = widths.reduce((a, b) => a + b, 0);
  return widths.map(w => w / sum * 100);
}

export function tableRowHeights(values: unknown, count: number, fallback: number): number[] {
  const input = Array.isArray(values) ? values : [];
  return Array.from({ length: count }, (_, i) => typeof input[i] === "number" && Number.isFinite(input[i]) ? Math.min(400, Math.max(3, input[i])) : fallback);
}

export function resizeTableColumn(widths: number[], boundary: number, delta: number) {
  const next = [...widths];
  if (boundary < 0 || boundary >= widths.length - 1) return next;
  const min = Math.min(3, widths[boundary], widths[boundary + 1]);
  const change = Math.max(min - widths[boundary], Math.min(widths[boundary + 1] - min, delta));
  next[boundary] += change; next[boundary + 1] -= change;
  return next;
}
