"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import { downloadCsv } from "@/lib/csv";
import { DataError } from "@/lib/db/common";
import {
  createMaterialReceipt,
  createMaterialRequest,
  materialApproval,
  materialBalance,
  updateReceiptApproval,
  useMaterials,
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

// Material Request form: 3 ตารางเรียงต่อกันในหน้าเดียว — 1. Request  2. รับของ  3. สถานะ / ยอดสะสม — เชื่อมกันด้วย Request No.
// กด Request No. ในตาราง 1/2 → เลื่อนไปตาราง 3 และเปิด timeline ของรายการนั้น

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const day = (iso: string | null) => (iso ? formatDate(iso) : "–");

const blankRequest = { description: "", spec: "", unit: "", quantity: "", require_schedule: "", remark: "" };

const SECTION_ID = { request: "mr-request", receive: "mr-receive", status: "mr-status" } as const;

/** เลื่อนไปที่ตาราง — รอ render รอบถัดไปก่อน (ฟอร์ม/timeline ที่เพิ่งเปิดจะได้อยู่ในหน้าแล้ว) */
const scrollToSection = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));

/** ตารางขอเบิก/รับของ/ยอดสะสมของวัสดุในโครงการ */
export function MaterialRequestBoard({ project }: { project: ProjectRecord }) {
  const { userProfile, can } = useAuth();
  const { requests, receipts, loading, error } = useMaterials(project);
  const [query, setQuery] = useState("");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [receiveFormOpen, setReceiveFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayInBangkok();
  const actor = userProfile?.email ?? "";
  const approval = useApproval(project, actor);

  const byId = new Map(requests.map((r) => [r.id, r]));
  const balances = new Map(requests.map((r) => [r.id, materialBalance(r, receipts, today)]));
  const q = query.trim().toLowerCase();
  const matches = (r: MaterialRequest | undefined) => !q || (!!r && `${r.no} ${r.description} ${r.spec}`.toLowerCase().includes(q));
  const outstanding = requests.filter((r) => balances.get(r.id)!.status.tone !== "ok");

  function pick(r: MaterialRequest) {
    setOpenId(r.id);
    scrollToSection(SECTION_ID.status);
  }

  function exportCsv() {
    downloadCsv(
      `material-status-${project.code}-${today}.csv`,
      ["Request No.", "Description", "Spec", "Unit", "Quantity", "Require Schedule", "รับสะสม (Approved)", "รอตรวจ (Pending)", "คงค้าง", "รับล่าสุด", "สถานะ", "Remark"],
      requests.map((r) => {
        const b = balances.get(r.id)!;
        return [r.no, r.description, r.spec, r.unit, r.quantity, r.require_schedule, b.received, b.pending, b.remaining, b.last_receive_date, b.status.label, r.remark];
      }),
    );
  }

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

      <Section
        id={SECTION_ID.request}
        title="1. Request"
        count={`${requests.length} รายการ`}
        actions={
          can("material.request") && (
            <button type="button" className="btn btn-primary" onClick={() => setRequestDialogOpen(true)}>+ เพิ่ม Request</button>
          )
        }
      >
        {notice && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">✓ {notice}</p>}
        {loading ? <Loading /> : <RequestTable requests={requests.filter(matches)} balances={balances} onPick={pick} />}
      </Section>

      {requestDialogOpen && (
        <RequestDialog project={project} actor={actor} onClose={() => setRequestDialogOpen(false)} onSaved={(no) => setNotice(`เพิ่ม ${no} แล้ว`)} />
      )}

      <Section
        id={SECTION_ID.receive}
        title="2. รับของ"
        count={`${receipts.length} ครั้ง`}
        actions={
          can("material.receive") && (
            <button type="button" className="btn btn-primary" onClick={() => setReceiveFormOpen((o) => !o)}>{receiveFormOpen ? "ปิดฟอร์ม" : "+ รับของ"}</button>
          )
        }
      >
        {receiveFormOpen && (
          <ReceiveForm project={project} actor={actor} requests={outstanding} balances={balances} canApprove={can("material.approve")} />
        )}
        {loading ? (
          <Loading />
        ) : (
          <ReceiveTable
            receipts={receipts.filter((x) => matches(byId.get(x.request_id)))}
            byId={byId}
            approval={can("material.approve") ? approval : undefined}
            onPick={pick}
          />
        )}
      </Section>

      <Section
        id={SECTION_ID.status}
        title="3. สถานะ / ยอดสะสม"
        count={`${outstanding.length} รายการค้างรับ`}
        actions={<button type="button" className="btn" onClick={exportCsv} disabled={requests.length === 0}>⬇ Export Excel</button>}
      >
        {approval.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{approval.error}</p>}
        {loading ? (
          <Loading />
        ) : (
          <StatusTable
            requests={requests.filter(matches)}
            receipts={receipts}
            balances={balances}
            openId={openId}
            onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
            approval={can("material.approve") ? approval : undefined}
            renderReceive={
              can("material.receive")
                ? (r) => <ReceiveForm project={project} actor={actor} requests={[r]} balances={balances} canApprove={can("material.approve")} fixed />
                : undefined
            }
          />
        )}
      </Section>
    </div>
  );
}

function Section({ id, title, count, actions, children }: { id: string; title: string; count: string; actions?: ReactNode; children: ReactNode }) {
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

function RequestNoLink({ request, onPick }: { request: MaterialRequest | undefined; onPick: (r: MaterialRequest) => void }) {
  if (!request) return <span className="text-muted">ไม่พบ Request</span>;
  return (
    <button type="button" className="font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline" onClick={() => onPick(request)}>
      {request.no}
    </button>
  );
}

function RequestTable({ requests, balances, onPick }: { requests: MaterialRequest[]; balances: Map<string, MaterialBalance>; onPick: (r: MaterialRequest) => void }) {
  return (
    <>
      <Table
        groups={[["ข้อมูลวัสดุ", 3, G_ITEM], ["การขอเบิก", 5, G_REQ], ["", 1, ""]]}
        head={<><th>Request No.</th><th>Description</th><th>Spec</th><th>Unit</th><th className="text-right">Quantity</th><th>Require Schedule</th><th>Remark</th><th>ไฟล์แนบ</th><th>สถานะ</th></>}
        empty={requests.length === 0}
      >
        {requests.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="px-3 py-2"><RequestNoLink request={r} onPick={onPick} /></td>
            <td className="px-3 py-2">{r.description}</td>
            <td className="px-3 py-2 text-muted">{r.spec || "–"}</td>
            <td className="px-3 py-2">{r.unit}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(r.quantity)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{day(r.require_schedule)}</td>
            <td className="px-3 py-2 text-muted">{r.remark || "–"}</td>
            <td className="max-w-48 px-3 py-2"><FileLinks files={r.files} /></td>
            <td className="px-3 py-2"><Pill tone={balances.get(r.id)!.status.tone}>{balances.get(r.id)!.status.label}</Pill></td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted">กด Request No. เพื่อดูสถานะและ timeline ในตารางที่ 3</p>
    </>
  );
}

/** เปลี่ยนผล Material Approve ของการรับของ — ใช้ทั้งตารางรับของและ timeline */
function useApproval(project: ProjectRecord, actor: string) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const change = (id: string, value: MaterialApproval) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await updateReceiptApproval(project.id, id, value, actor);
      } catch (e) {
        setError("บันทึก Material Approve ไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  };
  return { change, error, pending };
}

type Approval = ReturnType<typeof useApproval>;

function ReceiveTable({
  receipts,
  byId,
  approval,
  onPick,
}: {
  receipts: MaterialReceipt[];
  byId: Map<string, MaterialRequest>;
  /** undefined = ไม่มีสิทธิ์เปลี่ยน */
  approval?: Approval;
  onPick: (r: MaterialRequest) => void;
}) {
  return (
    <>
      {approval?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{approval.error}</p>}
      <Table
        groups={[["อ้างอิง Request", 2, G_ITEM], ["การรับของ", 5, G_RECV]]}
        head={<><th>Request No.</th><th>Description</th><th>Actual Receive Date</th><th className="text-right">จำนวนรับ</th><th>เลขที่ DO</th><th>Material Approve</th><th>Remark</th></>}
        empty={receipts.length === 0}
      >
        {receipts.map((x) => {
          const r = byId.get(x.request_id);
          return (
            <tr key={x.id} className="border-t border-border">
              <td className="px-3 py-2"><RequestNoLink request={r} onPick={onPick} /></td>
              <td className="px-3 py-2">{r?.description ?? "–"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{day(x.receive_date)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(x.quantity)} <span className="text-xs text-muted">{r?.unit}</span>
              </td>
              <td className="px-3 py-2">{x.do_no || "–"}</td>
              <td className="px-3 py-2">
                {approval ? (
                  <select
                    className="dcr-cell w-auto"
                    aria-label="Material Approve"
                    value={x.approval}
                    disabled={approval.pending}
                    onChange={(e) => approval.change(x.id, e.target.value as MaterialApproval)}
                  >
                    {Object.entries(materialApproval).map(([k, a]) => (
                      <option key={k} value={k}>{a.label}</option>
                    ))}
                  </select>
                ) : (
                  <Pill tone={materialApproval[x.approval].tone}>{materialApproval[x.approval].label}</Pill>
                )}
              </td>
              <td className="px-3 py-2 text-muted">{x.remark || "–"}</td>
            </tr>
          );
        })}
      </Table>
      <p className="text-xs text-muted">นับเข้ายอดรับสะสมเฉพาะรายการที่ Material Approve = Approved</p>
    </>
  );
}

function StatusTable({
  requests,
  receipts,
  balances,
  openId,
  onToggle,
  approval,
  renderReceive,
}: {
  requests: MaterialRequest[];
  receipts: MaterialReceipt[];
  balances: Map<string, MaterialBalance>;
  openId: string | null;
  onToggle: (id: string) => void;
  approval?: Approval;
  renderReceive?: (r: MaterialRequest) => ReactNode;
}) {
  return (
    <>
      <Table
        groups={[["Request", 3, G_ITEM], ["ขอเบิก", 2, G_REQ], ["การรับ", 4, G_RECV], ["", 1, ""]]}
        head={<><th>Request No.</th><th>Description</th><th>Unit</th><th className="text-right">Quantity</th><th>Require Schedule</th><th className="text-right">รับสะสม (Approved)</th><th className="text-right">รอตรวจ (Pending)</th><th className="text-right">คงค้าง</th><th>รับล่าสุด</th><th>สถานะ</th></>}
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
                <td className={`px-3 py-2 text-right tabular-nums ${b.pending > 0 ? "text-warn" : "text-muted"}`}>{fmt(b.pending)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${b.remaining > 0 ? "text-warn" : "text-muted"}`}>{fmt(b.remaining)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{day(b.last_receive_date)}</td>
                <td className="px-3 py-2"><Pill tone={b.status.tone}>{b.status.label}</Pill></td>
              </tr>
              {open && (
                <tr className="bg-surface-2">
                  <td colSpan={10} className="px-4 py-4">
                    <Timeline
                      request={r}
                      receipts={receipts.filter((x) => x.request_id === r.id)}
                      balance={b}
                      approval={approval}
                      receiveForm={b.remaining > 0 ? renderReceive?.(r) : undefined}
                    />
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

function Timeline({
  request: r,
  receipts,
  balance: b,
  approval,
  receiveForm,
}: {
  request: MaterialRequest;
  receipts: MaterialReceipt[];
  balance: MaterialBalance;
  approval?: Approval;
  receiveForm?: ReactNode;
}) {
  // เรียงเก่า → ใหม่เพื่อคำนวณยอดสะสม ณ แต่ละครั้ง
  const ordered = receipts.toSorted((a, b) => a.receive_date.localeCompare(b.receive_date) || a.created_at.localeCompare(b.created_at));
  const events = ordered.map((x, i) => ({
    x,
    acc: ordered.slice(0, i + 1).reduce((s, y) => s + (y.approval === "approved" ? y.quantity : 0), 0),
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
                <div className="text-xs text-muted">{day(x.receive_date)} · {x.do_no || "ไม่มีเลข DO"} · {x.created_by}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>รับ {fmt(x.quantity)} {r.unit}</b>
                  <Pill tone={a.tone}>{a.label}</Pill>
                  {approval && x.approval === "pending" && (
                    <>
                      <button type="button" className="btn px-2 py-0.5 text-xs text-ok" disabled={approval.pending} onClick={() => approval.change(x.id, "approved")}>✓ Approve</button>
                      <button type="button" className="btn px-2 py-0.5 text-xs text-bad" disabled={approval.pending} onClick={() => approval.change(x.id, "rejected")}>✕ Reject</button>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {x.approval === "approved" ? `สะสม ${fmt(acc)} / ${fmt(r.quantity)} · คงค้าง ${fmt(Math.max(0, r.quantity - acc))}` : x.approval === "pending" ? "รอตรวจ — ยังไม่นับเข้ายอดสะสม" : "ไม่นับเข้ายอดสะสม"}
                  {x.remark && ` · ${x.remark}`}
                </div>
              </li>
            );
          })}
          <li className="relative">
            <span className={`absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-surface-2 ${DOT.request}`} />
            <div className="text-xs text-muted">{formatDateTime(r.created_at)} · {r.created_by} · กำหนดใช้ {day(r.require_schedule)}</div>
            <div className="text-sm"><b>Request {fmt(r.quantity)} {r.unit}</b> · {r.description}{r.spec && ` · ${r.spec}`}</div>
            {r.remark && <div className="text-xs text-muted">{r.remark}</div>}
            {r.files.length > 0 && (
              <div className="mt-1">
                <FileLinks files={r.files} />
              </div>
            )}
          </li>
        </ol>
      </div>

      <div className="space-y-3 self-start">
      <div className="space-y-1.5 rounded-lg border border-border bg-surface p-3 text-sm">
        <div className="mb-1 text-xs font-semibold">ยอด up to date</div>
        <Row label="ขอเบิก" value={`${fmt(r.quantity)} ${r.unit}`} />
        <Row label="รับแล้ว (Approved)" value={fmt(b.received)} className="text-ok" />
        <Row label="รอตรวจ (Pending)" value={fmt(b.pending)} />
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
          <span>คงค้าง</span>
          <span className={b.remaining > 0 ? "text-warn" : "text-muted"}>{fmt(b.remaining)} {r.unit}</span>
        </div>
      </div>
      {receiveForm && (
        <div>
          <div className="mb-1.5 text-xs font-semibold">บันทึกรับของ {r.no}</div>
          {receiveForm}
        </div>
      )}
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

/* ---------- ฟอร์ม ---------- */

function useSave(onDone: (no?: string) => void) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (save: () => Promise<string | undefined>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        onDone(await save());
      } catch (e) {
        setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  };
  return { error, setError, pending, run };
}

function FormBox({ onSubmit, error, children }: { onSubmit: (e: FormEvent) => void; error?: string; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      {children}
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** ฟอร์มเพิ่ม Request พร้อมไฟล์แนบ — เปิดเป็น modal ทันทีที่ render, บันทึกแล้วปิดและเรียก onClose */
function RequestDialog({ project, actor, onClose, onSaved }: { project: ProjectRecord; actor: string; onClose: () => void; onSaved: (no: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(blankRequest);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof blankRequest) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const tooBig = picked.filter((f) => f.size > MAX_FILE_SIZE);
    setError(tooBig.length ? `ไฟล์ใหญ่เกิน ${formatFileSize(MAX_FILE_SIZE)}: ${tooBig.map((f) => f.name).join(", ")}` : undefined);
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_FILE_SIZE)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(v.quantity);
    if (!v.description.trim()) return setError("กรุณาใส่ Description");
    if (!v.unit.trim()) return setError("กรุณาใส่ Unit");
    if (!(quantity > 0)) return setError("Quantity ต้องมากกว่า 0");
    if (!v.require_schedule) return setError("กรุณาใส่ Require Schedule");
    const input = { description: v.description.trim(), spec: v.spec.trim(), unit: v.unit.trim(), quantity, require_schedule: v.require_schedule, remark: v.remark.trim() };
    setError(undefined);
    startTransition(async () => {
      try {
        onSaved(await createMaterialRequest(project.id, input, files, actor));
        close();
      } catch (err) {
        setError(err instanceof DataError ? err.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(err));
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => pending && e.preventDefault()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={onSubmit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-lg text-primary">+</div>
          <div className="flex-1">
            <h2 className="font-bold">เพิ่ม Material Request</h2>
            <div className="text-xs text-muted">{project.code} · Request No. สร้างอัตโนมัติเมื่อบันทึก</div>
          </div>
          <button type="button" className="text-xl text-muted hover:text-text" aria-label="ปิด" onClick={close} disabled={pending}>
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
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

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">ไฟล์แนบ</h3>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm">
                    <span>📎</span>
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted">{formatFileSize(f.size)}</span>
                    <button type="button" className="text-xs text-bad hover:underline" disabled={pending} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}>เอาออก</button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
            <button type="button" className="btn w-full border-dashed" disabled={pending} onClick={() => fileInputRef.current?.click()}>
              📎 เลือกไฟล์ (แบบ, ใบเสนอราคา, รูป ฯลฯ — ไม่เกิน {formatFileSize(MAX_FILE_SIZE)} ต่อไฟล์)
            </button>
          </section>

          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn" onClick={close} disabled={pending}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? (files.length ? "กำลังอัปโหลดและบันทึก..." : "กำลังบันทึก...") : "บันทึก Request"}</button>
        </div>
      </form>
    </dialog>
  );
}

/** ลิงก์ไฟล์แนบของ Request */
function FileLinks({ files }: { files: MaterialFile[] }) {
  if (files.length === 0) return <span className="text-muted">–</span>;
  return (
    <ul className="space-y-0.5">
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

function ReceiveForm({
  project,
  actor,
  requests,
  balances,
  canApprove,
  fixed = false,
}: {
  project: ProjectRecord;
  actor: string;
  requests: MaterialRequest[];
  balances: Map<string, MaterialBalance>;
  /** ผู้มีสิทธิ์ Approve รับของแล้วนับเข้ายอดได้ทันที — คนอื่นบันทึกเป็น Pending รอตรวจ */
  canApprove: boolean;
  /** รับของของ Request เดียว (ใน timeline) — ไม่ต้องเลือก Request No. */
  fixed?: boolean;
}) {
  const blank = { receive_date: todayInBangkok(), quantity: "", do_no: "", approval: (canApprove ? "approved" : "pending") as MaterialApproval, remark: "" };
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "");
  const [v, setV] = useState(blank);
  const [saved, setSaved] = useState<string>();
  const { error, setError, pending, run } = useSave(setSaved);
  const r = requests.find((x) => x.id === requestId) ?? requests[0];
  const b = r ? balances.get(r.id)! : null;
  // ยอดที่ยังรับได้ = คงค้าง − ที่รอตรวจอยู่ (กันบันทึกซ้ำก่อนอนุมัติ)
  const receivable = b ? Math.max(0, b.remaining - b.pending) : 0;

  if (!r || !b) return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">ไม่มี Request ที่ค้างรับ</p>;
  if (fixed && receivable === 0 && !saved)
    return <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">ยอดที่เหลือรอตรวจ (Pending) อยู่ทั้งหมด — Approve ก่อนจึงจะนับเข้ายอดรับ</p>;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!r) return;
    const quantity = Number(v.quantity);
    setSaved(undefined);
    if (!v.receive_date) return setError("กรุณาใส่ Actual Receive Date");
    if (!(quantity > 0)) return setError("จำนวนรับต้องมากกว่า 0");
    if (quantity > receivable) return setError(`รับเกินยอดคงค้าง — รับได้อีก ${fmt(receivable)} ${r.unit}`);
    const input = { request_id: r.id, receive_date: v.receive_date, quantity, do_no: v.do_no.trim(), approval: v.approval, remark: v.remark.trim() };
    run(async () => {
      await createMaterialReceipt(project.id, input, actor);
      setV(blank);
      return `บันทึกรับ ${r.no} จำนวน ${fmt(quantity)} ${r.unit} แล้ว` + (input.approval === "approved" ? "" : ` — สถานะ ${materialApproval[input.approval].label} ยังไม่นับเข้ายอดรับสะสม`);
    });
  }

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <FormBox onSubmit={onSubmit} error={error}>
      <div className={`grid gap-2 ${fixed ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr]"}`}>
        {!fixed && (
          <select className="input" aria-label="Request No." value={r.id} onChange={(e) => setRequestId(e.target.value)}>
            {requests.map((x) => (
              <option key={x.id} value={x.id}>{x.no} · {x.description}</option>
            ))}
          </select>
        )}
        <input className="input" type="date" aria-label="Actual Receive Date" title="Actual Receive Date" value={v.receive_date} onChange={set("receive_date")} />
        <input className="input text-right" type="number" min="0" step="any" aria-label="จำนวนรับ" placeholder={`จำนวนรับ (${r.unit}) *`} value={v.quantity} onChange={set("quantity")} />
        <input className="input" aria-label="เลขที่ DO" placeholder="เลขที่ DO / ใบส่งของ" maxLength={60} value={v.do_no} onChange={set("do_no")} />
        <select className="input" aria-label="Material Approve" value={v.approval} onChange={set("approval")} disabled={!canApprove}>
          {Object.entries(materialApproval).map(([k, a]) => (
            <option key={k} value={k}>{a.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input flex-1" aria-label="Remark" placeholder="Remark" maxLength={300} value={v.remark} onChange={set("remark")} />
        <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
      </div>
      <div className="text-xs text-muted">
        {!fixed && <>{r.description}{r.spec && ` · ${r.spec}`} · ขอ {fmt(r.quantity)} {r.unit} · รับแล้ว {fmt(b.received)} · </>}
        {b.pending > 0 && `รอตรวจ ${fmt(b.pending)} · `}
        <b className="text-warn">รับได้อีก {fmt(receivable)} {r.unit}</b>
        {!canApprove && " · บันทึกเป็น Pending — นับเข้ายอดเมื่อผู้มีสิทธิ์ Approve"}
      </div>
      {saved && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">✓ {saved}</p>}
    </FormBox>
  );
}
