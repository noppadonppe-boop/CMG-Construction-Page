"use client";

import { useSearchParams } from "next/navigation";
import { projectOptions, useProjects } from "@/lib/db/projects";
import { documentCategory } from "@/lib/format";
import { PageHeader, Skeleton } from "@/components/ui";
import { Guard, NoProjects } from "@/components/guard";
import type { DocumentCategory } from "@/lib/types";
import { DocumentForm } from "./document-form";

export default function NewDocumentPage() {
  const params = useSearchParams();
  const category = params.get("category");
  const { projects, loading } = useProjects();
  const options = projectOptions(projects);
  return (
    <>
      <PageHeader title="อัปโหลดเอกสาร" subtitle="แบบ สัญญา Submittal และเอกสารโครงการ — เก็บทุก revision ไว้ย้อนดูได้" />
      <Guard permission="document.upload">
        {loading ? (
          <Skeleton />
        ) : options.length === 0 ? (
          <NoProjects />
        ) : (
          <DocumentForm
            projects={options}
            defaultProjectId={params.get("project") ?? undefined}
            defaultCategory={category && category in documentCategory ? (category as DocumentCategory) : undefined}
          />
        )}
      </Guard>
    </>
  );
}
