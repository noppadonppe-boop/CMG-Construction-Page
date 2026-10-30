"use client";

/* eslint-disable @next/next/no-img-element -- รูปจาก Firebase Storage URL */
// เอกสารรายงานประจำวัน (A–H) สำหรับแสดงบนจอและพิมพ์ (A–G = A4, H = ขนาด/แนวตามที่ตั้งแต่ละหน้า) — ป้ายกำกับเปลี่ยนตามภาษา (ไทย / English / 中文)
import type { ReactNode } from "react";
import {
  manpowerTotals,
  sumRows,
  reportDocNo,
  SKY_ICON,
  workingHours,
  type DcrData,
  type DcrSettings,
  type HeadcountRow,
  type Signature,
} from "@/lib/dcr";
import type { Project } from "@/lib/types";
import { sectionLetters, type DailySectionKey } from "@/lib/daily-report-standard";
import { DCR_TEXT, reportLocale, translateValue, type ReportLang } from "@/lib/dcr-i18n";
import { LayoutPaper, SlotContent, slotBox } from "@/components/dcr-layout-page";

type Text = (typeof DCR_TEXT)[ReportLang];

const DAY = 86_400_000;
const contractDay = (start: string, end: string, date: string) => {
  const s = Date.parse(start);
  return { day: Math.round((Date.parse(date) - s) / DAY) + 1, total: Math.round((Date.parse(end) - s) / DAY) + 1 };
};

export function DcrDocument({ project, settings, r, date, lang = "th" }: { project: Project; settings: DcrSettings; r: DcrData; date: string; lang?: ReportLang }) {
  const t = DCR_TEXT[lang];
  const hours = workingHours(r.working_hours.start, r.working_hours.end);
  const totals = manpowerTotals(r.manpower, hours);
  const cd = contractDay(project.start_date, project.end_date, date);
  const subs = settings.subcontractors.filter((s) => r.subcontractors_today.includes(s.id));
  // หัวรายงาน: ไม่ได้ติ๊กผู้รับเหมาช่วงของวันนั้น (เช่น เพิ่มบริษัทหลังสร้างรายงาน) → แสดงผู้รับเหมาช่วงของโครงการ
  const headerSubs = subs.length ? subs : settings.subcontractors.filter((s) => s.name || s.logo);
  const consultants = settings.consultants.filter((c) => c.name || c.logo);
  const photos = r.progress.flatMap((p, i) => p.photos.map((ph, j) => ({ ...ph, label: `${i + 1}.${j + 1}`, zone: p.zone })));
  const L = sectionLetters(r.form_standard?.sections);
  const code = r.report_no ? reportDocNo(r, project.code) : "—";
  const fmt = (n: number) => n.toLocaleString(reportLocale(lang));
  const head = (key: DailySectionKey) => ({ title: t.sections[key].title, en: t.sections[key].sub });

  return (
    <div lang={lang} className="dcr-doc mx-auto max-w-[210mm] rounded-sm border border-border bg-surface p-6 text-[12px] leading-snug shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      {/* หัวรายงาน: ซ้าย = Client / Consultant · กลาง = ชื่อเอกสาร + เลขที่ · ขวา = Main contractor / Subcontractor */}
      <header className="mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
        <div className="grid content-start gap-1.5">
          <LogoCell label={t.client} companies={[settings.client]} />
          {settings.show_consultant && consultants.length > 0 && <LogoCell label={t.consultant} companies={consultants} />}
        </div>
        <div className="dcr-band flex flex-col items-center justify-center rounded-sm px-3 py-3 text-center">
          <div className="text-[17px] leading-tight font-bold tracking-wide">{t.title}</div>
          <div className="text-[11.5px] opacity-80">{t.subtitle}</div>
          <div className="mt-2 text-[10.5px] opacity-70">{t.docNo}</div>
          <div className="text-[13px] font-semibold">{code}</div>
        </div>
        <div className="grid content-start gap-1.5">
          <LogoCell label={t.mainContractor} companies={[settings.contractor]} />
          {headerSubs.length > 0 && <LogoCell label={t.subcontractor} companies={headerSubs} />}
        </div>
      </header>
      {r.form_standard && (
        <div className="-mt-2 mb-2 text-right text-[10.5px] text-muted">
          {t.formStandard}: {r.form_standard.name}{r.form_standard.code && ` · ${r.form_standard.code}`}{r.form_standard.rev && ` · Rev. ${r.form_standard.rev}`}
        </div>
      )}

      {/* A. ข้อมูลโครงการ */}
      <Section letter="A" {...head("project")}>
        <table className="dcr dcr-info">
          <colgroup><col style={{ width: "16%" }} /><col /><col style={{ width: "16%" }} /><col style={{ width: "24%" }} /></colgroup>
          <tbody>
            <tr><th>{t.projectName}</th><td className="font-semibold">{settings.project_name || project.name}</td><th>{t.projectNo}</th><td className="font-semibold">{settings.project_no || project.code}</td></tr>
            <tr><th>{t.client}</th><td>{settings.client.name || project.client || "—"}</td><th>{t.date}</th><td>{t.longDate(date)}</td></tr>
            {settings.show_consultant && consultants.length > 0 && <tr><th>{t.consultant}</th><td colSpan={3}>{consultants.map((c) => c.name).join(", ")}</td></tr>}
            <tr><th>{t.mainContractor}</th><td>{settings.contractor.name || "—"}</td><th>{t.docNo}</th><td>{code}</td></tr>
            <tr><th>{t.subcontractor}</th><td>{subs.map((s) => s.name).join(", ") || "—"}</td><th>{t.contractDay}</th><td>{cd.day} / {cd.total}</td></tr>
            <tr>
              <th>{t.location}</th><td>{project.location ?? "—"}</td>
              <th>{t.workingHours}</th><td>{r.working_hours.start}–{r.working_hours.end}{r.working_hours.overtime && ` (OT ${r.working_hours.overtime})`}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* B. สภาพอากาศ */}
      {L.weather && (<Section letter={L.weather} {...head("weather")}>
        <table className="dcr">
          <thead>
            <tr>
              <th style={{ width: "18%" }}>{t.period}</th>
              <th style={{ width: "16%" }}>{t.weather}</th>
              <th style={{ width: "17%" }}>{t.workStatus}</th>
              <th className="text-center">{t.temp}</th>
              <th className="text-center">{t.rain}</th>
              <th className="text-center">{t.lostHours}</th>
              <th>{t.siteCondition}</th>
            </tr>
          </thead>
          <tbody>
            {([[t.am, r.weather.am], [t.pm, r.weather.pm]] as const).map(([label, h], i) => (
              <tr key={i}>
                <td>{label}</td>
                <td><span className="mr-1">{SKY_ICON[h.sky]}</span>{t.sky[h.sky]}</td>
                <td><span className={`dcr-chip whitespace-nowrap ${h.status === "stopped" ? "bad" : h.status === "partial" ? "warn" : "ok"}`}>{t.work[h.status]}</span></td>
                {i === 0 && (
                  <>
                    <td rowSpan={2} className="text-center align-middle">{r.weather.temp_high ?? "–"} / {r.weather.temp_low ?? "–"} °C</td>
                    <td rowSpan={2} className="text-center align-middle">{r.weather.rain_mm} {t.mm}</td>
                    <td rowSpan={2} className={`text-center align-middle font-semibold ${r.weather.lost_hours ? "text-bad" : ""}`}>{r.weather.lost_hours} {t.hr}</td>
                    <td rowSpan={2} className="align-middle">{translateValue(t, r.weather.site_condition)}</td>
                  </>
                )}
              </tr>
            ))}
            {r.weather.remark && <tr><td colSpan={7} className="text-muted">{t.remark}: {r.weather.remark}</td></tr>}
          </tbody>
        </table>
      </Section>)}

      {/* C. กำลังคน (ซ้าย) · เครื่องจักร (ขวา) */}
      {L.manpower && (<Section letter={L.manpower} {...head("manpower")}>
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          <div className="space-y-2">
            <Headcount t={t} title={t.indirect} rows={r.manpower.indirect} />
            <Headcount t={t} title={t.direct} rows={r.manpower.direct} />
          </div>
          <div className="space-y-2">
            <table className="dcr">
              <colgroup><col style={{ width: "6%" }} /><col /><col style={{ width: "13%" }} /><col style={{ width: "21%" }} /><col style={{ width: "24%" }} /></colgroup>
              <thead>
                <tr><th colSpan={5} className="dcr-sub">{t.equipment}</th></tr>
                <tr><th>#</th><th>{t.equipCol}</th><th className="num">{t.qty}</th><th>{t.equipStatus}</th><th>{t.remark}</th></tr>
              </thead>
              <tbody>
                {r.equipment.length === 0 && <tr><td colSpan={5} className="text-center text-muted">{t.noEquipment}</td></tr>}
                {r.equipment.map((e, i) => (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    <td>{e.name}{e.owner && <div className="text-[10.5px] text-muted">{e.owner}</div>}</td>
                    <td className="num">{e.quantity}</td>
                    <td><span className={`dcr-chip whitespace-nowrap ${e.status === "breakdown" ? "bad" : e.status === "idle" ? "warn" : "ok"}`}>{t.equip[e.status]}</span></td>
                    <td className="text-[11px]">{e.remark}</td>
                  </tr>
                ))}
                {r.equipment.length > 0 && (
                  <tr className="dcr-total"><td colSpan={2}>{t.sum}</td><td className="num">{r.equipment.reduce((s, e) => s + e.quantity, 0)}</td><td colSpan={2}>{t.vehicles}</td></tr>
                )}
              </tbody>
            </table>
            {r.materials.length > 0 && (
              <table className="dcr">
                <colgroup><col /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /><col style={{ width: "28%" }} /></colgroup>
                <thead>
                  <tr><th colSpan={4} className="dcr-sub">{t.materials}</th></tr>
                  <tr><th>{t.item}</th><th>{t.unit}</th><th className="num">{t.qty}</th><th>{t.remark}</th></tr>
                </thead>
                <tbody>{r.materials.map((m, i) => <tr key={i}><td>{m.item}</td><td>{m.unit}</td><td className="num">{fmt(m.quantity)}</td><td className="text-[11px]">{m.remark}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-sm border border-text/20 text-center">
          <Stat label={t.statIndirect} value={`${totals.indirect.present} / ${totals.indirect.total}`} unit={t.people} />
          <Stat label={t.statDirect} value={`${totals.direct.present} / ${totals.direct.total}`} unit={t.people} />
          <Stat label={t.statPresent} value={totals.total} unit={t.people} strong />
          <Stat label={t.manHours(hours)} value={fmt(Math.round(totals.manHours))} unit={t.hr} />
        </div>
      </Section>)}

      {/* D. งานที่ทำวันนี้ */}
      {L.activities && (<Section letter={L.activities} {...head("activities")}>
        <Lines empty={t.noActivities}>
          {r.progress.filter((p) => p.description || p.zone).map((p, i) => (
            <Line key={p.id} n={i + 1}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div className="min-w-0 flex-1">
                  {(p.zone || p.category) && <span className="dcr-tag">{[p.zone, p.category].filter(Boolean).join(" · ")}</span>}
                  <span className="whitespace-pre-wrap">{p.description}</span>
                  {L.attachments && p.photos.length > 0 && <span className="text-muted"> ({t.photo} {L.attachments}-{i + 1}.1{p.photos.length > 1 ? `–${i + 1}.${p.photos.length}` : ""})</span>}
                </div>
                {(p.quantity || p.cumulative) && (
                  <div className="shrink-0 text-[11px] text-muted">
                    {p.quantity && <>{t.today} <b className="text-text">{p.quantity}</b></>}
                    {p.quantity && p.cumulative && " · "}
                    {p.cumulative && <>{t.cumulative} <b className="text-text">{p.cumulative}</b></>}
                  </div>
                )}
              </div>
            </Line>
          ))}
        </Lines>
        <div className="mt-2 grid gap-x-4 gap-y-0.5 rounded-sm bg-surface-2 px-3 py-1.5 text-[11px] sm:grid-cols-2 print:grid-cols-2">
          <div>
            <b>{t.safety}:</b> {t.toolbox} {r.safety.toolbox_topic || "—"}{r.safety.toolbox_attendees ? ` (${r.safety.toolbox_attendees} ${t.people})` : ""} · {t.incidents} {r.safety.incidents} · {t.nearMiss} {r.safety.near_miss}{r.safety.remark && ` · ${r.safety.remark}`}
          </div>
          <div><b>{t.quality}:</b> {t.inspections} {r.quality.inspections || "—"} · NCR {r.quality.ncr || t.none}</div>
        </div>
      </Section>)}

      {/* E. ปัญหาและอุปสรรค */}
      {L.issues && (<Section letter={L.issues} {...head("issues")}>
        <Lines empty={t.noIssues}>
          {r.issues.map((x, i) => (
            <Line key={i} n={i + 1}>
              {x.cause && <span className="dcr-tag warn">{translateValue(t, x.cause)}</span>}
              {x.description}
              {x.impact_hours > 0 && <span className="font-semibold text-bad"> · {t.impact} {x.impact_hours} {t.hr}</span>}
              {(x.responsible || x.action) && (
                <div className="text-[11px] text-muted">
                  {x.action && <>{t.action}: {x.action}</>}{x.action && x.responsible && " · "}{x.responsible && <>{t.responsible}: {x.responsible}</>}
                </div>
              )}
            </Line>
          ))}
        </Lines>
      </Section>)}

      {/* F. แผนงานพรุ่งนี้ */}
      {L.tomorrow && (<Section letter={L.tomorrow} {...head("tomorrow")}>
        <Lines empty={t.noPlan}>
          {r.tomorrow.map((p, i) => (
            <Line key={i} n={i + 1}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 flex-1">{p.task}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {p.manpower > 0 && <>{t.manpower} <b className="text-text">{p.manpower}</b> {t.people}</>}
                  {p.manpower > 0 && p.resources && " · "}
                  {p.resources}
                </span>
              </div>
            </Line>
          ))}
        </Lines>
      </Section>)}

      {/* ลงนาม */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center break-inside-avoid">
        <SignatureCell t={t} title={t.preparedBy} role={t.roleEngineer} sig={r.signatures.prepared} />
        <SignatureCell t={t} title={t.reviewedBy} role={t.rolePM} sig={r.signatures.reviewed} />
        <SignatureCell t={t} title={t.acknowledged} role={t.roleClient} sig={r.signatures.acknowledged} />
      </div>

      {/* G. ภาพประกอบ: ขึ้นหน้าใหม่เมื่อพิมพ์ */}
      {L.attachments && (<Section letter={L.attachments} {...head("attachments")} className={photos.length ? "print-break mt-4" : "mt-4"}>
        {photos.length === 0 ? (
          <p className="rounded-sm border border-dashed border-text/25 py-6 text-center text-muted">{t.noAttachments}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {photos.map((ph) => <PhotoTile key={ph.path} {...ph} prefix={L.attachments ?? "G"} />)}
          </div>
        )}
      </Section>)}

      <footer className="mt-4 flex justify-between border-t border-border pt-1 text-[10.5px] text-muted">
        <span>CMG Project Hub · {code}</span>
        <span>{settings.project_name || project.name} · {t.shortDate(date)}</span>
      </footer>

      {/* H. เอกสารแนบแบบจัดหน้า: แต่ละหน้าขึ้นกระดาษใหม่ตามขนาด/แนวของตัวเอง */}
      {L.layout && r.layout_pages.map((page, i) => (
        <LayoutPaper
          key={page.id}
          page={page}
          letter={L.layout!}
          title={`${t.sections.layout.title}${r.layout_pages.length > 1 ? ` (${L.layout}-${i + 1})` : ""}`}
          right={`${code} · ${t.pageOf(i + 1, r.layout_pages.length)}`}
          className="mt-6 border-t border-dashed border-border pt-4 print:mt-0 print:border-0 print:pt-0"
        >
          {page.slots.map((s) => (
            <div key={s.id} style={slotBox(s)}>
              <SlotContent slot={s} />
            </div>
          ))}
        </LayoutPaper>
      ))}
    </div>
  );
}

/** ช่องโลโก้บนหัวรายงาน — โลโก้กว้างแสดงเต็มความกว้าง ไม่มีโลโก้แสดงชื่อบริษัท */
function LogoCell({ label, companies }: { label: string; companies: { id: string; name: string; logo: { url: string } | null }[] }) {
  return (
    <div className="flex min-h-[54px] flex-col rounded-sm border border-text/20 bg-white px-1.5 pt-1 pb-0.5">
      <div className="flex flex-1 items-center justify-center gap-2">
        {companies.map((c) =>
          c.logo?.url ? (
            <img key={c.id} src={c.logo.url} alt={c.name} className="max-h-[38px] min-w-0 object-contain" style={{ maxWidth: `${100 / companies.length}%` }} />
          ) : (
            <span key={c.id} className="text-center text-[11px] leading-tight font-semibold text-[#0f1b2d]">{c.name || "—"}</span>
          ),
        )}
      </div>
      <div className="text-center text-[8.5px] tracking-wide text-[#5b6b80] uppercase">{label}</div>
    </div>
  );
}

function Section({ letter, title, en, children, className = "" }: { letter: string; title: string; en: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-3 ${className}`}>
      <div className="mb-1.5 flex items-center gap-2 border-b-2 border-primary pb-1">
        <span className="dcr-letter">{letter}</span>
        <span className="font-semibold">{title}</span>
        {en && <span className="text-[11px] text-muted">{en}</span>}
      </div>
      {children}
    </section>
  );
}

function Headcount({ t, title, rows }: { t: Text; title: string; rows: HeadcountRow[] }) {
  const sum = sumRows(rows);
  const absent = (r: { total: number; present: number }) => Math.max(0, r.total - r.present);
  return (
    <table className="dcr">
      <colgroup><col /><col style={{ width: "14%" }} /><col style={{ width: "17%" }} /><col style={{ width: "15%" }} /></colgroup>
      <thead>
        <tr><th colSpan={4} className="dcr-sub">{title}</th></tr>
        <tr><th>{t.position}</th><th className="num">{t.total}</th><th className="num">{t.present}</th><th className="num">{t.absent}</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={4} className="text-center text-muted">—</td></tr>}
        {rows.map((r, i) => (
          <tr key={i} className={r.total || r.present ? "" : "text-muted"}>
            <td>{r.label}</td>
            <td className="num">{r.total || "–"}</td>
            <td className="num font-semibold">{r.present || "–"}</td>
            <td className={`num ${absent(r) ? "text-warn" : ""}`}>{absent(r) || "–"}</td>
          </tr>
        ))}
        <tr className="dcr-total"><td>{t.sum}</td><td className="num">{sum.total}</td><td className="num">{sum.present}</td><td className="num">{absent(sum)}</td></tr>
      </tbody>
    </table>
  );
}

function Stat({ label, value, unit, strong }: { label: string; value: ReactNode; unit: string; strong?: boolean }) {
  return (
    <div className={`border-r border-text/20 px-2 py-1.5 last:border-r-0 ${strong ? "bg-primary-soft" : "bg-surface-2"}`}>
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className={`text-[15px] font-bold ${strong ? "text-primary" : ""}`}>{value} <span className="text-[11px] font-normal text-muted">{unit}</span></div>
    </div>
  );
}

/** กล่องข้อความแบบบรรทัด (D/E/F) — เส้นบรรทัดว่างให้เขียนเพิ่มเมื่อพิมพ์ */
function Lines({ children, empty }: { children: ReactNode[]; empty: string }) {
  const filled = children.length;
  return (
    <ol className="dcr-lines">
      {filled === 0 && <li className="text-muted"><span className="dcr-n">–</span><div>{empty}</div></li>}
      {children}
      {Array.from({ length: Math.max(0, 3 - Math.max(filled, 1)) }, (_, i) => <li key={`blank-${i}`} aria-hidden><span className="dcr-n" /><div>&nbsp;</div></li>)}
    </ol>
  );
}

function Line({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li>
      <span className="dcr-n">{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function PhotoTile({ url, caption, label, zone, prefix }: { url: string; caption: string; label: string; zone: string; prefix: string }) {
  return (
    <figure className="break-inside-avoid overflow-hidden rounded-sm border border-text/20">
      <img src={url} alt={caption || label} className="aspect-[4/3] w-full object-cover" />
      <figcaption className="px-2 py-1 text-[11px]"><b>{prefix}-{label}</b> <span className="text-muted">{caption || zone}</span></figcaption>
    </figure>
  );
}

function SignatureCell({ t, title, role, sig }: { t: Text; title: string; role: string; sig: Signature }) {
  return (
    <div className="rounded-sm border border-text/20 px-2 pt-2 pb-1.5">
      <div className="text-[11px] font-semibold text-muted">{title}</div>
      <div className="flex h-10 items-end justify-center border-b border-dotted border-text/40 pb-1">
        {sig && <span className="text-ok">{t.signed}</span>}
      </div>
      <div className="mt-1">{sig ? sig.name : "(..............................)"}</div>
      <div className="text-[10.5px] text-muted">{role}{sig ? ` · ${t.dateTime(sig.at)}` : ` · ${t.dateBlank}`}</div>
    </div>
  );
}
