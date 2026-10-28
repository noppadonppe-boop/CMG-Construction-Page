"use client";

import { PageHeader } from "@/components/ui";
import { Guard } from "@/components/guard";
import { ProjectForm } from "../project-form";

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="สร้างโครงการใหม่" subtitle="หลังสร้างแล้ว ใส่แผนความคืบหน้ารายเดือน และ assign ผู้ใช้เข้าโครงการได้" />
      <Guard permission="project.create">
        <ProjectForm />
      </Guard>
    </>
  );
}
