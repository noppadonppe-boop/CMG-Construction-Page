"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useDailyReports } from "@/lib/db/daily";
import { DCR_STATUS_LABEL } from "@/lib/dcr";
import { useProjects } from "@/lib/db/projects";
import { dailyReportHref } from "@/lib/project-context";
import { Guard, NoProjects } from "@/components/guard";
import { formatDate, weatherLabel } from "@/lib/format";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { PhotoGallery } from "@/components/photo-gallery";

export default function DailyReportsPage() {
  const { can } = useAuth();
  const projectId = useSearchParams().get("project");
  return (
    <>
      <PageHeader
        title="รายงานประจำวัน (Site Diary)"
        subtitle={`บันทึกงานหน้างานรายวัน${projectId ? "ของโครงการนี้" : "ของโครงการที่คุณได้รับมอบหมาย"} · อัปเดตอัตโนมัติ`}
        actions={
          can("daily.create") && (
            <Link href={projectId ? dailyReportHref(projectId) : "/daily-reports/new"} className="btn btn-primary">+ เขียนรายงาน</Link>
          )
        }
      />
      <Guard permission="daily.view">
        <ReportList projectId={projectId} />
      </Guard>
    </>
  );
}

/** projectId = อยู่ใน workspace ของโครงการ → ฟังเฉพาะรายงานของโครงการนั้น */
function ReportList({ projectId }: { projectId: string | null }) {
  const { projects: all, loading: loadingProjects } = useProjects();
  const projects = projectId ? all.filter((p) => p.id === projectId) : all;
  const { reports, loading } = useDailyReports(projects);
  if (loadingProjects || loading) return <Skeleton />;
  if (projects.length === 0) return <NoProjects />;
  return (
    <>
      {reports.length === 0 ? (
        <EmptyState>ยังไม่มีรายงาน — เริ่มเขียนรายงานแรกได้เลย</EmptyState>
      ) : (
        <div className="grid gap-3">
          {reports.map((r) => (
            <article key={`${r.project_id}/${r.id}`} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/daily-reports/${r.project_id}/${r.id}`} className="font-semibold hover:text-primary">
                    {formatDate(r.report_date)}
                    {r.code && <span className="ml-2 text-sm font-normal text-muted">{r.code}</span>}
                  </Link>
                  {!projectId && (
                    <>
                      <span className="text-muted"> · </span>
                      <Link href={`/projects/${r.project_id}`} className="text-muted hover:text-primary">
                        {r.project_name}
                      </Link>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status && <Pill tone={r.status === "draft" ? "warn" : r.status === "submitted" ? "info" : "ok"}>{DCR_STATUS_LABEL[r.status]}</Pill>}
                  <Pill tone="info">{weatherLabel[r.weather]}</Pill>
                  {!!r.lost_hours && <Pill tone="bad">หยุดงาน {r.lost_hours} ชม.</Pill>}
                  <Pill tone="info">{r.workers} คน</Pill>
                  <Link href={`/daily-reports/${r.project_id}/${r.id}`} className="btn px-2.5 py-1 text-xs">เปิดรายงาน</Link>
                </div>
              </div>
              <p className="mt-2">{r.work_done}</p>
              {r.equipment.length > 0 && <p className="mt-1 text-xs text-muted">เครื่องจักร: {r.equipment.join(", ")}</p>}
              {r.issues && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-warn">⚠ {r.issues}</p>}
              {r.photos.length > 0 && (
                <div className="mt-3">
                  <PhotoGallery photos={r.photos} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
