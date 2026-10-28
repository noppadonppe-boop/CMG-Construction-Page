"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { deleteFormStandard, FORM_CATEGORIES, FORM_CATEGORY_KEYS, useFormStandards, type FormCategory, type FormStandard } from "@/lib/db/form-standards";
import { useProjects } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { FormStandardRow } from "@/components/form-standard-row";
import { FormStandardDialog } from "./form-dialog";

export default function FormStandardsPage() {
  const { can } = useAuth();
  const manage = can("form.manage");
  const { forms, loading, error } = useFormStandards();
  const { projects } = useProjects();
  const [category, setCategory] = useState<FormCategory | null>(null);
  const [search, setSearch] = useState("");
  // ไม่ส่ง form = เพิ่มใหม่
  const [editing, setEditing] = useState<{ form?: FormStandard } | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string>();

  // โครงการ (ที่ผู้ใช้มองเห็น) ที่เลือกใช้แต่ละแบบฟอร์ม
  const usedBy = useMemo(() => {
    const m = new Map<string, { id: string; code: string }[]>();
    projects.forEach((p) => p.form_standards.forEach((id) => m.set(id, [...(m.get(id) ?? []), { id: p.id, code: p.code }])));
    return m;
  }, [projects]);

  const q = search.trim().toLowerCase();
  const matched = forms.filter((f) => !q || `${f.code} ${f.name} ${f.description}`.toLowerCase().includes(q));
  const shown = category ? matched.filter((f) => f.category === category) : matched;
  const groups = FORM_CATEGORY_KEYS.map((c) => ({ c, items: shown.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);

  function remove(form: FormStandard) {
    const n = usedBy.get(form.id)?.length ?? 0;
    if (!confirm(`ลบแบบฟอร์ม "${form.name}" ออกจากคลัง?${n ? `\nมี ${n} โครงการเลือกใช้อยู่ — จะหายไปจากโครงการเหล่านั้นด้วย` : ""}`)) return;
    startTransition(async () => {
      try {
        await deleteFormStandard(form);
        setActionError(undefined);
      } catch (e) {
        setActionError("ลบไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  return (
    <>
      <PageHeader
        title="มาตรฐานแบบฟอร์ม"
        subtitle="คลังแบบฟอร์มกลางของบริษัท · แต่ละโครงการเลือกแบบฟอร์มที่ใช้ได้ที่หน้ารายละเอียดโครงการ"
        actions={manage && <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>+ เพิ่มแบบฟอร์ม</button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5">
          <CategoryChip active={!category} onClick={() => setCategory(null)} label="ทั้งหมด" count={matched.length} />
          {FORM_CATEGORY_KEYS.map((c) => (
            <CategoryChip
              key={c}
              active={category === c}
              onClick={() => setCategory(category === c ? null : c)}
              label={`${FORM_CATEGORIES[c].icon} ${FORM_CATEGORIES[c].label}`}
              count={matched.filter((f) => f.category === c).length}
            />
          ))}
        </nav>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาเลขที่ / ชื่อแบบฟอร์ม"
          aria-label="ค้นหาแบบฟอร์ม"
          className="input w-full sm:w-64"
        />
      </div>

      {(error || actionError) && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error ? `โหลดไม่สำเร็จ: ${error}` : actionError}</p>}

      {loading ? (
        <Skeleton />
      ) : groups.length === 0 ? (
        <EmptyState>
          {forms.length === 0 ? "ยังไม่มีแบบฟอร์มในคลัง" : "ไม่พบแบบฟอร์มที่ค้นหา"}
          {manage && forms.length === 0 && (
            <div className="mt-3">
              <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>+ เพิ่มแบบฟอร์มแรก</button>
            </div>
          )}
        </EmptyState>
      ) : (
        <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
          {groups.map(({ c, items }) => (
            <section key={c} className="card">
              <h2 className="mb-1 font-semibold">
                {FORM_CATEGORIES[c].icon} {FORM_CATEGORIES[c].label} <span className="text-sm font-normal text-muted">({items.length})</span>
              </h2>
              <ul className="divide-y divide-border">
                {items.map((f) => {
                  const used = usedBy.get(f.id) ?? [];
                  return (
                    <FormStandardRow
                      key={f.id}
                      form={f}
                      meta={
                        used.length > 0 && (
                          <p className="text-xs text-muted">
                            ใช้ใน {used.length} โครงการ:{" "}
                            {used.map((p, i) => (
                              <span key={p.id}>
                                {i > 0 && ", "}
                                <Link href={`/projects/${p.id}`} className="text-primary hover:underline">{p.code}</Link>
                              </span>
                            ))}
                          </p>
                        )
                      }
                      actions={
                        manage && (
                          <>
                            <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => setEditing({ form: f })}>แก้ไข</button>
                            <button type="button" className="btn px-2.5 py-1 text-xs text-bad" disabled={pending} onClick={() => remove(f)}>ลบ</button>
                          </>
                        )
                      }
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && <FormStandardDialog form={editing.form} onClose={() => setEditing(null)} />}
    </>
  );
}

function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm whitespace-nowrap ${active ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-surface text-muted hover:text-text"}`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
