"use client";

import Link from "next/link";
import { useRouteParams } from "@/lib/static-export";
import { useIssues } from "@/lib/db/issues";
import { useProjects } from "@/lib/db/projects";
import {
  formatDate,
  formatDateTime,
  isOverdue,
  issueCategoryIcon,
  issueCategoryLabel,
  issuePriority,
  issueStatusLabel,
  todayInBangkok,
} from "@/lib/format";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { PhotoGallery } from "@/components/photo-gallery";
import { StatusButtons } from "../../issue-ui";

export default function IssuePage() {
  return (
    <Guard permission="issue.view">
      <Detail />
    </Guard>
  );
}

function Detail() {
  const { projectId, id } = useRouteParams<{ projectId: string; id: string }>("/issues/[projectId]/[id]");
  const { byId, loading: loadingProjects } = useProjects();
  const project = byId.get(projectId);
  const { issues, loading } = useIssues(project ? [project] : []);
  const issue = issues.find((i) => i.id === id);

  if (loadingProjects || loading) return <Skeleton />;
  if (!issue) return <EmptyState>ไม่พบรายการนี้ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  const overdue = isOverdue(issue, todayInBangkok());
  const priority = issuePriority[issue.priority];
  const statusTone = issue.status === "closed" ? "ok" : issue.status === "in_progress" ? "warn" : "bad";

  return (
    <>
      <PageHeader
        eyebrow={`${issueCategoryIcon[issue.category]} ${issueCategoryLabel[issue.category]} / ${issue.code}`}
        title={issue.title}
        subtitle={
          <Link href={`/projects/${issue.project_id}`} className="hover:text-primary">
            {issue.project_name}
          </Link>
        }
        actions={<Link href={`/issues?project=${projectId}`} className="btn">กลับไปบอร์ด</Link>}
      />

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="card space-y-4">
          <div>
            <h3 className="mb-1 font-semibold">รายละเอียด</h3>
            <p className="whitespace-pre-wrap">{issue.description || <span className="text-muted">—</span>}</p>
          </div>
          {issue.photos.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">รูปถ่าย</h3>
              <PhotoGallery photos={issue.photos} />
            </div>
          )}
        </div>

        <aside className="card space-y-3 self-start">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">สถานะ</dt>
            <dd><Pill tone={statusTone}>{issueStatusLabel[issue.status]}</Pill></dd>
            <dt className="text-muted">ความเร่งด่วน</dt>
            <dd><Pill tone={priority.tone}>{priority.label}</Pill></dd>
            <dt className="text-muted">ผู้รับผิดชอบ</dt>
            <dd>{issue.assignee ?? "—"}</dd>
            <dt className="text-muted">กำหนดเสร็จ</dt>
            <dd className={overdue ? "font-semibold text-bad" : ""}>
              {issue.due_date ? formatDate(issue.due_date) : "—"}
              {overdue && " · เกินกำหนด"}
            </dd>
            <dt className="text-muted">แจ้งเมื่อ</dt>
            <dd>{formatDateTime(issue.created_at)}</dd>
            {issue.closed_at && (
              <>
                <dt className="text-muted">ปิดเมื่อ</dt>
                <dd>{formatDateTime(issue.closed_at)}</dd>
              </>
            )}
          </dl>
          <div className="border-t border-border pt-3 empty:hidden">
            <StatusButtons projectId={issue.project_id} id={issue.id} status={issue.status} size="md" />
          </div>
        </aside>
      </div>
    </>
  );
}
