"use client";

import { useRouteParams } from "@/lib/static-export";
import { useProjects } from "@/lib/db/projects";
import { todayInBangkok } from "@/lib/format";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { ProgressForm } from "./progress-form";

export default function ProgressPage() {
  const { id } = useRouteParams<{ id: string }>("/projects/[id]/progress");
  const { byId, loading } = useProjects();
  const project = byId.get(id);

  if (loading) return <Skeleton />;
  if (!project) return <EmptyState>ไม่พบโครงการ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  return (
    <>
      <PageHeader
        eyebrow={`โครงการ / ${project.code}`}
        title="อัปเดตความคืบหน้า"
        subtitle={`${project.name} · ตัดยอดทุกวันที่ 1 ของเดือน`}
      />
      <Guard permission="progress.edit">
        {/* key = id + ช่วงสัญญา: เปลี่ยนวันที่สัญญาแล้วตารางเดือนต้องสร้างใหม่ — แต่ไม่ล้างเมื่อแค่มีคนบันทึกความคืบหน้า */}
        <ProgressForm key={`${project.id}:${project.start_date}:${project.end_date}`} project={project} currentMonth={todayInBangkok().slice(0, 8) + "01"} />
      </Guard>
    </>
  );
}
