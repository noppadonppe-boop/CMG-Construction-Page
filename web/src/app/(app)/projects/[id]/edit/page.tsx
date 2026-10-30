"use client";

import { useRouteParams } from "@/lib/static-export";
import { useProjects } from "@/lib/db/projects";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { ProjectForm } from "../../project-form";

export default function EditProjectPage() {
  const { id } = useRouteParams<{ id: string }>("/projects/[id]/edit");
  const { byId, loading } = useProjects();
  const project = byId.get(id);

  if (loading) return <Skeleton />;
  if (!project) return <EmptyState>ไม่พบโครงการ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  return (
    <>
      <PageHeader title="แก้ไขข้อมูลโครงการ" subtitle={project.name} />
      <Guard permission="project.edit">
        {/* key = id เท่านั้น: ข้อมูลเปลี่ยนแบบ realtime แล้วฟอร์มไม่ล้างสิ่งที่กำลังพิมพ์ */}
        <ProjectForm key={project.id} project={project} />
      </Guard>
    </>
  );
}
