"use client";

import { useState, useTransition, type FormEvent, type RefObject } from "react";
import { useAuth } from "@/lib/auth/context";
import { CARD_COLORS, createMenu, updateMenu, type CustomMenu } from "@/lib/db/menus";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { ColorPicker, EmojiPicker, MenuIcon } from "./icon-pickers";

/** สร้างเมนูใหม่ (ไม่ส่ง menu) หรือแก้ชื่อ/ไอคอนของเมนูเดิม */
export function MenuDialog({
  dialogRef,
  menu,
  nextOrder = 0,
  onSaved,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  menu?: CustomMenu;
  nextOrder?: number;
  onSaved?: (menuId: string) => void;
}) {
  // ฟอร์มรีเซ็ตทุกครั้งที่ปิด — เปิดใหม่จะเริ่มจากข้อมูลล่าสุด
  const [formKey, setFormKey] = useState(0);
  return (
    <dialog
      ref={dialogRef}
      onClose={() => setFormKey((k) => k + 1)}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] overflow-visible rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <MenuForm key={formKey} menu={menu} nextOrder={nextOrder} close={() => dialogRef.current?.close()} onSaved={onSaved} />
    </dialog>
  );
}

function MenuForm({
  menu,
  nextOrder,
  close,
  onSaved,
}: {
  menu?: CustomMenu;
  nextOrder: number;
  close: () => void;
  onSaved?: (menuId: string) => void;
}) {
  const { userProfile } = useAuth();
  const [name, setName] = useState(menu?.name ?? "");
  const [emoji, setEmoji] = useState(menu?.emoji ?? "📁");
  const [color, setColor] = useState(menu?.color ?? CARD_COLORS[0]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = { name: name.trim(), emoji, color };
    if (!input.name) return setError("กรุณาใส่ชื่อเมนู");
    startTransition(async () => {
      try {
        const id = menu ? (await updateMenu(menu.id, input, userProfile!.email), menu.id) : await createMenu(input, nextOrder, userProfile!.email);
        close();
        onSaved?.(id);
      } catch (err) {
        setError("บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5">
      <h2 className="text-lg font-bold">{menu ? "ตั้งค่าเมนู" : "เพิ่มเมนูใหม่"}</h2>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
        <MenuIcon emoji={emoji} color={color} name={name} size={40} />
        <div className="truncate font-semibold">{name || "ชื่อเมนู"}</div>
      </div>
      <div>
        <div className="label">Emoji (ไอคอนใน Sidebar)</div>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>
      <div>
        <label className="label" htmlFor="menu-name">ชื่อเมนู *</label>
        <input id="menu-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="เช่น Construction" autoFocus />
      </div>
      <div>
        <div className="label">สีไอคอน</div>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={close}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : menu ? "บันทึก" : "สร้างเมนู"}</button>
      </div>
    </form>
  );
}
