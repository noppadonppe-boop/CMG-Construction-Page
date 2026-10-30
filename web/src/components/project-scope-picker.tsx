"use client";

import { useState } from "react";
import type { ProjectRecord } from "@/lib/db/projects";

/** ป้ายสั้น ๆ บอกว่าแสดงในโครงการไหน เช่น "J-078, J-081 +2" */
export function scopeLabel(ids: string[], byId: Map<string, ProjectRecord>, max = 2) {
  const codes = ids.map((id) => byId.get(id)?.code ?? "โครงการที่ถูกลบ");
  return codes.length > max ? `${codes.slice(0, max).join(", ")} +${codes.length - max}` : codes.join(", ");
}

/**
 * เลือกโครงการที่เมนู/Card แสดง — ids = [] คือ "ทุกโครงการ" (เมนู) หรือ "ตามเมนู" (Card)
 * ตอนกดเลือกโครงการครั้งแรกยังไม่ติ๊กอะไร ฟอร์มต้องตรวจว่าเลือกอย่างน้อย 1 โครงการ (ดู scopeError)
 */
export function ProjectScopePicker({
  ids,
  limited,
  onChange,
  projects,
  allLabel,
  allHint,
  limitLabel,
  limitHint,
}: {
  ids: string[];
  limited: boolean;
  onChange: (limited: boolean, ids: string[]) => void;
  projects: ProjectRecord[];
  allLabel: string;
  allHint: string;
  limitLabel: string;
  limitHint: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = projects.filter((p) => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  const toggle = (id: string) => onChange(true, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        <ScopeOption on={!limited} label={allLabel} hint={allHint} onClick={() => onChange(false, [])} />
        <ScopeOption on={limited} label={limitLabel} hint={limitHint} onClick={() => onChange(true, ids)} />
      </div>
      {limited && (
        <div className="rounded-xl border border-border p-2">
          {projects.length > 6 && (
            <input className="input mb-1.5" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหารหัส / ชื่อโครงการ" aria-label="ค้นหาโครงการ" />
          )}
          <div className="max-h-48 overflow-auto">
            {projects.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">ยังไม่มีโครงการ</p>}
            {shown.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-mono text-xs text-muted">{p.code}</span>
                <span className="min-w-0 truncate">{p.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 px-2 text-xs text-muted">เลือกแล้ว {ids.length} โครงการ</p>
        </div>
      )}
    </div>
  );
}

/** ข้อความผิดพลาดเมื่อเลือก "เลือกโครงการ" แต่ยังไม่ติ๊กโครงการ */
export const scopeError = (limited: boolean, ids: string[]) => (limited && ids.length === 0 ? "กรุณาเลือกโครงการอย่างน้อย 1 โครงการ" : undefined);

function ScopeOption({ on, label, hint, onClick }: { on: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`rounded-xl border p-3 text-left ${on ? "border-primary bg-primary-soft/60" : "border-border hover:bg-surface-2"}`}
    >
      <div className={`font-semibold ${on ? "text-primary" : ""}`}>{label}</div>
      <div className="text-xs text-muted">{hint}</div>
    </button>
  );
}
