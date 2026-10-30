"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { addCard, CARD_COLORS, GRID_COLS, MAX_ROWS, safeUrl, updateCard, type CardInput, type MenuCard } from "@/lib/db/menus";
import { EditorDialog } from "@/components/editor-dialog";
import { ColorPicker, IconPicker, MenuIcon } from "@/components/icon-pickers";
import { ActiveSwitch } from "./active-switch";

const SIZE_PRESETS: [number, number][] = [[1, 5], [2, 5], [3, 5], [2, 7], [4, 6], [6, 6], [12, 4]];
const DESCRIPTION_MAX = 80;

/** เพิ่ม Card ใหม่ (ไม่ส่ง card) หรือแก้ Card เดิม */
export function CardDialog({ menuId, menuName, card, onClose }: { menuId: string; menuName: string; card?: MenuCard; onClose: () => void }) {
  const { userProfile } = useAuth();
  const [v, setV] = useState<CardInput>(
    card ?? { name: "", url: "", description: "", emoji: "", glyph: "globe", icon: null, color: CARD_COLORS[0], active: false, w: 2, h: 5 },
  );
  const set = (patch: Partial<CardInput>) => setV((prev) => ({ ...prev, ...patch }));
  const input = { ...v, name: v.name.trim(), url: v.url.trim(), description: v.description.trim() };

  return (
    <EditorDialog
      title={card ? "แก้ไข Card" : "เพิ่ม Card ใหม่"}
      subtitle={`หมวด: ${menuName}`}
      isNew={!card}
      submitLabel={card ? "บันทึก" : "เพิ่ม Card"}
      validate={() => {
        if (!input.name) return "กรุณาใส่ชื่อ Card";
        if (input.url !== "#" && !safeUrl(input.url)) return "URL ต้องขึ้นต้นด้วย http:// หรือ https:// (ใส่ # ถ้ายังไม่มี URL)";
      }}
      save={() => (card ? updateCard(menuId, card, input, userProfile!.email) : addCard(menuId, input, userProfile!.email))}
      onClose={onClose}
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
        <MenuIcon emoji={v.emoji} glyph={v.glyph} icon={v.icon} color={v.color} name={v.name} size={48} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{v.name || "ชื่อ Card"}</div>
          <div className="truncate font-mono text-xs text-muted">{v.url || "https://..."}</div>
          <div className="truncate text-xs text-muted">{v.description || "คำอธิบาย..."}</div>
        </div>
      </div>

      <div>
        <div className="label">ไอคอน</div>
        <IconPicker emoji={v.emoji} glyph={v.glyph} icon={v.icon} onChange={set} />
      </div>
      <div>
        <label className="label" htmlFor="card-name">ชื่อ Card *</label>
        <input id="card-name" className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="เช่น QC Dashboard" />
      </div>
      <div>
        <label className="label" htmlFor="card-url">URL *</label>
        <input
          id="card-url"
          className="input font-mono"
          value={v.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://example.web.app"
          required
          inputMode="url"
        />
        <p className="mt-1 text-xs text-muted">ใส่ # ถ้ายังไม่มี URL</p>
      </div>
      <div>
        <label className="label" htmlFor="card-desc">คำอธิบาย</label>
        <input
          id="card-desc"
          className="input"
          value={v.description}
          onChange={(e) => set({ description: e.target.value })}
          maxLength={DESCRIPTION_MAX}
          placeholder="อธิบายระบบสั้นๆ..."
        />
        <p className="mt-1 text-right text-xs text-muted">{v.description.length}/{DESCRIPTION_MAX}</p>
      </div>
      <div>
        <div className="label">สีพื้นหลัง Icon</div>
        <ColorPicker value={v.color} onChange={(color) => set({ color })} />
      </div>

      <SizePicker w={v.w} h={v.h} onChange={(w, h) => set({ w, h })} />

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex-1">
          <div className="font-semibold">สถานะการแสดงผล</div>
          <div className="text-xs text-muted">เมื่อตั้งเป็น Active จะมีเครื่องหมาย ✓ สีเขียวที่มุมบนซ้ายของ Card</div>
        </div>
        <ActiveSwitch checked={v.active} onChange={(active) => set({ active })} />
      </label>
    </EditorDialog>
  );
}

/** ขนาด Card: ปุ่มขนาดสำเร็จรูป หรือคลิกช่องบนตารางย่อเพื่อเลือก กว้าง × สูง เอง */
function SizePicker({ w, h, onChange }: { w: number; h: number; onChange: (w: number, h: number) => void }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [sw, sh] = hover ?? [w, h];
  return (
    <div>
      <div className="label">
        ขนาด Card (กว้าง × สูง) — <b className="text-text">{sw}×{sh}</b>
        <span className="ml-1 text-xs">· เต็มแถว = {GRID_COLS} ช่อง</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {SIZE_PRESETS.map(([pw, ph]) => (
          <button
            key={`${pw}x${ph}`}
            type="button"
            onClick={() => onChange(pw, ph)}
            className={`rounded-md border px-2.5 py-1 text-xs tabular-nums ${pw === w && ph === h ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border hover:bg-surface-2"}`}
          >
            {pw}×{ph}
          </button>
        ))}
      </div>
      <div
        className="grid w-full max-w-sm gap-[3px] rounded-lg border border-border bg-surface-2 p-1.5"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
        onMouseLeave={() => setHover(null)}
        role="grid"
        aria-label="เลือกขนาด Card"
      >
        {Array.from({ length: MAX_ROWS * GRID_COLS }, (_, i) => {
          const c = (i % GRID_COLS) + 1;
          const r = Math.floor(i / GRID_COLS) + 1;
          const on = c <= sw && r <= sh;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-label={`${c}×${r}`}
              className={`aspect-square rounded-[3px] ${on ? "bg-primary" : "bg-border/70 hover:bg-primary/40"}`}
              onMouseEnter={() => setHover([c, Math.max(2, r)])}
              onClick={() => onChange(c, Math.max(2, r))}
            />
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          กว้าง
          <input type="number" className="input w-16 px-2 py-1" min={1} max={GRID_COLS} value={w} onChange={(e) => onChange(clampInt(e.target.value, 1, GRID_COLS), h)} />
        </label>
        <label className="flex items-center gap-1.5">
          สูง
          <input type="number" className="input w-16 px-2 py-1" min={2} max={MAX_ROWS} value={h} onChange={(e) => onChange(w, clampInt(e.target.value, 2, MAX_ROWS))} />
        </label>
      </div>
    </div>
  );
}

const clampInt = (s: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(s)) || min));
