"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { useProjects } from "@/lib/db/projects";
import { PageHeader, Skeleton } from "@/components/ui";
import { NoProjects } from "@/components/guard";
import { ProjectTable } from "./project-table";

export default function ProjectsPage() {
  const { can } = useAuth();
  const { projects, loading } = useProjects();
  return (
    <>
      <PageHeader
        title="โครงการ"
        subtitle={can("project.viewAll") ? "โครงการทั้งหมดในระบบ" : "โครงการที่คุณได้รับมอบหมาย"}
      />
      {loading ? (
        <Skeleton />
      ) : (
        <div className="card">
          {can("project.create") && (
            <div className="mb-3 flex justify-end">
              <Link href="/projects/new" className="btn btn-primary">+ สร้างโครงการ</Link>
            </div>
          )}
          {projects.length === 0 ? (
            <NoProjects />
          ) : (
            <ProjectTable projects={projects} canEdit={can("project.edit")} canDelete={can("project.delete")} />
          )}
        </div>
      )}
    </>
  );
}
