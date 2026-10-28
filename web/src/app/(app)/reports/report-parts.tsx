import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { PrintButton } from "./print-button";

/** เวลาที่ออกรายงาน (อ่านนาฬิกาตอน render บน server — หน้ารายงานเป็น dynamic อยู่แล้ว) */
const generatedAt = () => formatDateTime(new Date().toISOString());

/** หัวรายงาน: ชื่อรายงาน ช่วงเวลา และเวลาที่ออกรายงาน + ปุ่มพิมพ์/เลื่อนช่วงเวลา (ไม่ถูกพิมพ์) */
export function ReportHeader({
  title,
  subtitle,
  period,
  prevHref,
  nextHref,
}: {
  title: string;
  subtitle?: ReactNode;
  period: string;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/reports" className="btn">← รายงานทั้งหมด</Link>
        <div className="flex gap-2">
          <Link href={prevHref} className="btn">‹ ก่อนหน้า</Link>
          <Link href={nextHref} className="btn">ถัดไป ›</Link>
          <PrintButton />
        </div>
      </div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-text pb-3">
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted uppercase">CMG Project Hub</div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <div className="text-muted">{subtitle}</div>}
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">{period}</div>
          <div className="text-xs text-muted">ออกรายงาน {generatedAt()}</div>
        </div>
      </header>
    </>
  );
}

export function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" | "ok" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : ""}`}>{value}</div>
    </div>
  );
}
