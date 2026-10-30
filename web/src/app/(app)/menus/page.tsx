"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import {
  cardVisibleIn,
  deleteCard,
  deleteMenu,
  moveCard,
  reorderMenus,
  safeUrl,
  menuVisibleIn,
  setCardActive,
  useMenus,
  type CustomMenu,
  type MenuCard,
} from "@/lib/db/menus";
import { DataError } from "@/lib/db/common";
import { useProjects, type ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { EditorDialog } from "@/components/editor-dialog";
import { Guard } from "@/components/guard";
import { MenuIcon } from "@/components/icon-pickers";
import { MenuDialog } from "@/components/menu-dialog";
import { scopeLabel } from "@/components/project-scope-picker";
import { SideMenuIcon } from "@/components/side-menu-icon";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { CardDialog } from "./card-dialog";

// ไม่ส่ง menu/card = เพิ่มใหม่
type Editing = { kind: "menu"; menu?: CustomMenu } | { kind: "card"; card?: MenuCard } | { kind: "order" } | null;

// ตัวกรอง "แสดงของ": "" = ทุกเมนู, ALL_ONLY = เฉพาะที่ตั้งเป็นทุกโครงการ, อื่น ๆ = id โครงการ
const ALL_ONLY = "*";

export default function ManageCardsPage() {
  return (
    <Guard permission="menu.manage">
      {/* อ่าน ?menu= จาก URL ตอน runtime จึงต้องอยู่หลัง Suspense */}
      <Suspense fallback={<Skeleton />}>
        <CardManager />
      </Suspense>
    </Guard>
  );
}

/** จัดการ Cards & เมนู: เลือกเมนูจากแท็บ แล้วเพิ่ม/แก้/ลบ/เรียง Card ของเมนูนั้น */
function CardManager() {
  const { userProfile } = useAuth();
  const { menus: allMenus, loading, error } = useMenus();
  const { projects, byId } = useProjects();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string>();
  const actor = userProfile?.email ?? "";

  // เมนูและตัวกรองโครงการเก็บใน URL — ลิงก์ "จัดการ Cards" จากหน้าเมนูพามาถูกเมนู และรีเฟรชแล้วไม่หาย
  const filter = params.get("scope") ?? "";
  const scopeOf = (f: string) => (f === ALL_ONLY ? null : f);
  const menus = filter ? allMenus.filter((m) => menuVisibleIn(m, scopeOf(filter)) && (filter !== ALL_ONLY || m.project_ids.length === 0)) : allMenus;
  const menu = menus.find((m) => m.id === params.get("menu")) ?? menus[0];
  const go = (next: { menu?: string; scope?: string }) => {
    const q = new URLSearchParams();
    const m = next.menu ?? menu?.id;
    const f = next.scope ?? filter;
    if (m) q.set("menu", m);
    if (f) q.set("scope", f);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  const selectMenu = (id: string) => go({ menu: id });
  const cards = menu ? (filter ? menu.cards.filter((c) => cardVisibleIn(menu, c, scopeOf(filter))) : menu.cards) : [];

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
        title="จัดการ Cards & เมนู"
        subtitle="เพิ่ม แก้ไข ลบ และจัดเรียงหมวดเมนูและ Card ต่างๆ"
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn bg-side text-white hover:opacity-90" onClick={() => setEditing({ kind: "order" })} disabled={allMenus.length < 2}>
              ↕ เรียงลำดับเมนู
            </button>
            <button type="button" className="btn bg-ok text-white hover:opacity-90" onClick={() => setEditing({ kind: "menu" })}>
              + เพิ่มเมนูใหม่
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: "card" })} disabled={!menu}>
              + เพิ่ม Card ใหม่
            </button>
          </div>
        }
      />
      {actionError && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{actionError}</p>}

      {allMenus.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor="scope-filter" className="text-sm text-muted">แสดงของ</label>
          <select id="scope-filter" className="input w-auto min-w-56" value={filter} onChange={(e) => go({ scope: e.target.value, menu: "" })}>
            <option value="">ทุกเมนู</option>
            <option value={ALL_ONLY}>เฉพาะที่แสดงทุกโครงการ</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} : {p.name}</option>
            ))}
          </select>
          {filter && filter !== ALL_ONLY && <span className="text-xs text-muted">รวมเมนูและ Card ที่แสดงทุกโครงการ</span>}
        </div>
      )}

      {allMenus.length > 0 && menus.length === 0 ? (
        <EmptyState>ไม่มีเมนูที่แสดงในโครงการนี้</EmptyState>
      ) : menus.length === 0 ? (
        <EmptyState>
          ยังไม่มีเมนู — เริ่มจากสร้างเมนูแรก แล้วเพิ่ม Card ในเมนูนั้น
          <div className="mt-3">
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: "menu" })}>+ เพิ่มเมนูใหม่</button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* แท็บเมนู */}
          <div role="tablist" aria-label="เลือกเมนู" className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-2">
            {menus.map((m) => {
              const on = m.id === menu?.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => selectMenu(m.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${on ? "border border-primary/30 bg-surface font-semibold text-primary shadow-sm" : "text-text hover:bg-surface"}`}
                >
                  <SideMenuIcon menu={m} />
                  {m.name}
                  <ScopeBadge ids={m.project_ids} byId={byId} />
                  <span className="rounded-md bg-surface-2 px-1.5 text-xs text-muted tabular-nums">{m.cards.length}</span>
                </button>
              );
            })}
          </div>

          {menu && (
            <>
              {/* หัวเมนูที่เลือก */}
              <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-primary/20 bg-primary-soft/60 px-4 py-3">
                <SideMenuIcon menu={menu} />
                <span className="font-semibold">{menu.name}</span>
                <span className="text-sm text-muted">({menu.cards.length} Cards)</span>
                <span className="text-sm text-muted">· แสดงใน{menu.project_ids.length ? `โครงการ ${scopeLabel(menu.project_ids, byId, 4)}` : "ทุกโครงการ"}</span>
                <div className="ml-auto flex gap-3 text-sm">
                  <button type="button" className="text-primary hover:underline" onClick={() => setEditing({ kind: "menu", menu })}>
                    ✎ ตั้งค่าเมนูนี้
                  </button>
                  <button
                    type="button"
                    className="text-bad hover:underline"
                    disabled={pending}
                    onClick={() => confirm(`ลบเมนู "${menu.name}" และ Card ทั้งหมด ${menu.cards.length} ใบ?`) && run(() => deleteMenu(menu))}
                  >
                    ลบเมนู
                  </button>
                </div>
              </div>

              {cards.length === 0 && menu.cards.length > 0 ? (
                <EmptyState>ไม่มี Card ของเมนูนี้ที่แสดงในโครงการที่กรอง</EmptyState>
              ) : cards.length === 0 ? (
                <EmptyState>
                  ยังไม่มี Card ในเมนูนี้
                  <div className="mt-3">
                    <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: "card" })}>+ เพิ่ม Card แรก</button>
                  </div>
                </EmptyState>
              ) : (
                <ul className={`space-y-2 ${pending ? "opacity-70" : ""}`}>
                  {cards.map((card) => (
                    <li key={card.id}>
                      <CardRow
                        card={card}
                        scope={card.project_ids.length ? scopeLabel(card.project_ids, byId) : undefined}
                        disabled={pending}
                        first={card.id === menu.cards[0]?.id}
                        last={card.id === menu.cards.at(-1)?.id}
                        onMove={(step) => run(() => moveCard(menu.id, card.id, step, actor))}
                        onToggle={() => run(() => setCardActive(menu.id, card.id, !card.active, actor))}
                        onEdit={() => setEditing({ kind: "card", card })}
                        onDelete={() => confirm(`ลบ Card "${card.name}"?`) && run(() => deleteCard(menu.id, card, actor))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {editing?.kind === "menu" && (
        <MenuDialog menu={editing.menu} nextOrder={(menus.at(-1)?.order ?? -1) + 1} onSaved={selectMenu} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === "card" && menu && <CardDialog menu={menu} card={editing.card} onClose={() => setEditing(null)} />}
      {editing?.kind === "order" && <OrderDialog menus={allMenus} onClose={() => setEditing(null)} />}
    </>
  );
}

/** ป้ายโครงการบนแท็บเมนู — ไม่แสดงถ้าเป็นทุกโครงการ */
function ScopeBadge({ ids, byId }: { ids: string[]; byId: Map<string, ProjectRecord> }) {
  if (ids.length === 0) return null;
  return <span className="rounded-md bg-warn-soft px-1.5 text-[11px] text-warn">{scopeLabel(ids, byId, 1)}</span>;
}

function CardRow({
  card,
  scope,
  disabled,
  first,
  last,
  onMove,
  onToggle,
  onEdit,
  onDelete,
}: {
  card: MenuCard;
  /** ป้ายโครงการเมื่อ Card เลือกเฉพาะบางโครงการ (undefined = ตามเมนู) */
  scope?: string;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onMove: (step: -1 | 1) => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasUrl = Boolean(safeUrl(card.url));
  return (
    <div className="card flex items-center gap-3 p-3">
      <MenuIcon emoji={card.emoji} glyph={card.glyph} icon={card.icon} color={card.color} name={card.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{card.name}</span>
          {scope && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn">เฉพาะ {scope}</span>}
          {!hasUrl && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn">ยังไม่มี URL</span>}
          {card.active ? (
            <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] text-ok">✓ Active</span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Inactive</span>
          )}
        </div>
        <div className="truncate font-mono text-xs text-muted">{hasUrl ? card.url : "—"}</div>
        {card.description && <div className="truncate text-sm text-muted">{card.description}</div>}
      </div>
      <div className="flex flex-none items-center">
        <ToolButton label="เลื่อนขึ้น" d="m18 15-6-6-6 6" disabled={first || disabled} onClick={() => onMove(-1)} />
        <ToolButton label="เลื่อนลง" d="m6 9 6 6 6-6" disabled={last || disabled} onClick={() => onMove(1)} />
        <button
          type="button"
          title={card.active ? "ปิด Active" : "ตั้งเป็น Active"}
          aria-label={card.active ? "ปิด Active" : "ตั้งเป็น Active"}
          aria-pressed={card.active}
          disabled={disabled}
          onClick={onToggle}
          className={`grid size-8 place-items-center rounded-md hover:bg-surface-2 ${card.active ? "text-ok" : "text-border"}`}
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <path d="m8 12.5 2.5 2.5L16 9.5" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ToolButton label="แก้ไข" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" onClick={onEdit} />
        <ToolButton label="ลบ" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" danger disabled={disabled} onClick={onDelete} />
      </div>
    </div>
  );
}

/** เรียงลำดับเมนูใน Sidebar — จัดในหน้าต่างก่อน แล้วบันทึกครั้งเดียว */
function OrderDialog({ menus, onClose }: { menus: CustomMenu[]; onClose: () => void }) {
  const [list, setList] = useState(menus);
  const move = (i: number, step: -1 | 1) =>
    setList((prev) => {
      const next = [...prev];
      [next[i], next[i + step]] = [next[i + step], next[i]];
      return next;
    });
  return (
    <EditorDialog title="เรียงลำดับเมนู" subtitle="ลำดับนี้ใช้ทั้งใน Sidebar และแท็บด้านบน" isNew={false} submitLabel="บันทึกลำดับ" validate={() => undefined} save={() => reorderMenus(list)} onClose={onClose}>
      <ol className="space-y-1.5">
        {list.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
            <span className="w-5 text-right text-xs text-muted tabular-nums">{i + 1}</span>
            <SideMenuIcon menu={m} />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <ToolButton label="เลื่อนขึ้น" d="m18 15-6-6-6 6" disabled={i === 0} onClick={() => move(i, -1)} />
            <ToolButton label="เลื่อนลง" d="m6 9 6 6 6-6" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
          </li>
        ))}
      </ol>
    </EditorDialog>
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
      className={`grid size-8 place-items-center rounded-md hover:bg-surface-2 disabled:opacity-30 ${danger ? "text-bad" : "text-muted"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d={d} />
      </svg>
    </button>
  );
}
