"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { deleteCard, deleteMenu, moveCard, useMenus, type CustomMenu, type MenuCard } from "@/lib/db/menus";
import { DataError } from "@/lib/db/common";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { MenuDialog } from "@/components/menu-dialog";
import { CardDialog } from "./card-dialog";
import { LinkCard } from "./link-card";

export default function CustomMenuPage() {
  const { menuId } = useParams<{ menuId: string }>();
  const { menus, loading, error } = useMenus();
  const menu = menus.find((m) => m.id === menuId);

  if (loading) return <Skeleton />;
  if (error) return <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">โหลดเมนูไม่สำเร็จ: {error}</p>;
  if (!menu) return <EmptyState>ไม่พบเมนูนี้ อาจถูกลบไปแล้ว</EmptyState>;
  return <MenuBoard key={menu.id} menu={menu} />;
}

function MenuBoard({ menu }: { menu: CustomMenu }) {
  const { can, userProfile } = useAuth();
  const router = useRouter();
  const manage = can("menu.manage");
  const [editMode, setEditMode] = useState(false);
  // ไม่ส่ง card = เพิ่ม Card ใหม่
  const [editing, setEditing] = useState<{ card?: MenuCard } | null>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const actor = userProfile?.email ?? "";

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
        setError(undefined);
      } catch (e) {
        setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });

  function removeMenu() {
    if (!confirm(`ลบเมนู "${menu.name}" และ Card ทั้งหมด ${menu.cards.length} ใบ?`)) return;
    run(async () => {
      await deleteMenu(menu.id);
      router.replace("/");
    });
  }

  const showTools = manage && editMode;

  return (
    <>
      <PageHeader
        title={`${menu.emoji ? menu.emoji + " " : ""}${menu.name}`}
        subtitle={`${menu.cards.length} Cards`}
        actions={
          manage && (
            <>
              {editMode && (
                <>
                  <button type="button" className="btn text-bad" onClick={removeMenu} disabled={pending}>ลบเมนู</button>
                  <button type="button" className="btn" onClick={() => settingsRef.current?.showModal()}>ตั้งค่าเมนู</button>
                  <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>+ เพิ่ม Card</button>
                </>
              )}
              <button type="button" className={`btn ${editMode ? "bg-primary-soft text-primary" : ""}`} onClick={() => setEditMode((v) => !v)} aria-pressed={editMode}>
                {editMode ? "เสร็จสิ้น" : "จัดการ Cards"}
              </button>
            </>
          )
        }
      />

      {error && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      {menu.cards.length === 0 ? (
        <EmptyState>
          ยังไม่มี Card ในเมนูนี้
          {manage && (
            <div className="mt-3">
              <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>+ เพิ่ม Card แรก</button>
            </div>
          )}
        </EmptyState>
      ) : (
        <div className={`card-grid ${pending ? "opacity-70" : ""}`}>
          {menu.cards.map((card, i) => (
            <LinkCard
              key={card.id}
              card={card}
              tools={
                showTools && (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-center gap-1 rounded-lg bg-surface/95 p-1 shadow-sm">
                    <ToolButton label="เลื่อนไปก่อนหน้า" d="m15 18-6-6 6-6" disabled={i === 0 || pending} onClick={() => run(() => moveCard(menu.id, card.id, -1, actor))} />
                    <ToolButton label="แก้ไข" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" onClick={() => setEditing({ card })} />
                    <ToolButton
                      label="ลบ"
                      d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                      danger
                      disabled={pending}
                      onClick={() => confirm(`ลบ Card "${card.name}"?`) && run(() => deleteCard(menu.id, card.id, actor))}
                    />
                    <ToolButton
                      label="เลื่อนไปถัดไป"
                      d="m9 18 6-6-6-6"
                      disabled={i === menu.cards.length - 1 || pending}
                      onClick={() => run(() => moveCard(menu.id, card.id, 1, actor))}
                    />
                  </div>
                )
              }
            />
          ))}
        </div>
      )}

      {editing && <CardDialog menuId={menu.id} menuName={menu.name} card={editing.card} onClose={() => setEditing(null)} />}
      <MenuDialog dialogRef={settingsRef} menu={menu} />
    </>
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
