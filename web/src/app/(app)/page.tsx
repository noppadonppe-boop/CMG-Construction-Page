"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { useIssues } from "@/lib/db/issues";
import { useProjects } from "@/lib/db/projects";
import {
  formatDate,
  formatMillions,
  isOverdue,
  issueCategoryIcon,
  issuePriority,
  scheduleStatus,
  todayInBangkok,
} from "@/lib/format";
import type { IssuePriority } from "@/lib/types";
import { KpiCard, PageHeader, Pill, Skeleton } from "@/components/ui";
import { ProjectTable } from "./projects/project-table";

import { NoProjects } from "@/components/guard";

export default function DashboardPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader
        title="ภาพรวมโครงการทั้งหมด"
        subtitle="ข้อมูลล่าสุดจากทุกไซต์งาน · อัปเดตอัตโนมัติ"
        actions={can("daily.create") && <Link href="/daily-reports/new" className="btn btn-primary">+ รายงานประจำวัน</Link>}
      />
      <Dashboard />
    </>
  );
}

function Dashboard() {
  const { projects, loading } = useProjects();
  const { can } = useAuth();
  // ผู้ที่ไม่มีสิทธิ์ดูเรื่องปัญหา จะไม่เปิด listener ของหมวดนี้เลย
  const { issues } = useIssues(can("issue.view") ? projects : []);
  const today = todayInBangkok();

  if (loading) return <Skeleton />;
  if (projects.length === 0) return <NoProjects />;

  const active = projects.filter((p) => p.status === "active");
  const totalValue = projects.reduce((sum, p) => sum + p.contract_value, 0);
  const delayed = active.filter((p) => scheduleStatus(p.actual_pct, p.planned_pct).tone === "bad");
  const avgProgress = active.length ? active.reduce((s, p) => s + p.actual_pct, 0) / active.length : 0;

  // เรื่องที่ต้องดำเนินการ: เกินกำหนดก่อน แล้วเรียงตามความเร่งด่วน และวันกำหนดเสร็จ
  const urgency: Record<IssuePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const pending = issues.filter((i) => i.status !== "closed");
  const overdueCount = pending.filter((i) => isOverdue(i, today)).length;
  const todo = pending
    .toSorted(
      (a, b) =>
        Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
        urgency[a.priority] - urgency[b.priority] ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
    )
    .slice(0, 6);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="โครงการที่ดำเนินการ" value={active.length} note={`ทั้งหมด ${projects.length} โครงการ`} />
        <KpiCard label="มูลค่างานรวม" value={formatMillions(totalValue)} />
        <KpiCard
          label="โครงการล่าช้ากว่าแผน"
          value={delayed.length}
          tone={delayed.length ? "bad" : "ok"}
          note={delayed.length ? delayed.map((p) => p.code).join(", ") : "ทุกโครงการอยู่ในเกณฑ์"}
        />
        <KpiCard
          label="เรื่องค้าง (ปัญหา / ความปลอดภัย / RFI)"
          value={pending.length}
          tone={overdueCount ? "bad" : undefined}
          note={overdueCount ? `เกินกำหนด ${overdueCount} เรื่อง` : `ความคืบหน้าเฉลี่ย ${avgProgress.toFixed(1)}%`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="card">
          <h3 className="mb-3 font-semibold">สถานะโครงการ</h3>
          <ProjectTable projects={projects} />
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">ต้องดำเนินการ</h3>
            <Link href="/issues" className="text-xs text-primary">ดูทั้งหมด →</Link>
          </div>
          {todo.length === 0 ? (
            <p className="text-muted">ไม่มีเรื่องค้าง 🎉</p>
          ) : (
            <ul className="divide-y divide-border">
              {todo.map((i) => {
                const overdue = isOverdue(i, today);
                return (
                  <li key={i.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/issues/${i.project_id}/${i.id}`} className="hover:text-primary">
                        {issueCategoryIcon[i.category]} {i.title}
                      </Link>
                      <Pill tone={issuePriority[i.priority].tone}>{issuePriority[i.priority].label}</Pill>
                    </div>
                    <div className="text-xs text-muted">
                      {i.code} · {i.project_name}
                      {i.due_date && (
                        <span className={overdue ? "font-semibold text-bad" : ""}>
                          {" · "}
                          {overdue ? "เกินกำหนด " : "ครบ "}
                          {formatDate(i.due_date, "short")}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
