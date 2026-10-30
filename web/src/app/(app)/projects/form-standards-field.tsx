"use client";

import Link from "next/link";
import { FORM_CATEGORIES, FORM_CATEGORY_KEYS, isDailyReportStandard, type FormStandard } from "@/lib/db/form-standards";

/**
 * เลือกมาตรฐานแบบฟอร์มในฟอร์มโครงการ — รายงานประจำวันเลือกได้ 1 รายการ (dropdown) ส่วนแบบฟอร์มอื่นติ๊กได้หลายรายการ
 * ค่าที่เลือกเก็บที่ projects/{id}.form_standards ทุกหน้าของโครงการ (รวมรายงานประจำวันฉบับใหม่) ใช้ชุดนี้
 */
export function FormStandardsField({
  forms,
  loading,
  chosen,
  onChange,
}: {
  forms: FormStandard[];
  loading: boolean;
  chosen: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const daily = forms.filter(isDailyReportStandard);
  const others = forms.filter((f) => !isDailyReportStandard(f));
  const dailyId = daily.find((f) => chosen.has(f.id))?.id ?? "";
  const groups = FORM_CATEGORY_KEYS.map((c) => ({ c, items: others.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);

  const setDaily = (id: string) => {
    const next = new Set(chosen);
    daily.forEach((f) => next.delete(f.id));
    if (id) next.add(id);
    onChange(next);
  };
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  return (
    <section className="space-y-3 border-t border-border pt-4 sm:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">มาตรฐานแบบฟอร์มที่ใช้ในโครงการ</h3>
        <Link href="/form-standards" className="text-xs text-primary hover:underline">ดูคลังแบบฟอร์ม</Link>
      </div>
      {loading ? (
        <p className="text-sm text-muted">กำลังโหลดแบบฟอร์ม...</p>
      ) : forms.length === 0 ? (
        <p className="text-sm text-muted">ยังไม่มีแบบฟอร์มในคลัง — เพิ่มได้ที่เมนูมาตรฐานแบบฟอร์ม</p>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="daily_standard">รายงานประจำวัน (เลือกได้ 1 รายการ)</label>
            <select id="daily_standard" className="input" value={dailyId} onChange={(e) => setDaily(e.target.value)}>
              <option value="">รูปแบบพื้นฐานของระบบ</option>
              {daily.map((f) => (
                <option key={f.id} value={f.id}>
                  {[f.code, f.name].filter(Boolean).join(" · ")}{f.rev && ` · Rev. ${f.rev}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">รายงานประจำวันฉบับใหม่ของโครงการนี้จะใช้มาตรฐานที่เลือก</p>
          </div>
          {groups.length > 0 && (
            <div className="space-y-3">
              <div className="label mb-0">แบบฟอร์มอื่น ๆ</div>
              {groups.map(({ c, items }) => (
                <div key={c}>
                  <div className="mb-1 text-xs font-semibold text-muted">{FORM_CATEGORIES[c].icon} {FORM_CATEGORIES[c].label}</div>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {items.map((f) => (
                      <label key={f.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={chosen.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                        <span className="min-w-0 text-sm">
                          {f.code && <span className="mr-1.5 font-mono text-xs text-muted">{f.code}</span>}
                          {f.name}
                          {f.rev && <span className="ml-1.5 text-[11px] text-muted">Rev. {f.rev}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
