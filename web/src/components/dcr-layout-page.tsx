/* eslint-disable @next/next/no-img-element -- รูปจาก Storage / blob preview */
// หน้ากระดาษของหัวข้อ H — ใช้ทั้งในฟอร์มแก้ไข (มีตัวจับลาก) และหน้ารายงาน/พิมพ์
// ขนาดทุกอย่างคิดเป็น "มม. บนกระดาษ" ผ่านตัวแปร --mm: จอ = ย่อตามความกว้าง, พิมพ์ = 1mm จริง (ดู .dcr-hpage ใน globals.css)
import { TableResizeHandle } from "./table-resize-handle";
import { tableColumnWidths, tableRowHeights } from "@/lib/dcr-layout";
import type { CSSProperties, ReactNode, Ref } from "react";
import { DCR_TEXT, type ReportLang } from "@/lib/dcr-i18n";
import { textRuns } from "@/lib/dcr-text-format";
import { SKY_ICON } from "@/lib/dcr";
import type { LayoutVariable } from "@/lib/dcr-layout-variables";
import { PAGE_MARGIN_MM, TEXT_SIZE_MM, TEXT_FONT_FAMILIES, isCovered, mergeAt, paperMm, type LayoutPage, type LayoutSlot } from "@/lib/dcr-layout";

/** ความสูงแถบหัวหน้า + ระยะห่างก่อน Body (มม.) */
const HEADER_MM = 8;
const GAP_MM = 2;

export function LayoutPaper({
  page,
  letter,
  title,
  right,
  bodyRef,
  pdfSection,
  className = "",
  children,
  showHeader = true,
}: {
  showHeader?: boolean;
  page: LayoutPage;
  letter: string;
  title: string;
  /** ข้อความชิดขวาของแถบหัว เช่น Doc. no. · หน้า 1/2 */
  right: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  pdfSection?: string;
  className?: string;
  /** ช่องทั้งหมด (วางแบบ absolute ด้วย slotBox) */
  children: ReactNode;
}) {
  const paper = paperMm(page.size, page.orientation);
  const w = paper.w - PAGE_MARGIN_MM * 2;
  // หัก 1 มม. กันเนื้อหาล้นไปหน้าถัดไปตอนพิมพ์
  const h = paper.h - PAGE_MARGIN_MM * 2 - 1;
  return (
    <div data-pdf-section={pdfSection} className={`dcr-hpage-wrap dcr-paper-${page.size.toLowerCase()}-${page.orientation} ${className}`} style={{ "--pw": w, "--ph": h } as CSSProperties}>
      <div className="dcr-hpage" style={{ aspectRatio: `${w} / ${h}` }}>
        {showHeader && <div className="absolute inset-x-0 top-0 flex items-center gap-[calc(var(--mm)*2)] border-b-2 border-primary" style={{ height: mm(HEADER_MM) }}>
          <span className="dcr-letter" style={{ width: mm(5), height: mm(5), fontSize: mm(2.8) }}>{letter}</span>
          <span className="font-semibold" style={{ fontSize: mm(3.4) }}>{title}</span>
          <span className="ml-auto text-muted" style={{ fontSize: mm(2.6) }}>{right}</span>
        </div>}
        <div ref={bodyRef} className="absolute inset-x-0 bottom-0" style={{ top: showHeader ? mm(HEADER_MM + GAP_MM) : 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export const mm = (n: number) => `calc(var(--mm) * ${n})`;

/** กรอบตำแหน่งของช่อง (% ของ Body) — เว้นระยะครึ่งช่องไฟรอบช่องให้ช่องติดกันไม่ทับเส้น */
export const slotBox = (r: { x: number; y: number; w: number; h: number; kind?: LayoutSlot["kind"] }): CSSProperties => ({
  position: "absolute",
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
  padding: mm(r.kind === "text" || r.kind === "shape" ? 0.15 : 0.75),
});

/** เนื้อหาของช่อง 1 ช่อง — src = รูปที่จะแสดง (รูปที่บันทึกแล้ว หรือ preview ที่ยังไม่อัปโหลด) */
export function SlotContent({ slot: s, src, placeholder, variableValue, weatherTable, lang = "th", editingCell, onEditCell, onChangeCell, onFinishCell, onSelectTable, onResizeTable }: { slot: LayoutSlot; src?: string | null; placeholder?: ReactNode; variableValue?: string; weatherTable?: LayoutVariable["weatherTable"]; lang?: ReportLang; editingCell?: { r: number; c: number }; onEditCell?: (r: number, c: number) => void; onChangeCell?: (r: number, c: number, value: string) => void; onFinishCell?: () => void; onSelectTable?: () => void; onResizeTable?: (patch: Partial<LayoutSlot>) => void }) {
  const t = DCR_TEXT[lang];
  const style: CSSProperties = {
    fontSize: mm(s.kind === "text" && s.text_font_size != null ? s.text_font_size / 2.83464567 : TEXT_SIZE_MM[s.size]),
    fontFamily: s.kind === "text" ? TEXT_FONT_FAMILIES[s.text_font] : undefined,
    color: s.text_color || "#000000",
    printColorAdjust: "exact",
    textAlign: s.align,
    border: s.kind !== "shape" && s.border ? `${mm(0.3)} solid color-mix(in srgb, var(--text) 35%, transparent)` : undefined,
    background: s.kind !== "shape" && s.shade ? "var(--surface-2)" : undefined,
  };
  const pad = { padding: `${mm(1.2)} ${mm(1.6)}` };
  const image = src ?? s.image?.url ?? null;
  const picture = image ? (
    <img src={image} alt={s.title || "รูปประกอบ"} className="size-full min-h-0" style={{ objectFit: s.fit }} />
  ) : (
    <div className="grid size-full place-items-center text-center text-muted">{placeholder}</div>
  );

  const body = (() => {
    if (s.kind === "shape") {
      return <div className="size-full" style={{ backgroundColor: s.shape_color, opacity: 1 - s.shape_transparency / 100, border: s.border ? `${mm(0.3)} solid ${s.shape_color}` : undefined, borderRadius: s.shape_type === "ellipse" ? "50%" : undefined, printColorAdjust: "exact" }} />;
    }
    if (s.kind === "text") {
      if (s.variable === "B.table" && weatherTable) {
        const cell: CSSProperties = { border: `${mm(0.2)} solid var(--border)`, padding: `${mm(0.6)} ${mm(1.6)}`, textAlign: "left", overflowWrap: "anywhere" };
        return <div className="size-full overflow-hidden" style={{ padding: mm(0.2) }}>
          {s.title && <div className="font-semibold">{s.title}</div>}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "35%" }} /><col style={{ width: "31%" }} /><col style={{ width: "34%" }} /></colgroup>
            <thead><tr style={{ background: "var(--primary-soft)" }}>{[t.period, t.weather, t.workStatus].map(label => <th key={label} style={cell}>{label}</th>)}</tr></thead>
            <tbody>{([[t.am, weatherTable.am], [t.pm, weatherTable.pm]] as const).map(([label, half]) => <tr key={label}>
              <td style={cell}>{label}</td>
              <td style={cell}><span style={{ marginRight: mm(1) }}>{SKY_ICON[half.sky]}</span>{t.sky[half.sky]}</td>
              <td style={cell}><span style={{ borderRadius: mm(1), padding: `0 ${mm(1.2)}`, color: half.status === "stopped" ? "var(--bad)" : half.status === "partial" ? "var(--warn)" : "var(--ok)", background: half.status === "stopped" ? "var(--bad-soft)" : half.status === "partial" ? "var(--warn-soft)" : "var(--ok-soft)" }}>{t.work[half.status]}</span></td>
            </tr>)}</tbody>
          </table>
        </div>;
      }
      return (
        <div className="size-full overflow-hidden whitespace-pre-wrap" style={{ padding: mm(0.2), overflowWrap: "anywhere", wordBreak: "break-word" }}>
          {s.title && <div className="font-semibold">{s.title}</div>}
          {s.variable ? (variableValue || placeholder || "—") : s.text ? textRuns(s.text, s.text_marks ?? []).map(run => <span key={run.start} style={{ fontSize: run.size != null ? mm(run.size / 2.83464567) : undefined, color: run.color || undefined }}>{run.text}</span>) : (!s.title && placeholder)}
        </div>
      );
    }
    if (s.kind === "calendar") {
      const month = /^\d{4}-\d{2}$/.test(s.calendar_month) ? s.calendar_month : "";
      const [year, mon] = month.split("-").map(Number);
      const offset = month ? new Date(year, mon - 1, 1).getDay() : 0;
      const days = month ? new Date(year, mon, 0).getDate() : 0;
      return <div className="size-full overflow-hidden" style={pad}><div className="text-center font-semibold">{month || ({ th: "เลือกเดือน", en: "Select month", zh: "选择月份" }[lang])}</div><div className="grid grid-cols-7 text-center">{({ th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], zh: ["日", "一", "二", "三", "四", "五", "六"] }[lang]).map(d => <b key={d}>{d}</b>)}{Array.from({length: offset + days}, (_, i) => <span key={i}>{i >= offset ? i - offset + 1 : ""}</span>)}</div></div>;
    }
    if (s.kind === "table") {
      return (
        <div className="size-full overflow-hidden" style={pad}>
          {s.title && <div className="font-semibold" style={{ marginBottom: mm(0.8) }}>{s.title}</div>}
          <SlotTable slot={s} editingCell={editingCell} onEditCell={onEditCell} onChangeCell={onChangeCell} onFinishCell={onFinishCell} onSelectTable={onSelectTable} onResizeTable={onResizeTable} />
        </div>
      );
    }
    if (s.kind === "image") {
      return (
        <div className="relative size-full overflow-hidden">
          {picture}
          {s.title && <div className="absolute inset-x-0 bottom-0 bg-surface/85" style={{ ...pad, paddingBlock: mm(0.6) }}>{s.title}</div>}
        </div>
      );
    }
    switch (s.custom) {
      case "caption":
        return (
          <div className="flex size-full flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">{picture}</div>
            <div className="border-t border-text/25" style={{ ...pad, paddingBlock: mm(0.8) }}>{s.title || <span className="text-muted">&nbsp;</span>}</div>
          </div>
        );
      case "sign":
        return (
          <div className="flex size-full flex-col text-center" style={pad}>
            <div className="font-semibold">{s.title || ({ th: "ลงนาม", en: "Signature", zh: "签名" }[lang])}</div>
            <div className="min-h-0 flex-1" />
            <div className="mx-auto w-4/5 border-b border-dotted border-text/50" />
            <div style={{ marginTop: mm(0.8) }}>{s.text ? `( ${s.text} )` : "(..............................)"}</div>
            <div className="text-muted" style={{ fontSize: mm(2.4), color: s.text_color || undefined }}>{t.dateBlank}</div>
          </div>
        );
      case "note":
        return (
          <div className="flex size-full flex-col overflow-hidden">
            <div className="bg-primary-soft font-semibold text-primary" style={{ ...pad, paddingBlock: mm(0.8), color: s.text_color || undefined }}>{s.title || t.remark}</div>
            <div className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap" style={pad}>{s.text || placeholder}</div>
          </div>
        );
    }
  })();

  return (
    <div className="size-full overflow-hidden" style={style}>
      {body}
    </div>
  );
}

/** ตารางของช่อง — วาดเซลล์ที่รวมด้วย rowSpan/colSpan · selected/onCell ใช้ในแผงแก้ไข */
export function SlotTable({
  slot: s,
  selected,
  onCell,
  className = "",
  editingCell, onEditCell, onChangeCell, onFinishCell, onSelectTable, onResizeTable,
}: {
  editingCell?: { r: number; c: number };
  onEditCell?: (r: number, c: number) => void;
  onChangeCell?: (r: number, c: number, value: string) => void;
  onFinishCell?: () => void;
  onSelectTable?: () => void; onResizeTable?: (patch: Partial<LayoutSlot>) => void;
  slot: Pick<LayoutSlot, "cells" | "merges" | "header" | "align" | "size" | "column_widths" | "row_heights">;
  selected?: (r: number, c: number) => boolean;
  onCell?: { down: (r: number, c: number, shift: boolean) => void; enter: (r: number, c: number) => void };
  className?: string;
}) {
  const editing = !!onCell;
  const widths = tableColumnWidths(s.column_widths, s.cells[0]?.length || 1);
  const heights = tableRowHeights(s.row_heights, s.cells.length, TEXT_SIZE_MM[s.size] * 1.9);
  return (
    <table className={`w-full table-fixed border-collapse ${className}`}>
      <colgroup>{widths.map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
      <tbody>
        {s.cells.map((row, r) => (
          <tr key={r} style={{ height: editing ? Math.max(24, heights[r] * 3) : mm(heights[r]) }}>
            {row.map((text, c) => {
              if (isCovered(s.merges, r, c)) return null;
              const m = mergeAt(s.merges, r, c);
              const head = s.header && r === 0;
              const Cell = head ? "th" : "td";
              const on = selected?.(r, c);
              return (
                <Cell
                  key={c}
                  rowSpan={m?.rs}
                  colSpan={m?.cs}
                  className={`relative border align-top whitespace-pre-wrap ${head ? "bg-surface-2 font-semibold" : "font-normal"} ${on ? "bg-primary-soft! text-primary outline-2 -outline-offset-2 outline-primary" : ""} ${editing ? "cursor-pointer border-border" : "border-text/30"}`}
                  style={editing ? { textAlign: s.align, padding: "2px 4px", height: 24 } : { padding: `${mm(0.5)} ${mm(1)}`,  textAlign: s.align }}
                  onPointerDown={onCell ? ((e) => { e.preventDefault(); onCell.down(r, c, e.shiftKey); }) : onSelectTable ? ((e) => { e.stopPropagation(); onSelectTable(); }) : undefined}
                  onPointerEnter={onCell && (() => onCell.enter(r, c))}
                  onDoubleClick={onEditCell && ((e) => { e.stopPropagation(); onEditCell(r, c); })}
                >
                  {editingCell?.r === r && editingCell.c === c ? <textarea autoFocus aria-label={`แก้ไขเซลล์แถว ${r + 1} คอลัมน์ ${c + 1}`} className="w-full min-h-[2em] resize-y bg-transparent select-text" style={{ color: "inherit" }} value={text} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onChange={e => onChangeCell?.(r, c, e.target.value)} onBlur={onFinishCell} /> : text || (editing ? "\u00a0" : "")}
                  {onResizeTable && <>{c + (m?.cs || 1) < widths.length && <TableResizeHandle axis="column" index={c + (m?.cs || 1) - 1} widths={widths} heights={heights} size={s.size} onChange={onResizeTable} />}<TableResizeHandle axis="row" index={r + (m?.rs || 1) - 1} widths={widths} heights={heights} size={s.size} onChange={onResizeTable} /></>}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
