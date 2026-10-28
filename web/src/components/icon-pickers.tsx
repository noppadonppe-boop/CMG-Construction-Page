"use client";

import { useState } from "react";
import { CARD_COLORS } from "@/lib/db/menus";

const EMOJIS = [
  "📋", "📒", "📘", "📁", "📂", "🗂️", "📄", "📑", "📝", "📐", "📏", "📊", "📈", "📉", "🗓️", "📅",
  "🏗️", "🏢", "🏠", "🏭", "🚧", "🦺", "⛑️", "👷", "🔧", "🔨", "🛠️", "⚙️", "🧱", "🪜", "🚜", "🏗",
  "💰", "💵", "🧾", "💳", "🏦", "🛒", "📦", "🚚", "👥", "🤝", "👤", "🧑‍💼", "🎓", "🏆", "⭐", "✅",
  "🔍", "🔒", "🛡️", "⚠️", "🔥", "💡", "🔔", "📣", "💬", "📧", "🌐", "🔗", "🖥️", "📱", "🧮", "🧪",
];

/** เลือก emoji จากรายการ หรือพิมพ์/วาง emoji เอง */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="input flex w-48 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-lg leading-none">{value || "🙂"}</span>
        <span className="flex-1 text-muted">{value ? "เปลี่ยน Emoji" : "เลือก Emoji"}</span>
        <svg viewBox="0 0 24 24" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-[min(20rem,calc(100vw-4rem))] rounded-xl border border-border bg-surface p-2 shadow-lg">
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`grid aspect-square place-items-center rounded-md text-lg hover:bg-surface-2 ${e === value ? "bg-primary-soft" : ""}`}
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2 border-t border-border pt-2">
            <input
              className="input py-1"
              placeholder="หรือวาง emoji เอง"
              maxLength={8}
              defaultValue={EMOJIS.includes(value) ? "" : value}
              onChange={(e) => onChange(e.target.value.trim())}
            />
            <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => (onChange(""), setOpen(false))}>
              ไม่ใช้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CARD_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`สี ${c}`}
          aria-pressed={c === value}
          className={`size-8 rounded-lg ring-offset-2 ring-offset-surface ${c === value ? "ring-2 ring-primary" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

/** ไอคอนของเมนู/Card: emoji บนพื้นอ่อน หรือถ้าไม่มี emoji ใช้ตัวอักษรแรกบนพื้นสี */
export function MenuIcon({ emoji, color, name, size = 48 }: { emoji: string; color: string; name: string; size?: number }) {
  return (
    <div
      className="grid flex-none place-items-center rounded-xl font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: emoji ? `color-mix(in srgb, ${color} 14%, transparent)` : color,
      }}
    >
      {emoji || name.trim().charAt(0).toUpperCase() || "•"}
    </div>
  );
}
