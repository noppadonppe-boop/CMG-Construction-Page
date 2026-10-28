import type { ProgressSnapshot } from "@/lib/types";
import { formatDate, formatPct } from "@/lib/format";

const W = 600;
const H = 240;
const L = 36;
const R = 12;
const T = 12;
const B = 24;

/** กราฟ S-Curve ความคืบหน้าสะสม แผน (เส้นประ) เทียบผลจริง */
export function SCurve({ data }: { data: ProgressSnapshot[] }) {
  if (data.length < 2) {
    return <p className="py-10 text-center text-muted">ยังไม่มีข้อมูลความคืบหน้าเพียงพอ</p>;
  }
  const n = data.length - 1;
  const x = (i: number) => L + (i * (W - L - R)) / n;
  const y = (v: number) => H - B - (v * (H - B - T)) / 100;
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const actual = data.flatMap((d) => (d.actual_pct === null ? [] : [d.actual_pct]));
  const lastIdx = actual.length - 1;
  const labelStep = Math.ceil(data.length / 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="S-Curve แผนเทียบผลจริง">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
            {v}%
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        i % labelStep === 0 ? (
          <text key={d.as_of} x={x(i)} y={H - 6} textAnchor={i >= n - 1 ? "end" : "middle"} fontSize={10} fill="var(--muted)">
            {formatDate(d.as_of, "medium").replace(/^\d+\s/, "")}
          </text>
        ) : null,
      )}
      {lastIdx >= 0 && (
        <line x1={x(lastIdx)} x2={x(lastIdx)} y1={T} y2={H - B} stroke="var(--bad)" strokeDasharray="3 3" />
      )}
      <path d={path(data.map((d) => d.planned_pct))} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" />
      {lastIdx > 0 && <path d={path(actual)} fill="none" stroke="var(--primary)" strokeWidth={2.5} />}
      {lastIdx >= 0 && (
        <>
          <circle cx={x(lastIdx)} cy={y(actual[lastIdx])} r={4} fill="var(--primary)" />
          <text x={x(lastIdx) - 8} y={y(actual[lastIdx]) - 8} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--primary)">
            {formatPct(actual[lastIdx])}
          </text>
        </>
      )}
    </svg>
  );
}
