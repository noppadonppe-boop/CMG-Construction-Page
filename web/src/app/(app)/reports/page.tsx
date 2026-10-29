"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { downloadCsv } from "@/lib/csv";
import { useDailyReports } from "@/lib/db/daily";
import { useDocuments } from "@/lib/db/documents";
import { useIssues } from "@/lib/db/issues";
import { useProjects } from "@/lib/db/projects";
import {
  documentCategory,
  documentStatus,
  issueCategoryLabel,
  issuePriority,
  issueStatusLabel,
  scheduleStatus,
  statusLabel,
  todayInBangkok,
  weatherLabel,
} from "@/lib/format";
import { PageHeader, Skeleton } from "@/components/ui";
import { Guard, NoProjects } from "@/components/guard";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="รายงาน" subtitle="สร้างจากข้อมูลหน้างานอัตโนมัติ — พิมพ์หรือบันทึกเป็น PDF ได้ทันที ไม่ต้องทำ Excel ซ้ำ" />
      <Guard permission="report.view">
        <Choices />
      </Guard>
    </>
  );
}

function Choices() {
  const router = useRouter();
  const preset = useSearchParams().get("project") ?? undefined;
  const { can } = useAuth();
  const { projects, loading } = useProjects();
  const today = todayInBangkok();
  if (loading) return <Skeleton />;
  if (projects.length === 0) return <NoProjects />;

  const open = (e: FormEvent<HTMLFormElement>, path: string) => {
    e.preventDefault();
    const q = new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>);
    router.push(`${path}?${q}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={(e) => open(e, "/reports/weekly")} className="card space-y-3">
        <h3 className="font-semibold">📋 รายงานประจำสัปดาห์ (รายโครงการ)</h3>
        <p className="text-sm text-muted">ความคืบหน้า, S-Curve, งานรายวันพร้อมรูป, ปัญหาค้าง, เอกสารใหม่ — สำหรับส่งเจ้าของงาน</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <select name="project" defaultValue={preset} className="input" aria-label="โครงการ" required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input type="date" name="date" defaultValue={today} className="input" aria-label="สัปดาห์ที่มีวันที่" />
        </div>
        <button className="btn btn-primary">เปิดรายงาน</button>
      </form>

      <form onSubmit={(e) => open(e, "/reports/monthly")} className="card space-y-3">
        <h3 className="font-semibold">📊 รายงานสรุปผู้บริหาร (รายเดือน)</h3>
        <p className="text-sm text-muted">ภาพรวมทุกโครงการที่คุณเข้าถึงได้, มูลค่างาน, โครงการล่าช้า, สถิติปัญหา/RFI และเอกสารรออนุมัติ</p>
        <input type="month" name="month" defaultValue={today.slice(0, 7)} className="input" aria-label="เดือน" />
        <button className="btn btn-primary">เปิดรายงาน</button>
      </form>

      {can("report.export") && <Exports />}
    </div>
  );
}

/** ส่งออก Excel (CSV) จากข้อมูลโครงการที่ผู้ใช้เข้าถึงได้เท่านั้น */
function Exports() {
  const { can } = useAuth();
  const { projects } = useProjects();
  const { reports } = useDailyReports(can("daily.view") ? projects : []);
  const { issues } = useIssues(can("issue.view") ? projects : []);
  const { documents } = useDocuments(can("document.view") ? projects : []);
  const stamp = todayInBangkok();

  const exports = [
    {
      label: "โครงการ + ความคืบหน้า",
      note: "มูลค่า, % จริง/แผน, สถานะ",
      run: () =>
        downloadCsv(
          `cmg-projects-${stamp}.csv`,
          ["รหัส", "ชื่อโครงการ", "เจ้าของงาน", "สถานที่", "ผู้จัดการ", "มูลค่าสัญญา (บาท)", "เริ่มสัญญา", "สิ้นสุดสัญญา", "สถานะโครงการ", "% จริง", "% แผน", "เทียบแผน"],
          projects.map((p) => [
            p.code, p.name, p.client, p.location, p.manager_name, p.contract_value, p.start_date, p.end_date,
            statusLabel[p.status], p.actual_pct, p.planned_pct, scheduleStatus(p.actual_pct, p.planned_pct).label,
          ]),
        ),
    },
    can("daily.view") && {
      label: "รายงานประจำวันทั้งหมด",
      note: "แรงงาน, งานที่ทำ, ปัญหา",
      run: () =>
        downloadCsv(
          `cmg-daily-reports-${stamp}.csv`,
          ["วันที่", "โครงการ", "สภาพอากาศ", "แรงงาน (คน)", "งานที่ทำ", "เครื่องจักร", "ปัญหา/อุปสรรค", "จำนวนรูป"],
          reports.toReversed().map((r) => [
            r.report_date, r.project_name, weatherLabel[r.weather].replace(/^\S+\s/, ""), r.workers, r.work_done,
            r.equipment.join(", "), r.issues, r.photos.length,
          ]),
        ),
    },
    can("issue.view") && {
      label: "ปัญหา / ความปลอดภัย / RFI",
      note: "เลขที่, ผู้รับผิดชอบ, กำหนดเสร็จ",
      run: () =>
        downloadCsv(
          `cmg-issues-${stamp}.csv`,
          ["เลขที่", "หมวด", "เรื่อง", "รายละเอียด", "โครงการ", "ความเร่งด่วน", "สถานะ", "ผู้รับผิดชอบ", "กำหนดเสร็จ", "แจ้งเมื่อ", "ปิดเมื่อ"],
          issues.map((i) => [
            i.code, issueCategoryLabel[i.category], i.title, i.description, i.project_name, issuePriority[i.priority].label,
            issueStatusLabel[i.status], i.assignee, i.due_date, i.created_at.slice(0, 10), i.closed_at?.slice(0, 10),
          ]),
        ),
    },
    can("document.view") && {
      label: "ทะเบียนเอกสาร",
      note: "เลขที่แบบ, Rev. ล่าสุด, สถานะ",
      run: () =>
        downloadCsv(
          `cmg-documents-${stamp}.csv`,
          ["หมวด", "เลขที่", "ชื่อเอกสาร", "โครงการ", "Rev. ล่าสุด", "ไฟล์", "สถานะ", "จำนวน Revision", "อัปเดตล่าสุด", "ลิงก์ไฟล์"],
          documents.map((d) => {
            const current = d.revisions.at(-1);
            return [
              documentCategory[d.category].label, d.doc_no, d.title, d.project_name, current?.rev, current?.file_name,
              documentStatus[d.status].label, d.revisions.length, d.updated_at.slice(0, 10), current?.url,
            ];
          }),
        ),
    },
  ].filter(Boolean) as { label: string; note: string; run: () => void }[];

  return (
    <section className="card lg:col-span-2">
      <h3 className="mb-1 font-semibold">⬇️ ส่งออก Excel</h3>
      <p className="mb-3 text-sm text-muted">ไฟล์ CSV (UTF-8) เปิดด้วย Excel หรือ Google Sheets ได้ ภาษาไทยแสดงถูกต้อง · เฉพาะโครงการที่คุณเข้าถึงได้</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {exports.map((e) => (
          <button key={e.label} type="button" onClick={e.run} className="rounded-lg border border-border p-3 text-left hover:border-primary">
            <div className="font-medium">{e.label}</div>
            <div className="text-xs text-muted">{e.note}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
