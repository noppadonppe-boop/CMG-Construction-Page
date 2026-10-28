import type { ReactNode } from "react";
import type { Tone } from "@/lib/format";

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-primary-soft text-primary",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="text-xs text-muted">{eyebrow}</div>}
        <h1 className="text-[22px] font-bold">{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="card">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`my-0.5 text-[26px] font-bold tabular-nums ${tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {note && (
        <div className={`text-xs ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-muted"}`}>{note}</div>
      )}
    </div>
  );
}

/** แถบความคืบหน้าจริง พร้อมขีดตำแหน่งตามแผน */
export function ProgressBar({ actual, planned }: { actual: number; planned: number }) {
  return (
    <div className="relative h-1.5 min-w-[90px] flex-1 overflow-hidden rounded-full border border-border bg-surface-2">
      <i className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${actual}%` }} />
      <b className="absolute -inset-y-0.5 w-0.5 bg-text opacity-50" style={{ left: `${planned}%` }} />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted">{children}</div>;
}

export function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-label="กำลังโหลด">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-border/60" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-border/60" />
    </div>
  );
}
