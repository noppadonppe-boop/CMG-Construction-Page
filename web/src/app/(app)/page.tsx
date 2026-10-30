"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { useDailyReports } from "@/lib/db/daily";
import { useIssues } from "@/lib/db/issues";
import { useProjects, type ProjectRecord } from "@/lib/db/projects";
import { formatMillions, scheduleStatus, statusLabel, todayInBangkok } from "@/lib/format";
import { readLastProject } from "@/lib/project-context";
import type { ProjectStatus } from "@/lib/types";
import { Pill, ProgressBar, Skeleton } from "@/components/ui";
import { NoProjects } from "@/components/guard";
import { ProjectActionsMenu } from "./projects/project-actions-menu";

const STATUSES: ProjectStatus[] = ["active", "planning", "completed"];
const noSubscribe = () => () => {};

// ชื่อไทยเขียนติด "คุณ" ได้ ชื่ออังกฤษเว้นวรรค
const greetingName = (name: string) => (/^[A-Za-z]/.test(name) ? `คุณ ${name}` : `คุณ${name}`);

// ก่อนเวลานี้ยังไม่ถือว่า "ขาด" รายงานวันนี้ — เตือนแบบเบา ๆ ก่อน
const REPORT_DUE_HOUR = 17;
const bangkokHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", hourCycle: "h23" }));

/** หน้าแรก — เลือกโครงการเพื่อเข้าไปทำงาน */
export default function ProjectPickerPage() {
  const { userProfile, can } = useAuth();
  const { projects, loading } = useProjects();
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold">สวัสดี{userProfile && ` ${greetingName(displayName(userProfile))}`}</h1>
          <p className="text-muted">
            เลือกโครงการเพื่อเริ่มทำงาน
            {!loading && ` · ${can("project.viewAll") ? "ทั้งหมดในระบบ" : "คุณได้รับมอบหมาย"} ${projects.length} โครงการ`}
          </p>
        </div>
        {can("project.create") && <Link href="/projects/new" className="btn btn-primary">+ สร้างโครงการ</Link>}
      </div>
      {loading ? <Skeleton /> : projects.length === 0 ? <NoProjects /> : <Picker projects={projects} />}
    </>
  );
}

function Picker({ projects }: { projects: ProjectRecord[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const lastId = useSyncExternalStore(noSubscribe, readLastProject, () => null);

  // มีโครงการเดียว → พาเข้าโครงการเลย (?all = ผู้ใช้กดกลับมาหน้ารวมเอง)
  const only = projects.length === 1 ? projects[0].id : null;
  const showAll = params.has("all");
  useEffect(() => {
    if (only && !showAll) router.replace(`/projects/${only}`);
  }, [only, showAll, router]);

  const active = projects.filter((p) => p.status === "active");
  const { issues } = useIssues(can("issue.view") ? projects : []);
  const { reports } = useDailyReports(can("daily.view") ? active : []);
  const today = todayInBangkok();
  const reportOverdue = bangkokHour() >= REPORT_DUE_HOUR;
  const openIssues = new Map<string, number>();
  for (const i of issues) if (i.status !== "closed") openIssues.set(i.project_id, (openIssues.get(i.project_id) ?? 0) + 1);
  const reportedToday = new Set(reports.filter((r) => r.report_date === today).map((r) => r.project_id));

  const q = search.trim().toLowerCase();
  const shown = projects
    .filter((p) => (!status || p.status === status) && (!q || `${p.code} ${p.name} ${p.manager_name ?? ""}`.toLowerCase().includes(q)))
    .toSorted(
      (a, b) =>
        Number(b.id === lastId) - Number(a.id === lastId) ||
        STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
        a.code.localeCompare(b.code),
    );

  if (only && !showAll) return <Skeleton />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1" aria-label="กรองตามสถานะ">
          {[null, ...STATUSES].map((s) => {
            const count = s ? projects.filter((p) => p.status === s).length : projects.length;
            return (
              <button
                key={s ?? "all"}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md px-3 py-1.5 whitespace-nowrap ${s === status ? "bg-primary-soft font-semibold text-primary" : "text-muted hover:text-text"}`}
              >
                {s ? statusLabel[s] : "ทั้งหมด"} {count}
              </button>
            );
          })}
        </nav>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / รหัส / ผู้จัดการ"
          aria-label="ค้นหาโครงการ"
          className="input ml-auto w-full sm:w-64"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted">ไม่พบโครงการที่ตรงกับการค้นหา</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              recent={p.id === lastId}
              openIssues={openIssues.get(p.id) ?? 0}
              missingToday={can("daily.view") && p.status === "active" && !reportedToday.has(p.id)}
              reportOverdue={reportOverdue}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProjectCard({
  project: p,
  recent,
  openIssues,
  missingToday,
  reportOverdue,
}: {
  project: ProjectRecord;
  recent: boolean;
  openIssues: number;
  missingToday: boolean;
  reportOverdue: boolean;
}) {
  const schedule = scheduleStatus(p.actual_pct, p.planned_pct);
  return (
    // เมนู ⋯ วางทับการ์ด (ไม่อยู่ใน Link) — กดเมนูแล้วไม่พาเข้าโครงการ
    <div className="relative">
      <Link
        href={`/projects/${p.id}`}
        className={`card flex h-full flex-col gap-1 transition hover:border-primary hover:shadow-md ${recent ? "border-primary ring-2 ring-primary-soft" : ""}`}
      >
        <div className="flex items-center justify-between gap-2 pr-9 text-xs text-muted">
          <span>
            {p.code}
            {recent && <span className="ml-2 font-semibold text-primary">เปิดล่าสุด</span>}
          </span>
          {/* สถานะเทียบแผนมีความหมายเฉพาะโครงการที่กำลังก่อสร้าง */}
          {p.status === "active" ? <Pill tone={schedule.tone}>{schedule.label}</Pill> : <Pill tone="info">{statusLabel[p.status]}</Pill>}
        </div>
        <div className="text-base font-semibold">{p.name}</div>
        <div className="text-xs text-muted">
          PM: {p.manager_name ?? "-"} · {formatMillions(p.contract_value)}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar actual={p.actual_pct} planned={p.planned_pct} />
          <span className="text-xs whitespace-nowrap text-muted tabular-nums">
            จริง {Math.round(p.actual_pct)}% / แผน {Math.round(p.planned_pct)}%
          </span>
        </div>
        {(openIssues > 0 || missingToday) && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {openIssues > 0 && <span className="text-warn">⚠ เรื่องค้าง {openIssues}</span>}
            {missingToday && <span className={reportOverdue ? "text-bad" : "text-muted"}>ยังไม่มีรายงานวันนี้</span>}
          </div>
        )}
      </Link>
      <ProjectActionsMenu project={p} className="absolute top-3 right-3" />
    </div>
  );
}
