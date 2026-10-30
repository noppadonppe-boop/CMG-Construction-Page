"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { CARD_COLORS, createMenu, updateMenu, type CustomMenu, type MenuInput } from "@/lib/db/menus";
import { useProjects } from "@/lib/db/projects";
import { EditorDialog } from "./editor-dialog";
import { ColorPicker, IconPicker } from "./icon-pickers";
import { ProjectScopePicker, scopeError } from "./project-scope-picker";
import { SideMenuIcon } from "./side-menu-icon";

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
  const { projects } = useProjects();
  const [v, setV] = useState<MenuInput>(
    menu
      ? { name: menu.name, emoji: menu.emoji, glyph: menu.glyph, icon: menu.icon, color: menu.color, project_ids: menu.project_ids }
      : { name: "", emoji: "", glyph: "layers", icon: null, color: CARD_COLORS[0], project_ids: [] },
  );
  // แยกจาก project_ids เพราะกด "เลือกโครงการ" แล้วยังไม่ติ๊กก็ต้องคงอยู่ในโหมดเลือก
  const [limited, setLimited] = useState(v.project_ids.length > 0);
  const set = (patch: Partial<MenuInput>) => setV((prev) => ({ ...prev, ...patch }));
  const input = { ...v, name: v.name.trim() };

  return (
    <EditorDialog
      title={menu ? "ตั้งค่าเมนู" : "เพิ่มเมนูใหม่"}
      subtitle="จะแสดงบน Sidebar หัวข้อ “เมนูเพิ่มเติม”"
      isNew={!menu}
      submitLabel={menu ? "บันทึก" : "เพิ่มเมนูใหม่"}
      validate={() => (input.name ? scopeError(limited, input.project_ids) : "กรุณาใส่ชื่อเมนู")}
      save={async () => {
        if (menu) await updateMenu(menu, input, userProfile!.email);
        else onSaved?.(await createMenu(input, nextOrder, userProfile!.email));
      }}
      onClose={onClose}
    >
      {/* ตัวอย่างหน้าตาบน Sidebar (พื้นสีเดียวกับ Sidebar) */}
      <div className="flex items-center gap-2.5 rounded-xl bg-side px-4 py-3 font-semibold text-white">
        <SideMenuIcon menu={v} />
        <span className="truncate">{v.name || "ตัวอย่างชื่อเมนู"}</span>
      </div>
      <div>
        <label className="label" htmlFor="menu-name">ชื่อเมนู *</label>
        <input id="menu-name" className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} placeholder="เช่น CMG Innovation, Safety Control..." autoFocus />
      </div>
      <div>
        <div className="label">ไอคอน</div>
        <IconPicker emoji={v.emoji} glyph={v.glyph} icon={v.icon} onChange={set} />
      </div>
      <div>
        <div className="label">สีไอคอนบน Sidebar</div>
        <ColorPicker value={v.color} onChange={(color) => set({ color })} />
      </div>
      <div>
        <div className="label">แสดงในโครงการ *</div>
        <ProjectScopePicker
          ids={v.project_ids}
          limited={limited}
          onChange={(on, project_ids) => {
            setLimited(on);
            set({ project_ids });
          }}
          projects={projects}
          allLabel="ทุกโครงการ"
          allHint="เห็นทุกหน้า ทุกโครงการ"
          limitLabel="เลือกโครงการ"
          limitHint="เห็นเมื่ออยู่ในโครงการที่เลือก"
        />
      </div>
    </EditorDialog>
  );
}
