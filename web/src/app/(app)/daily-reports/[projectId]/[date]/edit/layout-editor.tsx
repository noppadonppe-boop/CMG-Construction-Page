"use client";

// หัวข้อ H: แก้หน้าเอกสารแนบ — เพิ่มหน้า เลือกขนาด/แนว แบ่งช่อง (Shrink) ลากย้าย/ขยายช่อง และแม่แบบของโครงการ
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { LayoutPaper, SlotContent, SlotTable, slotBox, mm } from "@/components/dcr-layout-page";
import {
  CUSTOM_STYLES,
  MAX_SLOTS,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  PAPER_SIZES,
  SLOT_COUNTS,
  SLOT_KINDS,
  KEYBOARD_STEP,
  TEXT_SIZES,
  TEXT_SIZE_MM,
  TEXT_FONT_FAMILIES,
  TEXT_FONTS,
  expandRange,
  hasContent,
  mergeAt,
  mergeCells,
  newPage,
  newSlot,
  normalizeTable,
  placeSlot,
  paperMm,
  relayout,
  type LayoutPage,
  type LayoutSlot,
  type Orientation,
} from "@/lib/dcr-layout";
import { updateTextMarks, type TextMark } from "@/lib/dcr-text-format";
import type { LayoutVariable } from "@/lib/dcr-layout-variables";
import type { LayoutTemplates } from "@/lib/db/dcr";

export type FreshImage = { file: File; preview: string };
type Rect = { x: number; y: number; w: number; h: number };
type Drag = { mode: "move" | "e" | "s" | "se"; startX: number; startY: number; items: { id: string; origin: Rect }[]; rects: Record<string, Rect>; width: number; height: number };
type Marquee = { x0: number; y0: number; x1: number; y1: number; base: string[] };
const HISTORY_LIMIT = 50;
const rectOf = (s: { x: number; y: number; w: number; h: number }): Rect => ({ x: s.x, y: s.y, w: s.w, h: s.h });
/** เลื่อนกลุ่ม Box ทั้งชุดตาม dx/dy แต่จำกัดให้อยู่ในกระดาษ โดยไม่เปลี่ยนขนาดของแต่ละ Box */
function fitGroup(rects: Rect[], dx: number, dy: number): { dx: number; dy: number } {
  const minX = Math.min(...rects.map((r) => r.x)), maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y)), maxY = Math.max(...rects.map((r) => r.y + r.h));
  const fit = (lo: number, hi: number, v: number) => (lo <= hi ? Math.min(hi, Math.max(lo, v)) : v);
  return { dx: fit(-minX, 100 - maxX, dx), dy: fit(-minY, 100 - maxY, dy) };
}

export function LayoutEditor({
  pages,
  showTemplates = true,
  showPaperHeader = true,
  boxTools = false,
  historyKey = "",
  variableLabel = "ตัวแปรข้อมูล A–G",
  documentTitle = "เอกสารแนบ (จัดหน้า)",
  variables,
  onChange,
  letter,
  docNo,
  locked,
  fresh,
  imageBusy,
  onPickImage,
  onDropImages,
  layouts,
  templateBusy,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onSetDefault,
}: {
  showTemplates?: boolean;
  showPaperHeader?: boolean;
  /** เปิดการเลือกหลาย Box (ลากคลุม/Shift), คัดลอก–วาง, ย้อนกลับ (Ctrl+Z) และลากไปวางบนปุ่มหน้า */
  boxTools?: boolean;
  /** เปลี่ยนค่านี้เมื่อประวัติการแก้ไขควรถูกล้าง (เช่น สลับโปรไฟล์ หรือหลังบันทึก) */
  historyKey?: string;
  variableLabel?: string;
  documentTitle?: string;
  pages: LayoutPage[];
  variables: LayoutVariable[];
  onChange: (fn: (pages: LayoutPage[]) => LayoutPage[]) => void;
  letter: string;
  docNo: string;
  locked: boolean;
  /** รูปที่เลือกแล้วแต่ยังไม่อัปโหลด: slotId → preview */
  fresh: Record<string, FreshImage>;
  imageBusy: boolean;
  onPickImage: (slotId: string, file: File) => void;
  /** ช่องที่ถูกลบ/ล้างรูป — ฟอร์มจัดการลบไฟล์ใน Storage หลังบันทึก */
  onDropImages: (slots: LayoutSlot[]) => void;
  layouts: LayoutTemplates | null;
  templateBusy: boolean;
  onSaveTemplate: (name: string, keepText: boolean, makeDefault: boolean) => Promise<boolean>;
  onApplyTemplate: (id: string, mode: "replace" | "append") => void;
  onDeleteTemplate: (id: string) => void;
  onSetDefault: (id: string | null) => void;
}) {
  const [cur, setCur] = useState(0);
  const [preview, setPreview] = useState(false);
  const [selIds, setSelIds] = useState<string[]>([]);
  // Box ที่เลือกล่าสุดเป็นตัวที่แผงตั้งค่าแสดง
  const selId = selIds[selIds.length - 1] ?? null;
  const setSelId = (id: string | null) => setSelIds(id ? [id] : []);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; r: number; c: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [textSelection, setTextSelection] = useState<{ id: string; start: number; end: number } | null>(null);
  const canvasTextRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editingId) canvasTextRef.current?.focus(); }, [editingId]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropPage, setDropPage] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const index = Math.min(cur, Math.max(0, pages.length - 1));
  const page = pages[index] as LayoutPage | undefined;
  const sel = page?.slots.find((s) => s.id === selId) ?? null;
  const selected = page ? page.slots.filter((s) => selIds.includes(s.id)) : [];

  // ── ประวัติการแก้ไข (Ctrl+Z), คลิปบอร์ด Box (Ctrl+C / Ctrl+V) ──
  const past = useRef<LayoutPage[][]>([]);
  const lastKey = useRef<string | null>(null);
  const clipboard = useRef<LayoutSlot[]>([]);
  useEffect(() => { past.current = []; lastKey.current = null; }, [historyKey]);
  /** เก็บสถานะก่อนแก้ไขลงประวัติ; การแก้ไขต่อเนื่องที่มี key เดียวกัน (เช่นพิมพ์ข้อความ) จะรวมเป็นรายการเดียว */
  const commit = (fn: (all: LayoutPage[]) => LayoutPage[], key?: string) => {
    if (boxTools) {
      const merge = key !== undefined && lastKey.current === key;
      if (!merge) past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), pages];
      lastKey.current = key ?? null;
    }
    onChange(fn);
  };
  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    lastKey.current = null;
    setDrag(null);
    onChange(() => prev);
  }
  function copySelected() {
    if (!selected.length) return;
    clipboard.current = selected.map((s) => structuredClone(s));
  }
  /** วาง Box ที่คัดลอกไว้ — ขนาดคงเดิมทุกช่อง เลื่อนเฉพาะตำแหน่ง (ไม่ย่อ/ยืด) */
  function pasteClipboard() {
    if (!page || !clipboard.current.length || page.slots.length + clipboard.current.length > MAX_SLOTS) return;
    const rects = clipboard.current.map((s) => rectOf(s));
    const shift = fitGroup(rects, 3, 3);
    const copies = clipboard.current.map((s) => ({ ...structuredClone(s), id: crypto.randomUUID(), x: s.x + shift.dx, y: s.y + shift.dy }));
    // ตำแหน่งวางครั้งต่อไปจะเลื่อนต่อจากชุดนี้ เพื่อไม่ให้ทับกันพอดี
    clipboard.current = copies.map((s) => structuredClone(s));
    commit((all) => all.map((p, i) => (i === index ? { ...p, slots: [...p.slots, ...copies] } : p)));
    setSelIds(copies.map((s) => s.id));
  }

  const setPage = (fn: (p: LayoutPage) => LayoutPage, key?: string) => commit((all) => all.map((p, i) => (i === index ? fn(p) : p)), key);
  const setSlot = (id: string, patch: Partial<LayoutSlot>, key?: string) => setPage((p) => ({ ...p, slots: p.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }), key);

  function addPage() {
    const next = { ...newPage(page?.size, page?.orientation, 1), slots: [] };
    commit((all) => [...all, next]);
    setCur(pages.length);
    setSelId(null);
  }
  function duplicatePage() {
    if (!page) return;
    // สำเนาหน้าอ้างอิงรูปเดิม
    const copy: LayoutPage = { ...structuredClone(page), id: crypto.randomUUID(), slots: page.slots.map((s) => ({ ...structuredClone(s), id: crypto.randomUUID() })) };
    commit((all) => [...all.slice(0, index + 1), copy, ...all.slice(index + 1)]);
    setCur(index + 1);
    setSelId(null);
  }
  function deletePage() {
    if (!page) return;
    if (page.slots.some(hasContent) && !confirm(`ลบหน้า ${letter}-${index + 1} และเนื้อหาในหน้านี้?`)) return;
    onDropImages(page.slots);
    commit((all) => all.filter((_, i) => i !== index));
    setCur(Math.max(0, index - 1));
    setSelId(null);
  }
  function movePage(dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= pages.length) return;
    commit((all) => {
      const next = [...all];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setCur(to);
  }
  function setCount(n: number) {
    if (!page) return;
    const dropped = page.slots.slice(n);
    if (dropped.some(hasContent) && !confirm(`ช่องที่ ${n + 1}–${page.slots.length} มีเนื้อหาอยู่ จะถูกลบออก — ดำเนินการต่อ?`)) return;
    onDropImages(dropped);
    setPage((p) => relayout(p, n));
    if (selId && dropped.some((s) => s.id === selId)) setSelId(null);
  }
  function addSlot() {
    if (!page || page.slots.length >= MAX_SLOTS) return;
    const s = newSlot({ x: 0, y: 0, w: 40, h: 30, kind: "text" });
    setPage((p) => ({ ...p, slots: [...p.slots, s] }));
    setSelId(s.id);
  }
  function addShape() {
    if (!page || page.slots.length >= MAX_SLOTS) return;
    const s = placeSlot(newSlot({ kind: "shape", border: false, w: 20, h: 8 }), { x: sel?.x ?? 0, y: sel?.y ?? 0, w: 20, h: 8 });
    setPage((p) => ({ ...p, slots: [...p.slots, s] }));
    setSelId(s.id);
  }
  function removeSlot(s: LayoutSlot) {
    if (hasContent(s) && !confirm("ลบช่องนี้และเนื้อหาในช่อง?")) return;
    onDropImages([s]);
    setPage((p) => ({ ...p, slots: p.slots.filter((x) => x.id !== s.id) }));
    setSelId(null);
  }

  // ── ลากย้าย / ขยาย: ระหว่างลากเก็บใน state ของ editor แล้วค่อยบันทึกลงรายงานตอนปล่อย ──
  function startDrag(e: ReactPointerEvent, s: LayoutSlot, mode: Drag["mode"]) {
    e.stopPropagation();
    const grouping = boxTools && mode === "move" && selIds.length > 1 && selIds.includes(s.id);
    if (boxTools && e.shiftKey) setSelIds(selIds.includes(s.id) ? selIds.filter((id) => id !== s.id) : [...selIds, s.id]);
    else if (!grouping) setSelId(s.id);
    if (locked || e.button !== 0 || !bodyRef.current || (editingId === s.id || editingCell?.id === s.id)) return;
    if (boxTools && e.shiftKey) return;
    e.preventDefault();
    const box = bodyRef.current.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // ลากกลุ่ม: ย้ายทุก Box ที่เลือกพร้อมกัน (ขนาดไม่เปลี่ยน) · ลากเดี่ยว/ขยาย: ทำงานกับ Box เดียว
    const members = grouping ? page!.slots.filter((x) => selIds.includes(x.id)) : [s];
    const items = members.map((m) => ({ id: m.id, origin: rectOf(m) }));
    const rects = Object.fromEntries(items.map((it) => [it.id, it.origin]));
    setDrag({ mode, startX: e.clientX, startY: e.clientY, items, rects, width: box.width, height: box.height });
  }
  function moveDrag(e: ReactPointerEvent) {
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) / drag.width) * 100;
    const dy = ((e.clientY - drag.startY) / drag.height) * 100;
    if (drag.items.length > 1) {
      const fit = fitGroup(drag.items.map((it) => it.origin), dx, dy);
      const rects = Object.fromEntries(drag.items.map((it) => [it.id, { ...it.origin, x: it.origin.x + fit.dx, y: it.origin.y + fit.dy }]));
      setDrag({ ...drag, rects });
    } else {
      const o = drag.items[0].origin;
      const raw =
        drag.mode === "move"
          ? { ...o, x: o.x + dx, y: o.y + dy }
          : { ...o, w: drag.mode === "s" ? o.w : o.w + dx, h: drag.mode === "e" ? o.h : o.h + dy };
      const original = page?.slots.find((s) => s.id === drag.items[0].id);
      if (!original) return;
      const placed = placeSlot(original, raw);
      setDrag({ ...drag, rects: { [original.id]: rectOf(placed) } });
    }
    // ลากเดี่ยวไปวางบนปุ่มหน้าอื่น → ย้าย Box ไปหน้านั้น
    if (boxTools && drag.mode === "move") {
      const tab = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-page-tab]");
      const target = tab ? Number(tab.dataset.pageTab) : null;
      setDropPage(target !== null && target !== index ? target : null);
    }
  }
  function endDrag() {
    if (!drag) return;
    const { items, rects } = drag;
    const target = dropPage;
    setDrag(null);
    setDropPage(null);
    if (target !== null && boxTools) {
      moveSlotsToPage(items.map((it) => it.id), target, rects);
      return;
    }
    const ids = new Set(items.filter((it) => {
      const r = rects[it.id], o = it.origin;
      return r && (r.x !== o.x || r.y !== o.y || r.w !== o.w || r.h !== o.h);
    }).map((it) => it.id));
    if (!ids.size) return;
    setPage((p) => ({ ...p, slots: p.slots.map((s) => (ids.has(s.id) ? { ...s, ...rects[s.id] } : s)) }));
  }
  /** ย้าย Box ที่เลือกไปหน้า `to` (ตำแหน่งตามที่ลากไว้) แล้วพาไปดูหน้านั้น */
  function moveSlotsToPage(ids: string[], to: number, rects: Record<string, Rect>) {
    if (!page || to < 0 || to >= pages.length) return;
    const moving = page.slots.filter((s) => ids.includes(s.id)).map((s) => ({ ...s, ...(rects[s.id] ?? {}) }));
    if (!moving.length || pages[to].slots.length + moving.length > MAX_SLOTS) return;
    commit((all) => all.map((p, i) => {
      if (i === index) return { ...p, slots: p.slots.filter((s) => !ids.includes(s.id)) };
      if (i === to) return { ...p, slots: [...p.slots, ...moving] };
      return p;
    }));
    setCur(to);
    setSelIds(moving.map((s) => s.id));
  }

  // ── คลุมเลือกหลาย Box: ลากบนพื้นกระดาษ (กด Shift เพื่อเพิ่มเข้าไปในที่เลือกเดิม) ──
  const pointInPaper = (e: ReactPointerEvent) => {
    const b = bodyRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return { x: clamp((e.clientX - b.left) / b.width * 100), y: clamp((e.clientY - b.top) / b.height * 100) };
  };
  function startMarquee(e: ReactPointerEvent) {
    if (!boxTools || locked || e.button !== 0 || !bodyRef.current) return;
    const p = pointInPaper(e);
    const base = e.shiftKey ? selIds : [];
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, base });
    setSelIds(base);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveMarquee(e: ReactPointerEvent) {
    if (!marquee || !page || !bodyRef.current) return;
    const p = pointInPaper(e);
    const m = { ...marquee, x1: p.x, y1: p.y };
    setMarquee(m);
    const left = Math.min(m.x0, m.x1), right = Math.max(m.x0, m.x1), top = Math.min(m.y0, m.y1), bottom = Math.max(m.y0, m.y1);
    const hits = page.slots.filter((s) => s.x < right && s.x + s.w > left && s.y < bottom && s.y + s.h > top).map((s) => s.id);
    setSelIds([...new Set([...m.base, ...hits])]);
  }
  function endMarquee() {
    setMarquee(null);
  }
  // ลูกศร = ย้าย · Shift + ลูกศร = ขยาย/หด (ทีละ KEYBOARD_STEP %)
  function onSlotKey(e: KeyboardEvent, s: LayoutSlot) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || locked) return;
    e.preventDefault();
    const [dx, dy] = [d[0] * KEYBOARD_STEP, d[1] * KEYBOARD_STEP];
    const next = placeSlot(s, e.shiftKey ? { ...s, w: s.w + dx, h: s.h + dy } : { ...s, x: s.x + dx, y: s.y + dy });
    setSlot(s.id, { x: next.x, y: next.y, w: next.w, h: next.h });
  }

  // Ctrl/⌘ + Z = ย้อนกลับ · Ctrl/⌘ + C = คัดลอก Box ที่เลือก · Ctrl/⌘ + V = วาง — ข้ามเมื่อกำลังพิมพ์ในช่องข้อความ
  function onEditorKey(e: KeyboardEvent) {
    if (!boxTools || locked || editingId || editingCell || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === "c" && selected.length) { e.preventDefault(); copySelected(); }
    else if (k === "v" && clipboard.current.length) { e.preventDefault(); pasteClipboard(); }
  }

  return (
    <div className="space-y-3" onKeyDown={onEditorKey}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{preview ? "แสดงทุกหน้าเรียงตามลำดับ รวมการแก้ไขล่าสุด" : "จัดหน้าเอกสารแนบ"}</span>
        <button type="button" className="btn px-3 py-1 text-xs" disabled={!pages.length && !preview} aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "กลับไปจัดหน้า" : "ดูตัวอย่างทุกหน้า"}</button>
      </div>
      {preview ? (
        <div className="space-y-6 rounded-lg bg-surface-2 p-3 sm:p-5" aria-label="ตัวอย่างเอกสารแนบทุกหน้า">
          {pages.map((p, i) => (
            <div key={p.id} className="mx-auto w-full" style={{ maxWidth: paperMm(p.size, p.orientation).w / 420 * 880 }}>
              <div className="mb-1 text-xs font-medium text-muted">{letter}-{i + 1} · {p.size} {p.orientation === "portrait" ? "แนวตั้ง" : "แนวนอน"}</div>
              <LayoutPaper showHeader={showPaperHeader} page={p} letter={letter} title={`${documentTitle}${pages.length > 1 ? ` (${letter}-${i + 1})` : ""}`} right={`${docNo} · หน้า ${i + 1}/${pages.length}`} className="dcr-layout-preview shadow-sm">
                {p.slots.map(s => <div key={s.id} style={slotBox(s)}><SlotContent slot={s} src={fresh[s.id]?.preview} variableValue={variables.find(v => v.key === s.variable)?.value} weatherTable={variables.find(v => v.key === s.variable)?.weatherTable} /></div>)}
              </LayoutPaper>
            </div>
          ))}
        </div>
      ) : (<>
      {/* หน้า */}
      <div className="flex flex-wrap items-center gap-1.5">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={i === index}
            data-page-tab={i}
            onClick={() => { setCur(i); setSelId(null); }}
            className={`rounded-md border px-2.5 py-1 text-xs ${dropPage === i ? "ring-2 ring-primary border-primary bg-primary-soft text-primary" : i === index ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text"}`}
          >
            {letter}-{i + 1} · {p.size} {p.orientation === "portrait" ? "ตั้ง" : "นอน"}
          </button>
        ))}
        <button type="button" className="rounded-md border border-dashed border-text/30 px-2.5 py-1 text-xs text-primary hover:border-primary" onClick={addPage}>+ เพิ่มหน้า</button>
        {page && (
          <span className="ml-auto flex gap-1">
            <IconButton label="เลื่อนหน้าไปทางซ้าย" disabled={index === 0} onClick={() => movePage(-1)}>←</IconButton>
            <IconButton label="เลื่อนหน้าไปทางขวา" disabled={index === pages.length - 1} onClick={() => movePage(1)}>→</IconButton>
            <IconButton label="ทำซ้ำหน้านี้" onClick={duplicatePage}>⧉</IconButton>
            <IconButton label="ลบหน้านี้" danger onClick={deletePage}>✕</IconButton>
          </span>
        )}
      </div>

      {!page ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          ยังไม่มีหน้าเอกสารแนบ — เพิ่มหน้าใหม่ หรือเลือกแม่แบบของโครงการด้านล่าง
          <div className="mt-3 flex justify-center gap-2">
            <button type="button" className="btn" onClick={addPage}>+ เพิ่มหน้า A4</button>
          </div>
        </div>
      ) : (
        <>
          {/* ตั้งค่าหน้า */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <Field label="ขนาด">
              <Segmented value={page.size} options={PAPER_SIZES.map((s) => [s, s])} onChange={(size) => setPage((p) => ({ ...p, size }))} />
            </Field>
            <Field label="แนว">
              <Segmented<Orientation> value={page.orientation} options={[["portrait", "▯ ตั้ง"], ["landscape", "▭ นอน"]]} onChange={(orientation) => setPage((p) => ({ ...p, orientation }))} />
            </Field>
            <Field label="จัดแบ่งช่อง">
              <select aria-label="จำนวนช่องในหน้า" className="dcr-cell w-20 py-0.5" value={SLOT_COUNTS.includes(page.slots.length) ? page.slots.length : ""} onChange={(e) => setCount(Number(e.target.value))}>
                {!SLOT_COUNTS.includes(page.slots.length) && <option value="">{page.slots.length}</option>}
                {SLOT_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => setPage((p) => relayout(p, p.slots.length))} title="วางทุกช่องกลับเป็นตาราง เนื้อหาเดิมคงอยู่">▦ จัดเรียงอัตโนมัติ</button>
            <button type="button" className="btn px-2.5 py-1 text-xs" disabled={page.slots.length >= MAX_SLOTS} onClick={addSlot}>+ เพิ่ม Box</button>
            <button type="button" className="btn px-2.5 py-1 text-xs" disabled={page.slots.length >= MAX_SLOTS} onClick={addShape}>+ เพิ่ม Shape / ไฮไลต์</button>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            {/* กระดาษ */}
            <div className="rounded-lg bg-surface-2 p-3 outline-none" tabIndex={boxTools ? -1 : undefined} onPointerDown={(e) => { setSelId(null); startMarquee(e); }} onPointerMove={moveMarquee} onPointerUp={endMarquee} onPointerCancel={endMarquee} onDragOver={(e) => { if (!locked) e.preventDefault(); }} onDrop={(e) => {
              if (locked || !bodyRef.current) return;
              e.preventDefault();
              const key = e.dataTransfer.getData("application/x-dcr-variable");
              const bounds = bodyRef.current.getBoundingClientRect();
              if (!variables.some(v => v.key === key) || e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom || page.slots.length >= MAX_SLOTS) return;
              const w = key === "B.table" ? 65 : 30;
              const h = key === "B.table" ? 16 : 10;
              const slot = placeSlot(newSlot({ kind: "text", variable: key, border: false, w, h }), { x: (e.clientX - bounds.left) / bounds.width * 100, y: (e.clientY - bounds.top) / bounds.height * 100, w, h });
              setPage(p => ({ ...p, slots: [...p.slots, slot] })); setSelId(slot.id);
            }}>
              <LayoutPaper
                showHeader={showPaperHeader}
                page={page}
                letter={letter}
                title={showTemplates ? `${letter}-${index + 1}` : documentTitle}
                right={`${docNo} · ${page.size} ${page.orientation === "portrait" ? "Portrait" : "Landscape"} · หน้า ${index + 1}/${pages.length}`}
                bodyRef={bodyRef}
                className={`shadow-sm ${page.orientation === "portrait" ? "max-w-[620px]" : "max-w-[880px]"}`}
              >
                {page.slots.map((s, i) => {
                  const active = selIds.includes(s.id);
                  const rect = drag?.rects[s.id] ?? s;
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`ช่อง ${i + 1} ${s.kind === "custom" ? CUSTOM_STYLES[s.custom] : SLOT_KINDS[s.kind]}`}
                      aria-pressed={active}
                      style={slotBox({ ...rect, kind: s.kind })}
                      className={`group touch-none outline-none ${locked ? "" : "cursor-move"} ${active ? "" : ""}`}
                      onPointerDown={(e) => { e.currentTarget.focus({ preventScroll: true }); startDrag(e, s, "move"); }}
                      onDoubleClick={(e) => { if (!locked && s.kind === "text" && !s.variable) { e.stopPropagation(); setSelId(s.id); setEditingId(s.id); setTextSelection(null); } }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onFocus={() => { if (!selIds.includes(s.id)) setSelId(s.id); }}
                      onKeyDown={(e) => onSlotKey(e, s)}
                    >
                      <div className={`relative size-full select-none ${active ? "outline-2 outline-primary" : "outline-1 outline-text/30 outline-dashed group-hover:outline-primary/60"}`}>
                        <SlotContent onResizeTable={active && !locked && s.kind === "table" ? patch => setSlot(s.id, patch) : undefined} slot={s} src={fresh[s.id]?.preview} variableValue={variables.find(v => v.key === s.variable)?.value} weatherTable={variables.find(v => v.key === s.variable)?.weatherTable} placeholder={s.variable ? variables.find(v => v.key === s.variable)?.label : <Placeholder slot={s} />} editingCell={editingCell?.id === s.id ? editingCell : undefined} onSelectTable={!locked && s.kind === "table" ? () => setSelId(s.id) : undefined} onEditCell={!locked && s.kind === "table" ? (r, c) => { setSelId(s.id); setEditingCell({ id: s.id, r, c }); } : undefined} onChangeCell={(r, c, value) => setSlot(s.id, { cells: s.cells.map((row, ri) => ri === r ? row.map((v, ci) => ci === c ? value : v) : row) })} onFinishCell={() => setEditingCell(null)} />
                        {editingId === s.id && s.kind === "text" && !s.variable && <textarea
                          ref={canvasTextRef} aria-label="แก้ไขข้อความบน Box" value={s.text}
                          className="absolute inset-x-0 bottom-0 w-full resize-none border-0 bg-white outline-none select-text"
                          style={{ top: s.title ? mm(5) : 0, padding: mm(0.2), fontSize: mm(s.text_font_size != null ? s.text_font_size / 2.83464567 : TEXT_SIZE_MM[s.size]), fontFamily: TEXT_FONT_FAMILIES[s.text_font], color: s.text_color || "#000000", textAlign: s.align, lineHeight: 1.35, overflowWrap: "anywhere" }}
                          onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
                          onSelect={e => setTextSelection({ id: s.id, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
                          onChange={e => { const text = e.target.value; setSlot(s.id, { text, text_marks: updateTextMarks(s.text, text, s.text_marks ?? []) }, `text:${s.id}`); setTextSelection({ id: s.id, start: e.target.selectionStart, end: e.target.selectionEnd }); }}
                          onBlur={() => setEditingId(null)}
                        />}
                        {active && !locked && s.kind === "image" && <label className="absolute right-1 top-1 cursor-pointer rounded bg-white px-1 text-xs shadow" onPointerDown={e => e.stopPropagation()}>📷<input type="file" accept="image/*" className="sr-only" disabled={imageBusy} onChange={e => { const f = e.target.files?.[0]; if (f) onPickImage(s.id, f); e.target.value = ""; }} /></label>}
                        {fresh[s.id] && <span className="absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[10px] text-white">รอบันทึก</span>}
                        {active && !locked && selIds.length === 1 && (
                          <>
                            <Handle mode="e" onPointerDown={(e) => startDrag(e, s, "e")} />
                            <Handle mode="s" onPointerDown={(e) => startDrag(e, s, "s")} />
                            <Handle mode="se" onPointerDown={(e) => startDrag(e, s, "se")} />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {marquee && <div aria-hidden className="pointer-events-none absolute z-30 border border-primary bg-primary/10" style={{ left: `${Math.min(marquee.x0, marquee.x1)}%`, top: `${Math.min(marquee.y0, marquee.y1)}%`, width: `${Math.abs(marquee.x1 - marquee.x0)}%`, height: `${Math.abs(marquee.y1 - marquee.y0)}%` }} />}
              </LayoutPaper>
              <p className="mt-2 text-center text-[11px] text-muted">คลิกช่องเพื่อเลือก · ตาราง: ลากเส้นแบ่งเพื่อปรับคอลัมน์/แถว · ดับเบิลคลิก Box ข้อความหรือเซลล์ตารางเพื่อแก้ไข · ลากเพื่อย้าย · เลือกรูปที่ไอคอนบน Box · รูปขยายเกินขอบได้ (ส่วนที่เกินกระดาษจะไม่พิมพ์) · ลากขอบขวา/ล่าง/มุมเพื่อขยาย · ลูกศร = ย้าย, Shift + ลูกศร = ปรับขนาด (ทีละ {KEYBOARD_STEP}%)
              {boxTools && <> · ลากพื้นกระดาษเพื่อคลุมหลาย Box (Shift = เพิ่มเข้าที่เลือก) · ลากไปวางบนปุ่มหน้า (เช่น MR-2) เพื่อย้ายไปหน้านั้น · Ctrl+C / Ctrl+V คัดลอก–วาง Box (ขนาดคงเดิม) · Ctrl+Z ย้อนกลับ</>}</p>
            </div>

            {/* ตั้งค่าช่อง */}
            <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
              {sel ? (
                <SlotPanel
                  key={sel.id}
                  variableLabel={variables.find(v => v.key === sel.variable)?.label}
                  selection={textSelection?.id === sel.id ? textSelection : { start: 0, end: 0 }}
                  onSelection={(selection) => setTextSelection({ id: sel.id, ...selection })}
                  slot={sel}
                  n={page.slots.indexOf(sel) + 1}
                  fresh={fresh[sel.id]}
                  imageBusy={imageBusy}
                  onChange={(patch) => setSlot(sel.id, patch, `panel:${sel.id}:${Object.keys(patch).join(",")}`)}
                  onPickImage={(file) => onPickImage(sel.id, file)}
                  onClearImage={() => { onDropImages([sel]); setSlot(sel.id, { image: null }); }}
                  onRemove={() => removeSlot(sel)}
                  onLayer={(direction) => setPage(p => { const slots = [...p.slots]; const i = slots.findIndex(x => x.id === sel.id); const j = i + direction; if (i >= 0 && j >= 0 && j < slots.length) [slots[i], slots[j]] = [slots[j], slots[i]]; return { ...p, slots }; })}
                />
              ) : (
                <p className="py-6 text-center text-xs text-muted">เลือกช่องบนกระดาษเพื่อตั้งค่า<br />ชนิด (ข้อความ / รูปภาพ / Custom style) และสไตล์</p>
              )}
              <div className="border-t border-border pt-3"><b>ลำดับ Box</b><div className="max-h-32 space-y-1 overflow-y-auto">{page.slots.map((slot, i) => <button key={slot.id} type="button" className="block w-full rounded border border-border px-2 py-1 text-left text-xs" onClick={() => setSelId(slot.id)}>{i + 1}. {slot.variable ? variables.find(v => v.key === slot.variable)?.label : SLOT_KINDS[slot.kind]}</button>)}</div></div>
              <div className="border-t border-border pt-3"><b>{variableLabel}</b><p className="mb-2 text-xs text-muted">ลากชื่อฟิลด์มาวางบนกระดาษหรือบนกล่อง</p><div className="max-h-72 space-y-1 overflow-y-auto">{variables.filter(v => !v.key.startsWith("B.") || v.key === "B.table").map(v => <div key={v.key} draggable={!locked} onDragStart={e => e.dataTransfer.setData("application/x-dcr-variable", v.key)} className="cursor-grab rounded border border-border bg-surface px-2 py-1 text-xs" title={v.value || "ยังไม่มีข้อมูล"}>{v.label}</div>)}</div></div>
            </div>
          </div>
        </>
      )}

      </>)}
      {showTemplates && <TemplateBar layouts={layouts} busy={templateBusy || imageBusy} hasPages={pages.length > 0} onSave={onSaveTemplate} onApply={onApplyTemplate} onDelete={onDeleteTemplate} onSetDefault={onSetDefault} />}
    </div>
  );
}

function Placeholder({ slot: s }: { slot: LayoutSlot }) {
  if (s.kind === "text") return <span className="text-muted">พิมพ์ข้อความในแผงด้านขวา</span>;
  if (s.kind === "table") return <span className="text-muted">…</span>;
  if (s.kind === "image" || s.custom === "caption") return <span className="text-[11px]">🖼<br />เลือกรูปในแผงด้านขวา</span>;
  return <span className="text-muted">…</span>;
}

function Handle({ mode, onPointerDown }: { mode: "e" | "s" | "se"; onPointerDown: (e: ReactPointerEvent) => void }) {
  const cls = {
    e: "top-1/2 -right-1.5 h-6 w-3 -translate-y-1/2 cursor-ew-resize",
    s: "-bottom-1.5 left-1/2 h-3 w-6 -translate-x-1/2 cursor-ns-resize",
    se: "-right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize",
  }[mode];
  return <span aria-hidden className={`absolute z-20 rounded-sm border border-white bg-primary ${cls}`} onPointerDown={onPointerDown} />;
}

function SlotPanel({
  slot: s,
  variableLabel,
  selection,
  onSelection,
  n,
  fresh,
  imageBusy,
  onChange,
  onPickImage,
  onClearImage,
  onRemove,
  onLayer,
}: {
  slot: LayoutSlot;
  variableLabel?: string;
  selection: { start: number; end: number };
  onSelection: (selection: { start: number; end: number }) => void;
  n: number;
  fresh?: FreshImage;
  imageBusy: boolean;
  onChange: (patch: Partial<LayoutSlot>) => void;
  onPickImage: (file: File) => void;
  onClearImage: () => void;
  onRemove: () => void;
  onLayer: (direction: -1 | 1) => void;
}) {
  const [selectedSize, setSelectedSize] = useState(16);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const applyMarks = (marks: Pick<TextMark, "kind" | "value">[]) => {
    if (selection.start >= selection.end) return;
    onChange({ text_marks: [...(s.text_marks ?? []), ...marks.map(mark => ({ ...mark, ...selection }))] });
  };
  const usesImage = s.kind === "image" || (s.kind === "custom" && s.custom === "caption");
  const usesText = s.kind === "text" || (s.kind === "custom" && (s.custom === "note" || s.custom === "sign"));
  const titleLabel = s.kind === "custom" && s.custom === "sign" ? "ตำแหน่ง / หัวข้อลงนาม" : usesImage ? "คำบรรยาย" : "หัวข้อ";
  const textLabel = s.kind === "custom" && s.custom === "sign" ? "ชื่อผู้ลงนาม" : "ข้อความ";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <b>ตั้งค่า Box {n}</b>
        <button type="button" className="text-xs text-bad hover:underline" onClick={onRemove}>ลบช่อง</button>
      </div>
      <label className="block">
        <span className="label">ชนิดเนื้อหา</span>
        <select className="dcr-cell" value={s.kind} onChange={(e) => onChange({ kind: e.target.value as LayoutSlot["kind"] })}>
          {Object.entries(SLOT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="flex gap-2 text-xs"><button type="button" className="btn" onClick={() => onLayer(-1)}>↓ ส่งไปด้านหลัง</button><button type="button" className="btn" onClick={() => onLayer(1)}>↑ นำมาด้านหน้า</button></div>
      {s.variable && <div className="text-xs text-primary">เชื่อมตัวแปร: {variableLabel || s.variable} <button type="button" onClick={() => onChange({ variable: "" })}>✕</button></div>}
      {s.kind === "calendar" && <label className="block"><span className="label">เดือน</span><input type="month" className="dcr-cell" value={s.calendar_month} onChange={e => onChange({ calendar_month: e.target.value })} /></label>}
      {s.kind === "custom" && (
        <label className="block">
          <span className="label">รูปแบบ Custom style</span>
          <select className="dcr-cell" value={s.custom} onChange={(e) => onChange({ custom: e.target.value as LayoutSlot["custom"] })}>
            {Object.entries(CUSTOM_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      )}
      {s.kind !== "shape" && <label className="block">
        <span className="label">{titleLabel}</span>
        <input className="dcr-cell" value={s.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>}
      {s.kind !== "shape" && <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2"><span className="label">สีข้อความทั้งกล่อง</span><input type="color" aria-label="สีข้อความทั้งกล่อง" value={s.text_color || "#000000"} onChange={e => onChange({ text_color: e.target.value })} /></label>
          <button type="button" className="text-xs text-primary" onClick={() => onChange({ text_color: "" })}>คืนค่าเริ่มต้น</button>
        </div>
        <p className="text-[11px] text-muted">ใช้กับข้อความและข้อมูลจากตัวแปรในกล่องนี้ สีเฉพาะคำที่ตั้งไว้จะยังคงเดิม</p>
      </div>}
      {s.kind === "shape" && <div className="space-y-2">
        <label className="block"><span className="label">รูปทรง</span><select className="dcr-cell" value={s.shape_type} onChange={e => onChange({ shape_type: e.target.value as LayoutSlot["shape_type"] })}><option value="rectangle">สี่เหลี่ยม</option><option value="ellipse">วงรี</option></select></label>
        <label className="flex items-center gap-2 text-xs"><span>สี</span><input type="color" aria-label="สี Shape" value={s.shape_color} onChange={e => onChange({ shape_color: e.target.value })} /></label>
        <label className="block text-xs"><span>ความโปร่งใส {s.shape_transparency}%</span><input aria-label="ความโปร่งใส Shape" className="w-full" type="range" min={0} max={100} step={1} value={s.shape_transparency} onChange={e => onChange({ shape_transparency: Number(e.target.value) })} /></label>
        <p className="text-xs text-muted">ลาก Shape ไปวางบนรูปภาพ และปรับลำดับ Box เพื่อให้อยู่ด้านหน้ารูป</p>
      </div>}
      {usesText && !s.variable && (
        <label className="block">
          <span className="label">{textLabel}</span>
          {s.custom === "sign" && s.kind === "custom" ? (
            <input className="dcr-cell" value={s.text} onChange={(e) => onChange({ text: e.target.value })} />
          ) : (
            <textarea rows={4} className="dcr-cell" value={s.text} onSelect={e => onSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })} onChange={e => { const text = e.target.value; onChange({ text, text_marks: updateTextMarks(s.text, text, s.text_marks ?? []) }); onSelection({ start: e.target.selectionStart, end: e.target.selectionEnd }); }} />
          )}
        </label>
      )}
      {s.kind === "text" && !s.variable && <div className="space-y-1.5 rounded border border-border p-2 text-xs">
        <p className="text-muted">เลือกคำหรือบรรทัดบน Box หรือในช่องด้านบน แล้วกำหนดเฉพาะส่วนที่เลือก {selection.end > selection.start ? `(เลือก ${selection.end - selection.start} ตัวอักษร)` : ""}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label>ขนาด (pt) <select className="dcr-cell inline-block w-20" value={selectedSize} onChange={e => setSelectedSize(Number(e.target.value))}>{Array.from({ length: 67 }, (_, i) => i + 6).map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <button type="button" className="btn px-2 py-1" disabled={selection.start >= selection.end} onClick={() => applyMarks([{ kind: "size", value: selectedSize }])}>ใช้ขนาด</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">สี <input type="color" aria-label="สีข้อความที่เลือก" value={selectedColor} onChange={e => setSelectedColor(e.target.value)} /></label>
          <button type="button" className="btn px-2 py-1" disabled={selection.start >= selection.end} onClick={() => applyMarks([{ kind: "color", value: selectedColor }])}>ใช้สี</button>
          <button type="button" className="text-primary hover:underline" disabled={selection.start >= selection.end} onClick={() => applyMarks([{ kind: "size", value: null }, { kind: "color", value: null }])}>ล้างสไตล์ที่เลือก</button>
        </div>
      </div>}
      {usesImage && (
        <div className="space-y-1.5">
          <span className="label">รูปภาพ</span>
          <div className="flex flex-wrap gap-1.5">
            <label className={`btn cursor-pointer px-2.5 py-1 text-xs ${imageBusy ? "opacity-60" : ""}`}>
              {imageBusy ? "กำลังอัปโหลด..." : s.image || fresh ? "เปลี่ยนรูป" : "📷 อัปโหลดรูป"}
              <input type="file" accept="image/*" className="sr-only" disabled={imageBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ""; }} />
            </label>
            {(s.image || fresh) && <button type="button" className="btn px-2.5 py-1 text-xs text-bad" onClick={onClearImage}>เอารูปออก</button>}
          </div>
          <Segmented value={s.fit} options={[["contain", "พอดีช่อง"], ["cover", "เต็มช่อง (ครอป)"]]} onChange={(fit) => onChange({ fit })} />
        </div>
      )}
      {s.kind === "table" && <TableEditor slot={s} onChange={onChange} />}
      <div className="space-y-1.5 border-t border-border pt-2">
        <span className="label">สไตล์</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.border} onChange={(e) => onChange({ border: e.target.checked })} /> เส้นกรอบ</label>
          {s.kind !== "shape" && <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.shade} onChange={(e) => onChange({ shade: e.target.checked })} /> พื้นหลังเทา</label>}
        </div>
        {s.kind !== "shape" && <div className="flex flex-wrap items-center gap-2">
          <Segmented value={s.align} options={[["left", "ซ้าย"], ["center", "กลาง"], ["right", "ขวา"]]} onChange={(align) => onChange({ align })} />
          {s.kind !== "text" && <Segmented value={s.size} options={Object.entries(TEXT_SIZES) as [LayoutSlot["size"], string][]} onChange={(size) => onChange({ size })} />}
        </div>}
      </div>
      {s.kind === "text" && <div className="space-y-2 border-t border-border pt-2">
        <label className="block"><span className="label">แบบอักษร</span><select className="dcr-cell" value={s.text_font || "default"} onChange={e => onChange({ text_font: e.target.value as LayoutSlot["text_font"] })}>{Object.entries(TEXT_FONTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block"><span className="label">ขนาดตัวอักษร (pt)</span><select className="dcr-cell" value={s.text_font_size ?? ""} onChange={e => onChange({ text_font_size: e.target.value ? Number(e.target.value) : null })}><option value="">ค่าเดิมของช่อง</option>{Array.from({ length: 67 }, (_, i) => i + 6).map(size => <option key={size} value={size}>{size} pt</option>)}</select></label>
      </div>}
      <div className="text-[11px] text-muted">ตำแหน่ง X {Math.round(s.x)}% · Y {Math.round(s.y)}% · กว้าง {Math.round(s.w)}% · สูง {Math.round(s.h)}%</div>
    </div>
  );
}

/** ตารางในแผงตั้งค่า: เลือกเซลล์ (คลิก / ลาก / Shift+คลิก) แล้วรวม/แยก และพิมพ์ข้อความของเซลล์ที่เลือก */
function TableEditor({ slot: s, onChange }: { slot: LayoutSlot; onChange: (patch: Partial<LayoutSlot>) => void }) {
  const [anchor, setAnchor] = useState({ r: 0, c: 0 });
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [dragging, setDragging] = useState(false);
  const rows = s.cells.length;
  const cols = s.cells[0]?.length ?? 1;
  const clampCell = (p: { r: number; c: number }) => ({ r: Math.min(p.r, rows - 1), c: Math.min(p.c, cols - 1) });
  const range = expandRange(s.merges, clampCell(anchor), clampCell(focus));
  const count = (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
  const merged = mergeAt(s.merges, range.r0, range.c0);
  const canSplit = !!merged && merged.rs * merged.cs === count;
  const text = s.cells[range.r0]?.[range.c0] ?? "";

  const resize = (r: number, c: number) => onChange(normalizeTable(s.cells, s.merges, r, c));
  const select = (r: number, c: number) => {
    setAnchor({ r, c });
    setFocus({ r, c });
  };
  function merge() {
    const hasHidden = s.cells.some((row, r) => row.some((v, c) => v.trim() && (r !== range.r0 || c !== range.c0) && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1));
    if (hasHidden && !confirm("เซลล์ที่รวมมีข้อความอยู่หลายช่อง — ข้อความจะถูกต่อกันในเซลล์เดียว ดำเนินการต่อ?")) return;
    onChange(mergeCells(s.cells, s.merges, range));
    select(range.r0, range.c0);
  }
  function split() {
    onChange({ merges: s.merges.filter((m) => m !== merged) });
    select(range.r0, range.c0);
  }

  return (
    <div className="space-y-1.5" onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Stepper label="แถว" value={rows} min={1} max={MAX_TABLE_ROWS} onChange={(r) => resize(r, cols)} />
        <Stepper label="คอลัมน์" value={cols} min={1} max={MAX_TABLE_COLS} onChange={(c) => resize(rows, c)} />
      </div>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={s.header} onChange={(e) => onChange({ header: e.target.checked })} /> แถวแรกเป็นหัวตาราง</label>
      <p className="text-[11px] text-muted">คลิกเลือกเซลล์ · ลาก หรือ Shift+คลิก เพื่อเลือกหลายเซลล์</p>
      <div className="max-h-64 overflow-auto select-none">
        <SlotTable
          slot={s}
          className="text-xs"
          selected={(r, c) => r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1}
          onCell={{
            down: (r, c, shift) => {
              if (shift) setFocus({ r, c });
              else select(r, c);
              setDragging(true);
            },
            enter: (r, c) => dragging && setFocus({ r, c }),
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn px-2.5 py-1 text-xs" disabled={count < 2 || canSplit} onClick={merge}>รวมเซลล์</button>
        <button type="button" className="btn px-2.5 py-1 text-xs" disabled={!canSplit} onClick={split}>แยกเซลล์</button>
        {count > 1 && !canSplit && <span className="text-[11px] text-muted">เลือก {range.r1 - range.r0 + 1}×{range.c1 - range.c0 + 1} เซลล์</span>}
      </div>
      <label className="block">
        <span className="label">ข้อความในเซลล์ (แถว {range.r0 + 1}, คอลัมน์ {range.c0 + 1})</span>
        <textarea
          rows={2}
          className="dcr-cell"
          value={text}
          onChange={(e) => onChange({ cells: s.cells.map((row, r) => (r === range.r0 ? row.map((v, c) => (c === range.c0 ? e.target.value : v)) : row)) })}
        />
      </label>
    </div>
  );
}

function TemplateBar({
  layouts,
  busy,
  hasPages,
  onSave,
  onApply,
  onDelete,
  onSetDefault,
}: {
  layouts: LayoutTemplates | null;
  busy: boolean;
  hasPages: boolean;
  onSave: (name: string, keepText: boolean, makeDefault: boolean) => Promise<boolean>;
  onApply: (id: string, mode: "replace" | "append") => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [keepText, setKeepText] = useState(true);
  const [makeDefault, setMakeDefault] = useState(true);
  const [error, setError] = useState<string>();
  const templates = layouts?.templates ?? [];
  // ยังไม่มีแม่แบบเริ่มต้น → แม่แบบที่บันทึกจะเป็นค่าเริ่มต้นเสมอ (ไม่งั้นรายงานใหม่จะไม่ได้หน้า H)
  const forceDefault = !!layouts && !layouts.default_id;
  const willOverwrite = templates.some((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function save() {
    if (!name.trim()) return setError("ใส่ชื่อแม่แบบก่อนบันทึก");
    if (!hasPages) return setError("ยังไม่มีหน้าให้บันทึกเป็นแม่แบบ");
    if (willOverwrite && !confirm(`มีแม่แบบชื่อ “${name.trim()}” อยู่แล้ว — บันทึกทับ?`)) return;
    if (await onSave(name, keepText, makeDefault)) {
      setName("");
      setMakeDefault(true);
    }
  }

  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <b className="text-sm">แม่แบบของโครงการ</b>
        <span className="text-xs text-muted">บันทึกการจัดหน้านี้ไว้ใช้กับรายงานวันถัดไป · ★ = ใช้กับรายงานฉบับใหม่อัตโนมัติ</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {!layouts && <span className="text-xs text-muted">กำลังโหลด...</span>}
        {layouts && templates.length === 0 && <span className="text-xs text-muted">ยังไม่มีแม่แบบ</span>}
        {templates.map((t) => {
          const isDefault = layouts?.default_id === t.id;
          return (
            <span key={t.id} className={`inline-flex items-center overflow-hidden rounded-full border text-xs ${isDefault ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}>
              <button type="button" title={isDefault ? "เลิกใช้เป็นค่าเริ่มต้น" : "ใช้เป็นค่าเริ่มต้นของรายงานใหม่"} aria-pressed={isDefault} className={`px-2 py-1 ${isDefault ? "text-primary" : "text-muted hover:text-primary"}`} disabled={busy} onClick={() => onSetDefault(isDefault ? null : t.id)}>
                {isDefault ? "★" : "☆"}
              </button>
              <button type="button" className="py-1 pr-1 font-medium hover:text-primary" title="ใช้แม่แบบนี้แทนหน้าปัจจุบัน" onClick={() => onApply(t.id, "replace")}>
                {t.name} <span className="font-normal text-muted">({t.pages.length} หน้า)</span>
              </button>
              <button type="button" className="px-1.5 py-1 text-primary hover:underline" title="เพิ่มหน้าของแม่แบบต่อท้าย" onClick={() => onApply(t.id, "append")}>+ ต่อท้าย</button>
              <button type="button" aria-label={`ลบแม่แบบ ${t.name}`} className="px-2 py-1 text-muted hover:bg-bad-soft hover:text-bad" disabled={busy} onClick={() => confirm(`ลบแม่แบบ “${t.name}”?`) && onDelete(t.id)}>✕</button>
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="ชื่อแม่แบบ" className="dcr-cell w-60 py-1" placeholder="ชื่อแม่แบบ เช่น รูปหน้างาน 4 ช่อง" value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} /> เก็บหัวข้อ/ข้อความด้วย</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={makeDefault || forceDefault} disabled={forceDefault} title={forceDefault ? "โครงการยังไม่มีแม่แบบเริ่มต้น — แม่แบบแรกจะใช้กับรายงานใหม่อัตโนมัติ" : undefined} onChange={(e) => setMakeDefault(e.target.checked)} /> ใช้กับรายงานใหม่ (★)</label>
        <button type="button" className="btn px-2.5 py-1 text-xs" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก..." : willOverwrite ? "บันทึกทับแม่แบบ" : "บันทึกกับโครงการ"}</button>
        {error && <span className="text-xs text-bad">{error}</span>}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">แม่แบบเก็บตำแหน่ง ขนาด สไตล์ และตัวแปรที่เชื่อมไว้เสมอ เมื่อใช้กับรายงานใหม่ตัวแปรจะแสดงข้อมูลของรายงานนั้นโดยไม่ต้องจัดวางใหม่ · รูปที่อัปโหลดจะเก็บไว้กับแม่แบบด้วย</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      {children}
    </span>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <span role="group" className="inline-flex overflow-hidden rounded-md border border-border text-xs">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)} className={`px-2 py-0.5 [&+&]:border-l [&+&]:border-border ${v === value ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"}`}>
          {label}
        </button>
      ))}
    </span>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted">{label}</span>
      <button type="button" aria-label={`ลด${label}`} className="grid size-5 place-items-center rounded border border-border" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="w-4 text-center tabular-nums">{value}</span>
      <button type="button" aria-label={`เพิ่ม${label}`} className="grid size-5 place-items-center rounded border border-border" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`grid size-7 place-items-center rounded border border-border text-xs disabled:opacity-40 ${danger ? "text-muted hover:bg-bad-soft hover:text-bad" : "text-muted hover:text-text"}`}>
      {children}
    </button>
  );
}
