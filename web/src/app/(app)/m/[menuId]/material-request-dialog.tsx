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
  type MaterialReceipt,
  type MaterialRequest,
} from "@/lib/db/materials";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate, formatDateTime, todayInBangkok } from "@/lib/format";
import { Pill } from "@/components/ui";

// Material Request form: 3 ตาราง — 1. Request  2. รับของ  3. สถานะ / ยอดสะสม — เชื่อมกันด้วย Request No.
// กด Request No. ในตาราง 1/2 → ไปตาราง 3 และเปิด timeline ของรายการนั้น

type Tab = "request" | "receive" | "status";

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const day = (iso: string | null) => (iso ? formatDate(iso) : "–");

const blankRequest = { description: "", spec: "", unit: "", quantity: "", require_schedule: "", remark: "" };

/** ตารางขอเบิก/รับของ/ยอดสะสมของวัสดุในโครงการ — เปิดเป็น modal ทันทีที่ render */
export function MaterialRequestDialog({ project, onClose }: { project: ProjectRecord; onClose: () => void }) {
  const { userProfile, can } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { requests, receipts, loading, error } = useMaterials(project);
  const [tab, setTab] = useState<Tab>("request");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [receiveFor, setReceiveFor] = useState<string>("");
  const today = todayInBangkok();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  const byId = new Map(requests.map((r) => [r.id, r]));
  const balances = new Map(requests.map((r) => [r.id, materialBalance(r, receipts, today)]));
  const q = query.trim().toLowerCase();
  const matches = (r: MaterialRequest | undefined) => !q || (!!r && `${r.no} ${r.description} ${r.spec}`.toLowerCase().includes(q));
  const outstanding = requests.filter((r) => balances.get(r.id)!.status.tone !== "ok");

  function go(next: Tab, request?: MaterialRequest) {
    setTab(next);
    setFormOpen(false);
    setQuery(request?.no ?? "");
    setOpenId(next === "status" && request ? request.id : null);
  }

  function startReceive(request: MaterialRequest) {
    setTab("receive");
    setQuery(request.no);
    setReceiveFor(request.id);
    setFormOpen(true);
  }

  const canAdd = tab === "request" ? can("material.request") : tab === "receive" ? can("material.receive") : false;

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

  const tabs: { key: Tab; label: string; count: string }[] = [
    { key: "request", label: "1. Request", count: String(requests.length) },
    { key: "receive", label: "2. รับของ", count: String(receipts.length) },
    { key: "status", label: "3. สถานะ / ยอดสะสม", count: `${outstanding.length} ค้าง` },
  ];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto h-[calc(100dvh-2rem)] w-[min(76rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-lg">📦</div>
          <div className="flex-1">
            <h2 className="font-bold">Material Request form</h2>
            <div className="text-xs text-muted">
              {project.code} · {project.name} · ยอด up to date {formatDateTime(new Date().toISOString())}
            </div>
          </div>
          <button type="button" className="text-xl text-muted hover:text-text" aria-label="ปิด" onClick={() => dialogRef.current?.close()}>
            ×
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"}`}
              onClick={() => go(t.key)}
            >
              {t.label} <span className="text-xs font-normal text-muted">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-sm flex-1"
              placeholder="ค้นหา Request No. / Description / Spec"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="btn px-2.5 py-1.5 text-xs" onClick={() => setQuery("")}>ล้างตัวกรอง</button>
            )}
            <div className="flex-1" />
            {tab === "status" ? (
              <button type="button" className="btn" onClick={exportCsv} disabled={requests.length === 0}>⬇ Export Excel</button>
            ) : (
              canAdd && (
                <button type="button" className="btn btn-primary" onClick={() => (setFormOpen((o) => !o), setReceiveFor(""))}>
                  + {tab === "request" ? "เพิ่ม Request" : "บันทึกรับของ"}
                </button>
              )
            )}
          </div>

          {formOpen && tab === "request" && (
            <RequestForm project={project} actor={userProfile?.email ?? ""} onDone={(no) => (setFormOpen(false), setQuery(no ?? ""))} />
          )}
          {formOpen && tab === "receive" && (
            <ReceiveForm
              project={project}
              actor={userProfile?.email ?? ""}
              requests={outstanding}
              balances={balances}
              initial={receiveFor}
              onDone={(no) => (setFormOpen(false), setQuery(no ?? ""))}
            />
          )}

          {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">โหลดข้อมูลไม่สำเร็จ: {error}</p>}
          {loading ? (
            <p className="py-10 text-center text-sm text-muted">กำลังโหลด...</p>
          ) : tab === "request" ? (
            <RequestTable requests={requests.filter(matches)} balances={balances} onPick={(r) => go("status", r)} />
          ) : tab === "receive" ? (
            <ReceiveTable
              project={project}
              receipts={receipts.filter((x) => matches(byId.get(x.request_id)))}
              byId={byId}
              canApprove={can("material.approve")}
              actor={userProfile?.email ?? ""}
              onPick={(r) => go("status", r)}
            />
          ) : (
            <StatusTable
              requests={requests.filter(matches)}
              receipts={receipts}
              balances={balances}
              openId={openId}
              onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
              onReceive={can("material.receive") ? startReceive : undefined}
            />
          )}
        </div>
      </div>
    </dialog>
  );
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
        groups={[["ข้อมูลวัสดุ", 3, G_ITEM], ["การขอเบิก", 4, G_REQ], ["", 1, ""]]}
        head={<><th>Request No.</th><th>Description</th><th>Spec</th><th>Unit</th><th className="text-right">Quantity</th><th>Require Schedule</th><th>Remark</th><th>สถานะ</th></>}
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
            <td className="px-3 py-2"><Pill tone={balances.get(r.id)!.status.tone}>{balances.get(r.id)!.status.label}</Pill></td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted">กด Request No. เพื่อดูสถานะและ timeline ในตารางที่ 3</p>
    </>
  );
}

function ReceiveTable({
  project,
  receipts,
  byId,
  canApprove,
  actor,
  onPick,
}: {
  project: ProjectRecord;
  receipts: MaterialReceipt[];
  byId: Map<string, MaterialRequest>;
  canApprove: boolean;
  actor: string;
  onPick: (r: MaterialRequest) => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function changeApproval(id: string, approval: MaterialApproval) {
    setError(undefined);
    startTransition(async () => {
      try {
        await updateReceiptApproval(project.id, id, approval, actor);
      } catch (e) {
        setError("บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  return (
    <>
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
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
                {canApprove ? (
                  <select
                    className="dcr-cell w-auto"
                    aria-label="Material Approve"
                    value={x.approval}
                    disabled={pending}
                    onChange={(e) => changeApproval(x.id, e.target.value as MaterialApproval)}
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
  onReceive,
}: {
  requests: MaterialRequest[];
  receipts: MaterialReceipt[];
  balances: Map<string, MaterialBalance>;
  openId: string | null;
  onToggle: (id: string) => void;
  onReceive?: (r: MaterialRequest) => void;
}) {
  return (
    <>
      <Table
        groups={[["Request", 3, G_ITEM], ["ขอเบิก", 2, G_REQ], ["รับสะสม (Approved)", 3, G_RECV], ["", 1, ""]]}
        head={<><th>Request No.</th><th>Description</th><th>Unit</th><th className="text-right">Quantity</th><th>Require Schedule</th><th className="text-right">รับสะสม</th><th className="text-right">คงค้าง</th><th>รับล่าสุด</th><th>สถานะ</th></>}
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
                <td className={`px-3 py-2 text-right tabular-nums ${b.remaining > 0 ? "text-warn" : "text-muted"}`}>{fmt(b.remaining)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{day(b.last_receive_date)}</td>
                <td className="px-3 py-2"><Pill tone={b.status.tone}>{b.status.label}</Pill></td>
              </tr>
              {open && (
                <tr className="bg-surface-2">
                  <td colSpan={9} className="px-4 py-4">
                    <Timeline request={r} receipts={receipts.filter((x) => x.request_id === r.id)} balance={b} onReceive={onReceive} />
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
  onReceive,
}: {
  request: MaterialRequest;
  receipts: MaterialReceipt[];
  balance: MaterialBalance;
  onReceive?: (r: MaterialRequest) => void;
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
          </li>
        </ol>
      </div>

      <div className="space-y-1.5 self-start rounded-lg border border-border bg-surface p-3 text-sm">
        <div className="mb-1 text-xs font-semibold">ยอด up to date</div>
        <Row label="ขอเบิก" value={`${fmt(r.quantity)} ${r.unit}`} />
        <Row label="รับแล้ว (Approved)" value={fmt(b.received)} className="text-ok" />
        <Row label="รอตรวจ (Pending)" value={fmt(b.pending)} />
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
          <span>คงค้าง</span>
          <span className={b.remaining > 0 ? "text-warn" : "text-muted"}>{fmt(b.remaining)} {r.unit}</span>
        </div>
        {onReceive && b.remaining > 0 && (
          <button type="button" className="btn btn-primary mt-2 w-full" onClick={() => onReceive(r)}>บันทึกรับของ</button>
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

function RequestForm({ project, actor, onDone }: { project: ProjectRecord; actor: string; onDone: (no?: string) => void }) {
  const [v, setV] = useState(blankRequest);
  const { error, setError, pending, run } = useSave(onDone);
  const set = (k: keyof typeof blankRequest) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(v.quantity);
    if (!v.description.trim()) return setError("กรุณาใส่ Description");
    if (!v.unit.trim()) return setError("กรุณาใส่ Unit");
    if (!(quantity > 0)) return setError("Quantity ต้องมากกว่า 0");
    if (!v.require_schedule) return setError("กรุณาใส่ Require Schedule");
    run(() =>
      createMaterialRequest(
        project.id,
        { description: v.description.trim(), spec: v.spec.trim(), unit: v.unit.trim(), quantity, require_schedule: v.require_schedule, remark: v.remark.trim() },
        actor,
      ),
    );
  }

  return (
    <FormBox onSubmit={onSubmit} error={error}>
      <div className="text-xs text-muted">Request No. สร้างอัตโนมัติเมื่อบันทึก</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input" aria-label="Description" placeholder="Description *" maxLength={200} value={v.description} onChange={set("description")} />
        <input className="input" aria-label="Spec" placeholder="Spec" maxLength={200} value={v.spec} onChange={set("spec")} />
        <input className="input" aria-label="Unit" placeholder="Unit *" maxLength={30} value={v.unit} onChange={set("unit")} />
        <input className="input text-right" aria-label="Quantity" placeholder="Quantity *" type="number" min="0" step="any" value={v.quantity} onChange={set("quantity")} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="whitespace-nowrap">Require Schedule *</span>
          <input className="input" type="date" value={v.require_schedule} onChange={set("require_schedule")} />
        </label>
        <input className="input lg:col-span-2" aria-label="Remark" placeholder="Remark" maxLength={300} value={v.remark} onChange={set("remark")} />
        <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึก Request"}</button>
      </div>
    </FormBox>
  );
}

function ReceiveForm({
  project,
  actor,
  requests,
  balances,
  initial,
  onDone,
}: {
  project: ProjectRecord;
  actor: string;
  requests: MaterialRequest[];
  balances: Map<string, MaterialBalance>;
  initial: string;
  onDone: (no?: string) => void;
}) {
  const [requestId, setRequestId] = useState(initial || requests[0]?.id || "");
  const [v, setV] = useState({ receive_date: todayInBangkok(), quantity: "", do_no: "", approval: "pending" as MaterialApproval, remark: "" });
  const { error, setError, pending, run } = useSave(onDone);
  const r = requests.find((x) => x.id === requestId);
  const b = r ? balances.get(r.id)! : null;
  // ยอดที่ยังรับได้ = คงค้าง − ที่รอตรวจอยู่ (กันบันทึกซ้ำก่อนอนุมัติ)
  const receivable = b ? Math.max(0, b.remaining - b.pending) : 0;

  if (requests.length === 0) return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">ไม่มี Request ที่ค้างรับ</p>;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(v.quantity);
    if (!r) return setError("กรุณาเลือก Request No.");
    if (!v.receive_date) return setError("กรุณาใส่ Actual Receive Date");
    if (!(quantity > 0)) return setError("จำนวนรับต้องมากกว่า 0");
    if (quantity > receivable) return setError(`รับเกินยอดคงค้าง — รับได้อีก ${fmt(receivable)} ${r.unit}`);
    run(async () => {
      await createMaterialReceipt(project.id, { request_id: r.id, receive_date: v.receive_date, quantity, do_no: v.do_no.trim(), approval: v.approval, remark: v.remark.trim() }, actor);
      return r.no;
    });
  }

  return (
    <FormBox onSubmit={onSubmit} error={error}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr]">
        <select className="input" aria-label="Request No." value={requestId} onChange={(e) => setRequestId(e.target.value)}>
          {requests.map((x) => (
            <option key={x.id} value={x.id}>{x.no} · {x.description}</option>
          ))}
        </select>
        <input className="input" type="date" aria-label="Actual Receive Date" title="Actual Receive Date" value={v.receive_date} onChange={(e) => setV({ ...v, receive_date: e.target.value })} />
        <input className="input text-right" type="number" min="0" step="any" aria-label="จำนวนรับ" placeholder="จำนวนรับ *" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
        <input className="input" aria-label="เลขที่ DO" placeholder="เลขที่ DO / ใบส่งของ" maxLength={60} value={v.do_no} onChange={(e) => setV({ ...v, do_no: e.target.value })} />
        <select className="input" aria-label="Material Approve" value={v.approval} onChange={(e) => setV({ ...v, approval: e.target.value as MaterialApproval })}>
          {Object.entries(materialApproval).map(([k, a]) => (
            <option key={k} value={k}>{a.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input flex-1" aria-label="Remark" placeholder="Remark" maxLength={300} value={v.remark} onChange={(e) => setV({ ...v, remark: e.target.value })} />
        <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึกรับของ"}</button>
      </div>
      {r && b && (
        <div className="text-xs text-muted">
          {r.description}{r.spec && ` · ${r.spec}`} · ขอ {fmt(r.quantity)} {r.unit} · รับแล้ว {fmt(b.received)}
          {b.pending > 0 && ` · รอตรวจ ${fmt(b.pending)}`} · <b className="text-warn">รับได้อีก {fmt(receivable)} {r.unit}</b> · กำหนด {day(r.require_schedule)}
        </div>
      )}
    </FormBox>
  );
}
