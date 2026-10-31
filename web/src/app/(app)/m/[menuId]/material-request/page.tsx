"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouteParams } from "@/lib/static-export";
import { useMenus } from "@/lib/db/menus";
import { useProjects } from "@/lib/db/projects";
import { useCurrentProjectId } from "@/lib/project-context";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { MaterialRequestBoard } from "./material-request-board";

/** หน้า Material Request form ของโครงการ — เปิดจากปุ่มในเมนู Material Request (/m/{menuId}?project=) */
export default function MaterialRequestPage() {
  return (
    // อ่าน ?project= จาก URL ตอน runtime จึงต้องอยู่หลัง Suspense
    <Suspense fallback={<Skeleton />}>
      <MaterialRequest />
    </Suspense>
  );
}

function MaterialRequest() {
  const { menuId } = useRouteParams<{ menuId: string }>("/m/[menuId]/material-request");
  const { menus } = useMenus();
  const { byId, loading } = useProjects();
  const projectId = useCurrentProjectId();
  const project = projectId ? byId.get(projectId) : undefined;
  const menu = menus.find((m) => m.id === menuId);

  if (loading) return <Skeleton />;
  if (!project) return <EmptyState>ไม่พบโครงการนี้ หรือคุณไม่มีสิทธิ์เข้าถึง — เลือกโครงการก่อน</EmptyState>;

  return (
    <>
      <PageHeader
        eyebrow={menu?.name ?? "Material Request"}
        title="Material Request form"
        subtitle={`${project.code} · ${project.name}`}
        actions={<Link href={`/m/${menuId}?project=${project.id}`} className="btn">← กลับไปที่เมนู</Link>}
      />
      <MaterialRequestBoard project={project} />
    </>
  );
}
