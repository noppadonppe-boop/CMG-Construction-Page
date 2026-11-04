"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import {
  DEFAULT_EMAIL_SUBJECT,
  EMAIL_SUBJECT_VARIABLES,
  isValidEmail,
  loadEmailSetup,
  saveEmailSetup,
  type EmailAttachmentFile,
  type EmailContact,
  type EmailSetup,
  type EmailSetupTab,
  type EmailProfile,
} from "@/lib/db/email-setup";
import { newId } from "@/lib/db/common";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatFileSize } from "@/lib/format";
import { MultiSelect } from "@/components/multi-select";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const tabs: { id: EmailSetupTab; label: string }[] = [
  { id: "daily", label: "Daily Report" },
  { id: "material", label: "Material Request" },
  { id: "document", label: "Document Approve" },
];
const blankContact = { name: "", email: "", company: "", position: "" };

/** ตั้งค่ารายชื่อผู้รับ และเนื้อหาอีเมลรายงานประจำวันของโครงการ — เปิดเป็น modal ทันทีที่ render */
export function EmailSetupDialog({ projects, onClose }: { projects: ProjectRecord[]; onClose: () => void }) {
  const { userProfile } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [tab, setTab] = useState<EmailSetupTab>("daily");
  const [setups, setSetups] = useState<Record<EmailSetupTab, EmailSetup> | null>(null);
  const v = setups?.[tab] ?? null;
  const [draft, setDraft] = useState(blankContact);
  const [filesByTab, setFilesByTab] = useState<Record<EmailSetupTab, File[]>>({ daily: [], material: [], document: [] });
  const [removedByTab, setRemovedByTab] = useState<Record<EmailSetupTab, EmailAttachmentFile[]>>({ daily: [], material: [], document: [] });
  const newFiles = filesByTab[tab];
  const setNewFiles = (update: File[] | ((files: File[]) => File[])) => setFilesByTab((prev) => ({ ...prev, [tab]: typeof update === "function" ? update(prev[tab]) : update }));
  const setRemoved = (update: (files: EmailAttachmentFile[]) => EmailAttachmentFile[]) => setRemovedByTab((prev) => ({ ...prev, [tab]: update(prev[tab]) }));
  const [error, setError] = useState<string>();
  const [contactError, setContactError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<EmailSetup>) => setSetups((prev) => (prev ? { ...prev, [tab]: { ...prev[tab], ...patch } } : prev));
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    Promise.all(tabs.map(({ id }) => loadEmailSetup(projectId, id))).then(
      ([daily, material, document]) => !cancelled && setSetups({ daily, material, document }),
      (e) => {
        if (cancelled) return;
        setSetups(null);
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
    setSetups(null);
    setFilesByTab({ daily: [], material: [], document: [] });
    setRemovedByTab({ daily: [], material: [], document: [] });
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
    if (!v || !setups || !userProfile) return;
    for (const { id, label } of tabs) {
      const setup = setups[id];
      const selected = setup.profiles.find((p) => p.id === setup.selected_profile_id);
      if (setup.profiles.some((p) => !p.name.trim() || !p.subject.trim())) return setError(label + ": กรุณาใส่ชื่อโปรไฟล์และ Subject ทุกโปรไฟล์");
      if (setup.subject_mode === "custom" && !(selected?.subject ?? setup.subject).trim()) return setError(label + ": กรุณาใส่ Subject");
    }
    setError(undefined);
    startTransition(async () => {
      try {
        for (const { id } of tabs) {
          const setup = setups[id];
          const selected = setup.profiles.find((p) => p.id === setup.selected_profile_id);
          const subject = setup.subject_mode === "system" ? DEFAULT_EMAIL_SUBJECT : (selected?.subject ?? setup.subject).trim();
          const saved = await saveEmailSetup(projectId, { ...setup, subject, cc: setup.cc.filter((contactId) => !setup.to.includes(contactId)) }, filesByTab[id], removedByTab[id], userProfile.email, id);
          setSetups((prev) => prev ? { ...prev, [id]: saved } : prev);
          setFilesByTab((prev) => ({ ...prev, [id]: [] }));
          setRemovedByTab((prev) => ({ ...prev, [id]: [] }));
        }
        close();
      } catch (err) {
        setError("บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  const profile = v?.profiles.find((p) => p.id === v.selected_profile_id);
  const updateProfile = (patch: Partial<EmailProfile>) => {
    if (!v || !profile) return;
    const updated = { ...profile, ...patch };
    set({ profiles: v.profiles.map((p) => p.id === profile.id ? updated : p), subject: updated.subject });
  };
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

          <div role="tablist" aria-label="ประเภทอีเมล" className="flex flex-wrap gap-2 border-b border-border">
            {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`px-3 py-2 text-sm ${tab === item.id ? "border-b-2 border-primary font-semibold text-primary" : "text-muted"}`} onClick={() => { setTab(item.id); setError(undefined); setDraft(blankContact); setContactError(undefined); }}>{item.label}</button>)}
          </div>
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
                  <div className="label">Sent to</div>
                  <MultiSelect label="Sent to" options={options} value={v.to} onChange={(to) => set({ to, cc: v.cc.filter((id) => !to.includes(id)) })} placeholder="เลือกจากรายชื่อ" />
                </div>
                <div>
                  <div className="label">CC</div>
                  <MultiSelect label="CC" options={options.filter((o) => !v.to.includes(o.value))} value={v.cc} onChange={(cc) => set({ cc })} placeholder="เลือกจากรายชื่อ" />
                </div>
                <div>
                  <div className="label" id="es-subject-label">Subject *</div>
                  <div role="radiogroup" aria-labelledby="es-subject-label" className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="es-subject-mode" checked={v.subject_mode === "system"} onChange={() => set({ subject_mode: "system" })} />
                      ใช้ของระบบ
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="es-subject-mode" checked={v.subject_mode === "custom"} onChange={() => set({ subject_mode: "custom" })} />
                      ตั้งค่าเอง
                    </label>
                  </div>
                  {v.subject_mode === "system" ? (
                    <p className="input bg-surface-2 text-muted" aria-label="Subject ของระบบ">{DEFAULT_EMAIL_SUBJECT}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <select className="input flex-1" aria-label="เลือกโปรไฟล์อีเมล" value={profile?.id ?? ""} onChange={(e) => { const selected = v.profiles.find((p) => p.id === e.target.value); set({ selected_profile_id: e.target.value, ...(selected ? { subject: selected.subject } : {}) }); }}>
                          <option value="">Subject เดิม</option>
                          {v.profiles.map((p) => <option key={p.id} value={p.id}>{p.name || "โปรไฟล์ใหม่"}</option>)}
                        </select>
                        <button type="button" className="btn" onClick={() => { const p = { id: newId(), name: "", title: "", subject: v.subject, body: "" }; set({ profiles: [...v.profiles, p], selected_profile_id: p.id }); }}>+ สร้างโปรไฟล์</button>
                        {profile && <button type="button" className="btn text-bad" onClick={() => set({ profiles: v.profiles.filter((p) => p.id !== profile.id), selected_profile_id: "" })}>ลบโปรไฟล์</button>}
                      </div>
                      {profile && <>
                        <label className="block"><span className="label">ชื่อโปรไฟล์ *</span><input className="input" value={profile.name} maxLength={100} onChange={(e) => updateProfile({ name: e.target.value })} /></label>
                        <label className="block"><span className="label">Title</span><input className="input" value={profile.title} maxLength={500} onChange={(e) => updateProfile({ title: e.target.value })} /></label>
                      </>}
                      <label className="block"><span className="label">Subject *</span><textarea id="es-subject" className="input" rows={2} value={profile?.subject ?? v.subject} maxLength={500} onChange={(e) => profile ? updateProfile({ subject: e.target.value }) : set({ subject: e.target.value })} /></label>
                      {profile && <label className="block"><span className="label">เนื้อหา</span><textarea className="input" rows={6} value={profile.body} maxLength={20000} onChange={(e) => updateProfile({ body: e.target.value })} /></label>}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                    ตัวแปร:
                    {EMAIL_SUBJECT_VARIABLES.map((x) => (
                      <button key={x.key} type="button" disabled={v.subject_mode === "system"} className="rounded bg-primary-soft px-1.5 font-mono text-primary hover:underline disabled:opacity-50 disabled:no-underline" title={x.label} onClick={() => { const current = profile?.subject ?? v.subject; const subject = `${current}${current && !current.endsWith(" ") ? " " : ""}${x.key}`; if (profile) updateProfile({ subject }); else set({ subject }); }}>
                        {x.key}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label">Attachment</div>
                  {tab === "daily" && <div className="space-y-1.5 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.attach_report_pdf} onChange={(e) => set({ attach_report_pdf: e.target.checked })} />
                      แนบรายงานเป็นไฟล์ PDF
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.attach_photos} onChange={(e) => set({ attach_photos: e.target.checked })} />
                      แนบรูปถ่ายหน้างาน
                    </label>
                  </div>}
                  <p className="mt-1 text-xs text-muted">{tab === "daily" ? "ไฟล์เพิ่มเติมที่อัปโหลดไว้จะถูกแนบทุกครั้ง ส่วนรูปถ่ายจะถูกแนบเมื่อเลือกตัวเลือกด้านบน" : "ไฟล์เพิ่มเติมสำหรับแท็บนี้"}</p>
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
