"use client";
import { useRef } from "react";
import { resizeTableColumn, TEXT_SIZE_MM, type LayoutSlot } from "@/lib/dcr-layout";

export function TableResizeHandle({ axis, index, widths, heights, size, onChange }: { axis: "column" | "row"; index: number; widths: number[]; heights: number[]; size: LayoutSlot["size"]; onChange: (patch: Partial<LayoutSlot>) => void }) {
  const drag = useRef<{ start: number; scale: number; widths: number[]; heights: number[] } | null>(null);
  function update(delta: number, originalWidths = widths, originalHeights = heights) {
    if (axis === "column") onChange({ column_widths: resizeTableColumn(originalWidths, index, delta) });
    else onChange({ row_heights: originalHeights.map((h, i) => i === index ? Math.max(3, Math.min(400, h + delta)) : h) });
  }
  return <span role="separator" tabIndex={0} aria-label={axis === "column" ? `ปรับความกว้างคอลัมน์ ${index + 1}` : `ปรับความสูงแถว ${index + 1}`} aria-orientation={axis === "column" ? "vertical" : "horizontal"}
    className={`absolute z-20 touch-none select-none hover:bg-primary/50 focus:bg-primary/50 outline-none ${axis === "column" ? "right-[-3px] top-0 h-full w-[6px] cursor-col-resize" : "bottom-[-3px] left-0 h-[6px] w-full cursor-row-resize"}`}
    onDoubleClick={e => e.stopPropagation()}
    onPointerDown={e => {
      e.preventDefault(); e.stopPropagation(); if (e.button !== 0) return;
      const table = e.currentTarget.closest("table")!;
      const scale = axis === "column" ? table.getBoundingClientRect().width / 100 : parseFloat(getComputedStyle(table).fontSize) / TEXT_SIZE_MM[size];
      drag.current = { start: axis === "column" ? e.clientX : e.clientY, scale, widths: [...widths], heights: [...heights] };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => { if (!drag.current) return; e.stopPropagation(); const d = drag.current; update(((axis === "column" ? e.clientX : e.clientY) - d.start) / d.scale, d.widths, d.heights); }}
    onPointerUp={e => { e.stopPropagation(); drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={e => { e.stopPropagation(); drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={e => { e.stopPropagation(); const keys = axis === "column" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]; if (keys.includes(e.key)) { e.preventDefault(); update(e.key === keys[0] ? -1 : 1); } }} />;
}
