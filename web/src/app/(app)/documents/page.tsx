"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useDocuments } from "@/lib/db/documents";
import { useProjects } from "@/lib/db/projects";
import { Guard, NoProjects } from "@/components/guard";
import { documentCategory, documentStatus, formatDate } from "@/lib/format";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { ProjectFilter } from "@/components/project-filter";
import type { DocumentCategory } from "@/lib/types";

const CATEGORIES = Object.keys(documentCategory) as DocumentCategory[];

export default function DocumentsPage() {
  const { can } = useAuth();
  const projectId = useSearchParams().get("project");
  return (
    <>
      <PageHeader
        title="ศูนย์เอกสาร"
        subtitle="แหล่งเดียวสำหรับแบบ สัญญา และเอกสารทุกฉบับ — เก็บทุก revision · อัปเดตอัตโนมัติ"
        actions={can("document.upload") && <Link href={`/documents/new${projectId ? `?project=${projectId}` : ""}`} className="btn btn-primary">+ อัปโหลด</Link>}
      />
      <Guard permission="document.view">
        <Library />
      </Guard>
    </>
  );
}

function Library() {
  const params = useSearchParams();
  const projectId = params.get("project") ?? undefined;
  const rawCategory = params.get("category") as DocumentCategory | null;
  const category = rawCategory && CATEGORIES.includes(rawCategory) ? rawCategory : undefined;
  const { projects, loading: loadingProjects } = useProjects();
  const { documents: all, loading } = useDocuments(projects);
  const inProject = projectId ? all.filter((d) => d.project_id === projectId) : all;
  const documents = category ? inProject.filter((d) => d.category === category) : inProject;

  const href = (c?: DocumentCategory) => {
    const q = new URLSearchParams();
    if (c && c !== category) q.set("category", c); // กดหมวดเดิมซ้ำ = ยกเลิกตัวกรอง
    if (projectId) q.set("project", projectId);
    return `/documents${q.size ? `?${q}` : ""}`;
  };

  if (loadingProjects || loading) return <Skeleton />;
  if (projects.length === 0) return <NoProjects />;

  return (
    <>
      {/* ใน workspace ของโครงการสลับโครงการได้จากแถบบนแล้ว */}
      {!projectId && (
        <div className="mb-4 flex justify-end">
          <ProjectFilter projects={projects.map((p) => ({ id: p.id, name: p.name }))} basePath="/documents" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {CATEGORIES.map((c) => {
          const meta = documentCategory[c];
          const count = inProject.filter((d) => d.category === c).length;
          const pending = inProject.filter((d) => d.category === c && d.status === "pending").length;
          return (
            <Link
              key={c}
              href={href(c)}
              className={`card flex items-center gap-3 p-3 hover:border-primary ${c === category ? "border-primary ring-2 ring-primary-soft" : ""}`}
            >
              <span className="grid size-10 flex-none place-items-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{meta.badge}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{meta.label}</span>
                <span className="text-xs text-muted">
                  {count} ไฟล์{pending ? ` · รอตรวจ ${pending}` : ""}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="card mt-4">
        <h3 className="mb-3 font-semibold">
          {category ? documentCategory[category].label : "เอกสารล่าสุด"}
          <span className="ml-2 text-sm font-normal text-muted">{documents.length} รายการ</span>
        </h3>
        {documents.length === 0 ? (
          <EmptyState>ยังไม่มีเอกสาร — กด “อัปโหลด” เพื่อเริ่มเก็บเอกสาร</EmptyState>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2.5 py-2 font-medium">เอกสาร</th>
                  {!projectId && <th className="hidden px-2.5 py-2 font-medium md:table-cell">โครงการ</th>}
                  <th className="px-2.5 py-2 font-medium">Rev.</th>
                  <th className="px-2.5 py-2 font-medium">สถานะ</th>
                  <th className="hidden px-2.5 py-2 font-medium sm:table-cell">อัปเดต</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const current = d.revisions.at(-1);
                  return (
                    <tr key={`${d.project_id}/${d.id}`} className="border-t border-border hover:bg-surface-2">
                      <td className="px-2.5 py-3">
                        <Link href={`/documents/${d.project_id}/${d.id}`} className="font-semibold hover:text-primary">
                          {d.doc_no && <span className="mr-1.5 text-muted">{d.doc_no}</span>}
                          {d.title}
                        </Link>
                        <div className="text-xs text-muted">
                          {documentCategory[d.category].label} · {current?.file_name}
                        </div>
                      </td>
                      {!projectId && <td className="hidden px-2.5 py-3 md:table-cell">{d.project_name}</td>}
                      <td className="px-2.5 py-3 font-semibold">{current?.rev ?? "-"}</td>
                      <td className="px-2.5 py-3">
                        <Pill tone={documentStatus[d.status].tone}>{documentStatus[d.status].label}</Pill>
                      </td>
                      <td className="hidden px-2.5 py-3 text-xs whitespace-nowrap text-muted sm:table-cell">
                        {formatDate(d.updated_at.slice(0, 10))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
