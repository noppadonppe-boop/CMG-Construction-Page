"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { FORM_CATEGORIES, FORM_CATEGORY_KEYS, setProjectFormStandards, useFormStandards, type FormStandard } from "@/lib/db/form-standards";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { FormStandardRow } from "@/components/form-standard-row";

/** มาตรฐานแบบฟอร์มที่โครงการนี้เลือกใช้ (จากคลังกลาง) + ปุ่มเลือก/แก้ไขรายการ */
export function ProjectForms({ project }: { project: ProjectRecord }) {
  const { can } = useAuth();
  const { forms, loading } = useFormStandards();
  const [picking, setPicking] = useState(false);
  // แบบฟอร์มที่ถูกลบออกจากคลังแล้วจะไม่แสดง
  const selected = forms.filter((f) => project.form_standards.includes(f.id));
  const groups = FORM_CATEGORY_KEYS.map((c) => ({ c, items: selected.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);

  return (
    <div className="card mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          มาตรฐานแบบฟอร์มที่ใช้ในโครงการ <span className="text-sm font-normal text-muted">({selected.length})</span>
        </h3>
        <div className="flex gap-2">
          <Link href="/form-standards" className="btn px-2.5 py-1 text-xs">ดูคลังแบบฟอร์ม</Link>
          {can("project.edit") && (
            <button type="button" className="btn btn-primary px-2.5 py-1 text-xs" onClick={() => setPicking(true)} disabled={loading}>
              เลือกแบบฟอร์ม
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <p className="text-muted">กำลังโหลด...</p>
      ) : groups.length === 0 ? (
        <p className="text-muted">ยังไม่ได้เลือกแบบฟอร์มสำหรับโครงการนี้</p>
      ) : (
        <div className="grid gap-x-6 lg:grid-cols-2">
          {groups.map(({ c, items }) => (
            <div key={c}>
              <div className="mt-2 text-xs font-semibold text-muted">{FORM_CATEGORIES[c].icon} {FORM_CATEGORIES[c].label}</div>
              <ul className="divide-y divide-border">
                {items.map((f) => (
                  <FormStandardRow key={f.id} form={f} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {picking && <FormPicker project={project} forms={forms} onClose={() => setPicking(false)} />}
    </div>
  );
}

function FormPicker({ project, forms, onClose }: { project: ProjectRecord; forms: FormStandard[]; onClose: () => void }) {
  const { userProfile } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState(() => new Set(project.form_standards.filter((id) => forms.some((f) => f.id === id))));
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  const q = search.trim().toLowerCase();
  const shown = forms.filter((f) => !q || `${f.code} ${f.name}`.toLowerCase().includes(q));
  const groups = FORM_CATEGORY_KEYS.map((c) => ({ c, items: shown.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);

  const toggle = (ids: string[], on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  function save() {
    startTransition(async () => {
      try {
        await setProjectFormStandards(project.id, [...chosen], userProfile!.email);
        dialogRef.current?.close();
      } catch (e) {
        setError("บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto flex max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50 [&:not([open])]:hidden"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold">เลือกมาตรฐานแบบฟอร์ม</h2>
        <p className="text-xs text-muted">{project.code} · {project.name}</p>
        <input
          type="search"
          className="input mt-3"
          placeholder="ค้นหาเลขที่ / ชื่อแบบฟอร์ม"
          aria-label="ค้นหาแบบฟอร์ม"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {forms.length === 0 ? (
          <p className="text-muted">
            ยังไม่มีแบบฟอร์มในคลัง — เพิ่มได้ที่เมนู <Link href="/form-standards" className="text-primary hover:underline">มาตรฐานแบบฟอร์ม</Link>
          </p>
        ) : groups.length === 0 ? (
          <p className="text-muted">ไม่พบแบบฟอร์มที่ค้นหา</p>
        ) : (
          groups.map(({ c, items }) => {
            const allOn = items.every((f) => chosen.has(f.id));
            return (
              <section key={c}>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{FORM_CATEGORIES[c].icon} {FORM_CATEGORIES[c].label}</h3>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => toggle(items.map((f) => f.id), !allOn)}>
                    {allOn ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}
                  </button>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {items.map((f) => (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
                        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={chosen.has(f.id)} onChange={(e) => toggle([f.id], e.target.checked)} />
                        <span className="min-w-0">
                          {f.code && <span className="mr-2 font-mono text-xs text-muted">{f.code}</span>}
                          <span className="font-medium">{f.name}</span>
                          {f.rev && <span className="ml-2 text-[11px] text-muted">Rev. {f.rev}</span>}
                          {f.description && <span className="block truncate text-xs text-muted">{f.description}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        <span className="flex-1 text-sm text-muted">เลือกแล้ว {chosen.size} แบบฟอร์ม</span>
        <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>ยกเลิก</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
      </div>
    </dialog>
  );
}
