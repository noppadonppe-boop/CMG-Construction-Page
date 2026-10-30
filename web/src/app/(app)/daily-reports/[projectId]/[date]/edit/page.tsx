"use client";

import { useRouteParams } from "@/lib/static-export";
import { useState } from "react";
import { useDcr, useDcrSettings, type DcrRecord } from "@/lib/db/dcr";
import { dailyReportStandardSnapshot, projectDailyReportStandard, useFormStandards } from "@/lib/db/form-standards";
import { useProjects } from "@/lib/db/projects";
import { formatDate } from "@/lib/format";
import { isIsoDate } from "@/lib/report-period";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { DcrForm } from "./dcr-form";

export default function EditDcrPage() {
  const { projectId, date } = useRouteParams<{ projectId: string; date: string }>("/daily-reports/[projectId]/[date]/edit");
  const { byId, loading } = useProjects();
  const project = byId.get(projectId);
  const { forms, loading: loadingStandards } = useFormStandards();
  const { settings } = useDcrSettings(project?.id, project?.client ?? null);
  const { report, loading: loadingReport } = useDcr(project?.id, date, settings);
  // ข้อมูล ณ ตอนเปิดฟอร์ม — การเปลี่ยนแปลงภายหลังส่งเป็น live เพื่อแจ้งเตือน ไม่ล้างสิ่งที่กรอก
  const [opened, setOpened] = useState<{ key: string; report: DcrRecord | null } | null>(null);
  const key = `${projectId}/${date}`;
  const dailyStandard = project ? dailyReportStandardSnapshot(projectDailyReportStandard(forms, project.form_standards)) : null;
  if (!loadingReport && settings && opened?.key !== key) setOpened({ key, report });

  if (!isIsoDate(date)) return <EmptyState>วันที่ไม่ถูกต้อง</EmptyState>;
  if (loading) return <Skeleton />;
  if (!project) return <EmptyState>ไม่พบโครงการ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  return (
    <>
      <PageHeader
        eyebrow={`${project.code} · ${project.name}`}
        title="รายงานประจำวัน (Daily construction report)"
        subtitle={`วันที่ ${formatDate(date)}`}
      />
      <Guard permission="daily.create">
        {!opened || opened.key !== key || !settings || loadingStandards ? (
          <Skeleton />
        ) : (
          <DcrForm key={key} project={project} settings={settings} existing={opened.report} date={date} live={report} standard={dailyStandard} />
        )}
      </Guard>
    </>
  );
}
