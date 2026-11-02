import type { ProjectRecord } from "@/lib/db/projects";
import { lastEntry, requisitionPriority, requisitionStatus, type ApprovalEntry, type Requisition } from "@/lib/db/requisitions";
import { formatDate, formatDateTime } from "@/lib/format";

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const day = (iso: string) => (iso ? formatDate(iso) : "–");

/**
 * ใบขอเบิกวัสดุ (Material Requisition) — เอกสารมาตรฐานสำหรับพิมพ์ / บันทึกเป็น PDF (A4 แนวตั้ง)
 * ช่องลายเซ็น: ผู้ขอเบิก = ผู้กดส่งอนุมัติ · ผู้อนุมัติ = ผู้กดอนุมัติ/ไม่อนุมัติ (ชื่อ + วันเวลาจากระบบ)
 */
export function RequisitionDocument({ project, r }: { project: ProjectRecord; r: Requisition }) {
  const status = requisitionStatus[r.status];
  const submitted = lastEntry(r, "submit");
  const decision = r.status === "approved" ? lastEntry(r, "approve") : r.status === "rejected" ? lastEntry(r, "reject") : undefined;
  // ใบที่ยังไม่ผ่านการอนุมัติพิมพ์ได้ แต่มีลายน้ำบอกสถานะ ไม่ให้ใช้เบิกของจริงโดยไม่ตั้งใจ
  const notFinal = r.status !== "approved";

  return (
    <div className="requisition-doc relative mx-auto max-w-[210mm] rounded-sm border border-border bg-surface p-8 text-[12px] leading-snug shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      {notFinal && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span className="-rotate-30 select-none text-7xl font-bold tracking-widest text-text opacity-[0.05]">{status.label}</span>
        </div>
      )}

      <header className="flex items-start justify-between gap-4 border-b-2 border-text pb-3">
        <div>
          <h2 className="text-lg font-bold">ใบขอเบิกวัสดุ</h2>
          <div className="text-muted">Material Requisition</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold">{r.no}</div>
          <div className="text-muted">สถานะ: {status.label}</div>
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1.5">
        <Field label="โครงการ" value={`${project.code} · ${project.name}`} wide />
        <Field label="วันที่ขอเบิก" value={day(r.request_date)} />
        <Field label="ต้องการใช้วันที่" value={day(r.require_date)} />
        <Field label="ผู้ขอเบิก" value={r.requester_name || "–"} />
        <Field label="ความสำคัญ" value={requisitionPriority[r.priority]} />
        <Field label="ส่วนงาน / ตำแหน่งที่ใช้" value={r.work_area || "–"} wide />
        <Field label="วัตถุประสงค์" value={r.purpose || "–"} wide />
      </dl>

      <table className="mt-4 w-full border-collapse [&_td]:border [&_td]:border-text/40 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-text/40 [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-semibold">
        <thead>
          <tr>
            <th className="w-9">ลำดับ</th>
            <th className="text-left">รายการ (Description)</th>
            <th className="text-left">รายละเอียด / Spec</th>
            <th className="w-16">หน่วย</th>
            <th className="w-20">จำนวน</th>
            <th className="text-left">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((i, n) => (
            <tr key={i.id} className="break-inside-avoid">
              <td className="text-center">{n + 1}</td>
              <td>{i.description}</td>
              <td className="whitespace-pre-line">{i.spec}</td>
              <td className="text-center">{i.unit}</td>
              <td className="text-right">{fmt(i.quantity)}</td>
              <td className="whitespace-pre-line">{i.remark}</td>
            </tr>
          ))}
          {/* เติมแถวว่างให้ฟอร์มดูเป็นมาตรฐานเท่ากันทุกใบ */}
          {Array.from({ length: Math.max(0, 8 - r.items.length) }, (_, n) => (
            <tr key={`blank-${n}`} aria-hidden>
              <td className="h-7">&nbsp;</td><td /><td /><td /><td /><td />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-right text-muted">รวม {r.items.length} รายการ</div>

      {r.status === "rejected" && decision?.comment && (
        <p className="mt-3 rounded-sm border border-bad px-3 py-2 text-bad">เหตุผลที่ไม่อนุมัติ: {decision.comment}</p>
      )}
      {r.status === "approved" && decision?.comment && <p className="mt-3 text-muted">หมายเหตุผู้อนุมัติ: {decision.comment}</p>}

      <div className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid">
        <Signature title="ผู้ขอเบิก" entry={submitted} fallbackName={r.requester_name} caption="ส่งขออนุมัติ" />
        <Signature title="ผู้อนุมัติ" entry={decision} caption={r.status === "rejected" ? "ไม่อนุมัติ" : "อนุมัติ"} />
      </div>
      <p className="mt-6 text-center text-[10px] text-muted">เอกสารนี้สร้างและอนุมัติผ่านระบบ — ชื่อและวันเวลาในช่องลงนามบันทึกโดยระบบ</p>
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`border-b border-dotted border-text/40 font-medium ${wide ? "col-span-3" : ""}`}>{value}</dd>
    </>
  );
}

function Signature({ title, entry, caption, fallbackName }: { title: string; entry?: ApprovalEntry; caption: string; fallbackName?: string }) {
  return (
    <div className="text-center">
      <div className="mb-1 flex h-14 items-end justify-center border-b border-text/60 pb-1 text-sm font-semibold">{entry?.name ?? ""}</div>
      <div>( {entry?.name || fallbackName || "                "} )</div>
      <div className="font-semibold">{title}</div>
      <div className="text-muted">{entry ? `${caption} ${formatDateTime(entry.at)}` : "วันที่ ........./........./........."}</div>
    </div>
  );
}
