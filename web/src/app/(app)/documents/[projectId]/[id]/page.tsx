"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useDocuments } from "@/lib/db/documents";
import { useProjects } from "@/lib/db/projects";
import { documentCategory, documentStatus, formatDateTime, formatFileSize } from "@/lib/format";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { DeleteDocumentButton, RevisionForm, StatusSelect } from "./document-actions";

export default function DocumentPage() {
  return (
    <Guard permission="document.view">
      <Detail />
    </Guard>
  );
}

function Detail() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const { can } = useAuth();
  const { byId, loading: loadingProjects } = useProjects();
  const project = byId.get(projectId);
  const { documents, loading } = useDocuments(project ? [project] : []);
  const document = documents.find((d) => d.id === id);

  if (loadingProjects || loading) return <Skeleton />;
  if (!document) return <EmptyState>ไม่พบเอกสารนี้ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  const current = document.revisions.at(-1);
  const isPdf = current?.content_type === "application/pdf";
  const isImage = current?.content_type.startsWith("image/");

  return (
    <>
      <PageHeader
        eyebrow={`${documentCategory[document.category].label}${document.doc_no ? ` / ${document.doc_no}` : ""}`}
        title={document.title}
        subtitle={
          <Link href={`/projects/${document.project_id}`} className="hover:text-primary">
            {document.project_name}
          </Link>
        }
        actions={
          <>
            <Link href={`/documents?project=${projectId}`} className="btn">กลับ</Link>
            {current && (
              <a href={current.url} target="_blank" rel="noopener" className="btn btn-primary">
                เปิดไฟล์ Rev. {current.rev}
              </a>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {current && (isPdf || isImage) && (
            <div className="card p-2">
              {isPdf ? (
                <iframe src={current.url} title={current.file_name} className="h-[70vh] w-full rounded-lg bg-surface-2" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- ไฟล์จาก Firebase Storage URL
                <img src={current.url} alt={document.title} className="mx-auto max-h-[70vh] rounded-lg" />
              )}
            </div>
          )}

          <div className="card">
            <h3 className="mb-3 font-semibold">ประวัติ Revision</h3>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2.5 py-2 font-medium">Rev.</th>
                    <th className="px-2.5 py-2 font-medium">ไฟล์</th>
                    <th className="hidden px-2.5 py-2 font-medium sm:table-cell">หมายเหตุ</th>
                    <th className="px-2.5 py-2 font-medium">อัปโหลด</th>
                  </tr>
                </thead>
                <tbody>
                  {document.revisions.toReversed().map((r, i) => (
                    <tr key={r.rev} className="border-t border-border">
                      <td className="px-2.5 py-2.5 font-semibold">
                        {r.rev}
                        {i === 0 && <span className="ml-1.5 text-xs font-normal text-primary">ล่าสุด</span>}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <a href={r.url} target="_blank" rel="noopener" className="break-all text-primary hover:underline">
                          {r.file_name}
                        </a>
                        <div className="text-xs text-muted">{formatFileSize(r.size)}</div>
                      </td>
                      <td className="hidden px-2.5 py-2.5 text-muted sm:table-cell">{r.note ?? "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs whitespace-nowrap text-muted">{formatDateTime(r.uploaded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-4 self-start">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">สถานะ</h3>
              <Pill tone={documentStatus[document.status].tone}>{documentStatus[document.status].label}</Pill>
            </div>
            <StatusSelect document={document} />
          </div>
          {can("document.upload") && (
            <div className="card">
              <h3 className="mb-3 font-semibold">อัปโหลดฉบับแก้ไข</h3>
              <RevisionForm document={document} />
            </div>
          )}
          {can("document.delete") && <DeleteDocumentButton document={document} />}
        </aside>
      </div>
    </>
  );
}
