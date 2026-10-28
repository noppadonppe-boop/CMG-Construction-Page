"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { DEPARTMENTS, ROLE_LABEL } from "@/lib/auth/roles";
import { updateOwnProfile } from "@/lib/auth/service";
import { Avatar } from "./avatar";

/** มุมขวาบน: รูปโปรไฟล์ → เมนู "แก้ไขโปรไฟล์" และ "ออกจากระบบ" */
export function ProfileMenu() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!userProfile) return null;
  const name = displayName(userProfile);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="เมนูโปรไฟล์"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-primary-soft"
      >
        <span className="hidden text-right leading-tight sm:block">
          <span className="block">{name}</span>
          <span className="block text-xs text-muted">{userProfile.position || userProfile.email}</span>
        </span>
        <Avatar src={userProfile.photoURL} name={name} />
      </button>

      {open && (
        <div className="absolute right-0 z-[10010] mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg">
          <div className="flex items-center gap-3 border-b border-border px-2 pb-3 pt-1">
            <Avatar src={userProfile.photoURL} name={name} size={44} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{name}</div>
              <div className="truncate text-xs text-muted">{userProfile.email}</div>
            </div>
          </div>
          <button
            type="button"
            className="mt-1 w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2"
            onClick={() => {
              setOpen(false);
              dialogRef.current?.showModal();
            }}
          >
            แก้ไขโปรไฟล์
          </button>
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-bad hover:bg-bad-soft"
            onClick={() => logout().then(() => router.replace("/login"))}
          >
            ออกจากระบบ
          </button>
        </div>
      )}

      <ProfileDialog dialogRef={dialogRef} />
    </div>
  );
}

function ProfileDialog({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const { userProfile } = useAuth();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // ล้างฟอร์มให้ตรงกับข้อมูลล่าสุดทุกครั้งที่เปิด (ไม่ใช่ระหว่างกำลังพิมพ์)
  const [formKey, setFormKey] = useState(0);
  if (!userProfile) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const v = (k: string) => String(form.get(k) ?? "").trim();
    if (!v("firstName")) return setError("กรุณากรอกชื่อ");
    setSaving(true);
    setError(undefined);
    try {
      await updateOwnProfile(userProfile!.email, {
        firstName: v("firstName"),
        lastName: v("lastName"),
        position: v("position"),
        department: v("department"),
      });
      dialogRef.current?.close();
    } catch (err) {
      setError("บันทึกไม่สำเร็จ: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        setError(undefined);
        setFormKey((k) => k + 1);
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form key={formKey} onSubmit={onSubmit} className="space-y-3 p-5">
        <h2 className="text-lg font-bold">แก้ไขโปรไฟล์</h2>
        <div className="flex items-center gap-3">
          <Avatar src={userProfile.photoURL} name={displayName(userProfile)} size={52} />
          <div className="min-w-0 text-sm">
            <div className="truncate text-muted">{userProfile.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {userProfile.role.map((r) => (
                <span key={r} className="rounded bg-primary-soft px-1.5 text-xs text-primary">{ROLE_LABEL[r]}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pf-first">ชื่อ</label>
            <input id="pf-first" name="firstName" defaultValue={userProfile.firstName} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="pf-last">นามสกุล</label>
            <input id="pf-last" name="lastName" defaultValue={userProfile.lastName} className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pf-position">ตำแหน่ง</label>
          <input id="pf-position" name="position" defaultValue={userProfile.position} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="pf-dept">แผนก</label>
          <select id="pf-dept" name="department" defaultValue={userProfile.department} className="input">
            <option value="">— ไม่ระบุ —</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted">Role และโครงการที่เข้าถึงได้ กำหนดโดย Master Admin</p>
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </form>
    </dialog>
  );
}
