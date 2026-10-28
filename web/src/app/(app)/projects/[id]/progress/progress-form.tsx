"use client";

import { useSubmitOnce } from "@/lib/use-submit-once";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { ConflictError, DataError } from "@/lib/db/common";
import { updateProgress, useProjects, type ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/format";
import { progressMonths, validateProgress } from "@/lib/project-input";
import type { ProgressSnapshot } from "@/lib/types";
import { SCurve } from "@/components/s-curve";
import { ConflictNotice } from "@/components/conflict-notice";

type Row = { as_of: string; planned: string; actual: string };

const monthLabel = (iso: string) => formatDate(iso).replace(/^\d+\s/, "");
const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

function toRows(project: ProjectRecord): Row[] {
  const byMonth = new Map(project.progress.map((p) => [p.as_of, p]));
  return progressMonths(project.start_date, project.end_date).map((as_of, i) => {
    const p = byMonth.get(as_of);
    return {
      as_of,
      planned: p ? String(p.planned_pct) : i === 0 ? "0" : "",
      actual: p?.actual_pct != null ? String(p.actual_pct) : i === 0 ? "0" : "",
    };
  });
}

/**
 * ตารางความคืบหน้า — ตัวเลขที่กรอกเก็บใน state ของฟอร์ม ไม่ถูกล้างเมื่อมีคนอื่นบันทึก (realtime)
 * ตอนบันทึกจะตรวจ version ถ้าชนกันให้ผู้ใช้เลือกเอง
 */
export function ProgressForm({ project: initial, currentMonth }: { project: ProjectRecord; currentMonth: string }) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { byId } = useProjects();
  const [project, setProject] = useState(initial);
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, startTransition] = useSubmitOnce();
  const projectId = project.id;

  const live = byId.get(project.id);
  const remoteChange = live && live.version !== project.version ? { by: live.updated_by } : null;

  function reloadLatest() {
    if (!live) return;
    setProject(live);
    setRows(toRows(live));
    setConflict(null);
    setError(undefined);
  }

  const update = (i: number, field: "planned" | "actual", value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  /** เติมแผนสะสมเป็นรูปตัว S (เริ่มช้า เร่งช่วงกลาง ชะลอตอนท้าย) แล้วค่อยปรับเองทีละเดือน */
  function fillSCurve() {
    const n = rows.length - 1;
    setRows((rs) =>
      rs.map((r, i) => {
        const t = n === 0 ? 1 : i / n;
        return { ...r, planned: String(Math.round(100 * t * t * (3 - 2 * t) * 10) / 10) };
      }),
    );
  }

  // กราฟตัวอย่าง: ช่องแผนที่ยังว่างใช้ค่าของเดือนก่อนหน้า
  const preview: ProgressSnapshot[] = [];
  rows.forEach((r, i) => {
    const planned = toNumber(r.planned) ?? preview[i - 1]?.planned_pct ?? 0;
    const prevActual = i === 0 ? 0 : preview[i - 1].actual_pct;
    const actual = toNumber(r.actual);
    preview.push({ as_of: r.as_of, planned_pct: planned, actual_pct: prevActual === null ? null : actual });
  });

  function save(force = false) {
    const missing = rows.findIndex((r) => r.planned.trim() === "");
    if (missing >= 0) return setError(`กรอกแผนสะสมให้ครบ — ${monthLabel(rows[missing].as_of)} ยังว่างอยู่`);
    const points: ProgressSnapshot[] = rows.map((r) => ({
      as_of: r.as_of,
      planned_pct: Number(r.planned),
      actual_pct: toNumber(r.actual),
    }));
    const invalid = validateProgress(points, progressMonths(project.start_date, project.end_date));
    if (invalid) return setError(invalid);
    if (!userProfile) return;
    setError(undefined);
    setConflict(null);
    startTransition(async () => {
      try {
        await updateProgress(projectId, points, project.version, userProfile.email, force);
        router.push(`/projects/${projectId}`);
      } catch (e) {
        if (e instanceof ConflictError) setConflict(e.message);
        else setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">ความคืบหน้าสะสมรายเดือน (%)</h3>
          <button type="button" onClick={fillSCurve} className="btn text-xs">
            ✨ สร้างแผนแบบ S-Curve อัตโนมัติ
          </button>
        </div>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2 py-2 font-medium">ณ วันที่ 1</th>
                <th className="px-2 py-2 font-medium">แผนสะสม</th>
                <th className="px-2 py-2 font-medium">ผลงานจริงสะสม</th>
                <th className="px-2 py-2 text-right font-medium">ส่วนต่าง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const planned = toNumber(r.planned);
                const actual = toNumber(r.actual);
                const diff = planned !== null && actual !== null ? actual - planned : null;
                const isCurrent = r.as_of === currentMonth;
                return (
                  <tr key={r.as_of} className={`border-t border-border ${isCurrent ? "bg-primary-soft" : ""}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {monthLabel(r.as_of)}
                      {isCurrent && <span className="ml-1.5 text-xs text-primary">เดือนนี้</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`แผนสะสม ${monthLabel(r.as_of)}`}
                        type="number" step="0.1" min={0} max={100} inputMode="decimal"
                        value={r.planned}
                        onChange={(e) => update(i, "planned", e.target.value)}
                        className="input w-24 py-1 tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`ผลงานจริงสะสม ${monthLabel(r.as_of)}`}
                        type="number" step="0.1" min={0} max={100} inputMode="decimal"
                        value={r.actual}
                        placeholder="–"
                        onChange={(e) => update(i, "actual", e.target.value)}
                        className="input w-24 py-1 tabular-nums"
                      />
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${diff === null ? "text-muted" : diff >= -2 ? "text-ok" : diff >= -5 ? "text-warn" : "text-bad"}`}>
                      {diff === null ? "–" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">เว้นช่องผลงานจริงของเดือนที่ยังมาไม่ถึงไว้ว่าง ๆ</p>
      </div>

      <div className="space-y-4">
        <div className="card xl:sticky xl:top-20">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">ตัวอย่าง S-Curve</h3>
            <div className="flex gap-4 text-xs text-muted">
              <span>┄ แผน</span>
              <span className="text-primary">━ จริง</span>
            </div>
          </div>
          <SCurve data={preview} />
          <div className="mt-3 empty:hidden">
            <ConflictNotice remoteChange={remoteChange} conflictMessage={conflict} onReload={reloadLatest} onForceSave={() => save(true)} busy={pending} />
          </div>
          {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-bad">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Link href={`/projects/${projectId}`} className="btn">ยกเลิก</Link>
            <button className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึกความคืบหน้า"}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
