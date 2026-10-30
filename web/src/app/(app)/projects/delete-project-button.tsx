"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { countProjectData, deleteProject } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";

/**
 * ปุ่มลบโครงการ + กล่องยืนยัน — ต้องพิมพ์รหัสโครงการก่อนจึงจะลบได้
 * เพราะการลบจะลบรายงานประจำวัน เรื่องปัญหา/RFI และรูปทั้งหมดของโครงการไปด้วย และกู้คืนไม่ได้
 */
export function DeleteProjectButton({
  project,
  redirectTo,
  compact = false,
}: {
  project: { id: string; code: string; name: string };
  /** หน้าที่จะพาไปหลังลบ (ใช้เมื่อลบจากหน้ารายละเอียดของโครงการนั้นเอง) */
  redirectTo?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "btn border-transparent px-2 py-1 text-xs text-bad hover:bg-bad-soft" : "btn text-bad hover:bg-bad-soft"}
        aria-label={`ลบโครงการ ${project.name}`}
      >
        {compact ? "ลบ" : "ลบโครงการ"}
      </button>
      {open && <DeleteProjectDialog project={project} redirectTo={redirectTo} onClose={() => setOpen(false)} />}
    </>
  );
}

/** กล่องยืนยันการลบ — เปิดทันทีเมื่อ mount และเรียก onClose เมื่อปิด (ใช้กับปุ่มลบ และเมนูบนการ์ดโครงการ) */
export function DeleteProjectDialog({
  project,
  redirectTo,
  onClose,
}: {
  project: { id: string; code: string; name: string };
  redirectTo?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [counts, setCounts] = useState<{ reports: number; issues: number; documents: number } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    countProjectData(project.id).then(setCounts, () => setCounts(null));
  }, [project.id]);

  function confirm() {
    startTransition(async () => {
      if (!can("project.delete")) return setError("คุณไม่มีสิทธิ์ลบโครงการ");
      if (typed.trim().toUpperCase() !== project.code) return setError("รหัสโครงการที่พิมพ์ไม่ตรงกัน");
      try {
        await deleteProject(project.id, project.code);
        dialogRef.current?.close();
        if (redirectTo) router.push(redirectTo);
      } catch (e) {
        setError("ลบไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  const matches = typed.trim().toUpperCase() === project.code;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
      onClose={onClose}
    >
      <div className="space-y-3 p-5">
        <h2 className="text-lg font-bold text-bad">ลบโครงการ?</h2>
        <p>
          <b>{project.name}</b> <span className="text-muted">({project.code})</span>
        </p>
        <div className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          ข้อมูลต่อไปนี้จะถูกลบถาวรและกู้คืนไม่ได้
          <ul className="mt-1 list-disc pl-5">
            <li>ข้อมูลโครงการและแผน/ความคืบหน้ารายเดือน</li>
            <li>รายงานประจำวัน {counts ? `${counts.reports} ฉบับ` : "…"}</li>
            <li>ปัญหา / ความปลอดภัย / RFI {counts ? `${counts.issues} เรื่อง` : "…"}</li>
            <li>เอกสาร / แบบ {counts ? `${counts.documents} รายการ` : "…"} (ทุก revision)</li>
            <li>รูปถ่ายและไฟล์ทั้งหมดที่แนบไว้</li>
          </ul>
        </div>
        <div>
          <label className="label" htmlFor={`confirm-${project.id}`}>
            พิมพ์รหัสโครงการ <b className="text-text">{project.code}</b> เพื่อยืนยัน
          </label>
          <input
            id={`confirm-${project.id}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="input uppercase"
          />
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()} disabled={pending}>
            ยกเลิก
          </button>
          <button type="button" className="btn border-bad bg-bad text-white hover:bg-bad hover:opacity-90" disabled={!matches || pending} onClick={confirm}>
            {pending ? "กำลังลบ..." : "ลบถาวร"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
