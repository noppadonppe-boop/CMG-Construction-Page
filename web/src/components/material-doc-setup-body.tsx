"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MATERIAL_DOC_SETUP, type MaterialDocSetup } from "@/lib/material-doc-setup";
import { loadMaterialDocSetup, saveMaterialDocSetup } from "@/lib/db/material-doc-setup";
import { uploadFile, deleteFiles } from "@/lib/db/common";
import { APP_NAME } from "@/lib/db/paths";
import type { ProjectRecord } from "@/lib/db/projects";
import { MaterialSubmissionPreview } from "./material-submission-preview";
import { blankMaterialSubmission } from "@/lib/material-submission";
import { defaultMaterialCoverPages, materialCoverVariables } from "@/lib/material-cover-layout";
import { LayoutEditor } from "@/app/(app)/daily-reports/[projectId]/[date]/edit/layout-editor";
import { todayInBangkok } from "@/lib/format";

export function MaterialDocSetupBody({ project, onClose, onSaved }: { project: ProjectRecord; onClose: () => void; onSaved: () => void }) {
  const [config, setConfig] = useState<MaterialDocSetup>(DEFAULT_MATERIAL_DOC_SETUP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [profileName, setProfileName] = useState("");
  // เปลี่ยนเมื่อสลับโปรไฟล์หรือบันทึก เพื่อล้างประวัติ Ctrl+Z ของ LayoutEditor
  const [revision, setRevision] = useState(0);
  const baseConfig = useRef<MaterialDocSetup>(DEFAULT_MATERIAL_DOC_SETUP);
  const uploaded = useRef<string[]>([]);
  useEffect(() => {
    let active = true;
    loadMaterialDocSetup(project.id).then((value) => {
      if (active) {
        const next = { ...value, pages: value.pages ?? defaultMaterialCoverPages(value) };
        baseConfig.current = next;
        setConfig(next);
        setLoading(false);
      }
    }).catch(() => { if (active) setError("โหลดการตั้งค่าไม่สำเร็จ กรุณากลับแล้วลองใหม่"); });
    return () => { active = false; void deleteFiles(uploaded.current); };
  }, [project.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const sample = { no: "MR-PREVIEW", description: "ตัวอย่างวัสดุ", spec: "SD40", unit: "เส้น", quantity: 100, require_schedule: todayInBangkok(), remark: "", created_at: todayInBangkok(), submission: blankMaterialSubmission(project, todayInBangkok()) };
  const syncActiveProfile = (next: MaterialDocSetup) => {
    if (!activeProfileId) return next;
    const current = next.profiles.find((profile) => profile.id === activeProfileId);
    if (!current) return next;
    const { profiles: _profiles, ...profileConfig } = next;
    return { ...next, profiles: next.profiles.map((profile) => profile.id === activeProfileId ? { id: activeProfileId, name: current.name, ...profileConfig } : profile) };
  };
  const persist = async (candidate: MaterialDocSetup, successMessage: string) => {
    const next = syncActiveProfile(candidate);
    setSaving(true); setError(""); setNotice("");
    try {
      await saveMaterialDocSetup(project.id, next);
      const pages = [ ...(next.pages || []), ...next.profiles.flatMap((profile) => profile.pages || []) ];
      const kept = new Set(pages.flatMap((page) => page.slots.flatMap((slot) => slot.image ? [slot.image.path] : [])));
      const unused = uploaded.current.filter((path) => !kept.has(path));
      uploaded.current = [];
      void deleteFiles(unused);
      setConfig(next);
      if (!activeProfileId) baseConfig.current = next;
      setDirty(false); setRevision(r => r + 1); setNotice(successMessage); onSaved();
      return true;
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
      return false;
    } finally { setSaving(false); }
  };
  const saveAsProfile = async () => {
    const name = profileName.trim();
    if (!name) { setError("กรอกชื่อโปรไฟล์ก่อนบันทึก"); return; }
    const id = activeProfileId || crypto.randomUUID();
    const { profiles: _profiles, ...profileConfig } = config;
    const next = { ...config, profiles: [...config.profiles.filter((profile) => profile.id !== id), { id, name, ...profileConfig }] };
    const ok = await persist(next, `บันทึกโปรไฟล์ “${name}” แล้ว`);
    if (ok) { setActiveProfileId(id); setProfileName(name); }
  };
  const busy = loading || saving || imageBusy;
  return <section className="space-y-4" aria-label="Setup Doc Whiteboard">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn" disabled={saving || imageBusy} onClick={() => { if (!dirty || confirm("ยังมีการแก้ไขที่ไม่ได้บันทึก ต้องการกลับไป Request หรือไม่?")) onClose(); }}>← กลับ Request</button>
      <div className="flex-1"><h2 className="text-lg font-bold">Setup Doc · Cover Page Request Material</h2><p className="text-sm text-muted">{project.name} · {dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "แบบจัดหน้าของโครงการ"}</p></div>
      <button type="button" className="btn" disabled={busy || !config.pages?.length} onClick={() => setPreview(true)}>ดูตัวอย่าง PDF</button>
      <button type="button" className="btn btn-primary" disabled={busy || !config.pages?.length} onClick={() => void persist(config, "บันทึกแบบจัดหน้าแล้ว")}>{saving ? "กำลังบันทึก…" : "บันทึก Setup Doc"}</button>
    </div>
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-2 p-3">
      <label className="min-w-[14rem] flex-1">
        <span className="mb-1 block text-xs font-medium text-muted">โปรไฟล์ที่กำลังแก้ไข</span>
        <select className="input" value={activeProfileId} disabled={busy} onChange={(event) => {
          const id = event.target.value;
          setActiveProfileId(id);
          if (!id) { setConfig(baseConfig.current); setProfileName(""); setDirty(false); return; }
          const profile = config.profiles.find((candidate) => candidate.id === id);
          if (!profile) return;
          const { id: _id, name, ...profileConfig } = profile;
          setConfig(current => ({ ...current, ...profileConfig, profiles: current.profiles }));
          setProfileName(name);
          setDirty(false);
        }}>
          <option value="">แบบปัจจุบันของโครงการ</option>
          {config.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
      <label className="min-w-[14rem] flex-1">
        <span className="mb-1 block text-xs font-medium text-muted">ชื่อโปรไฟล์</span>
        <input className="input" value={profileName} disabled={busy} maxLength={120} placeholder="เช่น Cover งานโครงสร้าง" onChange={(event) => setProfileName(event.target.value)} />
      </label>
      <button type="button" className="btn" disabled={busy || !config.pages?.length || !profileName.trim()} onClick={() => void saveAsProfile()}>บันทึกเป็นโปรไฟล์</button>
      <p className="w-full text-xs text-muted">บันทึกแล้วจะเลือกใช้โปรไฟล์นี้ได้จากด้านบนของหน้าต่างเพิ่ม Material Request</p>
    </div>
    <p className="text-sm text-muted">จัดหน้าด้วยเครื่องมือเดียวกับส่วน H: เพิ่มกล่อง ลากย้าย ย่อ–ขยาย และลากข้อมูล Request ลงกระดาษ · PDF จะต่อด้วย Request Form ที่กรอกข้อมูลจริง</p>
    {error && <p role="alert" className="text-bad">{error}</p>}
    {notice && <p role="status" className="text-ok">{notice}</p>}
    {loading ? <p>กำลังโหลดการตั้งค่า…</p> : <fieldset disabled={saving || imageBusy} className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-5">
      <LayoutEditor pages={config.pages || []} variables={materialCoverVariables(project, sample)} variableLabel="ข้อมูล Request" documentTitle="Cover Page Request Material" showTemplates={false} showPaperHeader={false} boxTools historyKey={`${activeProfileId}:${revision}`}
        onChange={fn => { setConfig(current => { const next = { ...current, pages: fn(current.pages || []) }; if (!activeProfileId) baseConfig.current = next; return next; }); setDirty(true); setNotice(""); }}
        letter="MR" docNo="MR-PREVIEW" locked={busy} fresh={{}} imageBusy={imageBusy}
        onPickImage={async (slotId, file) => {
          if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { setError("เลือกรูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 5 MB"); return; }
          setImageBusy(true); setError("");
          try {
            const image = await uploadFile(`${APP_NAME}/root/projects/${project.id}/document_setup/${crypto.randomUUID()}`, file);
            uploaded.current.push(image.path);
            setConfig(current => { const next = { ...current, pages: current.pages?.map(page => ({ ...page, slots: page.slots.map(slot => slot.id === slotId ? { ...slot, image } : slot) })) }; if (!activeProfileId) baseConfig.current = next; return next; }); setDirty(true);
          } catch { setError("อัปโหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง"); }
          finally { setImageBusy(false); }
        }} onDropImages={() => {}} layouts={null} templateBusy={false} onSaveTemplate={async () => false} onApplyTemplate={() => {}} onDeleteTemplate={() => {}} onSetDefault={() => {}} />
      {!config.pages?.length && <p className="mt-3 text-sm text-bad">เพิ่มอย่างน้อย 1 หน้าก่อนบันทึก</p>}
    </fieldset>}
    {preview && <MaterialSubmissionPreview project={project} request={sample} setup={config} draft onClose={() => setPreview(false)} />}
  </section>;
}
