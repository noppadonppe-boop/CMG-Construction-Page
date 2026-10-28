"use client";

import { useState, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { updateIssueStatus } from "@/lib/db/issues";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import type { IssueStatus } from "@/lib/types";

const NEXT_STEPS: Record<IssueStatus, { to: IssueStatus; label: string; primary?: boolean }[]> = {
  open: [{ to: "in_progress", label: "เริ่มแก้ไข", primary: true }, { to: "closed", label: "ปิดงาน" }],
  in_progress: [{ to: "closed", label: "ปิดงาน", primary: true }, { to: "open", label: "ย้อนกลับ" }],
  closed: [{ to: "open", label: "เปิดใหม่" }],
};

/** ปุ่มเปลี่ยนสถานะ (ใช้ทั้งในการ์ด Kanban และหน้ารายละเอียด) */
export function StatusButtons({
  projectId,
  id,
  status,
  size = "sm",
}: {
  projectId: string;
  id: string;
  status: IssueStatus;
  size?: "sm" | "md";
}) {
  const { can, userProfile } = useAuth();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const cls = size === "sm" ? "btn px-2.5 py-1 text-xs" : "btn";
  if (!can("issue.update") || !userProfile) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {NEXT_STEPS[status].map((s) => (
          <button
            key={s.to}
            type="button"
            disabled={pending}
            className={`${cls} ${s.primary ? "btn-primary" : ""}`}
            onClick={() =>
              startTransition(async () => {
                try {
                  await updateIssueStatus(projectId, id, s.to, userProfile.email);
                  setError(undefined);
                } catch (e) {
                  setError(firebaseErrorMessage(e));
                }
              })
            }
          >
            {pending ? "..." : s.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
