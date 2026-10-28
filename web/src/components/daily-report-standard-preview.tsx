import type { FormStandard } from "@/lib/db/form-standards";
import { DAILY_REPORT_STANDARD_SECTIONS } from "@/lib/daily-report-standard";

/** ตัวอย่างมาตรฐาน DCR ที่แสดงในคลังแบบฟอร์มก่อนนำไปใช้กับโครงการ */
export function DailyReportStandardPreview({
  standard,
  canManage,
  pending,
  onCreate,
}: {
  standard: FormStandard | null;
  canManage: boolean;
  pending: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-primary/25 bg-surface shadow-[0_1px_3px_rgba(16,24,40,.06)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,.85fr)]">
        <div className="p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-primary text-lg text-white">▤</span>
                <div>
                  <div className="text-xs font-semibold tracking-wide text-primary uppercase">Digital form standard</div>
                  <h2 className="font-bold">รายงานประจำวันงานก่อสร้าง</h2>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-muted">ฟอร์มในระบบสำหรับสรุปข้อมูลหน้างานในแต่ละวัน โดยจัดหัวข้อและลำดับการอนุมัติให้เหมือนกันทุกโครงการ</p>
            </div>
            {standard ? (
              <span className="rounded-full bg-ok-soft px-3 py-1 text-xs font-medium text-ok">พร้อมใช้ · {standard.code || "DCR Standard"} Rev. {standard.rev || "–"}</span>
            ) : (
              <span className="rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn">ตัวอย่างมาตรฐาน · ยังไม่อยู่ในคลัง</span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {DAILY_REPORT_STANDARD_SECTIONS.map((section) => (
              <div key={section.number} className="flex gap-3 rounded-lg border border-border bg-surface-2 p-3">
                <span className="mt-0.5 font-mono text-xs font-semibold text-primary">{section.number}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{section.title}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{section.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            {standard ? (
              <p className="text-sm text-ok">โครงการเลือกมาตรฐานนี้แล้ว ฟอร์มรายงานใหม่จะแสดงชื่อและ revision ของมาตรฐานบนรายงาน</p>
            ) : canManage ? (
              <>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={onCreate}>{pending ? "กำลังเพิ่มมาตรฐาน..." : "เพิ่มมาตรฐานนี้เข้าคลัง"}</button>
                <p className="text-xs text-muted">เพิ่มครั้งเดียว แล้วเลือกให้แต่ละโครงการได้จากหน้ารายละเอียดโครงการ</p>
              </>
            ) : (
              <p className="text-sm text-muted">ผู้ดูแลแบบฟอร์มสามารถเพิ่มมาตรฐานนี้เข้าคลัง แล้วกำหนดให้แต่ละโครงการใช้ได้</p>
            )}
          </div>
        </div>

        <div className="border-t border-primary/20 bg-primary-soft/40 p-5 lg:border-t-0 lg:border-l">
          <div className="mx-auto max-w-sm rounded-md border border-text/20 bg-surface p-3 text-[11px] shadow-sm">
            <div className="flex items-start justify-between border-b-2 border-text pb-2">
              <div>
                <div className="font-bold">DAILY CONSTRUCTION REPORT</div>
                <div className="text-muted">มาตรฐานรายงานประจำวัน</div>
              </div>
              <div className="text-right text-muted">DCR-STD-001<br />Rev. 1</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <MockField label="Project" value="ชื่อโครงการ" />
              <MockField label="Report date" value="DD / MM / YYYY" />
              <MockField label="Working hours" value="08:00–17:00" />
              <MockField label="Weather" value="Clear · 31°C" />
            </div>
            <MockTable title="Manpower status" headers={["Trade", "Main", "Sub"]} rows={[["Steel fixer", "12", "4"], ["General worker", "16", "8"]]} />
            <MockTable title="Daily progress" headers={["Area", "Description", "Today"]} rows={[["Zone B", "Foundation rebar", "24 ea."], ["Zone C", "Concrete pour", "42 m³"]]} />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="rounded border border-border p-1.5"><b>Safety / QC</b><br /><span className="text-muted">Toolbox, inspection, NCR</span></div>
              <div className="rounded border border-border p-1.5"><b>Tomorrow plan</b><br /><span className="text-muted">Task, crew, resources</span></div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[9px] text-muted">
              <div className="border-t border-text/30 pt-1">Prepared</div>
              <div className="border-t border-text/30 pt-1">Reviewed</div>
              <div className="border-t border-text/30 pt-1">Acknowledged</div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted">ตัวอย่างมุมมองรายงานที่พิมพ์หรือบันทึกเป็น PDF ได้จากระบบ</p>
        </div>
      </div>
    </section>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-border px-1.5 py-1"><span className="block text-[9px] text-muted">{label}</span>{value}</div>;
}

function MockTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-2 overflow-hidden rounded border border-border">
      <div className="border-b border-border bg-surface-2 px-1.5 py-1 font-semibold">{title}</div>
      <div className="grid grid-cols-3 divide-x divide-border text-[9px] text-muted">{headers.map((h) => <div key={h} className="px-1.5 py-0.5">{h}</div>)}</div>
      {rows.map((row, index) => <div key={index} className="grid grid-cols-3 border-t border-border text-[9px]">{row.map((cell, cellIndex) => <div key={`${index}-${cellIndex}`} className="truncate px-1.5 py-0.5">{cell}</div>)}</div>)}
    </div>
  );
}
