import type { IconFields, IconValue } from "@/lib/db/menus";
import { Glyph, MenuIcon } from "./icon-pickers";
import { GLYPHS } from "./glyphs";

/** ไอคอนเมนูขนาด 18px บน Sidebar: รูป → ไอคอนจากชุด (สีตามเมนู) → emoji → จุดสี */
export function SideMenuIcon({ menu }: { menu: Omit<IconFields, "icon"> & { icon: IconValue; name: string } }) {
  if (menu.icon) return <MenuIcon emoji="" icon={menu.icon} color={menu.color} name={menu.name} size={18} />;
  if (!menu.emoji && GLYPHS[menu.glyph])
    return (
      <span style={{ color: menu.color }}>
        <Glyph name={menu.glyph} className="size-[18px]" />
      </span>
    );
  return (
    <span className="grid size-[18px] flex-none place-items-center text-[15px] leading-none">
      {menu.emoji || <i className="size-2.5 rounded-full" style={{ background: menu.color }} />}
    </span>
  );
}
