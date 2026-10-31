"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import {
  blankEmailSetup,
  EMAIL_SUBJECT_VARIABLES,
  isValidEmail,
  loadEmailSetup,
  saveEmailSetup,
  type EmailAttachmentFile,
  type EmailContact,
  type EmailSetup,
} from "@/lib/db/email-setup";
import { newId } from "@/lib/db/common";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatFileSize } from "@/lib/format";
import { MultiSelect } from "@/components/multi-select";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const blankContact = { name: "", email: "", company: "", position: "" };

/** ตั้งค่ารายชื่อผู้รับ และเนื้อหาอีเมลรายงานประจำวันของโครงการ — เปิดเป็น modal ทันทีที่ render */
export function EmailSetupDialog({ projects, onClose }: { projects: ProjectRecord[]; onClose: () => void }) {
  const { userProfile } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [v, setV] = useState<EmailSetup | null>(null);
  const [draft, setDraft] = useState(blankContact);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<EmailAttachmentFile[]>([]);
  const [error, setError] = useState<string>();
  const [contactError, setContactError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<EmailSetup>) => setV((prev) => (prev ? { ...prev, ...patch } : prev));
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    loadEmailSetup(projectId).then(
      (setup) => !cancelled && setV(setup),
      (e) => {
        if (cancelled) return;
        setV(blankEmailSetup());
        setError("โหลดการตั้งค่าไม่สำเร็จ: " + firebaseErrorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // เปลี่ยนโครงการ = ทิ้งค่าที่แก้ค้างไว้ แล้วโหลดการตั้งค่าของโครงการใหม่
  function changeProject(id: string) {
    setProjectId(id);
    setV(null);
    setNewFiles([]);
    setRemoved([]);
    setError(undefined);
  }

  function addContact() {
    if (!v) return;
    const c = { name: draft.name.trim(), email: draft.email.trim().toLowerCase(), company: draft.company.trim(), position: draft.position.trim() };
    if (!c.name) return setContactError("กรุณาใส่ชื่อ");
    if (!isValidEmail(c.email)) return setContactError("รูปแบบอีเมลไม่ถูกต้อง");
    if (v.contacts.some((x) => x.email === c.email)) return setContactError("อีเมลนี้มีในรายชื่อแล้ว");
    set({ contacts: [...v.contacts, { id: newId(), ...c }] });
    setDraft(blankContact);
    setContactError(undefined);
  }

  function removeContact(c: EmailContact) {
    if (!v) return;
    set({ contacts: v.contacts.filter((x) => x.id !== c.id), to: v.to.filter((id) => id !== c.id), cc: v.cc.filter((id) => id !== c.id) });
  }

  function pickFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    const tooBig = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (tooBig.length) setError(`ไฟล์ใหญ่เกิน ${formatFileSize(MAX_FILE_SIZE)}: ${tooBig.map((f) => f.name).join(", ")}`);
    setNewFiles((prev) => [...prev, ...files.filter((f) => f.size <= MAX_FILE_SIZE)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v || !userProfile) return;
    const subject = v.subject.trim();
    if (!subject) return setError("กรุณาใส่ Subject");
    if (v.to.length === 0) return setError("กรุณาเลือกผู้รับ (Sent to) อย่างน้อย 1 คน");
    const input: EmailSetup = { ...v, subject, cc: v.cc.filter((id) => !v.to.includes(id)) };
    setError(undefined);
    startTransition(async () => {
      try {
        await saveEmailSetup(projectId, input, newFiles, removed, userProfile.email);
        close();
      } catch (err) {
        setError("บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  const options = (v?.contacts ?? []).map((c) => ({ value: c.id, label: c.name, hint: [c.email, c.company, c.position].filter(Boolean).join(" · ") }));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-lg">✉️</div>
          <h2 className="flex-1 font-bold">ตั้งค่าอีเมลรายงานประจำวัน</h2>
          <button type="button" className="text-xl text-muted hover:text-text" aria-label="ปิด" onClick={close}>
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {projects.length > 1 && (
            <div>
              <label className="label" htmlFor="es-project">โครงการ</label>
              <select id="es-project" className="input" value={projectId} onChange={(e) => changeProject(e.target.value)} disabled={pending}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </select>
            </div>
          )}

          {!v ? (
            <p className="py-6 text-center text-sm text-muted">กำลังโหลด...</p>
          ) : (
            <>
              <section>
                <h3 className="mb-2 font-semibold">1. รายชื่ออีเมล</h3>
                <div className="grid gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                  <input className="input" aria-label="ชื่อ" placeholder="ชื่อ *" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <input
                    className="input"
                    aria-label="Email"
                    placeholder="Email *"
                    type="email"
                    inputMode="email"
                    value={draft.email}
                    maxLength={120}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addContact())}
                  />
                  <input className="input" aria-label="บริษัท" placeholder="บริษัท" value={draft.company} maxLength={120} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
                  <input className="input" aria-label="ตำแหน่ง" placeholder="ตำแหน่ง" value={draft.position} maxLength={80} onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
                  <button type="button" className="btn" onClick={addContact}>+ เพิ่ม</button>
                </div>
                {contactError && <p className="mt-1 text-xs text-bad">{contactError}</p>}

                {v.contacts.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">ยังไม่มีรายชื่อ — เพิ่มผู้รับอีเมลด้านบน</p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-2 text-left text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">ชื่อ</th>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">บริษัท</th>
                          <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {v.contacts.map((c) => (
                          <tr key={c.id} className="border-t border-border">
                            <td className="px-3 py-2">{c.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{c.email}</td>
                            <td className="px-3 py-2">{c.company || "–"}</td>
                            <td className="px-3 py-2">{c.position || "–"}</td>
                            <td className="px-2 py-2 text-right">
                              <button type="button" className="text-xs text-bad hover:underline" aria-label={`ลบ ${c.name}`} onClick={() => removeContact(c)}>ลบ</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">2. ตั้งค่าเนื้อหา</h3>
                <div>
                  <div className="label">Sent to *</div>
                  <MultiSelect label="Sent to" options={options} value={v.to} onChange={(to) => set({ to, cc: v.cc.filter((id) => !to.includes(id)) })} placeholder="เลือกจากรายชื่อ" />
                </div>
                <div>
                  <div className="label">CC</div>
                  <MultiSelect label="CC" options={options.filter((o) => !v.to.includes(o.value))} value={v.cc} onChange={(cc) => set({ cc })} placeholder="เลือกจากรายชื่อ" />
                </div>
                <div>
                  <label className="label" htmlFor="es-subject">Subject *</label>
                  <textarea id="es-subject" className="input" rows={3} value={v.subject} maxLength={500} onChange={(e) => set({ subject: e.target.value })} />
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                    ตัวแปร:
                    {EMAIL_SUBJECT_VARIABLES.map((x) => (
                      <button key={x.key} type="button" className="rounded bg-primary-soft px-1.5 font-mono text-primary hover:underline" title={x.label} onClick={() => set({ subject: `${v.subject}${v.subject && !v.subject.endsWith(" ") ? " " : ""}${x.key}` })}>
                        {x.key}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label">Attachment</div>
                  <div className="space-y-1.5 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.attach_report_pdf} onChange={(e) => set({ attach_report_pdf: e.target.checked })} />
                      แนบ PDF รายงานประจำวัน
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.attach_photos} onChange={(e) => set({ attach_photos: e.target.checked })} />
                      แนบรูปถ่ายหน้างาน
                    </label>
                  </div>
                  {(v.files.length > 0 || newFiles.length > 0) && (
                    <ul className="mt-2 space-y-1">
                      {v.files.map((f) => (
                        <li key={f.path} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm">
                          <span>📎</span>
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">{f.file_name}</a>
                          <span className="text-xs text-muted">{formatFileSize(f.size)}</span>
                          <button type="button" className="text-xs text-bad hover:underline" onClick={() => (set({ files: v.files.filter((x) => x.path !== f.path) }), setRemoved((r) => [...r, f]))}>เอาออก</button>
                        </li>
                      ))}
                      {newFiles.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm">
                          <span>📎</span>
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-muted">{formatFileSize(f.size)} · ใหม่</span>
                          <button type="button" className="text-xs text-bad hover:underline" onClick={() => setNewFiles((list) => list.filter((_, j) => j !== i))}>เอาออก</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
                  <button type="button" className="btn mt-2 px-2.5 py-1 text-xs" onClick={() => fileInputRef.current?.click()}>+ แนบไฟล์เพิ่มเติม</button>
                </div>
              </section>
            </>
          )}

          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn" onClick={close}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={pending || !v}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </form>
    </dialog>
  );
}
