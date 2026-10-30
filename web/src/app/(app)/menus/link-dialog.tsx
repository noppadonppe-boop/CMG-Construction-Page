"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { addLink, CARD_COLORS, safeUrl, updateLink, type LinkInput, type MenuLink } from "@/lib/db/menus";
import { ColorPicker, IconPicker } from "@/components/icon-pickers";
import { ActiveSwitch } from "./active-switch";
import { EditorDialog } from "@/components/editor-dialog";

const DESCRIPTION_MAX = 80;

/** เพิ่มลิงก์ใหม่ใน Card (ไม่ส่ง link) หรือแก้ลิงก์เดิม */
export function LinkDialog({
  menuId,
  cardId,
  cardName,
  link,
  onClose,
}: {
  menuId: string;
  cardId: string;
  cardName: string;
  link?: MenuLink;
  onClose: () => void;
}) {
  const { userProfile } = useAuth();
  const [v, setV] = useState<LinkInput>(
    link
      ? { name: link.name, url: link.url, description: link.description, emoji: link.emoji, icon: link.icon, color: link.color, active: link.active }
      : { name: "", url: "", description: "", emoji: "", icon: null, color: CARD_COLORS[0], active: true },
  );
  const set = (patch: Partial<LinkInput>) => setV((prev) => ({ ...prev, ...patch }));
  const input = { ...v, name: v.name.trim(), url: v.url.trim(), description: v.description.trim() };

  return (
    <EditorDialog
      title={link ? "แก้ไขลิงก์" : "เพิ่มลิงก์ใหม่"}
      subtitle={`Card: ${cardName}`}
      isNew={!link}
      submitLabel={link ? "บันทึก" : "เพิ่มลิงก์"}
      validate={() => {
        if (!input.name) return "กรุณาใส่ชื่อลิงก์";
        if (input.url !== "#" && !safeUrl(input.url)) return "URL ต้องขึ้นต้นด้วย http:// หรือ https:// (ใส่ # ถ้ายังไม่มี URL)";
      }}
      save={() => (link ? updateLink(menuId, cardId, link, input, userProfile!.email) : addLink(menuId, cardId, input, userProfile!.email))}
      onClose={onClose}
    >
      <div>
        <div className="label">ไอคอน</div>
        <IconPicker emoji={v.emoji} icon={v.icon} color={v.color} name={v.name} onChange={set} />
      </div>
      <div>
        <label className="label" htmlFor="link-name">ชื่อ *</label>
        <input id="link-name" className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="เช่น QC Dashboard" />
      </div>
      <div>
        <label className="label" htmlFor="link-url">URL *</label>
        <input
          id="link-url"
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
        <label className="label" htmlFor="link-desc">คำอธิบาย</label>
        <input
          id="link-desc"
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
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex-1">
          <div className="font-semibold">เปิดใช้งาน (Active)</div>
          <div className="text-xs text-muted">ปิด = ยังแสดงใน Card แต่กดเข้าใช้งานไม่ได้ และขึ้นป้าย &quot;ปิดใช้งาน&quot;</div>
        </div>
        <ActiveSwitch checked={v.active} onChange={(active) => set({ active })} />
      </label>
    </EditorDialog>
  );
}
