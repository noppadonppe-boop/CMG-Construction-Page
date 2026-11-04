"use client";

import type { MaterialSubmission, MaterialFieldErrors } from "@/lib/material-submission";
import { MaterialFieldError, materialFieldProps } from "./material-field-error";

type TextKey = Exclude<keyof MaterialSubmission, "history" | "contents">;

export function MaterialSubmissionFields({ value: v, onChange, disabled, errors = {} }: { value: MaterialSubmission; onChange: (value: MaterialSubmission) => void; disabled: boolean; errors?: MaterialFieldErrors }) {
  function set(key: TextKey, value: string) {
    const history = v.history.map((r) => {
      if (r.revision !== v.revision || r.date !== v.submission_date) return r;
      return key === "revision" ? { ...r, revision: value } : key === "submission_date" ? { ...r, date: value } : r;
    });
    onChange({ ...v, [key]: value, history });
  }
  const field = (key: TextKey, label: string, maxLength = 200, placeholder = "", required = false, type = "text") => (
    <label className="block" key={key}>
      <span className="label">{label}{required ? " *" : ""}</span>
      <input {...materialFieldProps(key, errors)} className="input" type={type} value={v[key]} onChange={(e) => set(key, e.target.value)} maxLength={maxLength} placeholder={placeholder} required={required} />
      <MaterialFieldError name={key} errors={errors} />
    </label>
  );

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5 disabled:opacity-60">
      <section className="space-y-3 border-t border-border pt-4">
        <h3 className="font-semibold">หน้า 1 · หน้าปกขออนุมัติวัสดุ</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("document_no", "Doc. No. / เลขที่เอกสาร", 100, "เว้นว่างเพื่อใช้ Request No. อัตโนมัติ")}
          {field("revision", "Revision", 20, "R0", true)}
          {field("submission_date", "วันที่ยื่นเอกสาร", 10, "", true, "date")}
          {field("submission_purpose", "วัตถุประสงค์การยื่น", 100, "For Approval")}
          {field("manufacturer", "ผู้ผลิต / ยี่ห้อ", 200)}
          {field("project_title", "Project Title / ชื่อโครงการ", 200, "", true)}
          {field("location", "Location / สถานที่", 240)}
          {field("owner", "Owner / เจ้าของโครงการ")}
          {field("pmc", "PMC / ที่ปรึกษาโครงการ")}
          {field("contractor", "Contractor / ผู้รับเหมาหลัก")}
          {field("subcontractor", "Sub Contractor / ผู้รับเหมาช่วง")}
        </div>
        <h4 className="text-sm font-semibold">ผู้รับผิดชอบเอกสาร</h4>
        <p className="text-xs text-muted">ชื่อจะแสดงใต้ช่องลงนามใน PDF การกรอกชื่อไม่ได้เปลี่ยนสถานะอนุมัติในระบบ</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("prepared_by", "Prepared / ผู้จัดทำ", 80)}
          {field("checked_by", "Checked / ผู้ตรวจสอบ", 80)}
          {field("reviewed_by", "Reviewed / ผู้ทบทวน", 80)}
          {field("approved_by", "Approved / ผู้อนุมัติ", 80)}
        </div>
      </section>
      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">หน้า 2 · History of Submission</h3>
          <button type="button" className="btn text-xs" disabled={v.history.length >= 30} onClick={() => onChange({ ...v, history: [...v.history, { revision: v.revision, date: v.submission_date, details: "" }] })}>+ เพิ่มประวัติ</button>
        </div>
        {v.history.length === 0 && <p className="text-sm text-muted">ยังไม่มีประวัติการยื่นเอกสาร</p>}
        <MaterialFieldError name="history" errors={errors} />
        {v.history.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[6rem_10rem_1fr_auto]">
            <label><span className="label">Revision {i + 1}</span><input className="input" aria-label={`History revision ${i + 1}`} {...materialFieldProps(`history.${i}.revision`, errors)} value={r.revision} required maxLength={20} onChange={(e) => onChange({ ...v, history: v.history.map((row, j) => j === i ? { ...row, revision: e.target.value } : row) })} /><MaterialFieldError name={`history.${i}.revision`} errors={errors} /></label>
            <label><span className="label">วันที่</span><input className="input" aria-label={`History date ${i + 1}`} {...materialFieldProps(`history.${i}.date`, errors)} type="date" value={r.date} required onChange={(e) => onChange({ ...v, history: v.history.map((row, j) => j === i ? { ...row, date: e.target.value } : row) })} /><MaterialFieldError name={`history.${i}.date`} errors={errors} /></label>
            <label><span className="label">รายละเอียดการยื่น / แก้ไข</span><textarea className="input" aria-label={`History details ${i + 1}`} {...materialFieldProps(`history.${i}.details`, errors)} value={r.details} rows={2} required maxLength={500} onChange={(e) => onChange({ ...v, history: v.history.map((row, j) => j === i ? { ...row, details: e.target.value } : row) })} /><MaterialFieldError name={`history.${i}.details`} errors={errors} /></label>
            <button type="button" className="self-center text-xs text-bad" aria-label={`ลบประวัติ ${i + 1}`} onClick={() => onChange({ ...v, history: v.history.filter((_, j) => j !== i) })}>ลบ</button>
          </div>
        ))}
      </section>
      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">หน้า 3 · Table of Content</h3>
          <button type="button" className="btn text-xs" disabled={v.contents.length >= 60} onClick={() => onChange({ ...v, contents: [...v.contents, { title: "", page: "" }] })}>+ เพิ่มหัวข้อ</button>
        </div>
        <p className="text-xs text-muted">แก้ไขหัวข้อและเลขหน้าตามชุดเอกสารที่จะยื่น เว้นว่างเลขหน้าได้ PDF นี้สร้างเฉพาะหน้าปก ประวัติ และสารบัญ ไฟล์แนบไม่ได้ถูกรวมเป็นหน้าต่อท้าย</p>
        <MaterialFieldError name="contents" errors={errors} />
        {v.contents.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="w-5 pt-7 text-xs text-muted">{i + 1}</span>
            <label className="min-w-0 flex-1"><span className="label">หัวข้อ</span><input className="input" aria-label={`หัวข้อสารบัญ ${i + 1}`} {...materialFieldProps(`contents.${i}.title`, errors)} value={r.title} required maxLength={200} onChange={(e) => onChange({ ...v, contents: v.contents.map((row, j) => j === i ? { ...row, title: e.target.value } : row) })} /><MaterialFieldError name={`contents.${i}.title`} errors={errors} /></label>
            <label className="w-20 sm:w-24"><span className="label">หน้า</span><input className="input" aria-label={`เลขหน้าสารบัญ ${i + 1}`} {...materialFieldProps(`contents.${i}.page`, errors)} value={r.page} maxLength={11} placeholder="4-10" onChange={(e) => onChange({ ...v, contents: v.contents.map((row, j) => j === i ? { ...row, page: e.target.value } : row) })} /><MaterialFieldError name={`contents.${i}.page`} errors={errors} /></label>
            <button type="button" className="pt-7 text-xs text-bad" aria-label={`ลบหัวข้อ ${i + 1}`} onClick={() => onChange({ ...v, contents: v.contents.filter((_, j) => j !== i) })}>ลบ</button>
          </div>
        ))}
      </section>
    </fieldset>
  );
}
