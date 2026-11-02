"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode, type RefObject } from "react";
import { useAuth } from "@/lib/auth/context";
import { downloadCsv } from "@/lib/csv";
import { DataError } from "@/lib/db/common";
import {
  countsToward,
  createMaterialRequest,
  deleteMaterialRequest,
  deleteReceipt,
  materialApproval,
  materialBalance,
  receiveMaterial,
  updateReceiptApproval,
  useMaterialRequests,
  type MaterialApproval,
  type MaterialBalance,
  type MaterialFile,
  type MaterialReceipt,
  type MaterialRequest,
} from "@/lib/db/materials";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate, formatDateTime, formatFileSize, todayInBangkok } from "@/lib/format";
import { Pill } from "@/components/ui";

// Material Request form: 3 ตารางเรียงต่อกันในหน้าเดียว อ่านจากเอกสาร Request ชุดเดียวกัน
//   1. Request — สร้างรายการขอเบิก (modal) แสดงสถานะ "รอรับของ"
//   2. รับของ — รายการ Request พร้อมปุ่ม "รับของ" (modal) และประวัติการรับแต่ละครั้ง
//   3. สถานะ / ยอดคงเหลือ — ยอดรับสะสม คงเหลือ และ timeline
// MasterAdmin ลบ Request หรือการรับแต่ละครั้งได้ — ลบการรับแล้วยอดคืนกลับไปที่ Request

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const day = (iso: string | null) => (iso ? formatDate(iso) : "–");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const STATUS_SECTION = "mr-status";

/** ทำงาน async (ลบ / เปลี่ยน approve) พร้อมเก็บข้อความผิดพลาด */
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

/** ตารางขอเบิก/รับของ/ยอดคงเหลือของวัสดุในโครงการ */
export function MaterialRequestBoard({ project }: { project: ProjectRecord }) {
  const { userProfile, can } = useAuth();
  const { requests, loading, error } = useMaterialRequests(project);
  const [query, setQuery] = useState("");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>();
  const action = useAction();
  const today = todayInBangkok();
  const actor = userProfile?.email ?? "";

  const balances = new Map(requests.map((r) => [r.id, materialBalance(r, today)]));
  const q = query.trim().toLowerCase();
  const shown = requests.filter((r) => !q || `${r.no} ${r.description} ${r.spec}`.toLowerCase().includes(q));
  // ตารางรับของ: รายการที่ยังรับไม่ครบขึ้นก่อน
  const toReceive = shown.toSorted((a, b) => Number(balances.get(a.id)!.remaining === 0) - Number(balances.get(b.id)!.remaining === 0));
  const outstanding = requests.filter((r) => balances.get(r.id)!.remaining > 0).length;
  const receiving = receivingId ? requests.find((r) => r.id === receivingId) : undefined;

  const canRemove = can("material.delete");
  const canApprove = can("material.approve");

  function pick(r: MaterialRequest) {
    setTimelineId(r.id);
    requestAnimationFrame(() => document.getElementById(STATUS_SECTION)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function removeRequest(r: MaterialRequest) {
    if (!confirm(`ลบ ${r.no} (${r.description}) พร้อมการรับของ ${r.receipts.length} ครั้งและไฟล์แนบทั้งหมด?`)) return;
    action.run(async () => {
      await deleteMaterialRequest(project.id, r);
      setNotice(`ลบ ${r.no} แล้ว`);
    });
  }

  function removeReceipt(r: MaterialRequest, x: MaterialReceipt) {
    if (!confirm(`ลบการรับ ${fmt(x.quantity)} ${r.unit} ของ ${r.no} (${day(x.receive_date)})? ยอดจะคืนกลับไปที่ Request`)) return;
    action.run(async () => {
      await deleteReceipt(project.id, r, x.id, actor);
      setNotice(`ลบการรับของ ${r.no} แล้ว — คืนยอด ${fmt(x.quantity)} ${r.unit}`);
    });
  }

  const changeApproval = (r: MaterialRequest, x: MaterialReceipt, approval: MaterialApproval) =>
    action.run(() => updateReceiptApproval(project.id, r.id, x.id, approval, actor));

  function exportCsv() {
    downloadCsv(
      `material-status-${project.code}-${today}.csv`,
      ["Request No.", "Description", "Spec", "Unit", "Quantity", "Require Schedule", "รับสะสม", "คงเหลือ", "รับล่าสุด", "สถานะ", "Remark"],
      requests.map((r) => {
        const b = balances.get(r.id)!;
        return [r.no, r.description, r.spec, r.unit, r.quantity, r.require_schedule, b.received, b.remaining, b.last_receive_date, b.status.label, r.remark];
      }),
    );
  }

  const removeProps: RemoveProps = canRemove ? { onRemove: removeRequest, removing: action.pending } : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-sm flex-1" placeholder="ค้นหา Request No. / Description / Spec — กรองทั้ง 3 ตาราง" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button type="button" className="btn px-2.5 py-1.5 text-xs" onClick={() => setQuery("")}>ล้างตัวกรอง</button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted">ยอด up to date {formatDateTime(new Date().toISOString())}</span>
      </div>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">โหลดข้อมูลไม่สำเร็จ: {error}</p>}
      {action.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{action.error}</p>}
      {notice && (
        <p className="flex items-center rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          <span className="flex-1">✓ {notice}</span>
          <button type="button" className="text-xs hover:underline" onClick={() => setNotice(undefined)}>ปิด</button>
        </p>
      )}

      <Section
        title="1. Request"
        count={`${requests.length} รายการ`}
        actions={can("material.request") && <button type="button" className="btn btn-primary" onClick={() => setRequestDialogOpen(true)}>+ เพิ่ม Request</button>}
      >
        {loading ? <Loading /> : <RequestTable requests={shown} balances={balances} onPick={pick} {...removeProps} />}
      </Section>

      <Section title="2. รับของ" count={`${outstanding} รายการรอรับ · กดแถวเพื่อดูประวัติการรับ`}>
        {loading ? (
          <Loading />
        ) : (
          <ReceiveTable
            requests={toReceive}
            balances={balances}
            openId={historyId}
            onToggle={(id) => setHistoryId((cur) => (cur === id ? null : id))}
            onReceive={can("material.receive") ? (r) => setReceivingId(r.id) : undefined}
            history={(r) => (
              <ReceiptHistory
                request={r}
                busy={action.pending}
                onApprove={canApprove ? (x, a) => changeApproval(r, x, a) : undefined}
                onRemove={canRemove ? (x) => removeReceipt(r, x) : undefined}
              />
            )}
          />
        )}
      </Section>

      <Section
        id={STATUS_SECTION}
        title="3. สถานะ / ยอดคงเหลือ"
        count={`${outstanding} รายการคงเหลือ`}
        actions={<button type="button" className="btn" onClick={exportCsv} disabled={requests.length === 0}>⬇ Export Excel</button>}
      >
        {loading ? (
          <Loading />
        ) : (
          <StatusTable
            requests={shown}
            balances={balances}
            openId={timelineId}
            onToggle={(id) => setTimelineId((cur) => (cur === id ? null : id))}
            {...removeProps}
          />
        )}
      </Section>

      {requestDialogOpen && (
        <RequestDialog project={project} actor={actor} onClose={() => setRequestDialogOpen(false)} onSaved={(no) => setNotice(`เพิ่ม ${no} แล้ว — สถานะรอรับของ`)} />
      )}
      {receiving && (
        <ReceiveDialog
          project={project}
          actor={actor}
          request={receiving}
          balance={balances.get(receiving.id)!}
          canApprove={canApprove}
          onClose={() => setReceivingId(null)}
          onSaved={(qty) => {
            setNotice(`รับของ ${receiving.no} จำนวน ${fmt(qty)} ${receiving.unit} แล้ว`);
            setHistoryId(receiving.id);
          }}
        />
      )}
    </div>
  );
}

function Section({ id, title, count, actions, children }: { id?: string; title: string; count: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-sm text-muted">{count}</span>
        <div className="flex-1" />
        {actions}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return <p className="py-8 text-center text-sm text-muted">กำลังโหลด...</p>;
}

/* ---------- ตาราง ---------- */

function Table({ groups, head, children, empty }: { groups: [string, number, string][]; head: ReactNode; children: ReactNode; empty: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-xs">
          <tr>
            {groups.map(([label, span, tone], i) => (
              <th key={i} colSpan={span} className={`px-3 py-1.5 font-semibold ${tone}`}>{label}</th>
            ))}
          </tr>
          <tr className="bg-surface-2 text-muted [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">{head}</tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={99} className="px-3 py-8 text-center text-muted">ยังไม่มีรายการ</td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

// สีกลุ่มคอลัมน์ตามไฟล์ Excel: ข้อมูลวัสดุ (ส้ม) · การขอเบิก (เหลือง) · การรับ (ฟ้า)
const G_ITEM = "bg-bad-soft text-bad";
const G_REQ = "bg-warn-soft text-warn";
const G_RECV = "bg-primary-soft text-primary";

/** ปุ่มลบ Request — ส่งมาเฉพาะผู้มีสิทธิ์ (MasterAdmin) */
type RemoveProps = { onRemove?: (r: MaterialRequest) => void; removing?: boolean };

function RemoveCell({ request, onRemove, removing }: RemoveProps & { request: MaterialRequest }) {
  if (!onRemove) return null;
  return (
    <td className="px-2 py-2 text-right">
      <button type="button" className="text-xs text-bad hover:underline disabled:opacity-50" disabled={removing} onClick={(e) => (e.stopPropagation(), onRemove(request))}>ลบ</button>
    </td>
  );
}

function RequestTable({ requests, balances, onPick, onRemove, removing }: { requests: MaterialRequest[]; balances: Map<string, MaterialBalance>; onPick: (r: MaterialRequest) => void } & RemoveProps) {
  return (
    <>
      <Table
        groups={[["ข้อมูลวัสดุ", 3, G_ITEM], ["การขอเบิก", 5, G_REQ], ["", onRemove ? 2 : 1, ""]]}
        head={<><th>Request No.</th><th>Description</th><th>Spec</th><th>Unit</th><th className="text-right">Quantity</th><th>Require Schedule</th><th>Remark</th><th>ไฟล์แนบ</th><th>สถานะ</th>{onRemove && <th />}</>}
        empty={requests.length === 0}
      >
        {requests.map((r) => {
          const b = balances.get(r.id)!;
          return (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2">
                <button type="button" className="font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline" onClick={() => onPick(r)}>{r.no}</button>
              </td>
              <td className="px-3 py-2">{r.description}</td>
              <td className="px-3 py-2 text-muted">{r.spec || "–"}</td>
              <td className="px-3 py-2">{r.unit}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(r.quantity)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{day(r.require_schedule)}</td>
              <td className="px-3 py-2 text-muted">{r.remark || "–"}</td>
              <td className="max-w-48 px-3 py-2"><FileLinks files={r.files} /></td>
              <td className="px-3 py-2"><Pill tone={b.status.tone}>{b.status.label}</Pill></td>
              <RemoveCell request={r} onRemove={onRemove} removing={removing} />
            </tr>
          );
        })}
      </Table>
      <p className="text-xs text-muted">กด Request No. เพื่อดูยอดคงเหลือและ timeline ในตารางที่ 3</p>
    </>
  );
}

function ReceiveTable({
  requests,
  balances,
  openId,
  onToggle,
  onReceive,
  history,
}: {
  requests: MaterialRequest[];
  balances: Map<string, MaterialBalance>;
  openId: string | null;
  onToggle: (id: string) => void;
  onReceive?: (r: MaterialRequest) => void;
  history: (r: MaterialRequest) => ReactNode;
}) {
  return (
    <Table
      groups={[["อ้างอิง Request", 4, G_ITEM], ["การรับของ", 4, G_RECV]]}
      head={<><th>Request No.</th><th>Description</th><th>Unit</th><th className="text-right">Quantity</th><th className="text-right">รับแล้ว</th><th className="text-right">คงเหลือ</th><th>รับล่าสุด</th><th>Action</th></>}
      empty={requests.length === 0}
    >
      {requests.map((r) => {
        const b = balances.get(r.id)!;
        const open = openId === r.id;
        return (
          <Fragment key={r.id}>
            <tr className="cursor-pointer border-t border-border hover:bg-surface-2" onClick={() => onToggle(r.id)} aria-expanded={open}>
              <td className="px-3 py-2 font-medium whitespace-nowrap">
                <span className="mr-1 inline-block w-3 text-muted">{open ? "▾" : "▸"}</span>
                {r.no}
                <span className="ml-1.5 text-xs font-normal text-muted">({r.receipts.length} ครั้ง)</span>
              </td>
              <td className="px-3 py-2">{r.description}</td>
              <td className="px-3 py-2">{r.unit}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(r.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ok">{fmt(b.received)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${b.remaining > 0 ? "text-warn" : "text-muted"}`}>{fmt(b.remaining)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{day(b.last_receive_date)}</td>
              <td className="px-3 py-2">
                {b.remaining === 0 ? (
                  <Pill tone="ok">รับครบ</Pill>
                ) : onReceive ? (
                  <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={(e) => (e.stopPropagation(), onReceive(r))}>รับของ</button>
                ) : (
                  <Pill tone={b.status.tone}>{b.status.label}</Pill>
                )}
              </td>
            </tr>
            {open && (
              <tr className="bg-surface-2">
                <td colSpan={8} className="px-4 py-3">{history(r)}</td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </Table>
  );
}

/** ประวัติการรับของของ Request หนึ่ง — ใหม่สุดอยู่บน */
function ReceiptHistory({
  request: r,
  busy,
  onApprove,
  onRemove,
}: {
  request: MaterialRequest;
  busy: boolean;
  onApprove?: (x: MaterialReceipt, approval: MaterialApproval) => void;
  onRemove?: (x: MaterialReceipt) => void;
}) {
  if (r.receipts.length === 0) return <p className="text-sm text-muted">ยังไม่มีการรับของ</p>;
  return (
    <ul className="divide-y divide-border">
      {r.receipts.toReversed().map((x) => {
        const a = materialApproval[x.approval];
        return (
          <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            <span className="w-20 text-xs text-muted">{day(x.receive_date)}</span>
            <b className={countsToward(x) ? "" : "text-muted line-through"}>รับ {fmt(x.quantity)} {r.unit}</b>
            <span className="text-muted">DO: {x.do_no || "–"}</span>
            {onApprove ? (
              <select className="dcr-cell w-auto" aria-label="Material Approve" value={x.approval} disabled={busy} onChange={(e) => onApprove(x, e.target.value as MaterialApproval)}>
                {Object.entries(materialApproval).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            ) : (
              <Pill tone={a.tone}>{a.label}</Pill>
            )}
            <span className="text-xs text-muted">ผู้รับ {x.received_by || "–"} · บันทึก {x.received_at ? formatDateTime(x.received_at) : "–"}</span>
            {x.remark && <span className="text-xs text-muted">· {x.remark}</span>}
            {x.files.length > 0 && <FileLinks files={x.files} inline />}
            <span className="flex-1" />
            {onRemove && (
              <button type="button" className="text-xs text-bad hover:underline disabled:opacity-50" disabled={busy} onClick={() => onRemove(x)}>ลบ (คืนยอด)</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StatusTable({
  requests,
  balances,
  openId,
  onToggle,
  onRemove,
  removing,
}: {
  requests: MaterialRequest[];
  balances: Map<string, MaterialBalance>;
  openId: string | null;
  onToggle: (id: string) => void;
} & RemoveProps) {
  return (
    <>
      <Table
        groups={[["Request", 3, G_ITEM], ["ขอเบิก", 2, G_REQ], ["การรับ", 3, G_RECV], ["", onRemove ? 2 : 1, ""]]}
        head={<><th>Request No.</th><th>Description</th><th>Unit</th><th className="text-right">Quantity</th><th>Require Schedule</th><th className="text-right">รับสะสม</th><th className="text-right">คงเหลือ</th><th>รับล่าสุด</th><th>สถานะ</th>{onRemove && <th />}</>}
        empty={requests.length === 0}
      >
        {requests.map((r) => {
          const b = balances.get(r.id)!;
          const open = openId === r.id;
          const pct = r.quantity > 0 ? Math.min(100, Math.round((b.received / r.quantity) * 100)) : 0;
          return (
            <Fragment key={r.id}>
              <tr className="cursor-pointer border-t border-border hover:bg-surface-2" onClick={() => onToggle(r.id)} aria-expanded={open}>
                <td className="px-3 py-2 font-medium whitespace-nowrap">
                  <span className="mr-1 inline-block w-3 text-muted">{open ? "▾" : "▸"}</span>
                  {r.no}
                </td>
                <td className="px-3 py-2">{r.description}</td>
                <td className="px-3 py-2">{r.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.quantity)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{day(r.require_schedule)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ok">
                  {fmt(b.received)}
                  <div className="mt-1 h-1 rounded-full bg-surface-2">
                    <div className="h-1 rounded-full bg-ok" style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${b.remaining > 0 ? "text-warn" : "text-muted"}`}>{fmt(b.remaining)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{day(b.last_receive_date)}</td>
                <td className="px-3 py-2"><Pill tone={b.status.tone}>{b.status.label}</Pill></td>
                <RemoveCell request={r} onRemove={onRemove} removing={removing} />
              </tr>
              {open && (
                <tr className="bg-surface-2">
                  <td colSpan={onRemove ? 10 : 9} className="px-4 py-4">
                    <Timeline request={r} balance={b} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </Table>
      <p className="text-xs text-muted">กดที่แถวเพื่อดู timeline ของ Request นั้น</p>
    </>
  );
}

const DOT: Record<string, string> = { request: "bg-warn", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };

function Timeline({ request: r, balance: b }: { request: MaterialRequest; balance: MaterialBalance }) {
  const events = r.receipts.map((x, i) => ({
    x,
    acc: r.receipts.slice(0, i + 1).reduce((s, y) => s + (countsToward(y) ? y.quantity : 0), 0),
  }));

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 text-xs font-semibold">Timeline {r.no}</div>
        <ol className="ml-1.5 space-y-3 border-l-2 border-border pl-5">
          {events.toReversed().map(({ x, acc }) => {
            const a = materialApproval[x.approval];
            return (
              <li key={x.id} className="relative">
                <span className={`absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-surface-2 ${DOT[a.tone]}`} />
                <div className="text-xs text-muted">
                  {x.received_at ? formatDateTime(x.received_at) : day(x.receive_date)} · {x.received_by} · DO {x.do_no || "–"}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>รับ {fmt(x.quantity)} {r.unit}</b>
                  <Pill tone={a.tone}>{a.label}</Pill>
                </div>
                <div className="text-xs text-muted">
                  {countsToward(x) ? `สะสม ${fmt(acc)} / ${fmt(r.quantity)} · คงเหลือ ${fmt(Math.max(0, r.quantity - acc))}` : "Rejected — ไม่นับเข้ายอด"}
                  {x.remark && ` · ${x.remark}`}
                </div>
                {x.files.length > 0 && <FileLinks files={x.files} />}
              </li>
            );
          })}
          <li className="relative">
            <span className={`absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-surface-2 ${DOT.request}`} />
            <div className="text-xs text-muted">{formatDateTime(r.created_at)} · {r.created_by} · กำหนดใช้ {day(r.require_schedule)}</div>
            <div className="text-sm"><b>Request {fmt(r.quantity)} {r.unit}</b> · {r.description}{r.spec && ` · ${r.spec}`}</div>
            {r.remark && <div className="text-xs text-muted">{r.remark}</div>}
            {r.files.length > 0 && <FileLinks files={r.files} />}
          </li>
        </ol>
      </div>

      <div className="space-y-1.5 self-start rounded-lg border border-border bg-surface p-3 text-sm">
        <div className="mb-1 text-xs font-semibold">ยอด up to date</div>
        <Row label="ขอเบิก" value={`${fmt(r.quantity)} ${r.unit}`} />
        <Row label="รับสะสม" value={fmt(b.received)} className="text-ok" />
        <Row label="จำนวนครั้งที่รับ" value={`${r.receipts.length} ครั้ง`} />
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
          <span>คงเหลือ</span>
          <span className={b.remaining > 0 ? "text-warn" : "text-muted"}>{fmt(b.remaining)} {r.unit}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${className}`}>{value}</span>
    </div>
  );
}

/** ลิงก์ไฟล์แนบ */
function FileLinks({ files, inline = false }: { files: MaterialFile[]; inline?: boolean }) {
  if (files.length === 0) return <span className="text-muted">–</span>;
  return (
    <ul className={inline ? "flex flex-wrap gap-x-3" : "space-y-0.5"}>
      {files.map((f) => (
        <li key={f.path} className="truncate">
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline" title={`${f.file_name} · ${formatFileSize(f.size)}`}>
            📎 {f.file_name}
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Modal ---------- */

/** กรอบ modal ของฟอร์ม — เปิดทันทีที่ render, ระหว่างบันทึกปิดไม่ได้ */
function Modal({
  dialogRef,
  title,
  subtitle,
  icon,
  error,
  pending,
  submitLabel,
  onSubmit,
  onClose,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  subtitle: string;
  icon: string;
  error?: string;
  pending: boolean;
  submitLabel: string;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = () => dialogRef.current?.close();
  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, [dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => pending && e.preventDefault()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-lg text-primary">{icon}</div>
          <div className="flex-1">
            <h2 className="font-bold">{title}</h2>
            <div className="text-xs text-muted">{subtitle}</div>
          </div>
          <button type="button" className="text-xl text-muted hover:text-text" aria-label="ปิด" onClick={close} disabled={pending}>×</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {children}
          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn" onClick={close} disabled={pending}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}

/** บันทึกใน modal — สำเร็จแล้วปิด modal */
function useModalSave(dialogRef: RefObject<HTMLDialogElement | null>) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (save: () => Promise<void>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await save();
        dialogRef.current?.close();
      } catch (e) {
        setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  };
  return { error, setError, pending, run };
}

/** เลือกไฟล์แนบหลายไฟล์ — ไฟล์ใหญ่เกินกำหนดถูกตัดออกพร้อมแจ้ง */
function FilePicker({ files, onChange, onError, disabled, hint }: { files: File[]; onChange: (files: File[]) => void; onError: (msg?: string) => void; disabled: boolean; hint: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  function pick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const tooBig = picked.filter((f) => f.size > MAX_FILE_SIZE);
    onError(tooBig.length ? `ไฟล์ใหญ่เกิน ${formatFileSize(MAX_FILE_SIZE)}: ${tooBig.map((f) => f.name).join(", ")}` : undefined);
    onChange([...files, ...picked.filter((f) => f.size <= MAX_FILE_SIZE)]);
    if (inputRef.current) inputRef.current.value = "";
  }
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">ไฟล์แนบ</h3>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm">
              <span>📎</span>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted">{formatFileSize(f.size)}</span>
              <button type="button" className="text-xs text-bad hover:underline" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))}>เอาออก</button>
            </li>
          ))}
        </ul>
      )}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      <button type="button" className="btn w-full border-dashed" disabled={disabled} onClick={() => inputRef.current?.click()}>
        📎 เลือกไฟล์ ({hint} — ไม่เกิน {formatFileSize(MAX_FILE_SIZE)} ต่อไฟล์)
      </button>
    </section>
  );
}

const blankRequest = { description: "", spec: "", unit: "", quantity: "", require_schedule: "", remark: "" };

function RequestDialog({ project, actor, onClose, onSaved }: { project: ProjectRecord; actor: string; onClose: () => void; onSaved: (no: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState(blankRequest);
  const [files, setFiles] = useState<File[]>([]);
  const { error, setError, pending, run } = useModalSave(dialogRef);
  const set = (k: keyof typeof blankRequest) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(v.quantity);
    if (!v.description.trim()) return setError("กรุณาใส่ Description");
    if (!v.unit.trim()) return setError("กรุณาใส่ Unit");
    if (!(quantity > 0)) return setError("Quantity ต้องมากกว่า 0");
    if (!v.require_schedule) return setError("กรุณาใส่ Require Schedule");
    const input = { description: v.description.trim(), spec: v.spec.trim(), unit: v.unit.trim(), quantity, require_schedule: v.require_schedule, remark: v.remark.trim() };
    run(async () => onSaved(await createMaterialRequest(project.id, input, files, actor)));
  }

  return (
    <Modal
      dialogRef={dialogRef}
      title="เพิ่ม Material Request"
      subtitle={`${project.code} · Request No. สร้างอัตโนมัติเมื่อบันทึก`}
      icon="+"
      error={error}
      pending={pending}
      submitLabel="บันทึก Request"
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-bad">ข้อมูลวัสดุ</h3>
        <div>
          <label className="label" htmlFor="mr-desc">Description *</label>
          <input id="mr-desc" className="input" placeholder="เช่น เหล็กเส้น DB12" maxLength={200} value={v.description} onChange={set("description")} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="mr-spec">Spec</label>
          <textarea id="mr-spec" className="input" rows={2} placeholder="เช่น SD40 ยาว 10 ม. มอก.24" maxLength={500} value={v.spec} onChange={set("spec")} />
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-warn">การขอเบิก</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="mr-unit">Unit *</label>
            <input id="mr-unit" className="input" placeholder="เส้น / ถุง / คิว" maxLength={30} value={v.unit} onChange={set("unit")} />
          </div>
          <div>
            <label className="label" htmlFor="mr-qty">Quantity *</label>
            <input id="mr-qty" className="input text-right" type="number" min="0" step="any" value={v.quantity} onChange={set("quantity")} />
          </div>
          <div>
            <label className="label" htmlFor="mr-sch">Require Schedule *</label>
            <input id="mr-sch" className="input" type="date" value={v.require_schedule} onChange={set("require_schedule")} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="mr-remark">Remark</label>
          <textarea id="mr-remark" className="input" rows={3} placeholder="เช่น ใช้งานฐานราก F1-F6" maxLength={1000} value={v.remark} onChange={set("remark")} />
        </div>
      </section>
      <FilePicker files={files} onChange={setFiles} onError={setError} disabled={pending} hint="แบบ, ใบเสนอราคา, รูป ฯลฯ" />
    </Modal>
  );
}

function ReceiveDialog({
  project,
  actor,
  request: r,
  balance: b,
  canApprove,
  onClose,
  onSaved,
}: {
  project: ProjectRecord;
  actor: string;
  request: MaterialRequest;
  balance: MaterialBalance;
  /** ผู้ไม่มีสิทธิ์ Approve บันทึกเป็น Pending (ยังนับเข้ายอด) */
  canApprove: boolean;
  onClose: () => void;
  onSaved: (quantity: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState({ quantity: "", receive_date: todayInBangkok(), do_no: "", approval: (canApprove ? "approved" : "pending") as MaterialApproval, remark: "" });
  const [files, setFiles] = useState<File[]>([]);
  const { error, setError, pending, run } = useModalSave(dialogRef);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(v.quantity);
    if (!(quantity > 0)) return setError("จำนวนรับต้องมากกว่า 0");
    if (v.approval !== "rejected" && quantity > b.remaining) return setError(`รับเกินยอดคงเหลือ — เหลือรับได้อีก ${fmt(b.remaining)} ${r.unit}`);
    if (!v.receive_date) return setError("กรุณาใส่ Actual Receive Date");
    const input = { quantity, receive_date: v.receive_date, do_no: v.do_no.trim(), approval: v.approval, remark: v.remark.trim() };
    run(async () => {
      await receiveMaterial(project.id, r.id, input, files, actor);
      onSaved(quantity);
    });
  }

  return (
    <Modal
      dialogRef={dialogRef}
      title={`รับของ ${r.no}`}
      subtitle={`${r.description}${r.spec ? ` · ${r.spec}` : ""}`}
      icon="📦"
      error={error}
      pending={pending}
      submitLabel="บันทึกรับของ"
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-center text-sm">
        <div><div className="text-xs text-muted">ขอเบิก</div><b>{fmt(r.quantity)} {r.unit}</b></div>
        <div><div className="text-xs text-muted">รับแล้ว</div><b className="text-ok">{fmt(b.received)}</b></div>
        <div><div className="text-xs text-muted">คงเหลือ</div><b className="text-warn">{fmt(b.remaining)} {r.unit}</b></div>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-primary">รายละเอียดการรับของ</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rc-qty">จำนวนรับ ({r.unit}) *</label>
            <input id="rc-qty" className="input text-right" type="number" min="0" step="any" value={v.quantity} onChange={set("quantity")} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="rc-date">Actual Receive Date *</label>
            <input id="rc-date" className="input" type="date" value={v.receive_date} onChange={set("receive_date")} />
          </div>
          <div>
            <label className="label" htmlFor="rc-do">เลขที่ DO / ใบส่งของ</label>
            <input id="rc-do" className="input" maxLength={60} value={v.do_no} onChange={set("do_no")} />
          </div>
          <div>
            <label className="label" htmlFor="rc-ap">Material Approve</label>
            <select id="rc-ap" className="input" value={v.approval} onChange={set("approval")} disabled={!canApprove}>
              {Object.entries(materialApproval).map(([k, a]) => (
                <option key={k} value={k}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="rc-remark">Remark</label>
          <textarea id="rc-remark" className="input" rows={2} maxLength={1000} value={v.remark} onChange={set("remark")} />
        </div>
        <p className="text-xs text-muted">Rejected = ของไม่ผ่าน ไม่นับเข้ายอดรับ · สถานะอื่นนับเข้ายอดทันที</p>
      </section>
      <FilePicker files={files} onChange={setFiles} onError={setError} disabled={pending} hint="ใบส่งของ, รูปถ่าย ฯลฯ" />
      <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted">ผู้รับ: <b className="text-text">{actor}</b> · ระบบบันทึกวันเวลาที่กดรับให้อัตโนมัติ</p>
    </Modal>
  );
}
