"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { DeleteProjectDialog } from "./delete-project-button";

/** ปุ่ม ⋯ บนการ์ดโครงการ → แก้ไขโครงการ / ตั้งค่ารายงาน / ลบโครงการ (แสดงตามสิทธิ์) · className ต้องมี position (ค่าเริ่มต้น relative) */
export function ProjectActionsMenu({ project, className = "" }: { project: { id: string; code: string; name: string }; className?: string }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const canEdit = can("project.edit");
  const canDelete = can("project.delete");
  if (!canEdit && !canDelete) return null;
  const item = "block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2";

  return (
    <div ref={menuRef} className={className || "relative"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`เมนูโครงการ ${project.name}`}
        aria-expanded={open}
        className="grid size-7 place-items-center rounded-md border border-border bg-surface text-muted hover:border-primary hover:text-primary"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-border bg-surface p-1.5 text-sm shadow-lg">
          {canEdit && (
            <>
              <Link href={`/projects/${project.id}/edit`} className={item}>แก้ไขโครงการ</Link>
              <Link href={`/projects/${project.id}/report-settings`} className={item}>ตั้งค่ารายงาน</Link>
            </>
          )}
          {canDelete && (
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-bad hover:bg-bad-soft"
              onClick={() => {
                setOpen(false);
                setDeleting(true);
              }}
            >
              ลบโครงการ
            </button>
          )}
        </div>
      )}
      {deleting && <DeleteProjectDialog project={project} onClose={() => setDeleting(false)} />}
    </div>
  );
}
