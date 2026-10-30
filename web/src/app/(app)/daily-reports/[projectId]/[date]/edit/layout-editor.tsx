"use client";

// หัวข้อ H: แก้หน้าเอกสารแนบ — เพิ่มหน้า เลือกขนาด/แนว แบ่งช่อง (Shrink) ลากย้าย/ขยายช่อง และแม่แบบของโครงการ
import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { LayoutPaper, SlotContent, SlotTable, slotBox } from "@/components/dcr-layout-page";
import {
  CUSTOM_STYLES,
  MAX_SLOTS,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  PAPER_SIZES,
  SLOT_COUNTS,
  SLOT_KINDS,
  SNAP,
  TEXT_SIZES,
  expandRange,
  hasContent,
  mergeAt,
  mergeCells,
  newPage,
  newSlot,
  normalizeTable,
  placeSlot,
  relayout,
  type LayoutPage,
  type LayoutSlot,
  type Orientation,
} from "@/lib/dcr-layout";
import type { LayoutTemplates } from "@/lib/db/dcr";

export type FreshImage = { file: File; preview: string };
type Rect = { x: number; y: number; w: number; h: number };
type Drag = { id: string; mode: "move" | "e" | "s" | "se"; startX: number; startY: number; origin: Rect; rect: Rect; width: number; height: number };

export function LayoutEditor({
  pages,
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
  pages: LayoutPage[];
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
  const [selId, setSelId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const index = Math.min(cur, Math.max(0, pages.length - 1));
  const page = pages[index] as LayoutPage | undefined;
  const sel = page?.slots.find((s) => s.id === selId) ?? null;

  const setPage = (fn: (p: LayoutPage) => LayoutPage) => onChange((all) => all.map((p, i) => (i === index ? fn(p) : p)));
  const setSlot = (id: string, patch: Partial<LayoutSlot>) => setPage((p) => ({ ...p, slots: p.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  function addPage() {
    const next = page ? newPage(page.size, page.orientation, page.slots.length || 4) : newPage();
    onChange((all) => [...all.slice(0, index + 1), next, ...all.slice(index + 1)]);
    setCur(page ? index + 1 : 0);
    setSelId(null);
  }
  function duplicatePage() {
    if (!page) return;
    // ทำซ้ำเฉพาะโครง — รูปไม่ถูกคัดลอก (ไฟล์ผูกกับช่องเดิม)
    const copy: LayoutPage = { ...structuredClone(page), id: crypto.randomUUID(), slots: page.slots.map((s) => ({ ...structuredClone(s), id: crypto.randomUUID(), image: null })) };
    onChange((all) => [...all.slice(0, index + 1), copy, ...all.slice(index + 1)]);
    setCur(index + 1);
    setSelId(null);
  }
  function deletePage() {
    if (!page) return;
    if (page.slots.some(hasContent) && !confirm(`ลบหน้า ${letter}-${index + 1} และเนื้อหาในหน้านี้?`)) return;
    onDropImages(page.slots);
    onChange((all) => all.filter((_, i) => i !== index));
    setCur(Math.max(0, index - 1));
    setSelId(null);
  }
  function movePage(dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= pages.length) return;
    onChange((all) => {
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
  function removeSlot(s: LayoutSlot) {
    if (hasContent(s) && !confirm("ลบช่องนี้และเนื้อหาในช่อง?")) return;
    onDropImages([s]);
    setPage((p) => ({ ...p, slots: p.slots.filter((x) => x.id !== s.id) }));
    setSelId(null);
  }

  // ── ลากย้าย / ขยาย: ระหว่างลากเก็บใน state ของ editor แล้วค่อยบันทึกลงรายงานตอนปล่อย ──
  function startDrag(e: ReactPointerEvent, s: LayoutSlot, mode: Drag["mode"]) {
    e.stopPropagation();
    setSelId(s.id);
    if (locked || e.button !== 0 || !bodyRef.current) return;
    e.preventDefault();
    const box = bodyRef.current.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const origin = { x: s.x, y: s.y, w: s.w, h: s.h };
    setDrag({ id: s.id, mode, startX: e.clientX, startY: e.clientY, origin, rect: origin, width: box.width, height: box.height });
  }
  function moveDrag(e: ReactPointerEvent) {
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) / drag.width) * 100;
    const dy = ((e.clientY - drag.startY) / drag.height) * 100;
    const o = drag.origin;
    const raw =
      drag.mode === "move"
        ? { ...o, x: o.x + dx, y: o.y + dy }
        : { ...o, w: drag.mode === "s" ? o.w : Math.min(100 - o.x, o.w + dx), h: drag.mode === "e" ? o.h : Math.min(100 - o.y, o.h + dy) };
    const placed = placeSlot({ ...newSlot(), ...o }, raw);
    setDrag({ ...drag, rect: { x: placed.x, y: placed.y, w: placed.w, h: placed.h } });
  }
  function endDrag() {
    if (!drag) return;
    const { id, rect, origin } = drag;
    setDrag(null);
    if (rect.x !== origin.x || rect.y !== origin.y || rect.w !== origin.w || rect.h !== origin.h) setSlot(id, rect);
  }
  // ลูกศร = ย้าย · Shift + ลูกศร = ขยาย/หด (ทีละ SNAP %)
  function onSlotKey(e: KeyboardEvent, s: LayoutSlot) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || locked) return;
    e.preventDefault();
    const [dx, dy] = [d[0] * SNAP, d[1] * SNAP];
    const next = placeSlot(s, e.shiftKey ? { ...s, w: s.w + dx, h: s.h + dy } : { ...s, x: s.x + dx, y: s.y + dy });
    setSlot(s.id, { x: next.x, y: next.y, w: next.w, h: next.h });
  }

  return (
    <div className="space-y-3">
      {/* หน้า */}
      <div className="flex flex-wrap items-center gap-1.5">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={i === index}
            onClick={() => { setCur(i); setSelId(null); }}
            className={`rounded-md border px-2.5 py-1 text-xs ${i === index ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text"}`}
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
            <Field label="จำนวน Shrink">
              <select aria-label="จำนวนช่องในหน้า" className="dcr-cell w-20 py-0.5" value={SLOT_COUNTS.includes(page.slots.length) ? page.slots.length : ""} onChange={(e) => setCount(Number(e.target.value))}>
                {!SLOT_COUNTS.includes(page.slots.length) && <option value="">{page.slots.length}</option>}
                {SLOT_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => setPage((p) => relayout(p, p.slots.length))} title="วางทุกช่องกลับเป็นตาราง เนื้อหาเดิมคงอยู่">▦ จัดเรียงอัตโนมัติ</button>
            <button type="button" className="btn px-2.5 py-1 text-xs" disabled={page.slots.length >= MAX_SLOTS} onClick={addSlot}>+ เพิ่มช่อง</button>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            {/* กระดาษ */}
            <div className="rounded-lg bg-surface-2 p-3" onPointerDown={() => setSelId(null)}>
              <LayoutPaper
                page={page}
                letter={letter}
                title={`${letter}-${index + 1}`}
                right={`${docNo} · ${page.size} ${page.orientation === "portrait" ? "Portrait" : "Landscape"} · หน้า ${index + 1}/${pages.length}`}
                bodyRef={bodyRef}
                className={`shadow-sm ${page.orientation === "portrait" ? "max-w-[620px]" : "max-w-[880px]"}`}
              >
                <div className="dcr-hgrid absolute inset-0" aria-hidden />
                {page.slots.map((s, i) => {
                  const active = s.id === selId;
                  const rect = drag?.id === s.id ? drag.rect : s;
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`ช่อง ${i + 1} ${s.kind === "custom" ? CUSTOM_STYLES[s.custom] : SLOT_KINDS[s.kind]}`}
                      aria-pressed={active}
                      style={slotBox(rect)}
                      className={`group touch-none outline-none ${locked ? "" : "cursor-move"} ${active ? "z-10" : ""}`}
                      onPointerDown={(e) => startDrag(e, s, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onFocus={() => setSelId(s.id)}
                      onKeyDown={(e) => onSlotKey(e, s)}
                    >
                      <div className={`relative size-full select-none ${active ? "outline-2 outline-primary" : "outline-1 outline-text/30 outline-dashed group-hover:outline-primary/60"}`}>
                        <SlotContent slot={s} src={fresh[s.id]?.preview} placeholder={<Placeholder slot={s} />} />
                        <span className="absolute top-0.5 left-0.5 rounded bg-primary px-1 text-[10px] leading-4 font-semibold text-white">{i + 1}</span>
                        {fresh[s.id] && <span className="absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[10px] text-white">รอบันทึก</span>}
                        {active && !locked && (
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
              </LayoutPaper>
              <p className="mt-2 text-center text-[11px] text-muted">คลิกช่องเพื่อเลือก · ลากเพื่อย้าย · ลากขอบขวา/ล่าง/มุมเพื่อขยาย · ลูกศร = ย้าย, Shift + ลูกศร = ปรับขนาด (ทีละ {SNAP}%)</p>
            </div>

            {/* ตั้งค่าช่อง */}
            <div className="rounded-lg border border-border p-3 text-sm">
              {sel ? (
                <SlotPanel
                  key={sel.id}
                  slot={sel}
                  n={page.slots.indexOf(sel) + 1}
                  fresh={fresh[sel.id]}
                  imageBusy={imageBusy}
                  onChange={(patch) => setSlot(sel.id, patch)}
                  onPickImage={(file) => onPickImage(sel.id, file)}
                  onClearImage={() => { onDropImages([sel]); setSlot(sel.id, { image: null }); }}
                  onRemove={() => removeSlot(sel)}
                />
              ) : (
                <p className="py-6 text-center text-xs text-muted">เลือกช่องบนกระดาษเพื่อตั้งค่า<br />ชนิด (ข้อความ / รูปภาพ / Custom style) และสไตล์</p>
              )}
            </div>
          </div>
        </>
      )}

      <TemplateBar layouts={layouts} busy={templateBusy} hasPages={pages.length > 0} onSave={onSaveTemplate} onApply={onApplyTemplate} onDelete={onDeleteTemplate} onSetDefault={onSetDefault} />
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
  n,
  fresh,
  imageBusy,
  onChange,
  onPickImage,
  onClearImage,
  onRemove,
}: {
  slot: LayoutSlot;
  n: number;
  fresh?: FreshImage;
  imageBusy: boolean;
  onChange: (patch: Partial<LayoutSlot>) => void;
  onPickImage: (file: File) => void;
  onClearImage: () => void;
  onRemove: () => void;
}) {
  const usesImage = s.kind === "image" || (s.kind === "custom" && s.custom === "caption");
  const usesText = s.kind === "text" || (s.kind === "custom" && (s.custom === "note" || s.custom === "sign"));
  const titleLabel = s.kind === "custom" && s.custom === "sign" ? "ตำแหน่ง / หัวข้อลงนาม" : usesImage ? "คำบรรยาย" : "หัวข้อ";
  const textLabel = s.kind === "custom" && s.custom === "sign" ? "ชื่อผู้ลงนาม" : "ข้อความ";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <b>ตั้งค่า Shrink {n}</b>
        <button type="button" className="text-xs text-bad hover:underline" onClick={onRemove}>ลบช่อง</button>
      </div>
      <label className="block">
        <span className="label">ชนิดเนื้อหา</span>
        <select className="dcr-cell" value={s.kind} onChange={(e) => onChange({ kind: e.target.value as LayoutSlot["kind"] })}>
          {Object.entries(SLOT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {s.kind === "custom" && (
        <label className="block">
          <span className="label">รูปแบบ Custom style</span>
          <select className="dcr-cell" value={s.custom} onChange={(e) => onChange({ custom: e.target.value as LayoutSlot["custom"] })}>
            {Object.entries(CUSTOM_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">{titleLabel}</span>
        <input className="dcr-cell" value={s.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      {usesText && (
        <label className="block">
          <span className="label">{textLabel}</span>
          {s.custom === "sign" && s.kind === "custom" ? (
            <input className="dcr-cell" value={s.text} onChange={(e) => onChange({ text: e.target.value })} />
          ) : (
            <textarea rows={4} className="dcr-cell" value={s.text} onChange={(e) => onChange({ text: e.target.value })} />
          )}
        </label>
      )}
      {usesImage && (
        <div className="space-y-1.5">
          <span className="label">รูปภาพ</span>
          <div className="flex flex-wrap gap-1.5">
            <label className={`btn cursor-pointer px-2.5 py-1 text-xs ${imageBusy ? "opacity-60" : ""}`}>
              {imageBusy ? "กำลังย่อรูป..." : s.image || fresh ? "เปลี่ยนรูป" : "📷 อัปโหลดรูป"}
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
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.shade} onChange={(e) => onChange({ shade: e.target.checked })} /> พื้นหลังเทา</label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={s.align} options={[["left", "ซ้าย"], ["center", "กลาง"], ["right", "ขวา"]]} onChange={(align) => onChange({ align })} />
          <Segmented value={s.size} options={Object.entries(TEXT_SIZES) as [LayoutSlot["size"], string][]} onChange={(size) => onChange({ size })} />
        </div>
      </div>
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
      <p className="mt-1.5 text-[11px] text-muted">แม่แบบเก็บขนาด/แนวกระดาษ ตำแหน่งและสไตล์ของช่อง — ไม่เก็บรูป (รูปแนบเป็นของรายงานแต่ละวัน)</p>
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
