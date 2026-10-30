import type { CSSProperties } from "react";
import { safeUrl, type MenuCard, type MenuLink } from "@/lib/db/menus";
import { MenuIcon } from "@/components/icon-pickers";

/** Card กลุ่มลิงก์ — ขนาดตาม w × h บนตาราง; ลิงก์เกินพื้นที่จะเลื่อนดูในกรอบได้ */
export function GroupCard({ card }: { card: MenuCard }) {
  const style = { "--w": card.w, "--h": card.h } as CSSProperties;
  const narrow = card.w <= 1;
  return (
    <section style={style} className="card flex h-full flex-col gap-2 overflow-hidden p-3">
      <header className="flex items-center gap-2.5">
        <MenuIcon emoji={card.emoji} icon={card.icon} color={card.color} name={card.name} size={narrow ? 32 : 40} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{card.name}</h2>
          {!narrow && card.description && <p className="truncate text-xs text-muted">{card.description}</p>}
        </div>
      </header>
      {card.links.length === 0 ? (
        <p className="grid flex-1 place-items-center text-xs text-muted">ยังไม่มีลิงก์</p>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {card.links.map((link) => (
            <li key={link.id}>
              <LinkRow link={link} compact={narrow} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({ link, compact }: { link: MenuLink; compact: boolean }) {
  const href = link.active ? safeUrl(link.url) : null;
  const body = (
    <>
      <MenuIcon emoji={link.emoji} icon={link.icon} color={link.color} name={link.name} size={compact ? 24 : 32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{link.name}</div>
        {!compact && link.description && <div className="truncate text-xs text-muted">{link.description}</div>}
      </div>
      {!link.active ? (
        <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">ปิดใช้งาน</span>
      ) : href ? (
        <svg viewBox="0 0 24 24" className="size-4 flex-none text-muted/60" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      ) : (
        <span className="flex-none text-[11px] text-muted">ยังไม่มี URL</span>
      )}
    </>
  );
  const cls = "flex items-center gap-2.5 rounded-lg px-1.5 py-1.5";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={link.description || link.name} className={`${cls} hover:bg-surface-2 hover:text-primary`}>
      {body}
    </a>
  ) : (
    <div className={`${cls} ${link.active ? "" : "opacity-55"}`}>{body}</div>
  );
}
