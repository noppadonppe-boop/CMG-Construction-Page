"use client";

/* eslint-disable @next/next/no-img-element -- รูปจาก Firebase Storage URL */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import {
  DCR_STATUS_LABEL,
  EQUIPMENT_STATUS_LABEL,
  manpowerTotals,
  reportCode,
  SKY_LABEL,
  WORK_STATUS_LABEL,
  workingHours,
  type Company,
  type DcrStatus,
  type HeadcountRow,
  type Signature,
} from "@/lib/dcr";
import { setDcrStatus, useDcr, useDcrSettings } from "@/lib/db/dcr";
import { useProjects } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { EmptyState, Pill, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { CompanyLogo } from "@/components/company-logo";
import { PrintButton } from "../../../reports/print-button";

const thaiWeekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", timeZone: "UTC" });
const DAY = 86_400_000;
const contractDay = (start: string, end: string, date: string) => {
  const s = Date.parse(start);
  return { day: Math.round((Date.parse(date) - s) / DAY) + 1, total: Math.round((Date.parse(end) - s) / DAY) + 1 };
};

export default function DcrViewPage() {
  return (
    <Guard permission="daily.view">
      <DcrView />
    </Guard>
  );
}

function DcrView() {
  const { projectId, date } = useParams<{ projectId: string; date: string }>();
  const { can, userProfile } = useAuth();
  const { byId, loading } = useProjects();
  const project = byId.get(projectId);
  const { settings } = useDcrSettings(project?.id, project?.client ?? null);
  const { report: r, loading: loadingReport } = useDcr(project?.id, date, settings);
  const [error, setError] = useState<string>();
  const [pending, run] = useSubmitOnce();

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

  const hours = workingHours(r.working_hours.start, r.working_hours.end);
  const totals = manpowerTotals(r.manpower, hours);
  const cd = contractDay(project.start_date, project.end_date, date);
  const subs = settings.subcontractors.filter((s) => r.subcontractors_today.includes(s.id));
  const photos = r.progress.flatMap((p, i) => p.photos.map((ph, j) => ({ ...ph, label: `${i + 1}.${j + 1}`, zone: p.zone })));
  const code = r.report_no ? reportCode(project.code, r.report_no) : "—";
  const canReview = can("project.edit");
  const editable = r.status === "draft" || r.status === "submitted";

  const act = (status: DcrStatus) =>
    run(async () => {
      if (!userProfile) return;
      try {
        await setDcrStatus(project.id, date, status, { name: `${displayName(userProfile)}${userProfile.position ? ` (${userProfile.position})` : ""}`, email: userProfile.email }, userProfile.email);
        setError(undefined);
      } catch (e) {
        setError(firebaseErrorMessage(e));
      }
    });

  return (
    <article>
      {/* แถบคำสั่ง (ไม่ถูกพิมพ์) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link href="/daily-reports" className="btn">← รายงานทั้งหมด</Link>
          <Pill tone={r.status === "draft" ? "warn" : r.status === "submitted" ? "info" : "ok"}>{DCR_STATUS_LABEL[r.status]}</Pill>
          {r.legacy && <Pill tone="info">รูปแบบเดิม</Pill>}
        </div>
        <div className="flex flex-wrap gap-2">
          {can("daily.create") && editable && !r.legacy && <Link href={`/daily-reports/${project.id}/${date}/edit`} className="btn">แก้ไข</Link>}
          {r.legacy && can("daily.create") && <Link href={`/daily-reports/${project.id}/${date}/edit`} className="btn">แปลงเป็นแบบฟอร์มใหม่</Link>}
          {canReview && r.status === "submitted" && <button className="btn" disabled={pending} onClick={() => act("reviewed")}>✓ ตรวจแล้ว</button>}
          {canReview && r.status === "reviewed" && <button className="btn" disabled={pending} onClick={() => act("acknowledged")}>บันทึกการรับทราบ</button>}
          {canReview && r.status !== "draft" && !r.legacy && <button className="btn text-bad" disabled={pending} onClick={() => act("draft")}>ตีกลับแก้ไข</button>}
          <PrintButton />
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-bad print:hidden">{error}</p>}

      <div className="mx-auto max-w-[210mm] rounded-sm border border-border bg-surface p-6 text-[12.5px] leading-snug shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        {/* หัวรายงาน */}
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b-2 border-text pb-3">
          <div>
            <div className="text-lg font-bold">รายงานประจำวัน · Daily construction report</div>
            <div className="text-muted">{project.name} ({project.code})</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">Report no. {code}</div>
            <div className="text-muted">{thaiWeekday(date)}ที่ {formatDate(date)}</div>
            <div className="text-muted">Contract day {cd.day} / {cd.total}</div>
          </div>
        </header>

        {/* แถบโลโก้: Client · Consultant · Contractor · Subcontractor */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <LogoGroup title="Client" companies={[settings.client]} />
          <LogoGroup title="Consultant / CM" companies={settings.consultants} />
          <LogoGroup title="Main contractor" companies={[settings.contractor]} />
          <LogoGroup title="Subcontractor" companies={subs} />
        </div>

        <table className="dcr mb-3">
          <tbody>
            <tr><th>Client</th><td>{settings.client.name || project.client || "—"}</td><th>Consultant / CM</th><td>{settings.consultants.map((c) => c.name).join(", ") || "—"}</td></tr>
            <tr><th>Main contractor</th><td>{settings.contractor.name}</td><th>Subcontractors</th><td>{subs.map((s) => s.name).join(", ") || "—"}</td></tr>
            <tr><th>Location</th><td>{project.location ?? "—"}</td><th>Working hours</th><td>{r.working_hours.start}–{r.working_hours.end}{r.working_hours.overtime && ` (OT ${r.working_hours.overtime})`}</td></tr>
          </tbody>
        </table>

        <Box title="1. สภาพอากาศและสภาพหน้างาน (Weather and site condition)">
          <table className="dcr">
            <thead><tr><th>ช่วงเวลา</th><th>สภาพอากาศ</th><th>สถานะการทำงาน</th></tr></thead>
            <tbody>
              {([["เช้า 08:00–12:00", r.weather.am], ["บ่าย 13:00–17:00", r.weather.pm]] as const).map(([label, h]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{SKY_LABEL[h.sky]}</td>
                  <td className={h.status === "stopped" ? "text-bad" : h.status === "partial" ? "text-warn" : "text-ok"}>{WORK_STATUS_LABEL[h.status]}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="text-muted">
                  อุณหภูมิ {r.weather.temp_high ?? "–"}/{r.weather.temp_low ?? "–"} °C · ฝน {r.weather.rain_mm} มม. ·{" "}
                  <b className={r.weather.lost_hours ? "text-bad" : ""}>ชั่วโมงสูญเสียจากสภาพอากาศ {r.weather.lost_hours} ชม.</b> · สภาพพื้นที่: {r.weather.site_condition}
                  {r.weather.remark && ` · ${r.weather.remark}`}
                </td>
              </tr>
            </tbody>
          </table>
        </Box>

        <div className="mb-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          <Box title="2. กำลังคน Indirect / Staff" flush><Headcount rows={r.manpower.indirect} /></Box>
          <Box title="3. กำลังคน Direct labor" flush><Headcount rows={r.manpower.direct} /></Box>
        </div>
        <p className="mb-3 text-right font-semibold">กำลังคนรวม {totals.total} คน · {Math.round(totals.manHours).toLocaleString("th-TH")} ชั่วโมงงาน ({hours} ชม./คน)</p>

        <Box title="4. เครื่องจักรและวัสดุ (Equipment and materials)">
          {r.equipment.length === 0 && r.materials.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <table className="dcr">
              <thead><tr><th>เครื่องจักร</th><th>เจ้าของ</th><th className="num">ทำงาน (ชม.)</th><th className="num">ว่าง (ชม.)</th><th>สถานะ</th></tr></thead>
              <tbody>
                {r.equipment.map((e, i) => (
                  <tr key={i}><td>{e.name}</td><td>{e.owner}</td><td className="num">{e.work_hours}</td><td className="num">{e.idle_hours}</td><td className={e.status === "breakdown" ? "text-bad" : ""}>{EQUIPMENT_STATUS_LABEL[e.status]}</td></tr>
                ))}
                {r.materials.length > 0 && (
                  <tr><td colSpan={5}>วัสดุเข้า: {r.materials.map((m) => `${m.item} ${m.quantity} (${m.status})`).join(" · ")}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Box>

        <Box title="5. ความคืบหน้างานประจำวัน (Daily progress)">
          <table className="dcr">
            <thead><tr><th style={{ width: "5%" }}>#</th><th style={{ width: "20%" }}>พื้นที่ / หมวดงาน</th><th>รายละเอียดงาน</th><th className="num" style={{ width: "14%" }}>วันนี้</th><th className="num" style={{ width: "10%" }}>สะสม</th></tr></thead>
            <tbody>
              {r.progress.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{p.zone}{p.category && <div className="text-muted">{p.category}</div>}</td>
                  <td className="whitespace-pre-wrap">{p.description}{p.photos.length > 0 && <span className="text-muted"> (รูป {i + 1}.1–{i + 1}.{p.photos.length})</span>}</td>
                  <td className="num">{p.quantity}</td>
                  <td className="num">{p.cumulative}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {photos.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {photos.slice(0, 4).map((ph) => <PhotoTile key={ph.path} {...ph} />)}
            </div>
          )}
        </Box>

        <div className="mb-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          <Box title="6. ความปลอดภัย / คุณภาพ" flush>
            <div className="p-2">
              Toolbox talk: {r.safety.toolbox_topic || "—"}{r.safety.toolbox_attendees ? ` (${r.safety.toolbox_attendees} คน)` : ""}
              <br />อุบัติเหตุ: {r.safety.incidents} · Near miss: {r.safety.near_miss}
              {r.safety.remark && <><br />{r.safety.remark}</>}
              <br />ตรวจงาน: {r.quality.inspections || "—"} · NCR: {r.quality.ncr || "ไม่มี"}
            </div>
          </Box>
          <Box title="7. ปัญหาและอุปสรรค" flush>
            <div className="p-2">
              {r.issues.length === 0 ? "ไม่มี" : r.issues.map((i, n) => (
                <div key={n} className="mb-1">
                  • {i.description} <span className="text-muted">({i.cause}{i.impact_hours ? ` · ${i.impact_hours} ชม.` : ""})</span>
                  {(i.responsible || i.action) && <div className="pl-3 text-muted">{[i.responsible, i.action].filter(Boolean).join(" — ")}</div>}
                </div>
              ))}
            </div>
          </Box>
        </div>

        <Box title="8. แผนงานพรุ่งนี้ (Tomorrow plan)">
          {r.tomorrow.length === 0 ? <p className="text-muted">—</p> : (
            <table className="dcr">
              <thead><tr><th>งาน</th><th className="num" style={{ width: "10%" }}>คน</th><th style={{ width: "40%" }}>เครื่องจักร / วัสดุ / ขอตรวจ</th></tr></thead>
              <tbody>{r.tomorrow.map((t, i) => <tr key={i}><td>{t.task}</td><td className="num">{t.manpower}</td><td>{t.resources}</td></tr>)}</tbody>
            </table>
          )}
        </Box>

        <div className="mt-5 grid grid-cols-3 gap-4 text-center">
          <SignatureCell title="จัดทำโดย" role="วิศวกรสนาม" sig={r.signatures.prepared} />
          <SignatureCell title="ตรวจสอบโดย" role="ผู้จัดการโครงการ" sig={r.signatures.reviewed} />
          <SignatureCell title="รับทราบ" role="ที่ปรึกษา / Client" sig={r.signatures.acknowledged} />
        </div>
        <footer className="mt-4 flex justify-between border-t border-border pt-1 text-[11px] text-muted">
          <span>CMG Project Hub · {code}</span>
          <span>{photos.length > 4 ? "มีภาคผนวกรูปถ่ายหน้าถัดไป" : ""}</span>
        </footer>

        {/* ภาคผนวกรูปถ่าย: ขึ้นหน้าใหม่เมื่อพิมพ์ */}
        {photos.length > 4 && (
          <section className="print-break mt-8">
            <div className="mb-2 border-b-2 border-text pb-1 font-semibold">ภาคผนวกรูปถ่าย · {code} · {formatDate(date)}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
              {photos.map((ph) => <PhotoTile key={ph.path} {...ph} />)}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

function Box({ title, children, flush }: { title: string; children: ReactNode; flush?: boolean }) {
  return (
    <section className={`break-inside-avoid border border-text/30 ${flush ? "" : "mb-3"}`}>
      <div className="border-b border-text/30 bg-surface-2 px-2 py-1 font-semibold">{title}</div>
      <div className={flush ? "" : "p-0"}>{children}</div>
    </section>
  );
}

function Headcount({ rows }: { rows: HeadcountRow[] }) {
  const shown = rows.filter((r) => r.main || r.sub);
  const sum = rows.reduce((s, r) => ({ main: s.main + r.main, sub: s.sub + r.sub }), { main: 0, sub: 0 });
  return (
    <table className="dcr">
      <thead><tr><th>ตำแหน่ง / ประเภท</th><th className="num">Main</th><th className="num">Sub</th></tr></thead>
      <tbody>
        {shown.length === 0 && <tr><td colSpan={3} className="text-muted">—</td></tr>}
        {shown.map((r, i) => <tr key={i}><td>{r.label}</td><td className="num">{r.main}</td><td className="num">{r.sub}</td></tr>)}
        <tr><th>รวม</th><th className="num">{sum.main}</th><th className="num">{sum.sub}</th></tr>
      </tbody>
    </table>
  );
}

function LogoGroup({ title, companies }: { title: string; companies: Company[] }) {
  const list = companies.filter((c) => c.name || c.logo);
  return (
    <div className="rounded border border-border p-2 text-center">
      <div className="mb-1 text-[10.5px] tracking-wide text-muted uppercase">{title}</div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {list.length === 0 ? <span className="text-muted">—</span> : list.map((c) => (
          <div key={c.id} className="flex flex-col items-center">
            <CompanyLogo company={c} size={40} />
            <span className="mt-0.5 max-w-24 truncate text-[10.5px]">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhotoTile({ url, caption, label, zone }: { url: string; caption: string; label: string; zone: string }) {
  return (
    <figure className="break-inside-avoid">
      <img src={url} alt={caption || label} className="aspect-[4/3] w-full rounded-sm object-cover" />
      <figcaption className="text-[11px] text-muted">{label} {caption || zone}</figcaption>
    </figure>
  );
}

function SignatureCell({ title, role, sig }: { title: string; role: string; sig: Signature }) {
  return (
    <div>
      <div className="flex h-10 items-end justify-center border-b border-text/40 pb-1">
        {sig && <span className="text-ok">✓ ลงนามในระบบ</span>}
      </div>
      <div className="mt-1">{title} · {role}</div>
      <div className="text-[11px] text-muted">{sig ? `${sig.name} · ${formatDateTime(sig.at)}` : "ชื่อ ........................ วันที่ ............"}</div>
    </div>
  );
}
