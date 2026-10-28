"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useDailyReports } from "@/lib/db/daily";
import { useDocuments } from "@/lib/db/documents";
import { useIssues } from "@/lib/db/issues";
import { useProjects } from "@/lib/db/projects";
import { Guard } from "@/components/guard";
import {
  documentCategory,
  documentStatus,
  formatDate,
  formatPct,
  isOverdue,
  issueCategoryIcon,
  issuePriority,
  issueStatusLabel,
  scheduleStatus,
  todayInBangkok,
  weatherLabel,
} from "@/lib/format";
import { addDays, isIsoDate, weekRange } from "@/lib/report-period";
import { EmptyState, Pill, Skeleton } from "@/components/ui";
import { SCurve } from "@/components/s-curve";
import { ReportHeader, Section, Stat } from "../report-parts";

export default function WeeklyReportPage() {
  return (
    <Guard permission="report.view">
      <Report />
    </Guard>
  );
}

function Report() {
  const params = useSearchParams();
  const { can } = useAuth();
  const date = isIsoDate(params.get("date")) ? params.get("date")! : todayInBangkok();
  const { projects, byId, loading: loadingProjects } = useProjects();
  const project = byId.get(params.get("project") ?? "") ?? projects[0];
  const scope = project ? [project] : [];
  const daily = useDailyReports(can("daily.view") ? scope : []);
  const issueData = useIssues(can("issue.view") ? scope : []);
  const docData = useDocuments(can("document.view") ? scope : []);

  if (loadingProjects || daily.loading || issueData.loading || docData.loading) return <Skeleton />;
  if (!project) return <EmptyState>ไม่พบโครงการ — <Link href="/reports" className="text-primary">เลือกโครงการใหม่</Link></EmptyState>;

  const { progress } = project;
  const { from, to } = weekRange(date);
  const reports = daily.reports.filter((r) => r.report_date >= from && r.report_date <= to).toReversed();
  const issues = issueData.issues;
  const documents = docData.documents;
  const today = todayInBangkok();

  const last = progress.filter((p) => p.actual_pct !== null).at(-1);
  const actual = last?.actual_pct ?? 0;
  const planned = last?.planned_pct ?? 0;
  const schedule = scheduleStatus(actual, planned);

  const manDays = reports.reduce((s, r) => s + r.workers, 0);
  const rainDays = reports.filter((r) => r.weather === "rain").length;
  const inWeek = (iso: string | null) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const openedThisWeek = issues.filter((i) => inWeek(i.created_at));
  const closedThisWeek = issues.filter((i) => inWeek(i.closed_at));
  const stillOpen = issues.filter((i) => i.status !== "closed");
  const docsThisWeek = documents.filter((d) => d.revisions.some((r) => inWeek(r.uploaded_at)));
  const href = (d: string) => `/reports/weekly?project=${project.id}&date=${d}`;

  return (
    <article className="space-y-4">
      <ReportHeader
        title="รายงานความก้าวหน้าประจำสัปดาห์"
        subtitle={`${project.code} · ${project.name}`}
        period={`${formatDate(from)} – ${formatDate(to)}`}
        prevHref={href(addDays(from, -7))}
        nextHref={href(addDays(from, 7))}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        <Stat label="ความคืบหน้าจริง / แผน" value={`${formatPct(actual)} / ${formatPct(planned)}`} tone={schedule.tone === "bad" ? "bad" : undefined} />
        <Stat label="สถานะเทียบแผน" value={schedule.label} tone={schedule.tone === "ok" ? "ok" : schedule.tone === "bad" ? "bad" : undefined} />
        <Stat label="แรงงานรวม (คน-วัน)" value={manDays.toLocaleString("th-TH")} />
        <Stat label="รายงานประจำวัน / วันฝนตก" value={`${reports.length} / ${rainDays}`} />
      </div>

      <Section title="S-Curve ความคืบหน้าสะสม">
        <SCurve data={progress} />
      </Section>

      <Section title={`งานที่ดำเนินการ (${reports.length} วัน)`}>
        {reports.length === 0 ? (
          <p className="text-muted">ไม่มีรายงานประจำวันในสัปดาห์นี้</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="break-inside-avoid border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap gap-x-3 text-sm">
                  <b>{formatDate(r.report_date)}</b>
                  <span className="text-muted">{weatherLabel[r.weather]}</span>
                  <span className="text-muted">แรงงาน {r.workers} คน</span>
                  {r.equipment.length > 0 && <span className="text-muted">เครื่องจักร: {r.equipment.join(", ")}</span>}
                </div>
                <p>{r.work_done}</p>
                {r.issues && <p className="text-warn">⚠ {r.issues}</p>}
                {r.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2 md:grid-cols-6 print:grid-cols-6">
                    {r.photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Firebase Storage URL
                      <img key={i} src={src} alt="" className="aspect-square w-full rounded object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`ปัญหา / ความปลอดภัย / RFI — เปิดใหม่ ${openedThisWeek.length} · ปิด ${closedThisWeek.length} · ค้าง ${stillOpen.length}`}>
        {stillOpen.length === 0 ? (
          <p className="text-muted">ไม่มีเรื่องค้าง</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 pr-2 font-medium">เลขที่</th>
                <th className="py-1.5 pr-2 font-medium">เรื่อง</th>
                <th className="py-1.5 pr-2 font-medium">ผู้รับผิดชอบ</th>
                <th className="py-1.5 pr-2 font-medium">กำหนด</th>
                <th className="py-1.5 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {stillOpen.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{i.code}</td>
                  <td className="py-1.5 pr-2">
                    {issueCategoryIcon[i.category]} {i.title}{" "}
                    <Pill tone={issuePriority[i.priority].tone}>{issuePriority[i.priority].label}</Pill>
                  </td>
                  <td className="py-1.5 pr-2">{i.assignee ?? "—"}</td>
                  <td className={`py-1.5 pr-2 whitespace-nowrap ${isOverdue(i, today) ? "font-semibold text-bad" : ""}`}>
                    {i.due_date ? formatDate(i.due_date, "short") : "—"}
                  </td>
                  <td className="py-1.5">{issueStatusLabel[i.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`เอกสารที่อัปเดตในสัปดาห์ (${docsThisWeek.length})`}>
        {docsThisWeek.length === 0 ? (
          <p className="text-muted">ไม่มีเอกสารใหม่</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {docsThisWeek.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">{documentCategory[d.category].badge}</span>
                <span>
                  {d.doc_no} {d.title} — Rev. {d.revisions.at(-1)?.rev}
                </span>
                <Pill tone={documentStatus[d.status].tone}>{documentStatus[d.status].label}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </article>
  );
}
