"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dropdown เลือกได้หลายค่า (role / โครงการ) — popup อยู่ชั้นบนสุด z-[10010] ไม่ถูกตารางหรือการ์ดอื่นบัง
 */
export function MultiSelect<T extends string>({
  options,
  value,
  onChange,
  placeholder = "เลือก",
  disabled,
  label,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  placeholder?: string;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input flex min-h-9 items-center gap-1 text-left disabled:opacity-60"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-muted">{placeholder}</span>
          ) : (
            selected.map((o) => (
              <span key={o.value} className="rounded bg-primary-soft px-1.5 text-xs text-primary">
                {o.label}
              </span>
            ))
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-none text-muted">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 z-[10010] mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          {options.length === 0 && <div className="px-2 py-1.5 text-xs text-muted">ไม่มีตัวเลือก</div>}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block">{o.label}</span>
                {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
