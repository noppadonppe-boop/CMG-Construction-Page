"use client";

import { useSubmitOnce } from "@/lib/use-submit-once";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { DataError } from "@/lib/db/common";
import { addRevision, deleteDocument, updateDocumentStatus } from "@/lib/db/documents";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { documentStatus } from "@/lib/format";
import type { DocumentStatus, ProjectDocument } from "@/lib/types";
import { FilePicker, useDocumentFile } from "../../file-upload";

const message = (e: unknown) => (e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));

export function StatusSelect({ document }: { document: ProjectDocument }) {
  const { userProfile, can } = useAuth();
  const [pending, startTransition] = useSubmitOnce();
  const [error, setError] = useState<string>();
  return (
    <div>
      <select
        aria-label="สถานะเอกสาร"
        className="input"
        value={document.status}
        disabled={pending || !can("document.approve")}
        onChange={(e) => {
          const next = e.target.value as DocumentStatus;
          if (!userProfile) return;
          startTransition(async () => {
            try {
              await updateDocumentStatus(document.project_id, document.id, next, userProfile.email);
              setError(undefined);
            } catch (err) {
              setError(message(err));
            }
          });
        }}
      >
        {(Object.keys(documentStatus) as DocumentStatus[]).map((s) => (
          <option key={s} value={s}>{documentStatus[s].label}</option>
        ))}
      </select>
      {!can("document.approve") && <p className="mt-1 text-xs text-muted">เปลี่ยนสถานะได้เฉพาะผู้มีสิทธิ์อนุมัติเอกสาร</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

/** Rev. ถัดไป (A → B, 0 → 1) */
const nextRev = (rev: string) =>
  /^\d+$/.test(rev) ? String(Number(rev) + 1) : /^[A-Y]$/.test(rev) ? String.fromCharCode(rev.charCodeAt(0) + 1) : "";

/**
 * อัปโหลดฉบับแก้ไข — ช่องกรอกเป็น state ของฟอร์มเอง: ถ้าคนอื่นอัปโหลด revision ระหว่างที่เรากำลังกรอก
 * ไฟล์/หมายเหตุที่เลือกไว้ไม่หาย (ถ้า Rev. ชนกัน ระบบจะแจ้งตอนบันทึก)
 */
export function RevisionForm({ document }: { document: ProjectDocument }) {
  const { userProfile } = useAuth();
  const { file, setFile, progress, setProgress, check } = useDocumentFile();
  const [rev, setRev] = useState(() => nextRev(document.revisions.at(-1)?.rev ?? ""));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useSubmitOnce();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = rev.trim().toUpperCase();
    const fileError = check();
    if (fileError) return setError(fileError);
    if (!value || value.length > 10) return setError("กรุณากรอก Rev. (ไม่เกิน 10 ตัวอักษร)");
    if (!userProfile || !file) return;
    setError(undefined);
    setDone(undefined);
    startTransition(async () => {
      try {
        setProgress(0);
        await addRevision(document.project_id, document.id, { rev: value, note: note.trim() || null }, file, userProfile.email, setProgress);
        setDone(`อัปโหลด Rev. ${value} แล้ว`);
        setFile(null);
        setNote("");
        setRev(nextRev(value));
      } catch (err) {
        setError(message(err));
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FilePicker file={file} onFile={setFile} progress={progress} />
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <div>
          <label className="label" htmlFor="rev">Rev.</label>
          <input id="rev" name="rev" required value={rev} onChange={(e) => setRev(e.target.value)} maxLength={10} className="input uppercase" />
        </div>
        <div>
          <label className="label" htmlFor="note">หมายเหตุ</label>
          <input id="note" name="note" value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="แก้ไขอะไร" />
        </div>
      </div>
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      {done && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{done}</p>}
      <button className="btn btn-primary w-full" disabled={pending || !file}>
        {progress !== null ? `กำลังอัปโหลด ${Math.round(progress * 100)}%` : pending ? "กำลังบันทึก..." : "อัปโหลด Revision ใหม่"}
      </button>
    </form>
  );
}

export function DeleteDocumentButton({ document }: { document: ProjectDocument }) {
  const router = useRouter();
  const [pending, startTransition] = useSubmitOnce();
  const [error, setError] = useState<string>();
  return (
    <div>
      <button
        type="button"
        className="btn w-full text-bad hover:bg-bad-soft"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`ลบ “${document.title}” และไฟล์ทุก revision ถาวร?`)) return;
          startTransition(async () => {
            try {
              await deleteDocument(document.project_id, document);
              router.push("/documents");
            } catch (err) {
              setError(message(err));
            }
          });
        }}
      >
        {pending ? "กำลังลบ..." : "ลบเอกสาร"}
      </button>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
