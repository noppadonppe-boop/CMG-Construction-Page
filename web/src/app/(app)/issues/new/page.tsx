"use client";

import { useSearchParams } from "next/navigation";
import { projectOptions, useProjects } from "@/lib/db/projects";
import { PageHeader, Skeleton } from "@/components/ui";
import { Guard, NoProjects } from "@/components/guard";
import type { IssueCategory } from "@/lib/types";
import { IssueForm } from "./issue-form";

export default function NewIssuePage() {
  const params = useSearchParams();
  const category = params.get("category");
  const { projects, loading } = useProjects();
  const options = projectOptions(projects);
  return (
    <>
      <PageHeader title="แจ้งเรื่องใหม่" subtitle="ปัญหาหน้างาน, ความปลอดภัย หรือ RFI — ระบบออกเลขที่ให้อัตโนมัติ" />
      <Guard permission="issue.create">
        {loading ? (
          <Skeleton />
        ) : options.length === 0 ? (
          <NoProjects />
        ) : (
          <IssueForm
            projects={options}
            defaultProjectId={params.get("project") ?? undefined}
            defaultCategory={category === "issue" || category === "safety" || category === "rfi" ? (category as IssueCategory) : undefined}
          />
        )}
      </Guard>
    </>
  );
}
