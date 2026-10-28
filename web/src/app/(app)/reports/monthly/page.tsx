"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useDailyReports } from "@/lib/db/daily";
import { useDocuments } from "@/lib/db/documents";
import { useIssues } from "@/lib/db/issues";
import { useProjects } from "@/lib/db/projects";
import { Guard, NoProjects } from "@/components/guard";
import {
  formatMillions,
  formatPct,
  isOverdue,
  issueCategoryIcon,
  issueCategoryLabel,
  scheduleStatus,
  statusLabel,
  todayInBangkok,
} from "@/lib/format";
import { addMonths, isIsoMonth, monthLabel, monthRange } from "@/lib/report-period";
import { Pill, ProgressBar, Skeleton } from "@/components/ui";
import type { IssueCategory } from "@/lib/types";
import { ReportHeader, Section, Stat } from "../report-parts";

export default function MonthlyReportPage() {
  return (
    <Guard permission="report.view">
      <Report />
    </Guard>
  );
}

function Report() {
  const params = useSearchParams();
  const { can } = useAuth();
  const today = todayInBangkok();
  const month = isIsoMonth(params.get("month")) ? params.get("month")! : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const { projects, loading: loadingProjects } = useProjects();
  const daily = useDailyReports(can("daily.view") ? projects : []);
  const issueData = useIssues(can("issue.view") ? projects : []);
  const docData = useDocuments(can("document.view") ? projects : []);

  if (loadingProjects || daily.loading || issueData.loading || docData.loading) return <Skeleton />;
  if (projects.length === 0) return <NoProjects />;
  const reports = daily.reports.filter((r) => r.report_date >= from && r.report_date <= to);
  const issues = issueData.issues;
  const documents = docData.documents;

  const active = projects.filter((p) => p.status === "active");
  const delayed = active.filter((p) => scheduleStatus(p.actual_pct, p.planned_pct).tone === "bad");
  const totalValue = projects.reduce((s, p) => s + p.contract_value, 0);
  const earned = projects.reduce((s, p) => s + (p.contract_value * p.actual_pct) / 100, 0);
  const inMonth = (iso: string | null) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const open = issues.filter((i) => i.status !== "closed");
  const overdue = open.filter((i) => isOverdue(i, today));
  const pendingDocs = documents.filter((d) => d.status === "pending");

  const perProject = (id: string) => {
    const r = reports.filter((x) => x.project_id === id);
    return {
      days: r.length,
      manDays: r.reduce((s, x) => s + x.workers, 0),
      openIssues: open.filter((i) => i.project_id === id).length,
      overdue: overdue.filter((i) => i.project_id === id).length,
    };
  };

  return (
    <article className="space-y-4">
      <ReportHeader
        title="รายงานสรุปผู้บริหารประจำเดือน"
        subtitle={`โครงการทั้งหมด ${projects.length} โครงการ`}
        period={monthLabel(month)}
        prevHref={`/reports/monthly?month=${addMonths(month, -1)}`}
        nextHref={`/reports/monthly?month=${addMonths(month, 1)}`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        <Stat label="มูลค่างานรวม" value={formatMillions(totalValue)} />
        <Stat label="มูลค่างานที่ทำได้ (ตาม % จริง)" value={formatMillions(earned)} />
        <Stat label="โครงการล่าช้า / ดำเนินการ" value={`${delayed.length} / ${active.length}`} tone={delayed.length ? "bad" : "ok"} />
        <Stat label="เรื่องค้าง / เกินกำหนด" value={`${open.length} / ${overdue.length}`} tone={overdue.length ? "bad" : undefined} />
      </div>

      <Section title="สถานะโครงการ">
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2 py-1.5 font-medium">โครงการ</th>
                <th className="px-2 py-1.5 font-medium">มูลค่า</th>
                <th className="px-2 py-1.5 font-medium">จริง / แผน</th>
                <th className="px-2 py-1.5 font-medium">สถานะ</th>
                <th className="px-2 py-1.5 text-right font-medium">รายงาน (วัน)</th>
                <th className="px-2 py-1.5 text-right font-medium">คน-วัน</th>
                <th className="px-2 py-1.5 text-right font-medium">เรื่องค้าง</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const s = scheduleStatus(p.actual_pct, p.planned_pct);
                const stats = perProject(p.id);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-2 py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted">{p.code} · {p.manager_name ?? "-"}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatMillions(p.contract_value)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <ProgressBar actual={p.actual_pct} planned={p.planned_pct} />
                        <span className="text-xs whitespace-nowrap tabular-nums">
                          {formatPct(p.actual_pct)} / {formatPct(p.planned_pct)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {p.status === "active" ? <Pill tone={s.tone}>{s.label}</Pill> : <Pill tone="info">{statusLabel[p.status]}</Pill>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{stats.days}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{stats.manDays.toLocaleString("th-TH")}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${stats.overdue ? "font-semibold text-bad" : ""}`}>
                      {stats.openIssues}
                      {stats.overdue > 0 && ` (เกิน ${stats.overdue})`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
        <Section title="ปัญหา / ความปลอดภัย / RFI">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">หมวด</th>
                <th className="py-1 text-right font-medium">เปิดเดือนนี้</th>
                <th className="py-1 text-right font-medium">ปิดเดือนนี้</th>
                <th className="py-1 text-right font-medium">ค้างทั้งหมด</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(issueCategoryLabel) as IssueCategory[]).map((c) => (
                <tr key={c} className="border-t border-border">
                  <td className="py-1.5">{issueCategoryIcon[c]} {issueCategoryLabel[c]}</td>
                  <td className="py-1.5 text-right tabular-nums">{issues.filter((i) => i.category === c && inMonth(i.created_at)).length}</td>
                  <td className="py-1.5 text-right tabular-nums">{issues.filter((i) => i.category === c && inMonth(i.closed_at)).length}</td>
                  <td className="py-1.5 text-right tabular-nums">{open.filter((i) => i.category === c).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="เอกสาร">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="อัปโหลดเดือนนี้ (revision)" value={documents.flatMap((d) => d.revisions).filter((r) => inMonth(r.uploaded_at)).length} />
            <Stat label="รอตรวจ / อนุมัติ" value={pendingDocs.length} tone={pendingDocs.length ? "bad" : undefined} />
          </div>
          {pendingDocs.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {pendingDocs.slice(0, 8).map((d) => (
                <li key={d.id}>
                  • {d.doc_no} {d.title} <span className="text-muted">— {d.project_name}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </article>
  );
}
