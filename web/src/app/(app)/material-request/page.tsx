"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useProjects } from "@/lib/db/projects";
import { useCurrentProjectId } from "@/lib/project-context";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { MaterialRequestBoard } from "../m/[menuId]/material-request-board";

/** Material Request (เบิก · รับ · คงค้าง) — ไม่มีในเมนูข้าง เปิดตรงที่ /material-request?project={id} */
export default function MaterialRequestPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <MaterialRequest />
    </Suspense>
  );
}

function MaterialRequest() {
  const { projects, byId, loading } = useProjects();
  const projectId = useCurrentProjectId();
  const project = projectId ? byId.get(projectId) : undefined;

  if (loading) return <Skeleton />;
  return (
    <>
      <PageHeader title="Material Request" subtitle={project ? `${project.code} · ${project.name}` : "เลือกโครงการ"} />
      {project ? (
        <div className="relative left-1/2 w-[max(100%,80cqw)] -translate-x-1/2">
          <MaterialRequestBoard project={project} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState>ยังไม่มีโครงการที่คุณเข้าถึงได้</EmptyState>
      ) : (
        <div className="card-grid">
          {projects.map((p) => (
            <Link key={p.id} href={`/material-request?project=${p.id}`} className="card p-3 hover:border-primary">
              <div className="text-xs text-muted">{p.code}</div>
              <div className="font-semibold">{p.name}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
