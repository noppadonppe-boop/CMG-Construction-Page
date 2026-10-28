import Link from "next/link";
import type { ProjectSummary } from "@/lib/types";
import { formatMillions, scheduleStatus, statusLabel } from "@/lib/format";
import { EmptyState, Pill, ProgressBar } from "@/components/ui";
import { DeleteProjectButton } from "./delete-project-button";

/** ตารางโครงการ — ส่ง canEdit / canDelete เพื่อแสดงคอลัมน์จัดการ (หน้ารายการโครงการ) */
export function ProjectTable({
  projects,
  canEdit = false,
  canDelete = false,
}: {
  projects: ProjectSummary[];
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const manage = canEdit || canDelete;
  if (projects.length === 0) return <EmptyState>ยังไม่มีโครงการ</EmptyState>;

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="px-2.5 py-2 font-medium">โครงการ</th>
            <th className="hidden px-2.5 py-2 font-medium sm:table-cell">ผู้จัดการ</th>
            <th className="px-2.5 py-2 font-medium">ความคืบหน้า (จริง / แผน)</th>
            <th className="px-2.5 py-2 font-medium">สถานะ</th>
            {manage && <th className="px-2.5 py-2 text-right font-medium">จัดการ</th>}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const status = scheduleStatus(p.actual_pct, p.planned_pct);
            return (
              <tr key={p.id} className="border-t border-border hover:bg-surface-2">
                <td className="px-2.5 py-3">
                  <Link href={`/projects/${p.id}`} className="font-semibold hover:text-primary">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {p.code} · {formatMillions(p.contract_value)}
                  </div>
                </td>
                <td className="hidden px-2.5 py-3 sm:table-cell">{p.manager_name ?? "-"}</td>
                <td className="px-2.5 py-3">
                  <div className="flex items-center gap-2">
                    <ProgressBar actual={p.actual_pct} planned={p.planned_pct} />
                    <span className="text-xs whitespace-nowrap tabular-nums">
                      {Math.round(p.actual_pct)}/{Math.round(p.planned_pct)}%
                    </span>
                  </div>
                </td>
                <td className="px-2.5 py-3">
                  {/* สถานะเทียบแผนมีความหมายเฉพาะโครงการที่กำลังก่อสร้าง */}
                  {p.status === "active" ? (
                    <Pill tone={status.tone}>{status.label}</Pill>
                  ) : (
                    <Pill tone="info">{statusLabel[p.status]}</Pill>
                  )}
                </td>
                {manage && (
                  <td className="px-2.5 py-3">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {canEdit && (
                        <Link href={`/projects/${p.id}/edit`} className="btn border-transparent px-2 py-1 text-xs">
                          แก้ไข
                        </Link>
                      )}
                      {canDelete && <DeleteProjectButton project={{ id: p.id, code: p.code, name: p.name }} compact />}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
