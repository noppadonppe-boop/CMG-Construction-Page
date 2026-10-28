"use client";

import { useSubmitOnce } from "@/lib/use-submit-once";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { DataError } from "@/lib/db/common";
import { createIssue } from "@/lib/db/issues";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { PhotoPicker, type PickedPhoto } from "@/components/photo-picker";
import { issueCategoryIcon, issueCategoryLabel, issuePriority } from "@/lib/format";
import type { IssueCategory, IssuePriority } from "@/lib/types";

const chip =
  "cursor-pointer rounded-full border border-border px-3 py-1.5 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary";

export function IssueForm({
  projects,
  defaultProjectId,
  defaultCategory,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  defaultCategory?: IssueCategory;
}) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useSubmitOnce();

  // ไม่ล้างฟอร์มเมื่อบันทึกไม่ผ่าน และปิดปุ่มระหว่างบันทึกเพื่อกันแจ้งซ้ำ
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "").trim();
    if (!text("project_id")) return setError("กรุณาเลือกโครงการ");
    if (!text("title")) return setError("กรุณากรอกหัวข้อ");
    if (!userProfile) return;
    const projectId = text("project_id");
    setError(undefined);
    startTransition(async () => {
      try {
        const id = await createIssue(
          {
            project_id: projectId,
            category: text("category") as IssueCategory,
            title: text("title"),
            description: text("description"),
            priority: text("priority") as IssuePriority,
            assignee: text("assignee") || null,
            due_date: text("due_date") || null,
          },
          photos.map((p) => p.file),
          userProfile.email,
        );
        router.push(`/issues/${projectId}/${id}`);
      } catch (err) {
        setError(err instanceof DataError ? err.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="label">หมวด</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(issueCategoryLabel) as IssueCategory[]).map((c) => (
            <label key={c} className={chip}>
              <input type="radio" name="category" value={c} defaultChecked={c === (defaultCategory ?? "issue")} className="sr-only" />
              {issueCategoryIcon[c]} {issueCategoryLabel[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">หัวข้อ</label>
        <input id="title" name="title" required className="input" placeholder="เช่น นั่งร้านชั้น 7 ไม่มีราวกันตก" />
      </div>

      <div>
        <label className="label" htmlFor="project_id">โครงการ</label>
        <select id="project_id" name="project_id" defaultValue={defaultProjectId} required className="input">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="label">ความเร่งด่วน</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(issuePriority) as IssuePriority[]).map((p) => (
            <label key={p} className={chip}>
              <input type="radio" name="priority" value={p} defaultChecked={p === "normal"} className="sr-only" />
              {issuePriority[p].label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="assignee">ผู้รับผิดชอบ</label>
        <input id="assignee" name="assignee" className="input" placeholder="เช่น จป. ประจำไซต์" />
      </div>
      <div>
        <label className="label" htmlFor="due_date">กำหนดแก้เสร็จ</label>
        <input id="due_date" name="due_date" type="date" className="input" />
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">รายละเอียด</label>
        <textarea id="description" name="description" rows={3} className="input" placeholder="ตำแหน่ง สาเหตุ สิ่งที่ต้องการให้ดำเนินการ" />
      </div>

      <fieldset className="sm:col-span-2">
        <legend className="label">รูปถ่าย</legend>
        <PhotoPicker photos={photos} onChange={setPhotos} onBusyChange={setCompressing} />
      </fieldset>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad sm:col-span-2">{error}</p>}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href="/issues" className="btn">ยกเลิก</Link>
        <button className="btn btn-primary" disabled={pending || compressing}>
          {pending ? (photos.length ? "กำลังอัปโหลดรูป..." : "กำลังบันทึก...") : "แจ้งเรื่อง"}
        </button>
      </div>
    </form>
  );
}
