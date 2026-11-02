"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { displayName, useAuth } from "@/lib/auth/context";
import { DataError } from "@/lib/db/common";
import { useProjects, type ProjectRecord } from "@/lib/db/projects";
import {
  decideRequisition,
  deleteRequisition,
  isEditable,
  requisitionPriority,
  requisitionStatus,
  submitRequisition,
  useRequisitions,
  type Requisition,
  type RequisitionStatus,
} from "@/lib/db/requisitions";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/format";
import { useCurrentProjectId } from "@/lib/project-context";
import { RequisitionDocument } from "./requisition-document";
import { RequisitionForm } from "./requisition-form";

/** ใบขอเบิกวัสดุ — รายการ: /material-requisition?project={id} · เปิดใบ: เพิ่ม &id={ใบ} (พิมพ์ / PDF + อนุมัติ) */
export default function MaterialRequisitionPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Requisitions />
    </Suspense>
  );
}

function Requisitions() {
  const { can } = useAuth();
  const { projects, byId, loading } = useProjects();
  const projectId = useCurrentProjectId();
  const project = projectId ? byId.get(projectId) : undefined;

  if (loading) return <Skeleton />;
  if (!can("material.request") && !can("material.approve"))
    return <EmptyState>คุณไม่มีสิทธิ์ใช้งานส่วนนี้ — ติดต่อ Master Admin เพื่อขอสิทธิ์</EmptyState>;
  if (!project)
    return (
      <>
        <PageHeader title="ใบขอเบิกวัสดุ" subtitle="เลือกโครงการ" />
        {projects.length === 0 ? (
          <EmptyState>ยังไม่มีโครงการที่คุณเข้าถึงได้</EmptyState>
        ) : (
          <div className="card-grid">
            {projects.map((p) => (
              <Link key={p.id} href={`/material-requisition?project=${p.id}`} className="card p-3 hover:border-primary">
                <div className="text-xs text-muted">{p.code}</div>
                <div className="font-semibold">{p.name}</div>
              </Link>
            ))}
          </div>
        )}
      </>
    );
  return <ProjectRequisitions project={project} />;
}

/** ทำงาน async พร้อมเก็บข้อความผิดพลาด */
function useAction() {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<void>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof DataError ? e.message : "ทำรายการไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  };
  return { error, pending, run };
}

function ProjectRequisitions({ project }: { project: ProjectRecord }) {
  const params = useSearchParams();
  const openId = params.get("id");
  const { requisitions, loading, error } = useRequisitions(project);
  const [formOpen, setFormOpen] = useState<"new" | "edit" | null>(null);
  const router = useRouter();
  const { userProfile, can } = useAuth();
  const [notice, setNotice] = useState<string>();
  const [filter, setFilter] = useState<RequisitionStatus | "all">("all");
  const base = `/material-requisition?project=${project.id}`;
  const actor = userProfile?.email ?? "";
  const name = userProfile ? displayName(userProfile) : "";
  const current = openId ? requisitions.find((r) => r.id === openId) : undefined;

  const form = formOpen && (
    <RequisitionForm
      project={project}
      actor={actor}
      requesterName={name}
      existing={formOpen === "edit" ? current : undefined}
      onClose={() => setFormOpen(null)}
      onSaved={(id, no) => {
        setNotice(`บันทึก ${no} แล้ว — ตรวจสอบแล้วกด "ส่งขออนุมัติ"`);
        router.push(`${base}&id=${id}`);
      }}
    />
  );

  if (openId) {
    if (loading) return <Skeleton />;
    if (!current) return <EmptyState>ไม่พบใบขอเบิกนี้ อาจถูกลบไปแล้ว</EmptyState>;
    return (
      <>
        <Detail project={project} r={current} base={base} notice={notice} onEdit={() => setFormOpen("edit")} onDeleted={() => router.push(base)} />
        {form}
      </>
    );
  }

  const shown = requisitions.filter((r) => filter === "all" || r.status === filter);
  const waiting = requisitions.filter((r) => r.status === "submitted").length;

  return (
    <>
      <PageHeader
        title="ใบขอเบิกวัสดุ"
        subtitle={`${project.code} · ${project.name}`}
        actions={
          <>
            <Link href={`/material-request?project=${project.id}`} className="btn">ติดตามรับของ</Link>
            {can("material.request") && <button type="button" className="btn btn-primary" onClick={() => setFormOpen("new")}>+ สร้างใบขอเบิก</button>}
          </>
        }
      />
      {error && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">โหลดข้อมูลไม่สำเร็จ: {error}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["all", "draft", "submitted", "approved", "rejected"] as const).map((s) => (
          <button key={s} type="button" className={`btn px-2.5 py-1 text-xs ${filter === s ? "btn-primary" : ""}`} onClick={() => setFilter(s)}>
            {s === "all" ? "ทั้งหมด" : requisitionStatus[s].label}
          </button>
        ))}
        {waiting > 0 && can("material.approve") && <span className="text-warn">มี {waiting} ใบรออนุมัติ</span>}
      </div>
      {loading ? (
        <Skeleton />
      ) : shown.length === 0 ? (
        <EmptyState>ยังไม่มีใบขอเบิก{filter === "all" ? "" : "ในสถานะนี้"}</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">วันที่ขอ</th>
                <th className="px-3 py-2">ผู้ขอเบิก</th>
                <th className="px-3 py-2">ส่วนงาน</th>
                <th className="px-3 py-2 text-right">รายการ</th>
                <th className="px-3 py-2">ต้องการใช้</th>
                <th className="px-3 py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2 font-semibold"><Link className="text-primary hover:underline" href={`${base}&id=${r.id}`}>{r.no}</Link></td>
                  <td className="px-3 py-2">{formatDate(r.request_date)}</td>
                  <td className="px-3 py-2">{r.requester_name}</td>
                  <td className="px-3 py-2">{r.work_area || "–"}</td>
                  <td className="px-3 py-2 text-right">{r.items.length}</td>
                  <td className="px-3 py-2">
                    {formatDate(r.require_date)} {r.priority === "urgent" && <Pill tone="bad">{requisitionPriority.urgent}</Pill>}
                  </td>
                  <td className="px-3 py-2"><Pill tone={requisitionStatus[r.status].tone}>{requisitionStatus[r.status].label}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form}
    </>
  );
}

function Detail({ project, r, base, notice, onEdit, onDeleted }: { project: ProjectRecord; r: Requisition; base: string; notice?: string; onEdit: () => void; onDeleted: () => void }) {
  const { userProfile, can } = useAuth();
  const action = useAction();
  const [comment, setComment] = useState("");
  const actor = userProfile?.email ?? "";
  const name = userProfile ? displayName(userProfile) : "";
  const isMaster = !!userProfile?.role.includes("MasterAdmin");
  const mine = r.created_by === actor;
  const status = requisitionStatus[r.status];
  const canEdit = isEditable(r) && can("material.request") && (mine || isMaster);
  // ผู้ขอเบิกอนุมัติใบของตัวเองไม่ได้ (ยกเว้น Master Admin) — ต้องมีคนที่สองตรวจ
  const canDecide = r.status === "submitted" && can("material.approve") && (r.created_by !== actor || isMaster);

  function remove() {
    if (!confirm(`ลบ ${r.no}? การลบย้อนกลับไม่ได้`)) return;
    action.run(async () => {
      await deleteRequisition(project.id, r.id);
      onDeleted();
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link href={base} className="btn">← กลับ</Link>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <button type="button" className="btn" onClick={onEdit} disabled={action.pending}>แก้ไข</button>}
          {canEdit && (mine || isMaster) && <button type="button" className="btn" onClick={remove} disabled={action.pending}>ลบ</button>}
          {canEdit && (
            <button type="button" className="btn btn-primary" disabled={action.pending} onClick={() => action.run(() => submitRequisition(project.id, r.id, actor, name))}>
              ส่งขออนุมัติ
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>🖨️ พิมพ์ / PDF</button>
        </div>
      </div>

      {notice && <p className="mb-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok print:hidden">✓ {notice}</p>}
      {action.error && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad print:hidden" role="alert">{action.error}</p>}
      {r.status === "rejected" && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">ใบนี้ไม่ได้รับอนุมัติ — แก้ไขตามเหตุผลที่ระบุท้ายใบ แล้วส่งขออนุมัติอีกครั้ง</p>}

      {canDecide && (
        <div className="card mb-4 space-y-2 p-3 print:hidden">
          <label className="label" htmlFor="mrq-comment">ความเห็นผู้อนุมัติ (จำเป็นเมื่อไม่อนุมัติ)</label>
          <textarea id="mrq-comment" className="input" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={action.pending} onClick={() => action.run(() => decideRequisition(project.id, r.id, "approve", actor, name, comment))}>✓ อนุมัติ</button>
            <button type="button" className="btn" disabled={action.pending} onClick={() => action.run(() => decideRequisition(project.id, r.id, "reject", actor, name, comment))}>ไม่อนุมัติ</button>
          </div>
        </div>
      )}

      <RequisitionDocument project={project} r={r} />

      {r.approval_log.length > 0 && (
        <section className="card mt-4 p-3 print:hidden">
          <h3 className="mb-2 text-sm font-semibold">ประวัติการอนุมัติ</h3>
          <ul className="space-y-1 text-sm">
            {r.approval_log.map((e) => (
              <li key={e.at} className="text-muted">
                {new Date(e.at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })} · <span className="text-text">{e.name || e.by}</span>{" "}
                {{ submit: "ส่งขออนุมัติ", approve: "อนุมัติ", reject: "ไม่อนุมัติ" }[e.action]}
                {e.comment && <> — “{e.comment}”</>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
