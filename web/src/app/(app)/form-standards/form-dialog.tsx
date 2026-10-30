"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import {
  FORM_CATEGORIES,
  FORM_CATEGORY_KEYS,
  newFormStandardId,
  saveFormStandard,
  type FormStandard,
  type FormStandardInput,
} from "@/lib/db/form-standards";
import { blankDigitalFormSchema } from "@/lib/form-schema";
import {
  DAILY_REPORT_STANDARD_SECTIONS,
  DAILY_REPORT_TEMPLATE_KEYS,
  DAILY_REPORT_TEMPLATES,
  OPTIONAL_DAILY_SECTIONS,
  sectionLetters,
  type DailySection,
} from "@/lib/daily-report-standard";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatFileSize } from "@/lib/format";
import { CustomFormBuilder } from "@/components/custom-form-builder";
import { FilePicker, useDocumentFile } from "../documents/file-upload";

/** เพิ่มแบบฟอร์มใหม่ (ไม่ส่ง form) หรือแก้/อัปโหลดฉบับใหม่ — เปิดเป็น modal ทันทีที่ render */
export function FormStandardDialog({ form, onClose }: { form?: FormStandard; onClose: () => void }) {
  const { userProfile } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // id ของแบบฟอร์มใหม่สร้างครั้งเดียว — ไฟล์จะอยู่ในโฟลเดอร์ของ id นี้
  const [id] = useState(() => form?.id ?? newFormStandardId());
  const [v, setV] = useState<FormStandardInput>(() =>
    form ?? { code: "", name: "", category: "general", description: "", rev: "0", link: "", kind: "document", schema: null, daily_template: null, daily_sections: null },
  );
  const set = (patch: Partial<FormStandardInput>) => setV((prev) => ({ ...prev, ...patch }));
  const { file, setFile, progress, setProgress } = useDocumentFile();
  const [removeFile, setRemoveFile] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const keepsFile = Boolean(form?.file && !removeFile);
  const isCustomDigital = v.kind === "custom";
  const isDaily = v.kind === "daily_report";
  const enabledSections: readonly string[] = v.daily_sections ?? OPTIONAL_DAILY_SECTIONS;
  const letters = sectionLetters(v.daily_sections);
  const toggleSection = (key: DailySection) => {
    const current = v.daily_sections ?? OPTIONAL_DAILY_SECTIONS;
    const next = current.includes(key) ? current.filter((k) => k !== key) : OPTIONAL_DAILY_SECTIONS.filter((k) => k === key || current.includes(k));
    // เปิดครบทุกหัวข้อ = null (ตามมาตรฐานเต็ม)
    set({ daily_sections: next.length === OPTIONAL_DAILY_SECTIONS.length ? null : next });
  };

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input: FormStandardInput = {
      ...v,
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      description: v.description.trim(),
      rev: v.rev.trim(),
      link: v.kind === "document" ? v.link.trim() : "",
      schema: isCustomDigital ? v.schema : null,
      daily_template: isDaily ? (v.daily_template ?? DAILY_REPORT_TEMPLATE_KEYS[0]) : null,
      daily_sections: isDaily ? v.daily_sections : null,
    };
    if (!input.name) return setError("กรุณาใส่ชื่อแบบฟอร์ม");
    if (input.link && !/^https?:\/\//i.test(input.link)) return setError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
    if (input.kind === "custom") {
      const sections = input.schema?.sections ?? [];
      const fieldCount = sections.reduce((sum, section) => sum + section.fields.length, 0);
      if (sections.length === 0 || fieldCount === 0) return setError("กรุณาเพิ่มอย่างน้อย 1 หมวด และ 1 ฟิลด์ในแบบฟอร์มดิจิทัล");
      if (sections.some((section) => !section.title.trim())) return setError("กรุณาตั้งชื่อให้ครบทุกหมวด");
      if (sections.some((section) => section.fields.some((field) => !field.label.trim()))) return setError("กรุณาตั้งชื่อให้ครบทุกฟิลด์");
      if (sections.some((section) => section.fields.some((field) => field.type === "select" && !field.options?.length))) return setError("ฟิลด์แบบตัวเลือกต้องมีรายการตัวเลือกอย่างน้อย 1 รายการ");
      if (sections.some((section) => section.fields.some((field) => field.type === "table" && !field.columns?.length))) return setError("ฟิลด์แบบตารางต้องมีชื่อคอลัมน์อย่างน้อย 1 คอลัมน์");
    }
    if (input.kind === "document" && !file && !keepsFile && !input.link) return setError("กรุณาอัปโหลดไฟล์ หรือใส่ลิงก์แบบฟอร์ม");
    startTransition(async () => {
      try {
        await saveFormStandard(id, form, input, file, removeFile, userProfile!.email, setProgress);
        dialogRef.current?.close();
      } catch (err) {
        setProgress(null);
        setError("บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(68rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-lg">{FORM_CATEGORIES[v.category].icon}</div>
          <h2 className="flex-1 font-bold">{form ? "แก้ไขแบบฟอร์ม" : "เพิ่มแบบฟอร์มมาตรฐาน"}</h2>
          <button type="button" className="text-xl text-muted hover:text-text" aria-label="ปิด" onClick={() => dialogRef.current?.close()}>
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label className="label" htmlFor="fs-code">เลขที่แบบฟอร์ม</label>
              <input id="fs-code" className="input font-mono uppercase" value={v.code} onChange={(e) => set({ code: e.target.value })} maxLength={30} placeholder="เช่น FM-QC-001" />
            </div>
            <div>
              <label className="label" htmlFor="fs-rev">Rev.</label>
              <input id="fs-rev" className="input" value={v.rev} onChange={(e) => set({ rev: e.target.value })} maxLength={10} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="fs-name">ชื่อแบบฟอร์ม *</label>
            <input id="fs-name" className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="เช่น ใบขออนุมัติเทคอนกรีต" />
          </div>
          <div>
            <label className="label" htmlFor="fs-cat">หมวด</label>
            <select id="fs-cat" className="input" value={v.category} onChange={(e) => set({ category: e.target.value as FormStandardInput["category"] })}>
              {FORM_CATEGORY_KEYS.map((c) => (
                <option key={c} value={c}>{FORM_CATEGORIES[c].icon} {FORM_CATEGORIES[c].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fs-desc">คำอธิบาย / วิธีใช้</label>
            <textarea id="fs-desc" className="input" rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} />
          </div>

          <div>
            <div className="label">รูปแบบการใช้งาน</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <KindOption checked={v.kind === "document"} onChange={() => set({ kind: "document", schema: null, daily_template: null })} title="เอกสาร / ไฟล์แนบ" detail="อัปโหลด PDF, Excel, Word หรือใช้ลิงก์ภายนอก" />
              <KindOption checked={v.kind === "custom"} onChange={() => set({ kind: "custom", schema: v.schema ?? blankDigitalFormSchema(), link: "", daily_template: null })} title="ฟอร์มดิจิทัลแบบกำหนดเอง" detail="ออกแบบหมวด ฟิลด์ ตาราง รูปภาพ และลายเซ็นในระบบ" />
              {DAILY_REPORT_TEMPLATE_KEYS.map((t) => (
                <KindOption key={t} checked={isDaily && v.daily_template === t} onChange={() => set({ kind: "daily_report", daily_template: t, schema: null, link: "" })} title={DAILY_REPORT_TEMPLATES[t].label} detail={DAILY_REPORT_TEMPLATES[t].detail} />
              ))}
            </div>
          </div>

          {isCustomDigital ? (
            <CustomFormBuilder schema={v.schema ?? blankDigitalFormSchema()} onChange={(schema) => set({ schema })} />
          ) : isDaily ? (
            <div className="rounded-lg border border-primary/25 bg-primary-soft/60 px-3 py-3">
              <p className="text-xs text-primary">ใช้หน้ารายงานประจำวันของระบบโดยตรง ไม่ต้องแนบไฟล์หรือลิงก์ · เลือกหัวข้อที่ใช้ — หัวข้อที่ปิดจะไม่แสดงในฟอร์มและรายงาน และเรียงตัวอักษรใหม่ให้ต่อเนื่อง</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {DAILY_REPORT_STANDARD_SECTIONS.map((s) => {
                  const required = s.key === "project";
                  const on = required || enabledSections.includes(s.key);
                  return (
                    <label key={s.key} className={`flex items-center gap-2 rounded-md border bg-surface px-2 py-1.5 text-xs ${on ? "border-border" : "border-dashed border-border opacity-60"} ${required ? "" : "cursor-pointer"}`}>
                      <span className={`grid size-5 shrink-0 place-items-center rounded text-[11px] font-bold ${on ? "bg-primary text-white" : "bg-surface-2 text-muted line-through"}`}>{letters[s.key] ?? "–"}</span>
                      <span className="min-w-0 flex-1">
                        {s.title}
                        <span className="block text-[11px] text-muted">{s.en}{required && " · บังคับใช้"}</span>
                      </span>
                      <input type="checkbox" role="switch" className="dcr-switch" checked={on} disabled={required} aria-label={`ใช้หัวข้อ ${s.title}`} onChange={() => toggleSection(s.key as DailySection)} />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
                  <div>
                    <div className="label">ไฟล์แบบฟอร์ม</div>
                    {keepsFile && !file && (
                      <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                        <span>📄</span>
                        <a href={form!.file!.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">
                          {form!.file!.file_name}
                        </a>
                        <span className="text-xs text-muted">{formatFileSize(form!.file!.size)}</span>
                        <button type="button" className="text-xs text-bad hover:underline" onClick={() => setRemoveFile(true)}>เอาออก</button>
                      </div>
                    )}
                    <FilePicker file={file} onFile={setFile} progress={progress} />
                    {form?.file && <p className="mt-1 text-xs text-muted">อัปโหลดไฟล์ใหม่ = แทนที่ไฟล์เดิม (อย่าลืมเปลี่ยน Rev.)</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="fs-link">หรือลิงก์ (Google Drive / เว็บ)</label>
                    <input id="fs-link" className="input font-mono" value={v.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://drive.google.com/..." inputMode="url" />
                    <p className="mt-1 text-xs text-muted">ถ้ามีทั้งไฟล์และลิงก์ จะเปิดไฟล์ที่อัปโหลดก่อน</p>
                  </div>
            </>
          )}

          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : form ? "บันทึก" : "เพิ่มแบบฟอร์ม"}</button>
        </div>
      </form>
    </dialog>
  );
}

function KindOption({ checked, onChange, title, detail }: { checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label className={`cursor-pointer rounded-lg border px-3 py-2.5 ${checked ? "border-primary bg-primary-soft" : "border-border bg-surface-2"}`}>
      <input className="sr-only" type="radio" name="form-kind" checked={checked} onChange={onChange} />
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{detail}</span>
    </label>
  );
}
