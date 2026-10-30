"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { DataError } from "@/lib/db/common";
import { firebaseErrorMessage } from "@/lib/firebase/errors";

/**
 * กรอบ modal ของฟอร์มแก้ เมนู / Card / ลิงก์ — เปิดทันทีที่ render, ปิดแล้วเรียก onClose
 * validate คืนข้อความผิดพลาด (ถ้ามี) ก่อนบันทึก
 */
export function EditorDialog({
  title,
  subtitle,
  isNew,
  submitLabel,
  validate,
  save,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  isNew: boolean;
  submitLabel: string;
  validate: () => string | undefined;
  save: () => Promise<void>;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = validate();
    if (invalid) return setError(invalid);
    startTransition(async () => {
      try {
        await save();
        close();
      } catch (err) {
        setError(err instanceof DataError ? err.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-lg text-primary">{isNew ? "+" : "✎"}</div>
          <div className="flex-1">
            <h2 className="font-bold">{title}</h2>
            {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
          </div>
          <button type="button" className="text-xl text-muted hover:text-text" aria-label="ปิด" onClick={close}>
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {children}
          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn" onClick={close}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
