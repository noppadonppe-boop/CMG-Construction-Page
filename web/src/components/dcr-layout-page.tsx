/* eslint-disable @next/next/no-img-element -- รูปจาก Storage / blob preview */
// หน้ากระดาษของหัวข้อ H — ใช้ทั้งในฟอร์มแก้ไข (มีตัวจับลาก) และหน้ารายงาน/พิมพ์
// ขนาดทุกอย่างคิดเป็น "มม. บนกระดาษ" ผ่านตัวแปร --mm: จอ = ย่อตามความกว้าง, พิมพ์ = 1mm จริง (ดู .dcr-hpage ใน globals.css)
import type { CSSProperties, ReactNode, Ref } from "react";
import { PAGE_MARGIN_MM, TEXT_SIZE_MM, isCovered, mergeAt, paperMm, type LayoutPage, type LayoutSlot } from "@/lib/dcr-layout";

/** ความสูงแถบหัวหน้า + ระยะห่างก่อน Body (มม.) */
const HEADER_MM = 8;
const GAP_MM = 2;

export function LayoutPaper({
  page,
  letter,
  title,
  right,
  bodyRef,
  className = "",
  children,
}: {
  page: LayoutPage;
  letter: string;
  title: string;
  /** ข้อความชิดขวาของแถบหัว เช่น Doc. no. · หน้า 1/2 */
  right: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  className?: string;
  /** ช่องทั้งหมด (วางแบบ absolute ด้วย slotBox) */
  children: ReactNode;
}) {
  const paper = paperMm(page.size, page.orientation);
  const w = paper.w - PAGE_MARGIN_MM * 2;
  // หัก 1 มม. กันเนื้อหาล้นไปหน้าถัดไปตอนพิมพ์
  const h = paper.h - PAGE_MARGIN_MM * 2 - 1;
  return (
    <div className={`dcr-hpage-wrap dcr-paper-${page.size.toLowerCase()}-${page.orientation} ${className}`} style={{ "--pw": w, "--ph": h } as CSSProperties}>
      <div className="dcr-hpage" style={{ aspectRatio: `${w} / ${h}` }}>
        <div className="absolute inset-x-0 top-0 flex items-center gap-[calc(var(--mm)*2)] border-b-2 border-primary" style={{ height: mm(HEADER_MM) }}>
          <span className="dcr-letter" style={{ width: mm(5), height: mm(5), fontSize: mm(2.8) }}>{letter}</span>
          <span className="font-semibold" style={{ fontSize: mm(3.4) }}>{title}</span>
          <span className="ml-auto text-muted" style={{ fontSize: mm(2.6) }}>{right}</span>
        </div>
        <div ref={bodyRef} className="absolute inset-x-0 bottom-0" style={{ top: mm(HEADER_MM + GAP_MM) }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export const mm = (n: number) => `calc(var(--mm) * ${n})`;

/** กรอบตำแหน่งของช่อง (% ของ Body) — เว้นระยะครึ่งช่องไฟรอบช่องให้ช่องติดกันไม่ทับเส้น */
export const slotBox = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  position: "absolute",
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
  padding: mm(0.75),
});

/** เนื้อหาของช่อง 1 ช่อง — src = รูปที่จะแสดง (รูปที่บันทึกแล้ว หรือ preview ที่ยังไม่อัปโหลด) */
export function SlotContent({ slot: s, src, placeholder }: { slot: LayoutSlot; src?: string | null; placeholder?: ReactNode }) {
  const style: CSSProperties = {
    fontSize: mm(TEXT_SIZE_MM[s.size]),
    textAlign: s.align,
    border: s.border ? `${mm(0.3)} solid color-mix(in srgb, var(--text) 35%, transparent)` : undefined,
    background: s.shade ? "var(--surface-2)" : undefined,
  };
  const pad = { padding: `${mm(1.2)} ${mm(1.6)}` };
  const image = src ?? s.image?.url ?? null;
  const picture = image ? (
    <img src={image} alt={s.title || "รูปประกอบ"} className="size-full min-h-0" style={{ objectFit: s.fit }} />
  ) : (
    <div className="grid size-full place-items-center text-center text-muted">{placeholder}</div>
  );

  const body = (() => {
    if (s.kind === "text") {
      return (
        <div className="size-full overflow-hidden whitespace-pre-wrap" style={pad}>
          {s.title && <div className="font-semibold">{s.title}</div>}
          {s.text || (!s.title && placeholder)}
        </div>
      );
    }
    if (s.kind === "table") {
      return (
        <div className="size-full overflow-hidden" style={pad}>
          {s.title && <div className="font-semibold" style={{ marginBottom: mm(0.8) }}>{s.title}</div>}
          <SlotTable slot={s} />
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
            <div className="font-semibold">{s.title || "ลงนาม"}</div>
            <div className="min-h-0 flex-1" />
            <div className="mx-auto w-4/5 border-b border-dotted border-text/50" />
            <div style={{ marginTop: mm(0.8) }}>{s.text ? `( ${s.text} )` : "(..............................)"}</div>
            <div className="text-muted" style={{ fontSize: mm(2.4) }}>วันที่ ......../......../........</div>
          </div>
        );
      case "note":
        return (
          <div className="flex size-full flex-col overflow-hidden">
            <div className="bg-primary-soft font-semibold text-primary" style={{ ...pad, paddingBlock: mm(0.8) }}>{s.title || "หมายเหตุ"}</div>
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
}: {
  slot: Pick<LayoutSlot, "cells" | "merges" | "header" | "align" | "size">;
  selected?: (r: number, c: number) => boolean;
  onCell?: { down: (r: number, c: number, shift: boolean) => void; enter: (r: number, c: number) => void };
  className?: string;
}) {
  const editing = !!onCell;
  return (
    <table className={`w-full table-fixed border-collapse ${className}`}>
      <tbody>
        {s.cells.map((row, r) => (
          <tr key={r}>
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
                  className={`border align-top whitespace-pre-wrap ${head ? "bg-surface-2 font-semibold" : "font-normal"} ${on ? "bg-primary-soft! text-primary outline-2 -outline-offset-2 outline-primary" : ""} ${editing ? "cursor-pointer border-border" : "border-text/30"}`}
                  style={editing ? { textAlign: s.align, padding: "2px 4px", height: 24 } : { padding: `${mm(0.5)} ${mm(1)}`, height: mm(TEXT_SIZE_MM[s.size] * 1.9), textAlign: s.align }}
                  onPointerDown={onCell && ((e) => { e.preventDefault(); onCell.down(r, c, e.shiftKey); })}
                  onPointerEnter={onCell && (() => onCell.enter(r, c))}
                >
                  {text || (editing ? "\u00a0" : "")}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
