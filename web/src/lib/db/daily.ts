"use client";

import type { QueryDocumentSnapshot } from "firebase/firestore";
import { manpowerTotals, reportCode, summarizeWeather, type DcrData, type Photo } from "../dcr";
import type { DailyReport } from "../types";
import type { StoredFile } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";

// รายการรายงานประจำวันของหลายโครงการ (realtime) — สรุปเป็นรูปแบบเดียวกันทั้งฉบับใหม่ (DCR schema 2) และฉบับเดิม
// ใช้ในหน้ารายการ, Dashboard, รายงานสัปดาห์/เดือน และส่งออก Excel  (ตัวรายงานเต็มอยู่ที่ lib/db/dcr.ts)

function toReport(snap: QueryDocumentSnapshot, project: ProjectRecord): DailyReport {
  const d = snap.data();
  const base = { id: snap.id, project_id: project.id, project_name: project.name, report_date: d.report_date ?? snap.id };
  if (d.schema === 2) {
    const r = d as DcrData;
    return {
      ...base,
      weather: summarizeWeather(r.weather),
      workers: manpowerTotals(r.manpower).total,
      work_done: r.progress.map((p) => [p.zone, p.description].filter(Boolean).join(": ")).filter(Boolean).join(" · "),
      equipment: r.equipment.map((e) => e.name),
      issues: r.issues.map((i) => i.description).join(" · ") || null,
      photos: r.progress.flatMap((p) => p.photos.map((ph: Photo) => ph.url)),
      code: reportCode(project.code, r.report_no),
      status: r.status,
      lost_hours: r.weather.lost_hours,
    };
  }
  return {
    ...base,
    weather: d.weather ?? "sunny",
    workers: Number(d.workers ?? 0),
    work_done: d.work_done ?? "",
    equipment: d.equipment ?? [],
    issues: d.issues ?? null,
    photos: ((d.photos ?? []) as StoredFile[]).map((p) => p.url),
  };
}

export function useDailyReports(projects: ProjectRecord[]) {
  const { items, loading, error } = useProjectSection(projects, "daily_reports", toReport);
  return { reports: items.toSorted((a, b) => b.report_date.localeCompare(a.report_date)), loading, error };
}
