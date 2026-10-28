"use client";

import { useSubmitOnce } from "@/lib/use-submit-once";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { DataError } from "@/lib/db/common";
import { createDocument, newDocumentRef } from "@/lib/db/documents";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { FilePicker, useDocumentFile } from "../file-upload";
import { documentCategory, documentStatus } from "@/lib/format";
import type { DocumentCategory, DocumentStatus } from "@/lib/types";

export function DocumentForm({
  projects,
  defaultProjectId,
  defaultCategory,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  defaultCategory?: DocumentCategory;
}) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { file, setFile, progress, setProgress, check } = useDocumentFile();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useSubmitOnce();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "").trim();
    const fileError = check();
    if (fileError) return setError(fileError);
    if (!text("title")) return setError("กรุณากรอกชื่อเอกสาร");
    const rev = text("rev").toUpperCase();
    if (!rev || rev.length > 10) return setError("กรุณากรอก Rev. (ไม่เกิน 10 ตัวอักษร)");
    if (!userProfile || !file) return;
    const projectId = text("project_id");
    // id ใหม่ทุกครั้งที่กดบันทึก — ไฟล์ไปอยู่ในโฟลเดอร์ของเอกสารนี้ตั้งแต่แรก
    const docId = newDocumentRef(projectId).id;
    setError(undefined);
    startTransition(async () => {
      try {
        setProgress(0);
        await createDocument(
          docId,
          {
            project_id: projectId,
            category: text("category") as DocumentCategory,
            doc_no: text("doc_no").toUpperCase(),
            title: text("title"),
            status: text("status") as DocumentStatus,
          },
          { rev, note: text("note") || null },
          file,
          userProfile.email,
          setProgress,
        );
        setFile(null);
        router.push(`/documents/${projectId}/${docId}`);
      } catch (err) {
        setError(err instanceof DataError ? err.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FilePicker file={file} onFile={setFile} progress={progress} />
      </div>

      <div>
        <label className="label" htmlFor="category">หมวด</label>
        <select id="category" name="category" defaultValue={defaultCategory ?? "drawing"} className="input">
          {(Object.keys(documentCategory) as DocumentCategory[]).map((c) => (
            <option key={c} value={c}>{documentCategory[c].label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="project_id">โครงการ</label>
        <select id="project_id" name="project_id" defaultValue={defaultProjectId} required className="input">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="doc_no">เลขที่เอกสาร / แบบ</label>
        <input id="doc_no" name="doc_no" className="input uppercase" placeholder="เช่น A-201" />
      </div>
      <div>
        <label className="label" htmlFor="rev">Rev.</label>
        <input id="rev" name="rev" required defaultValue="A" maxLength={10} className="input uppercase" />
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">ชื่อเอกสาร</label>
        <input id="title" name="title" required className="input" placeholder="เช่น แปลนชั้น 6" />
      </div>

      <div>
        <label className="label" htmlFor="status">สถานะ</label>
        <select id="status" name="status" defaultValue="pending" className="input">
          {(Object.keys(documentStatus) as DocumentStatus[]).map((s) => (
            <option key={s} value={s}>{documentStatus[s].label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="note">หมายเหตุ</label>
        <input id="note" name="note" className="input" placeholder="เช่น ออกครั้งแรกเพื่อขออนุมัติ" />
      </div>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad sm:col-span-2">{error}</p>}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href="/documents" className="btn">ยกเลิก</Link>
        <button className="btn btn-primary" disabled={pending || !file}>
          {progress !== null ? "กำลังอัปโหลด..." : pending ? "กำลังบันทึก..." : "อัปโหลดเอกสาร"}
        </button>
      </div>
    </form>
  );
}
