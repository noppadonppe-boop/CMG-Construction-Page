"use client";

import Link from "next/link";
import { useRouteParams } from "@/lib/static-export";
import { useEffect, useRef, useState } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { DCR_STATUS_LABEL, reportDocNo, type DcrStatus } from "@/lib/dcr";
import { setDcrStatus, useDcr, useDcrSettings } from "@/lib/db/dcr";
import { loadEmailSetup } from "@/lib/db/email-setup";
import { captureReportPdf, sendDailyReportEmail } from "@/lib/db/email-outbox";
import { useProjects } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/format";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { EmptyState, Pill, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { PrintButton } from "../../../reports/print-button";
import { DcrDocument } from "./dcr-document";
import { REPORT_LANG_KEYS, REPORT_LANGS, type ReportLang } from "@/lib/dcr-i18n";

export default function DcrViewPage() {
  return (
    <Guard permission="daily.view">
      <DcrView />
    </Guard>
  );
}

function DcrView() {
  const { projectId, date } = useRouteParams<{ projectId: string; date: string }>("/daily-reports/[projectId]/[date]");
  const { can, userProfile } = useAuth();
  const { byId, loading } = useProjects();
  const project = byId.get(projectId);
  const { settings } = useDcrSettings(project?.id, project?.client ?? null);
  const { report: r, loading: loadingReport } = useDcr(project?.id, date, settings);
  const [error, setError] = useState<string>();
  const [emailNotice, setEmailNotice] = useState<string>();
  const [emailPending, setEmailPending] = useState(false);
  const [pending, run] = useSubmitOnce();
  const docRef = useRef<HTMLDivElement>(null);
  // รายงานล่าสุดที่หน้าจอแสดง — ใช้รอให้ลายเซ็นหลังอนุมัติขึ้นจอก่อนถ่ายภาพไปทำ PDF
  const latestStatus = useRef<DcrStatus | undefined>(undefined);
  useEffect(() => {
    latestStatus.current = r?.status;
  });
  // ภาษาที่ผู้ดูเลือก — ยังไม่เลือก = ภาษาเริ่มต้นของโครงการ
  const [picked, setPicked] = useState<ReportLang | null>(null);
  const lang = picked ?? settings?.report_lang ?? "th";

  if (loading || (project && loadingReport)) return <Skeleton />;
  if (!project || !settings) return <EmptyState>ไม่พบโครงการ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  if (!r) {
    return (
      <EmptyState>
        ยังไม่มีรายงานของวันที่ {formatDate(date)}
        {can("daily.create") && (
          <> — <Link className="text-primary" href={`/daily-reports/${projectId}/${date}/edit`}>เขียนรายงาน</Link></>
        )}
      </EmptyState>
    );
  }

  const canReview = can("project.edit");
  const editable = r.status === "draft" || r.status === "submitted";
  const canSendEmail = can("daily.create") || can("report.export");

  const act = (status: DcrStatus) =>
    run(async () => {
      if (!userProfile) return;
      try {
        await setDcrStatus(project.id, date, status, { name: `${displayName(userProfile)}${userProfile.position ? ` (${userProfile.position})` : ""}`, email: userProfile.email }, userProfile.email);
        setError(undefined);
      } catch (e) {
        setError(firebaseErrorMessage(e));
        return;
      }
      // PM อนุมัติ (ตรวจแล้ว) → ส่งอีเมลรายงานให้ผู้รับที่ตั้งไว้ใน Setup Email อัตโนมัติ
      if (status === "reviewed") await sendEmail("หลังอนุมัติรายงาน", status);
    });

  const sendEmail = async (context?: string, waitForStatus?: DcrStatus) => {
    if (!userProfile || emailPending) return;
    setEmailPending(true);
    setEmailNotice(undefined);
    setError(undefined);
    try {
      const setup = await loadEmailSetup(project.id);
      if (waitForStatus) {
        for (let i = 0; i < 50 && latestStatus.current !== waitForStatus; i++) await new Promise((resolve) => setTimeout(resolve, 100));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      const docEl = docRef.current?.querySelector<HTMLElement>(".dcr-doc");
      if (setup.attach_report_pdf && !docEl) throw new Error("ไม่พบเอกสารรายงานบนหน้าจอสำหรับสร้าง PDF");
      const pdf = docEl ? captureReportPdf(docEl, `${r.report_no ? reportDocNo(r, project.code) : project.code}_${date}.pdf`.replace(/[^\w.\-]+/g, "_")) : undefined;
      const result = await sendDailyReportEmail({ project, settings, report: r, date, setup, pdf });
      setEmailNotice(`${context ? `${context} · ` : ""}ส่งอีเมลสำเร็จแล้ว (${result.recipients} ผู้รับ)`);
    } catch (e) {
      setError(`${context ? `${context} · ` : ""}ส่งอีเมลไม่สำเร็จ: ${firebaseErrorMessage(e)}`);
    } finally {
      setEmailPending(false);
    }
  };

  return (
    <article>
      {/* แถบคำสั่ง (ไม่ถูกพิมพ์) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link href={`/daily-reports?project=${projectId}`} className="btn">← รายงานทั้งหมด</Link>
          <Pill tone={r.status === "draft" ? "warn" : r.status === "submitted" ? "info" : "ok"}>{DCR_STATUS_LABEL[r.status]}</Pill>
          {r.legacy && <Pill tone="info">รูปแบบเดิม</Pill>}
          {r.form_standard && <Pill tone="info">มาตรฐาน {r.form_standard.code || r.form_standard.name}</Pill>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="ภาษาของรายงาน" className="inline-flex overflow-hidden rounded-lg border border-border">
            {REPORT_LANG_KEYS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setPicked(l)}
                className={`px-3 py-1.5 text-sm ${lang === l ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"} [&+&]:border-l [&+&]:border-border`}
              >
                {REPORT_LANGS[l]}
              </button>
            ))}
          </div>
          {can("daily.create") && editable && !r.legacy && <Link href={`/daily-reports/${project.id}/${date}/edit`} className="btn">แก้ไข</Link>}
          {r.legacy && can("daily.create") && <Link href={`/daily-reports/${project.id}/${date}/edit`} className="btn">แปลงเป็นแบบฟอร์มใหม่</Link>}
          {canReview && r.status === "submitted" && <button className="btn" disabled={pending} onClick={() => act("reviewed")}>✓ ตรวจแล้ว</button>}
          {canReview && r.status === "reviewed" && <button className="btn" disabled={pending} onClick={() => act("acknowledged")}>บันทึกการรับทราบ</button>}
          {canReview && r.status !== "draft" && !r.legacy && <button className="btn text-bad" disabled={pending} onClick={() => act("draft")}>ตีกลับแก้ไข</button>}
          {canSendEmail && <button className="btn" disabled={emailPending} onClick={() => sendEmail()}>{emailPending ? "กำลังส่ง..." : "✉️ ส่งอีเมล"}</button>}
          <PrintButton />
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-bad print:hidden">{error}</p>}
      {emailNotice && <p className="mb-3 rounded-lg bg-ok-soft px-3 py-2 text-ok print:hidden">{emailNotice}</p>}

      <div ref={docRef}><DcrDocument project={project} settings={settings} r={r} date={date} lang={lang} /></div>
    </article>
  );
}
