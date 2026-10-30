"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { CARD_COLORS, createMenu, updateMenu, type CustomMenu, type MenuInput } from "@/lib/db/menus";
import { EditorDialog } from "./editor-dialog";
import { ColorPicker, IconPicker } from "./icon-pickers";

/** สร้างเมนูใหม่ (ไม่ส่ง menu) หรือแก้ชื่อ/ไอคอนของเมนูเดิม — เปิดเป็น modal ทันทีที่ render */
export function MenuDialog({
  menu,
  nextOrder = 0,
  onSaved,
  onClose,
}: {
  menu?: CustomMenu;
  nextOrder?: number;
  onSaved?: (menuId: string) => void;
  onClose: () => void;
}) {
  const { userProfile } = useAuth();
  const [v, setV] = useState<MenuInput>({ name: menu?.name ?? "", emoji: menu?.emoji ?? "📁", icon: menu?.icon ?? null, color: menu?.color ?? CARD_COLORS[0] });
  const set = (patch: Partial<MenuInput>) => setV((prev) => ({ ...prev, ...patch }));
  const input = { ...v, name: v.name.trim() };

  return (
    <EditorDialog
      title={menu ? "ตั้งค่าเมนู" : "เพิ่มเมนูใหม่"}
      subtitle="เมนูจะแสดงใน Sidebar หัวข้อ “เมนูเพิ่มเติม”"
      isNew={!menu}
      submitLabel={menu ? "บันทึก" : "สร้างเมนู"}
      validate={() => (input.name ? undefined : "กรุณาใส่ชื่อเมนู")}
      save={async () => {
        if (menu) await updateMenu(menu, input, userProfile!.email);
        else onSaved?.(await createMenu(input, nextOrder, userProfile!.email));
      }}
      onClose={onClose}
    >
      <div>
        <div className="label">ไอคอนใน Sidebar</div>
        <IconPicker emoji={v.emoji} icon={v.icon} color={v.color} name={v.name} onChange={set} />
      </div>
      <div>
        <label className="label" htmlFor="menu-name">ชื่อเมนู *</label>
        <input id="menu-name" className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} placeholder="เช่น Construction" autoFocus />
      </div>
      <div>
        <div className="label">สีไอคอน</div>
        <ColorPicker value={v.color} onChange={(color) => set({ color })} />
      </div>
    </EditorDialog>
  );
}
