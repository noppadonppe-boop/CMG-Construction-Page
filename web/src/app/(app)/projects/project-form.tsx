"use client";

import { useSubmitOnce } from "@/lib/use-submit-once";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { ConflictError, DataError } from "@/lib/db/common";
import { setProjectFormStandards, useFormStandards } from "@/lib/db/form-standards";
import { createProject, updateProject, useProjects, type ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { statusLabel } from "@/lib/format";
import { parseProjectForm, STATUSES } from "@/lib/project-input";
import { ConflictNotice } from "@/components/conflict-notice";
import { FormStandardsField } from "./form-standards-field";

/**
 * สร้าง/แก้ไขโครงการ
 * ค่าในช่องกรอกมาจาก "ข้อมูล ณ ตอนเปิดฟอร์ม" — ถ้าคนอื่นบันทึกระหว่างที่เรากำลังพิมพ์ ข้อความที่พิมพ์ไม่หาย
 * แต่จะเห็นแจ้งเตือน และตอนบันทึกจะตรวจ version ก่อน ไม่บันทึกทับเงียบ ๆ
 */
export function ProjectForm({ project: initial }: { project?: ProjectRecord }) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { byId } = useProjects();
  const formRef = useRef<HTMLFormElement>(null);
  const [project, setProject] = useState(initial);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, startTransition] = useSubmitOnce();
  const { forms, loading: loadingForms } = useFormStandards();
  const [chosenForms, setChosenForms] = useState(() => new Set(initial?.form_standards ?? []));

  const live = project ? byId.get(project.id) : undefined;
  const remoteChange = project && live && live.version !== project.version ? { by: live.updated_by } : null;

  function save(force = false) {
    if (!formRef.current || !userProfile) return;
    const parsed = parseProjectForm(new FormData(formRef.current));
    if ("error" in parsed) return setError(parsed.error);
    setError(undefined);
    setConflict(null);
    startTransition(async () => {
      try {
        const id = project
          ? (await updateProject(project.id, parsed.data, project.version, userProfile.email, force), project.id)
          : await createProject(parsed.data, userProfile.email);
        // แบบฟอร์มที่ถูกลบออกจากคลังแล้วตัดทิ้ง · บันทึกเฉพาะเมื่อชุดที่เลือกเปลี่ยนจากตอนเปิดฟอร์ม
        if (!loadingForms) {
          const ids = forms.filter((f) => chosenForms.has(f.id)).map((f) => f.id);
          const before = forms.filter((f) => project?.form_standards.includes(f.id)).map((f) => f.id);
          if (ids.length !== before.length || ids.some((x) => !before.includes(x))) await setProjectFormStandards(id, ids, userProfile.email);
        }
        router.push(`/projects/${id}`);
      } catch (e) {
        if (e instanceof ConflictError) setConflict(e.message);
        else setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save();
  }

  function reloadLatest() {
    if (!live) return;
    setProject(live);
    setChosenForms(new Set(live.form_standards));
    setConflict(null);
    setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} ref={formRef} onSubmit={handleSubmit} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 empty:hidden">
        <ConflictNotice remoteChange={remoteChange} conflictMessage={conflict} onReload={reloadLatest} onForceSave={() => save(true)} busy={pending} />
      </div>
      <div>
        <label className="label" htmlFor="code">รหัสโครงการ</label>
        <input id="code" name="code" required defaultValue={project?.code} placeholder="PRJ-2569-010" className="input uppercase" />
      </div>
      <div>
        <label className="label" htmlFor="status">สถานะ</label>
        <select id="status" name="status" defaultValue={project?.status ?? "planning"} className="input">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel[s]}</option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">ชื่อโครงการ</label>
        <input id="name" name="name" required defaultValue={project?.name} placeholder="เช่น อาคารสำนักงาน 8 ชั้น – บางนา" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="client">เจ้าของงาน</label>
        <input id="client" name="client" defaultValue={project?.client ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="location">สถานที่</label>
        <input id="location" name="location" defaultValue={project?.location ?? ""} className="input" />
      </div>

      <div>
        <label className="label" htmlFor="manager_name">ผู้จัดการโครงการ</label>
        <input id="manager_name" name="manager_name" defaultValue={project?.manager_name ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="contract_value">มูลค่าสัญญา (บาท)</label>
        <input
          id="contract_value"
          name="contract_value"
          required
          inputMode="decimal"
          defaultValue={project ? project.contract_value.toLocaleString("en-US") : ""}
          placeholder="128,500,000"
          className="input tabular-nums"
        />
      </div>

      <div>
        <label className="label" htmlFor="start_date">วันเริ่มสัญญา</label>
        <input id="start_date" name="start_date" type="date" required defaultValue={project?.start_date} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="end_date">วันสิ้นสุดสัญญา</label>
        <input id="end_date" name="end_date" type="date" required defaultValue={project?.end_date} className="input" />
      </div>

      {project && (
        <p className="text-xs text-muted sm:col-span-2">
          ถ้าเปลี่ยนวันที่สัญญา ให้ตรวจแผนความคืบหน้ารายเดือนอีกครั้ง
        </p>
      )}
      <FormStandardsField forms={forms} loading={loadingForms} chosen={chosenForms} onChange={setChosenForms} />
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad sm:col-span-2">{error}</p>}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href={project ? `/projects/${project.id}` : "/projects"} className="btn">ยกเลิก</Link>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "กำลังบันทึก..." : project ? "บันทึกการแก้ไข" : "สร้างโครงการ"}
        </button>
      </div>
    </form>
  );
}
