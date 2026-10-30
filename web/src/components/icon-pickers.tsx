"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอนจาก Storage URL / blob preview */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CARD_COLORS, type IconValue } from "@/lib/db/menus";

/** ไอคอนย่อเหลือด้านยาวไม่เกินนี้ (px) — แสดงจริงไม่เกิน 56px จึงพอสำหรับจอความละเอียดสูง */
const ICON_SIZE = 128;
const MAX_ICON_INPUT_BYTES = 5 * 1024 * 1024;
const ICON_ACCEPT = "image/png,image/webp,image/jpeg,image/gif,image/svg+xml";

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

/**
 * แปลงรูปที่ผู้ใช้เลือก (PNG / WebP / JPG / GIF / SVG) เป็น WebP ขนาดไม่เกิน 128px — คงพื้นหลังโปร่งใส
 * SVG ถูกวาดลง canvas แล้วเก็บเป็นภาพ จึงไม่มีสคริปต์ใน SVG หลุดไปถึงผู้ใช้คนอื่น
 */
export async function prepareIcon(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size > MAX_ICON_INPUT_BYTES) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    // SVG ที่ไม่ระบุ width/height อาจได้ขนาด 0 — ใช้ขนาดเต็มกรอบแทน
    const w = img.naturalWidth || ICON_SIZE;
    const h = img.naturalHeight || ICON_SIZE;
    const scale = Math.min(1, ICON_SIZE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    // เบราว์เซอร์ที่เข้ารหัส WebP ไม่ได้จะคืน PNG มาแทน (ยังโปร่งใสเหมือนกัน)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
    return blob;
  } catch (e) {
    throw e instanceof Error && e.message.startsWith("แปลง") ? e : new Error("เปิดไฟล์รูปนี้ไม่ได้");
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** รูปจาก Blob ที่ยังไม่อัปโหลด — สร้าง object URL ใส่ <img> และคืนหน่วยความจำเมื่อเปลี่ยนรูป */
function BlobImage({ blob, className, style }: { blob: Blob; className: string; style: CSSProperties }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={ref} alt="" className={className} style={style} />;
}

/** เลือกไอคอน: Emoji หรืออัปโหลดรูป — ถ้ามีรูปจะแสดงรูปก่อน emoji */
export function IconPicker({
  emoji,
  icon,
  color,
  name,
  onChange,
}: {
  emoji: string;
  icon: IconValue;
  color: string;
  name: string;
  onChange: (patch: { emoji?: string; icon?: IconValue }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onChange({ icon: await prepareIcon(file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <MenuIcon emoji={emoji} icon={icon} color={color} name={name} size={48} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "กำลังเตรียมรูป..." : icon ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          </button>
          {icon && (
            <button type="button" className="btn text-bad" onClick={() => onChange({ icon: null })}>
              ลบรูป
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept={ICON_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <p className="mt-1 text-xs text-muted">PNG / WebP / SVG / JPG — ระบบย่อเหลือ {ICON_SIZE}px ให้อัตโนมัติ (แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นหลังโปร่งใส)</p>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
      {!icon && (
        <div className="mt-2">
          <div className="mb-1 text-xs text-muted">หรือใช้ Emoji</div>
          <EmojiPicker value={emoji} onChange={(e) => onChange({ emoji: e })} />
        </div>
      )}
    </div>
  );
}

/** ไอคอนของเมนู/Card/ลิงก์: รูปภาพ → emoji บนพื้นอ่อน → ตัวอักษรแรกบนพื้นสี */
export function MenuIcon({ emoji, icon, color, name, size = 48 }: { emoji: string; icon?: IconValue; color: string; name: string; size?: number }) {
  const box = { width: size, height: size };
  const imgClass = "flex-none rounded-xl object-contain";
  if (icon instanceof Blob) return <BlobImage blob={icon} className={imgClass} style={box} />;
  if (icon) return <img src={icon.url} alt="" className={imgClass} style={box} />;
  return (
    <div
      className="grid flex-none place-items-center rounded-xl font-bold text-white"
      style={{
        ...box,
        fontSize: size * 0.5,
        background: emoji ? `color-mix(in srgb, ${color} 14%, transparent)` : color,
      }}
    >
      {emoji || name.trim().charAt(0).toUpperCase() || "•"}
    </div>
  );
}
