import type { CSSProperties, ReactNode } from "react";
import { safeUrl, type MenuCard } from "@/lib/db/menus";
import { MenuIcon } from "@/components/icon-pickers";

/** Card ลิงก์ — ขนาดตาม w × h บนตาราง; Card เล็กจะซ่อนคำอธิบายอัตโนมัติ */
export function LinkCard({ card, tools }: { card: MenuCard; tools?: ReactNode }) {
  const href = safeUrl(card.url);
  const compact = card.w <= 1 || card.h <= 3;
  const iconSize = compact ? 36 : card.h >= 7 ? 56 : 48;
  const style = { "--w": card.w, "--h": card.h } as CSSProperties;

  const body = (
    <>
      {card.active && (
        <span className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-ok text-white" title="Active">
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3}>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
      {href && (
        <svg viewBox="0 0 24 24" className="absolute top-2.5 right-2.5 size-4 text-muted/60" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      )}
      <MenuIcon emoji={card.emoji} glyph={card.glyph} icon={card.icon} color={card.color} name={card.name} size={iconSize} />
      <div className={`w-full truncate font-semibold ${compact ? "text-xs" : "text-sm"}`}>{card.name}</div>
      {!compact && card.description && <p className="line-clamp-2 w-full text-xs text-muted">{card.description}</p>}
      {!compact && card.h >= 5 && (
        <span className={`text-sm font-medium ${href ? "text-primary" : "text-muted"}`}>{href ? "เข้าใช้งาน →" : "ยังไม่มี URL"}</span>
      )}
    </>
  );

  const cls = "card relative flex h-full flex-col items-center justify-center gap-1.5 overflow-hidden p-3 text-center transition";
  return href && !tools ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={style} className={`${cls} hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}>
      {body}
    </a>
  ) : (
    <div style={style} className={`${cls} ${tools ? "border-dashed" : ""}`}>
      {body}
      {tools}
    </div>
  );
}
