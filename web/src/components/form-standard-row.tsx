import type { ReactNode } from "react";
import { formHref, type FormStandard } from "@/lib/db/form-standards";

/** แถวแบบฟอร์ม 1 รายการ: เลขที่ ชื่อ Rev. และปุ่มเปิดไฟล์/ลิงก์ — ใช้ทั้งในคลังกลางและหน้าโครงการ */
export function FormStandardRow({ form, meta, actions }: { form: FormStandard; meta?: ReactNode; actions?: ReactNode }) {
  const href = formHref(form);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {form.code && <span className="font-mono text-xs text-muted">{form.code}</span>}
          <span className="font-medium">{form.name}</span>
          {form.rev && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">Rev. {form.rev}</span>}
        </div>
        {form.description && <p className="truncate text-xs text-muted">{form.description}</p>}
        {meta}
      </div>
      <div className="flex items-center gap-1.5">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="btn px-2.5 py-1 text-xs">
            {form.file ? "📄 เปิดไฟล์" : "🔗 เปิดลิงก์"}
          </a>
        ) : (
          <span className="text-xs text-muted">ไม่มีไฟล์</span>
        )}
        {actions}
      </div>
    </li>
  );
}
