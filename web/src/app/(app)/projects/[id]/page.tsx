"use client";

import Link from "next/link";
import { useRouteParams } from "@/lib/static-export";
import { useAuth } from "@/lib/auth/context";
import { useDailyReports } from "@/lib/db/daily";
import { useProjects } from "@/lib/db/projects";
import { formatDate, formatMillions, formatPct, scheduleStatus, weatherLabel } from "@/lib/format";
import { EmptyState, KpiCard, PageHeader, Pill, Skeleton } from "@/components/ui";
import { SCurve } from "@/components/s-curve";
import { PhotoGallery } from "@/components/photo-gallery";
import { dailyReportHref } from "@/lib/project-context";
import { ProjectForms } from "./project-forms";

const DAY = 86_400_000;

/** จำนวนวันตามสัญญา และจำนวนวันที่ผ่านไปถึงวันนี้ */
function timeline(startDate: string, endDate: string) {
  const start = new Date(startDate).getTime();
  const totalDays = Math.round((new Date(endDate).getTime() - start) / DAY) + 1;
  const elapsed = Math.min(totalDays, Math.max(0, Math.round((Date.now() - start) / DAY)));
  return { totalDays, elapsed };
}

export default function ProjectPage() {
  const { id } = useRouteParams<{ id: string }>("/projects/[id]");
  const { byId, loading } = useProjects();
  const { can } = useAuth();
  const project = byId.get(id);
  const { reports } = useDailyReports(project && can("daily.view") ? [project] : []);

  if (loading) return <Skeleton />;
  // ไม่พบ = ไม่มีโครงการนี้ หรือไม่ได้รับ assign (ไม่บอกว่ามีอยู่จริง)
  if (!project) return <EmptyState>ไม่พบโครงการ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  const { progress } = project;

  const last = progress.filter((p) => p.actual_pct !== null).at(-1);
  const actual = last?.actual_pct ?? 0;
  const planned = last?.planned_pct ?? 0;
  const status = scheduleStatus(actual, planned);
  const { totalDays, elapsed } = timeline(project.start_date, project.end_date);

  return (
    <>
      {/* ความคืบหน้า/ตั้งค่า/แก้ไข/ลบ อยู่ในเมนูของโครงการ — หัวหน้านี้เหลือเฉพาะงานที่ทำทุกวัน */}
      <PageHeader
        title={project.name}
        subtitle={`ผู้จัดการ: ${project.manager_name ?? "-"} · สัญญา ${formatDate(project.start_date)} – ${formatDate(project.end_date)} · มูลค่า ${formatMillions(project.contract_value)}`}
        actions={
          can("daily.create") && (
            <Link href={dailyReportHref(project.id)} className="btn btn-primary">
              + รายงานประจำวัน
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="ความคืบหน้าจริง"
          value={formatPct(actual)}
          tone={status.tone === "ok" ? "ok" : "bad"}
          note={`แผน ${formatPct(planned)} · ${status.label}`}
        />
        <KpiCard
          label="ระยะเวลาผ่านไป"
          value={<>{elapsed}<span className="text-base font-normal text-muted"> / {totalDays} วัน</span></>}
          note={`เหลือ ${totalDays - elapsed} วัน`}
        />
        <KpiCard label="เจ้าของงาน" value={<span className="text-base">{project.client ?? "-"}</span>} />
        <KpiCard label="สถานที่" value={<span className="text-base">{project.location ?? "-"}</span>} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">S-Curve ความคืบหน้าสะสม</h3>
            <div className="flex gap-4 text-xs text-muted">
              <span>┄ แผน</span>
              <span className="text-primary">━ จริง</span>
            </div>
          </div>
          <SCurve data={progress} />
        </div>
        {can("daily.view") && <div className="card">
          <h3 className="mb-3 font-semibold">รายงานประจำวันล่าสุด</h3>
          {reports.length === 0 ? (
            <p className="text-muted">ยังไม่มีรายงาน</p>
          ) : (
            <ul className="divide-y divide-border">
              {reports.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <b>{formatDate(r.report_date, "short")}</b>
                    <div className="text-xs text-muted">
                      {r.workers} คน · {r.work_done}
                    </div>
                    {r.photos.length > 0 && (
                      <div className="mt-1.5">
                        <PhotoGallery photos={r.photos} size="sm" />
                      </div>
                    )}
                  </div>
                  {r.issues ? <Pill tone="warn">มีปัญหา</Pill> : <Pill tone="ok">{weatherLabel[r.weather]}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </div>}
      </div>

      <ProjectForms project={project} />
    </>
  );
}
