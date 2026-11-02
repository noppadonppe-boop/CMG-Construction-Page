"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { cardVisibleIn, menuVisibleIn, useMenus } from "@/lib/db/menus";
import { useProjects } from "@/lib/db/projects";
import { useCurrentProjectId } from "@/lib/project-context";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { LinkCard } from "../menus/link-card";
import { MaterialRequestBoard } from "../m/[menuId]/material-request-board";

/** เมนู Cards เดิมที่เก็บการ์ดของแท็บ Document Approve — จับจากชื่อเมนู */
const isMaterialMenu = (name: string) => /material\s*request/i.test(name);

const TABS = [
  { id: "request", label: "Material Request" },
  { id: "approve", label: "Document Approve" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Project Document — แท็บ Material Request (เบิก · รับ · คงค้าง) และ Document Approve (การ์ดลิงก์) */
export default function ProjectDocumentPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ProjectDocument />
    </Suspense>
  );
}

function ProjectDocument() {
  const { projects, byId, loading } = useProjects();
  const { menus, loading: loadingMenus } = useMenus();
  const projectId = useCurrentProjectId();
  const [tab, setTab] = useState<TabId>("request");
  const project = projectId ? byId.get(projectId) : undefined;

  if (loading || loadingMenus) return <Skeleton />;
  if (!project)
    return (
      <>
        <PageHeader title="Project Document" subtitle="เลือกโครงการ" />
        {projects.length === 0 ? (
          <EmptyState>ยังไม่มีโครงการที่คุณเข้าถึงได้</EmptyState>
        ) : (
          <div className="card-grid">
            {projects.map((p) => (
              <Link key={p.id} href={`/project-documents?project=${p.id}`} className="card p-3 hover:border-primary">
                <div className="text-xs text-muted">{p.code}</div>
                <div className="font-semibold">{p.name}</div>
              </Link>
            ))}
          </div>
        )}
      </>
    );

  const cards = menus
    .filter((m) => isMaterialMenu(m.name) && menuVisibleIn(m, project.id))
    .flatMap((m) => m.cards.filter((c) => cardVisibleIn(m, c, project.id)));

  return (
    // ตาราง 3 ชุดกว้าง — ขยายเป็น 80% ของพื้นที่เนื้อหา (เกิน max-w ของ main ได้) จัดกึ่งกลาง · หัวหน้าและแท็บอยู่ในกรอบเดียวกันเพื่อให้ขอบตรงกัน
    <div className="relative left-1/2 w-[max(100%,80cqw)] -translate-x-1/2">
      <PageHeader title="Project Document" subtitle={`${project.code} · ${project.name}`} />
      <div role="tablist" aria-label="Project Document" className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-2">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${on ? "border border-primary/30 bg-surface font-semibold text-primary shadow-sm" : "text-text hover:bg-surface"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "request" ? (
        <MaterialRequestBoard project={project} />
      ) : cards.length === 0 ? (
        <EmptyState>ยังไม่มี Card ใน Document Approve</EmptyState>
      ) : (
        <div className="card-grid">
          {cards.map((card) => (
            <LinkCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
