"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { DataError } from "@/lib/db/common";
import type { ProjectRecord } from "@/lib/db/projects";
import {
  createRequisition,
  requisitionPriority,
  updateRequisition,
  type Requisition,
  type RequisitionInput,
  type RequisitionPriority,
} from "@/lib/db/requisitions";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { todayInBangkok } from "@/lib/format";

type ItemDraft = { id: string; description: string; spec: string; unit: string; quantity: string; remark: string };

const blankItem = (): ItemDraft => ({ id: crypto.randomUUID(), description: "", spec: "", unit: "", quantity: "", remark: "" });

/** ฟอร์มสร้าง / แก้ไขใบขอเบิก (บันทึกเป็นร่าง — ส่งอนุมัติที่หน้าใบขอเบิก) */
export function RequisitionForm({
  project,
  actor,
  requesterName,
  existing,
  onClose,
  onSaved,
}: {
  project: ProjectRecord;
  actor: string;
  requesterName: string;
  existing?: Requisition;
  onClose: () => void;
  onSaved: (id: string, no: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState({
    request_date: existing?.request_date ?? todayInBangkok(),
    require_date: existing?.require_date ?? "",
    priority: (existing?.priority ?? "normal") as RequisitionPriority,
    work_area: existing?.work_area ?? "",
    purpose: existing?.purpose ?? "",
    requester_name: existing?.requester_name ?? requesterName,
  });
  const [items, setItems] = useState<ItemDraft[]>(
    existing?.items.map((i) => ({ ...i, quantity: String(i.quantity) })) ?? [blankItem()],
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const setItem = (id: string, k: keyof ItemDraft, value: string) => setItems(items.map((i) => (i.id === id ? { ...i, [k]: value } : i)));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.requester_name.trim()) return setError("กรุณาใส่ชื่อผู้ขอเบิก");
    if (!v.require_date) return setError("กรุณาใส่วันที่ต้องการใช้");
    if (v.require_date < v.request_date) return setError("วันที่ต้องการใช้ต้องไม่ก่อนวันที่ขอเบิก");
    const input: RequisitionInput = { ...v, items: items.map((i) => ({ ...i, quantity: Number(i.quantity) })) };
    startTransition(async () => {
      try {
        if (existing) {
          await updateRequisition(project.id, existing.id, input, actor);
          onSaved(existing.id, existing.no);
        } else {
          const created = await createRequisition(project.id, input, actor);
          onSaved(created.id, created.no);
        }
        dialogRef.current?.close();
      } catch (err) {
        setError(err instanceof DataError ? err.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <h2 className="font-bold">{existing ? `แก้ไข ${existing.no}` : "สร้างใบขอเบิกวัสดุ"}</h2>
            <p className="text-xs text-muted">{project.code} · เลขที่เอกสารออกอัตโนมัติเมื่อบันทึก</p>
          </div>
          <button type="button" className="btn px-2.5 py-1.5 text-xs" onClick={() => dialogRef.current?.close()}>✕</button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="mrq-requester">ผู้ขอเบิก *</label>
              <input id="mrq-requester" className="input" maxLength={100} value={v.requester_name} onChange={set("requester_name")} />
            </div>
            <div>
              <label className="label" htmlFor="mrq-date">วันที่ขอเบิก</label>
              <input id="mrq-date" className="input" type="date" value={v.request_date} onChange={set("request_date")} required />
            </div>
            <div>
              <label className="label" htmlFor="mrq-require">ต้องการใช้วันที่ *</label>
              <input id="mrq-require" className="input" type="date" min={v.request_date} value={v.require_date} onChange={set("require_date")} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="mrq-area">ส่วนงาน / ตำแหน่งที่ใช้</label>
              <input id="mrq-area" className="input" placeholder="เช่น ฐานราก F1-F6 · ชั้น 3 โซน A" maxLength={200} value={v.work_area} onChange={set("work_area")} />
            </div>
            <div>
              <label className="label" htmlFor="mrq-priority">ความสำคัญ</label>
              <select id="mrq-priority" className="input" value={v.priority} onChange={set("priority")}>
                {Object.entries(requisitionPriority).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="label" htmlFor="mrq-purpose">วัตถุประสงค์การใช้งาน</label>
              <textarea id="mrq-purpose" className="input" rows={2} maxLength={500} value={v.purpose} onChange={set("purpose")} />
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center">
              <h3 className="flex-1 text-sm font-semibold">รายการวัสดุ ({items.length})</h3>
              <button type="button" className="btn px-2.5 py-1.5 text-xs" onClick={() => setItems([...items, blankItem()])}>+ เพิ่มรายการ</button>
            </div>
            {items.map((i, n) => (
              <div key={i.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[2rem_1fr_6rem_6rem_auto]">
                <div className="pt-2 text-center text-xs text-muted">{n + 1}</div>
                <input className="input" placeholder="Description * เช่น เหล็กเส้น DB12" maxLength={200} aria-label={`รายการที่ ${n + 1}`} value={i.description} onChange={(e) => setItem(i.id, "description", e.target.value)} />
                <input className="input" placeholder="Unit *" maxLength={30} aria-label="หน่วย" value={i.unit} onChange={(e) => setItem(i.id, "unit", e.target.value)} />
                <input className="input text-right" type="number" min="0" step="any" placeholder="จำนวน *" aria-label="จำนวน" value={i.quantity} onChange={(e) => setItem(i.id, "quantity", e.target.value)} />
                <button type="button" className="btn px-2.5 text-xs" disabled={items.length === 1} aria-label={`ลบรายการที่ ${n + 1}`} onClick={() => setItems(items.filter((x) => x.id !== i.id))}>ลบ</button>
                <input className="input sm:col-start-2 sm:col-span-2" placeholder="Spec เช่น SD40 ยาว 10 ม." maxLength={300} aria-label="Spec" value={i.spec} onChange={(e) => setItem(i.id, "spec", e.target.value)} />
                <input className="input sm:col-span-2" placeholder="หมายเหตุ" maxLength={300} aria-label="หมายเหตุ" value={i.remark} onChange={(e) => setItem(i.id, "remark", e.target.value)} />
              </div>
            ))}
          </section>

          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกเป็นร่าง"}</button>
        </div>
      </form>
    </dialog>
  );
}
