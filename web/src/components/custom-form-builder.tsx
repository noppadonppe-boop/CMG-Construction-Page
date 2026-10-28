"use client";

import {
  blankDigitalFormSchema,
  dailyReportFormSchema,
  FORM_FIELD_TYPES,
  FORM_FIELD_TYPE_KEYS,
  newFormElementId,
  type DigitalFormField,
  type DigitalFormSchema,
  type DigitalFormSection,
  type FormFieldType,
} from "@/lib/form-schema";

function moveItem<T>(items: T[], index: number, delta: -1 | 1) {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function lines(value?: string[]) {
  return value?.join("\n") ?? "";
}

function parseLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function fieldDefaults(type: FormFieldType): Partial<DigitalFormField> {
  if (type === "table") return { columns: ["รายการ", "รายละเอียด", "หมายเหตุ"] };
  if (type === "select") return { options: ["ตัวเลือกที่ 1", "ตัวเลือกที่ 2"] };
  return { placeholder: `กรอก${FORM_FIELD_TYPES[type].label}` };
}

export function CustomFormBuilder({ schema, onChange }: { schema: DigitalFormSchema; onChange: (next: DigitalFormSchema) => void }) {
  const totalFields = schema.sections.reduce((sum, section) => sum + section.fields.length, 0);

  function updateSection(index: number, patch: Partial<DigitalFormSection>) {
    onChange({ ...schema, sections: schema.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)) });
  }

  function updateField(sectionIndex: number, fieldIndex: number, patch: Partial<DigitalFormField>) {
    const section = schema.sections[sectionIndex];
    if (!section) return;
    updateSection(sectionIndex, { fields: section.fields.map((field, i) => (i === fieldIndex ? { ...field, ...patch } : field)) });
  }

  function addSection() {
    onChange({
      ...schema,
      sections: [...schema.sections, { id: newFormElementId("section"), title: `หมวดที่ ${schema.sections.length + 1}`, description: "", fields: [] }],
    });
  }

  function addField(sectionIndex: number) {
    const section = schema.sections[sectionIndex];
    if (!section) return;
    const type: FormFieldType = "text";
    updateSection(sectionIndex, {
      fields: [...section.fields, { id: newFormElementId("field"), label: `ฟิลด์ที่ ${section.fields.length + 1}`, type, required: false, ...fieldDefaults(type) }],
    });
  }

  function removeSection(index: number) {
    if (schema.sections.length <= 1) return;
    onChange({ ...schema, sections: schema.sections.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">ออกแบบโครงสร้างแบบฟอร์ม</h3>
          <p className="mt-0.5 text-xs text-muted">เพิ่มหมวดและฟิลด์ได้อิสระ ระบบจะบันทึกโครงสร้างนี้ไว้เป็นมาตรฐานกลาง</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => onChange(dailyReportFormSchema())}>เริ่มจากตัวอย่าง Daily Report</button>
          <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => onChange(blankDigitalFormSchema())}>เริ่มแบบฟอร์มว่าง</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface px-2 py-1">{schema.sections.length} หมวด</span>
        <span className="rounded-full bg-surface px-2 py-1">{totalFields} ฟิลด์</span>
        <span className="rounded-full bg-surface px-2 py-1">แก้ไขตัวอย่างได้ทุกจุด</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,.7fr)]">
        <div className="space-y-3">
          {schema.sections.map((section, sectionIndex) => (
            <section key={section.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 min-w-7 font-mono text-xs font-bold text-primary">{String(sectionIndex + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    className="input font-semibold"
                    value={section.title}
                    onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                    placeholder="ชื่อหมวด"
                    aria-label={`ชื่อหมวดที่ ${sectionIndex + 1}`}
                    maxLength={120}
                  />
                  <input
                    className="input text-sm"
                    value={section.description}
                    onChange={(e) => updateSection(sectionIndex, { description: e.target.value })}
                    placeholder="คำอธิบายหมวด (ไม่บังคับ)"
                    aria-label={`คำอธิบายหมวดที่ ${sectionIndex + 1}`}
                    maxLength={240}
                  />
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn px-2 py-1 text-xs" disabled={sectionIndex === 0} onClick={() => onChange({ ...schema, sections: moveItem(schema.sections, sectionIndex, -1) })} aria-label="เลื่อนหมวดขึ้น">↑</button>
                  <button type="button" className="btn px-2 py-1 text-xs" disabled={sectionIndex === schema.sections.length - 1} onClick={() => onChange({ ...schema, sections: moveItem(schema.sections, sectionIndex, 1) })} aria-label="เลื่อนหมวดลง">↓</button>
                  <button type="button" className="btn px-2 py-1 text-xs text-bad" disabled={schema.sections.length <= 1} onClick={() => removeSection(sectionIndex)} aria-label="ลบหมวด">ลบ</button>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {section.fields.map((field, fieldIndex) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    fieldIndex={fieldIndex}
                    fieldCount={section.fields.length}
                    onChange={(patch) => updateField(sectionIndex, fieldIndex, patch)}
                    onMove={(delta) => updateSection(sectionIndex, { fields: moveItem(section.fields, fieldIndex, delta) })}
                    onRemove={() => updateSection(sectionIndex, { fields: section.fields.filter((_, i) => i !== fieldIndex) })}
                  />
                ))}
                {section.fields.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">หมวดนี้ยังไม่มีฟิลด์ กดเพิ่มฟิลด์เพื่อเริ่มออกแบบ</p>}
                <button type="button" className="btn w-full border-dashed px-3 py-1.5 text-xs" onClick={() => addField(sectionIndex)}>+ เพิ่มฟิลด์ในหมวดนี้</button>
              </div>
            </section>
          ))}
          <button type="button" className="btn btn-primary w-full" onClick={addSection}>+ เพิ่มหมวดใหม่</button>
        </div>

        <SchemaPreview schema={schema} />
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  fieldIndex,
  fieldCount,
  onChange,
  onMove,
  onRemove,
}: {
  field: DigitalFormField;
  fieldIndex: number;
  fieldCount: number;
  onChange: (patch: Partial<DigitalFormField>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-2.5">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(9rem,.8fr)_auto]">
        <div>
          <label className="label" htmlFor={`field-label-${field.id}`}>ชื่อฟิลด์</label>
          <input id={`field-label-${field.id}`} className="input" value={field.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor={`field-type-${field.id}`}>ชนิดข้อมูล</label>
          <select id={`field-type-${field.id}`} className="input" value={field.type} onChange={(e) => onChange({ type: e.target.value as FormFieldType, ...fieldDefaults(e.target.value as FormFieldType) })}>
            {FORM_FIELD_TYPE_KEYS.map((type) => <option key={type} value={type}>{FORM_FIELD_TYPES[type].icon} {FORM_FIELD_TYPES[type].label}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-1">
          <button type="button" className="btn px-2 py-1 text-xs" disabled={fieldIndex === 0} onClick={() => onMove(-1)} aria-label="เลื่อนฟิลด์ขึ้น">↑</button>
          <button type="button" className="btn px-2 py-1 text-xs" disabled={fieldIndex === fieldCount - 1} onClick={() => onMove(1)} aria-label="เลื่อนฟิลด์ลง">↓</button>
          <button type="button" className="btn px-2 py-1 text-xs text-bad" onClick={onRemove}>ลบ</button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,.4fr)_auto]">
        <input className="input text-sm" value={field.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder="คำแนะนำในช่องกรอก (ไม่บังคับ)" />
        {field.type === "number" ? <input className="input text-sm" value={field.unit ?? ""} onChange={(e) => onChange({ unit: e.target.value })} placeholder="หน่วย เช่น m³" /> : <span />}
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted"><input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} /> จำเป็น</label>
      </div>

      {field.type === "select" && (
        <label className="mt-2 block">
          <span className="label">ตัวเลือก (บรรทัดละ 1 รายการ)</span>
          <textarea className="input text-sm" rows={2} value={lines(field.options)} onChange={(e) => onChange({ options: parseLines(e.target.value) })} placeholder="เช่น\nผ่าน\nไม่ผ่าน" />
        </label>
      )}
      {field.type === "table" && (
        <label className="mt-2 block">
          <span className="label">ชื่อคอลัมน์ (บรรทัดละ 1 คอลัมน์)</span>
          <textarea className="input text-sm" rows={2} value={lines(field.columns)} onChange={(e) => onChange({ columns: parseLines(e.target.value) })} placeholder="เช่น\nรายการ\nรายละเอียด\nหมายเหตุ" />
        </label>
      )}
    </div>
  );
}

function SchemaPreview({ schema }: { schema: DigitalFormSchema }) {
  return (
    <aside className="rounded-xl border border-primary/20 bg-primary-soft p-3 xl:sticky xl:top-3 xl:self-start">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Live preview</p>
          <h3 className="font-semibold">ตัวอย่างฟอร์ม</h3>
        </div>
        <span className="rounded-full bg-surface px-2 py-1 text-[11px] text-muted">{schema.sections.length} หมวด</span>
      </div>
      <div className="max-h-[31rem] space-y-2 overflow-y-auto pr-1">
        {schema.sections.map((section, index) => (
          <div key={section.id} className="rounded-lg border border-border bg-surface p-2.5">
            <div className="flex gap-2">
              <span className="font-mono text-[11px] font-bold text-primary">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="font-medium leading-tight">{section.title || "ยังไม่ตั้งชื่อหมวด"}</p>
                {section.description && <p className="mt-0.5 text-[11px] text-muted">{section.description}</p>}
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              {section.fields.map((field) => <PreviewField key={field.id} field={field} />)}
              {section.fields.length === 0 && <p className="text-[11px] text-muted">ยังไม่มีฟิลด์</p>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PreviewField({ field }: { field: DigitalFormField }) {
  if (field.type === "table") {
    return (
      <div>
        <p className="mb-1 text-[11px] font-medium">{field.label}{field.required && <span className="text-bad"> *</span>}</p>
        <div className="grid overflow-hidden rounded border border-border text-[10px]" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(field.columns?.length ?? 3, 4))}, minmax(0, 1fr))` }}>
          {(field.columns?.length ? field.columns : ["รายการ", "รายละเอียด", "หมายเหตุ"]).slice(0, 4).map((column) => <span key={column} className="border-r border-b border-border px-1.5 py-1 text-muted last:border-r-0">{column}</span>)}
        </div>
      </div>
    );
  }
  if (field.type === "photo") return <div className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted">📷 {field.label}</div>;
  if (field.type === "signature") return <div className="border-b border-border px-1 py-2 text-[11px] text-muted">✍ {field.label}</div>;
  if (field.type === "checkbox") return <div className="flex items-center gap-1.5 text-[11px]"><span className="grid size-3 place-items-center rounded border border-border">✓</span>{field.label}</div>;
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-[11px]">
      <span className="min-w-0 truncate">{field.label}{field.required && <span className="text-bad"> *</span>}</span>
      <span className="shrink-0 text-muted">{field.type === "select" ? "เลือก..." : field.unit || field.placeholder || FORM_FIELD_TYPES[field.type].label}</span>
    </div>
  );
}
