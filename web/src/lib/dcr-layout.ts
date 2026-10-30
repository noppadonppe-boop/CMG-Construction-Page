// หัวข้อ H: หน้าเอกสารแนบแบบจัดหน้าเอง — 1 หน้า = กระดาษ A4/A3 ตั้ง/นอน แบ่งเป็นช่อง (Shrink) วางตำแหน่งอิสระ
// ตำแหน่ง/ขนาดช่องเก็บเป็น % ของพื้นที่ Body ของหน้า จึงแสดงได้ทุกขนาดจอและพิมพ์ได้ตรงขนาดกระดาษ

import type { StoredImage } from "./dcr";

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

export const SLOT_KINDS = { text: "ข้อความ", image: "รูปภาพ", table: "ตาราง", custom: "Custom style" } as const;
export type SlotKind = keyof typeof SLOT_KINDS;
export const CUSTOM_STYLES = { caption: "รูป + คำบรรยาย", sign: "ช่องลงนาม", note: "กล่องหมายเหตุ" } as const;
export type CustomStyle = keyof typeof CUSTOM_STYLES;
export const TEXT_SIZES = { s: "เล็ก", m: "กลาง", l: "ใหญ่" } as const;
export type TextSize = keyof typeof TEXT_SIZES;
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
  /** หัวข้อ / คำบรรยาย / ตำแหน่งผู้ลงนาม */
  title: string;
  /** ข้อความ (text, note) / ชื่อผู้ลงนาม (sign) */
  text: string;
  image: StoredImage | null;
  fit: "contain" | "cover";
  /** ตาราง (kind = table): ข้อความแต่ละเซลล์ แถว × คอลัมน์ — เซลล์ที่ถูกรวมเก็บค่าว่าง */
  cells: string[][];
  merges: CellMerge[];
  /** แถวแรกเป็นหัวตาราง */
  header: boolean;
  border: boolean;
  shade: boolean;
  align: Align;
  size: TextSize;
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

export const SNAP = 2.5;
export const MIN_SLOT = 10;
export const MAX_SLOTS = 12;
export const SLOT_COUNTS = [1, 2, 3, 4, 5, 6, 8, 9, 12];

export const snap = (v: number) => Math.round(v / SNAP) * SNAP;
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
    title: "",
    text: "",
    image: null,
    fit: "contain",
    cells: [["", "", ""], ["", "", ""], ["", "", ""]],
    merges: [],
    header: true,
    border: true,
    shade: false,
    align: "left",
    size: "m",
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

/** ย้าย/ขยายช่องแล้วจัดให้อยู่ใน Body และตรงเส้นตาราง */
export function placeSlot(s: LayoutSlot, rect: { x: number; y: number; w: number; h: number }): LayoutSlot {
  const w = clamp(snap(rect.w), MIN_SLOT, 100);
  const h = clamp(snap(rect.h), MIN_SLOT, 100);
  return { ...s, w, h, x: clamp(snap(rect.x), 0, 100 - w), y: clamp(snap(rect.y), 0, 100 - h) };
}

export const hasContent = (s: LayoutSlot) => Boolean(s.image || s.text.trim() || s.cells.some((r) => r.some((c) => c.trim())));

/** หน้าที่ใช้เป็นแม่แบบ: ตัดรูปออก (รูปผูกกับรายงานแต่ละวัน) — keepText = เก็บหัวข้อ/ข้อความไว้ด้วย */
export function toTemplatePages(pages: LayoutPage[], keepText: boolean): LayoutPage[] {
  return pages.map((p) => ({
    ...p,
    slots: p.slots.map((s) => ({
      ...s,
      image: null,
      ...(keepText ? {} : { title: "", text: "", cells: s.cells.map((r) => r.map(() => "")) }),
    })),
  }));
}

/** นำแม่แบบมาใช้กับรายงาน: สร้าง id ใหม่ทุกหน้า/ช่อง ไม่ให้ซ้ำกับรายงานอื่น */
export const fromTemplate = (pages: LayoutPage[]): LayoutPage[] =>
  pages.map((p) => ({ ...p, id: crypto.randomUUID(), slots: p.slots.map((s) => ({ ...s, id: crypto.randomUUID(), image: null })) }));

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
  return {
    id: typeof v.id === "string" ? v.id : base.id,
    x: pct(v.x, 0),
    y: pct(v.y, 0),
    w: pct(v.w, 50) || 50,
    h: pct(v.h, 50) || 50,
    kind: legacyTable ? "table" : pick(v.kind, Object.keys(SLOT_KINDS) as SlotKind[], "image"),
    custom: pick(v.custom, Object.keys(CUSTOM_STYLES) as CustomStyle[], "caption"),
    title: String(v.title ?? ""),
    text: String(v.text ?? ""),
    image: image?.path && image?.url ? { path: String(image.path), url: String(image.url) } : null,
    fit: v.fit === "cover" ? "cover" : "contain",
    // Firestore เก็บ array ซ้อนไม่ได้ → บันทึกเป็น [{c: [...]}]
    ...normalizeTable(cells, Array.isArray(v.merges) ? (v.merges as CellMerge[]) : []),
    header: v.header !== false,
    border: v.border !== false,
    shade: v.shade === true,
    align: pick(v.align, ["left", "center", "right"] as const, "left"),
    size: pick(v.size, Object.keys(TEXT_SIZES) as TextSize[], "m"),
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
