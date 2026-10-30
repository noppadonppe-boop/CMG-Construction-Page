"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import {
  deleteCard,
  deleteLink,
  deleteMenu,
  moveCard,
  moveLink,
  moveMenu,
  safeUrl,
  setLinkActive,
  useMenus,
  type CustomMenu,
  type MenuCard,
  type MenuLink,
} from "@/lib/db/menus";
import { DataError } from "@/lib/db/common";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { Guard } from "@/components/guard";
import { MenuIcon } from "@/components/icon-pickers";
import { MenuDialog } from "@/components/menu-dialog";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { ActiveSwitch } from "./active-switch";
import { CardDialog } from "./card-dialog";
import { LinkDialog } from "./link-dialog";

// ไม่ส่ง menu/card/link = เพิ่มใหม่
type Editing = { kind: "menu"; menu?: CustomMenu } | { kind: "card"; card?: MenuCard } | { kind: "link"; link?: MenuLink } | null;

export default function MenusPage() {
  return (
    <Guard permission="menu.manage">
      {/* อ่าน ?menu= จาก URL ตอน runtime จึงต้องอยู่หลัง Suspense */}
      <Suspense fallback={<Skeleton />}>
        <MenuManager />
      </Suspense>
    </Guard>
  );
}

/** จัดการเมนูเพิ่มเติม: เลือกเมนู → เลือก Card → จัดการลิงก์ใน Card */
function MenuManager() {
  const { userProfile } = useAuth();
  const { menus, loading, error } = useMenus();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cardId, setCardId] = useState<string>();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string>();
  const actor = userProfile?.email ?? "";

  // เมนูที่เลือกเก็บใน URL — ลิงก์ "จัดการเมนูนี้" จากหน้าเมนูพามาถูกเมนู และรีเฟรชแล้วไม่หาย
  const menu = menus.find((m) => m.id === params.get("menu")) ?? menus[0];
  const card = menu?.cards.find((c) => c.id === cardId) ?? menu?.cards[0];
  const selectMenu = (id: string) => {
    setCardId(undefined);
    router.replace(`${pathname}?menu=${id}`, { scroll: false });
  };

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
        setActionError(undefined);
      } catch (e) {
        setActionError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });

  if (loading) return <Skeleton />;
  if (error) return <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">โหลดเมนูไม่สำเร็จ: {error}</p>;

  return (
    <>
      <PageHeader
        title="จัดการเมนู"
        subtitle="เพิ่ม/ลบเมนูใน Sidebar, Card ในแต่ละเมนู และลิงก์ในแต่ละ Card"
        actions={menu && <Link href={`/m/${menu.id}`} className="btn">ดูหน้าเมนู “{menu.name}”</Link>}
      />
      {actionError && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{actionError}</p>}

      <div className={`grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,1.4fr)] ${pending ? "opacity-70" : ""}`}>
        <Column step={1} title="เมนู" count={menus.length} onAdd={() => setEditing({ kind: "menu" })} addLabel="+ เมนู">
          {menus.length === 0 ? (
            <EmptyState>ยังไม่มีเมนู</EmptyState>
          ) : (
            menus.map((m, i) => (
              <Row
                key={m.id}
                selected={m.id === menu?.id}
                onSelect={() => selectMenu(m.id)}
                icon={<MenuIcon emoji={m.emoji} icon={m.icon} color={m.color} name={m.name} size={32} />}
                title={m.name}
                subtitle={`${m.cards.length} Cards`}
                disabled={pending}
                first={i === 0}
                last={i === menus.length - 1}
                onMove={(step) => run(() => moveMenu(menus, m.id, step))}
                onEdit={() => setEditing({ kind: "menu", menu: m })}
                onDelete={() =>
                  confirm(`ลบเมนู "${m.name}" พร้อม Card ${m.cards.length} ใบ และลิงก์ทั้งหมด?`) && run(() => deleteMenu(m))
                }
              />
            ))
          )}
        </Column>

        <Column step={2} title={menu ? `Card ในเมนู “${menu.name}”` : "Card"} count={menu?.cards.length} onAdd={menu && (() => setEditing({ kind: "card" }))} addLabel="+ Card">
          {!menu ? (
            <EmptyState>สร้างเมนูก่อน แล้วจึงเพิ่ม Card</EmptyState>
          ) : menu.cards.length === 0 ? (
            <EmptyState>ยังไม่มี Card — Card คือกลุ่มที่รวมลิงก์หลายรายการ</EmptyState>
          ) : (
            menu.cards.map((c, i) => (
              <Row
                key={c.id}
                selected={c.id === card?.id}
                onSelect={() => setCardId(c.id)}
                icon={<MenuIcon emoji={c.emoji} icon={c.icon} color={c.color} name={c.name} size={32} />}
                title={c.name}
                subtitle={`${c.links.length} ลิงก์ · ขนาด ${c.w}×${c.h}`}
                disabled={pending}
                first={i === 0}
                last={i === menu.cards.length - 1}
                onMove={(step) => run(() => moveCard(menu.id, c.id, step, actor))}
                onEdit={() => setEditing({ kind: "card", card: c })}
                onDelete={() => confirm(`ลบ Card "${c.name}" และลิงก์ ${c.links.length} รายการ?`) && run(() => deleteCard(menu.id, c, actor))}
              />
            ))
          )}
        </Column>

        <Column step={3} title={card ? `ลิงก์ใน “${card.name}”` : "ลิงก์"} count={card?.links.length} onAdd={card && (() => setEditing({ kind: "link" }))} addLabel="+ ลิงก์">
          {!menu || !card ? (
            <EmptyState>เลือกหรือเพิ่ม Card ก่อน แล้วจึงเพิ่มลิงก์</EmptyState>
          ) : card.links.length === 0 ? (
            <EmptyState>ยังไม่มีลิงก์ใน Card นี้</EmptyState>
          ) : (
            card.links.map((l, i) => (
              <Row
                key={l.id}
                icon={<MenuIcon emoji={l.emoji} icon={l.icon} color={l.color} name={l.name} size={32} />}
                title={l.name}
                subtitle={
                  <>
                    <span className={`font-mono ${safeUrl(l.url) ? "" : "text-warn"}`}>{l.url === "#" ? "ยังไม่มี URL" : l.url}</span>
                    {l.description && <span className="block truncate">{l.description}</span>}
                  </>
                }
                extra={
                  <ActiveSwitch
                    label={`เปิดใช้งาน ${l.name}`}
                    checked={l.active}
                    disabled={pending}
                    onChange={(active) => run(() => setLinkActive(menu.id, card.id, l.id, active, actor))}
                  />
                }
                disabled={pending}
                first={i === 0}
                last={i === card.links.length - 1}
                onMove={(step) => run(() => moveLink(menu.id, card.id, l.id, step, actor))}
                onEdit={() => setEditing({ kind: "link", link: l })}
                onDelete={() => confirm(`ลบลิงก์ "${l.name}"?`) && run(() => deleteLink(menu.id, card.id, l, actor))}
              />
            ))
          )}
        </Column>
      </div>

      {editing?.kind === "menu" && (
        <MenuDialog
          menu={editing.menu}
          nextOrder={(menus.at(-1)?.order ?? -1) + 1}
          onSaved={selectMenu}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "card" && menu && (
        <CardDialog menuId={menu.id} menuName={menu.name} card={editing.card} onSaved={setCardId} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === "link" && menu && card && (
        <LinkDialog menuId={menu.id} cardId={card.id} cardName={card.name} link={editing.link} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function Column({
  step,
  title,
  count,
  addLabel,
  onAdd,
  children,
}: {
  step: number;
  title: string;
  count?: number;
  addLabel: string;
  onAdd?: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <section className="card flex min-w-0 flex-col gap-2 p-3">
      <header className="flex items-center gap-2 pb-1">
        <span className="grid size-6 flex-none place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{step}</span>
        <h2 className="min-w-0 flex-1 truncate font-semibold">
          {title}
          {count !== undefined && <span className="ml-1 font-normal text-muted">({count})</span>}
        </h2>
        {onAdd && (
          <button type="button" className="btn btn-primary px-2.5 py-1 text-sm" onClick={onAdd}>
            {addLabel}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

/** แถวรายการ: คลิกเพื่อเลือก (ถ้ามี onSelect) + ปุ่มเลื่อน/แก้/ลบ */
function Row({
  selected,
  onSelect,
  icon,
  title,
  subtitle,
  extra,
  disabled,
  first,
  last,
  onMove,
  onEdit,
  onDelete,
}: {
  selected?: boolean;
  onSelect?: () => void;
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  extra?: ReactNode;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onMove: (step: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const info = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-muted">{subtitle}</div>
      </div>
    </>
  );
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${selected ? "border-primary bg-primary-soft/50" : "border-border"}`}>
      {onSelect ? (
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={onSelect} aria-pressed={selected}>
          {info}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{info}</div>
      )}
      {extra}
      <div className="flex flex-none">
        <ToolButton label="เลื่อนขึ้น" d="m18 15-6-6-6 6" disabled={first || disabled} onClick={() => onMove(-1)} />
        <ToolButton label="เลื่อนลง" d="m6 9 6 6 6-6" disabled={last || disabled} onClick={() => onMove(1)} />
        <ToolButton label="แก้ไข" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" onClick={onEdit} />
        <ToolButton label="ลบ" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" danger disabled={disabled} onClick={onDelete} />
      </div>
    </div>
  );
}

function ToolButton({ label, d, onClick, disabled, danger }: { label: string; d: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-md hover:bg-surface-2 disabled:opacity-30 ${danger ? "text-bad" : "text-muted"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d={d} />
      </svg>
    </button>
  );
}
