"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useIssues } from "@/lib/db/issues";
import { useProjects } from "@/lib/db/projects";
import { Guard, NoProjects } from "@/components/guard";
import {
  formatDate,
  isOverdue,
  issueCategoryIcon,
  issueCategoryLabel,
  issuePriority,
  issueStatusLabel,
  todayInBangkok,
  type Tone,
} from "@/lib/format";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import type { Issue, IssueCategory, IssueStatus } from "@/lib/types";
import { ProjectFilter } from "@/components/project-filter";
import { StatusButtons } from "./issue-ui";

const COLUMNS: { status: IssueStatus; tone: Tone }[] = [
  { status: "open", tone: "bad" },
  { status: "in_progress", tone: "warn" },
  { status: "closed", tone: "ok" },
];
const CATEGORIES: (IssueCategory | undefined)[] = [undefined, "issue", "safety", "rfi"];

export default function IssuesPage() {
  const { can } = useAuth();
  const projectId = useSearchParams().get("project");
  return (
    <>
      <PageHeader
        title="ปัญหา / ความปลอดภัย / RFI"
        subtitle="ติดตามทุกเรื่องจนปิดงาน พร้อมผู้รับผิดชอบและกำหนดเสร็จ · อัปเดตอัตโนมัติ"
        actions={can("issue.create") && <Link href={`/issues/new${projectId ? `?project=${projectId}` : ""}`} className="btn btn-primary">+ แจ้งเรื่องใหม่</Link>}
      />
      <Guard permission="issue.view">
        <Board />
      </Guard>
    </>
  );
}

function Board() {
  const params = useSearchParams();
  const projectId = params.get("project") ?? undefined;
  const rawCategory = params.get("category") as IssueCategory | null;
  const category = rawCategory && CATEGORIES.includes(rawCategory) ? rawCategory : undefined;
  const { projects, loading: loadingProjects } = useProjects();
  const { issues: all, loading } = useIssues(projects);
  const issues = all.filter((i) => (!projectId || i.project_id === projectId) && (!category || i.category === category));
  const today = todayInBangkok();

  if (loadingProjects || loading) return <Skeleton />;
  if (projects.length === 0) return <NoProjects />;

  const tabHref = (c?: IssueCategory) => {
    const q = new URLSearchParams();
    if (c) q.set("category", c);
    if (projectId) q.set("project", projectId);
    return `/issues${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
          {CATEGORIES.map((c) => (
            <Link
              key={c ?? "all"}
              href={tabHref(c)}
              className={`rounded-md px-3 py-1.5 whitespace-nowrap ${c === category ? "bg-primary-soft font-semibold text-primary" : "text-muted hover:text-text"}`}
            >
              {c ? `${issueCategoryIcon[c]} ${issueCategoryLabel[c]}` : "ทั้งหมด"}
            </Link>
          ))}
        </nav>
        {/* ใน workspace ของโครงการสลับโครงการได้จากแถบบนแล้ว */}
        {!projectId && <ProjectFilter projects={projects.map((p) => ({ id: p.id, name: p.name }))} basePath="/issues" />}
      </div>

      {issues.length === 0 ? (
        <EmptyState>ไม่มีรายการ — กด “แจ้งเรื่องใหม่” เพื่อเริ่มบันทึก</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map(({ status, tone }) => {
            const items = issues.filter((i) => i.status === status);
            return (
              <section key={status} className="rounded-xl border border-border bg-surface-2 p-3">
                <h3 className="mb-3">
                  <Pill tone={tone}>{issueStatusLabel[status]} · {items.length}</Pill>
                </h3>
                <div className="space-y-2.5">
                  {items.map((issue) => (
                    <IssueCard key={`${issue.project_id}/${issue.id}`} issue={issue} today={today} showProject={!projectId} />
                  ))}
                  {items.length === 0 && <p className="py-4 text-center text-xs text-muted">ไม่มีรายการ</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function IssueCard({ issue, today, showProject }: { issue: Issue; today: string; showProject: boolean }) {
  const overdue = isOverdue(issue, today);
  const priority = issuePriority[issue.priority];
  return (
    <article className={`card p-3 ${overdue ? "border-bad" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/issues/${issue.project_id}/${issue.id}`} className="font-medium hover:text-primary">
          <span className="mr-1">{issueCategoryIcon[issue.category]}</span>
          {issue.title}
        </Link>
        <Pill tone={priority.tone}>{priority.label}</Pill>
      </div>
      <div className="mt-1 text-xs text-muted">
        {issue.code}
        {showProject && ` · ${issue.project_name}`}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        {issue.assignee && <span>👤 {issue.assignee}</span>}
        {issue.due_date && (
          <span className={overdue ? "font-semibold text-bad" : ""}>
            📅 {formatDate(issue.due_date, "short")}
            {overdue && " · เกินกำหนด"}
          </span>
        )}
        {issue.photos.length > 0 && <span>📷 {issue.photos.length}</span>}
      </div>
      <div className="mt-2.5">
        <StatusButtons projectId={issue.project_id} id={issue.id} status={issue.status} />
      </div>
    </article>
  );
}
