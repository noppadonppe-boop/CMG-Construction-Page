"use client";

import {
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase/client";
import {
  blankReport,
  defaultSettings,
  type Company,
  type DcrData,
  type DcrSettings,
  type DcrStatus,
  type Photo,
} from "../dcr";
import { ConflictError, DataError, deleteFiles, newId, uploadFile, uploadFiles } from "./common";
import { APP_NAME, projectRef, sectionCol, storagePath } from "./paths";

// รายงานประจำวัน (DCR) — เก็บในโครงการของตัวเอง
//   projects/{projectId}/settings/dcr               บริษัท/โลโก้ รายการช่าง/เครื่องจักร เลขรันรายงาน
//   projects/{projectId}/daily_reports/{YYYY-MM-DD} รายงาน 1 ฉบับต่อวัน (schema 2)
//   Storage: .../projects/{projectId}/settings/logos/*  และ  .../daily_reports/{date}/*.jpg

export const settingsRef = (projectId: string) => doc(projectRef(projectId), "settings", "dcr");
export const reportRef = (projectId: string, date: string) => doc(sectionCol(projectId, "daily_reports"), date);

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function toSettings(snap: DocumentSnapshot, projectClient: string | null): DcrSettings {
  const base = defaultSettings(projectClient);
  if (!snap.exists()) return base;
  const d = snap.data();
  return {
    ...base,
    ...d,
    consultants: d.consultants ?? [],
    subcontractors: d.subcontractors ?? [],
    equipment: d.equipment ?? [],
    report_counter: Number(d.report_counter ?? 0),
    version: Number(d.version ?? 0),
  } as DcrSettings;
}

/** ตั้งค่ารายงานของโครงการ (realtime) — ยังไม่เคยตั้ง = ค่าเริ่มต้น */
export function useDcrSettings(projectId: string | undefined, projectClient: string | null) {
  const [state, setState] = useState<{ key: string; settings: DcrSettings | null; error?: string }>({ key: "", settings: null });
  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(
      settingsRef(projectId),
      (snap) => setState({ key: projectId, settings: toSettings(snap, projectClient) }),
      (e) => setState({ key: projectId, settings: null, error: e.message }),
    );
  }, [projectId, projectClient]);
  const current = state.key === projectId ? state : null;
  return { settings: current?.settings ?? null, loading: !!projectId && !current, error: current?.error };
}

/** บันทึกตั้งค่า — ตรวจ version กันบันทึกทับกัน (เลขรันรายงานไม่ถูกแตะ) */
export async function saveDcrSettings(projectId: string, settings: DcrSettings, actor: string, force = false) {
  const ref = settingsRef(projectId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    const currentVersion = Number(snap.get("version") ?? 0);
    if (!force && currentVersion !== settings.version) throw new ConflictError(snap.get("updated_by") ?? null);
    const { report_counter: _counter, version: _version, ...rest } = settings;
    void _counter;
    void _version;
    tx.set(ref, { ...rest, version: currentVersion + 1, updated_at: serverTimestamp(), updated_by: actor }, { merge: true });
  });
}

/** อัปโหลดโลโก้บริษัท (PNG/JPG/SVG/WebP ไม่เกิน 2 MB — เก็บไฟล์เดิม ไม่ย่อ เพื่อรักษาพื้นหลังโปร่งใส) */
export async function uploadLogo(projectId: string, file: File): Promise<Company["logo"]> {
  if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) throw new DataError("โลโก้ต้องเป็นไฟล์ PNG, JPG, SVG หรือ WebP");
  if (file.size > MAX_LOGO_BYTES) throw new DataError("โลโก้ต้องมีขนาดไม่เกิน 2 MB");
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  return uploadFile(`${APP_NAME}/root/projects/${projectId}/settings/logos/${newId()}.${ext}`, file);
}

export const deleteLogo = (logo: Company["logo"]) => (logo?.path ? deleteFiles([logo.path]) : Promise.resolve());

// ───────────── รายงาน ─────────────

export type DcrRecord = DcrData & { version: number; updated_by: string | null; legacy: boolean };

/** แปลงเอกสารเป็นรายงาน — รองรับรายงานรูปแบบเดิม (schema 1) ด้วยการแปลงเป็นโครงสร้างใหม่ขณะอ่าน */
export function toDcr(snap: DocumentSnapshot, settings: DcrSettings): DcrRecord | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  if (d.schema === 2) return { ...(d as DcrData), version: Number(d.version ?? 0), updated_by: d.updated_by ?? null, legacy: false };
  // schema 1: weather / workers / work_done / equipment[] / issues / photos
  const report = blankReport(d.report_date ?? snap.id, settings);
  const sky = d.weather === "rain" ? "heavy_rain" : d.weather === "cloudy" ? "cloudy" : "clear";
  report.weather.am.sky = sky;
  report.weather.pm.sky = sky;
  if (report.manpower.direct[0]) report.manpower.direct.at(-1)!.main = Number(d.workers ?? 0);
  report.equipment = ((d.equipment ?? []) as string[]).map((name) => ({ name, owner: "", work_hours: 0, idle_hours: 0, status: "working" as const }));
  report.progress = [
    {
      id: "legacy",
      zone: "",
      category: "",
      description: d.work_done ?? "",
      quantity: "",
      cumulative: "",
      photos: ((d.photos ?? []) as { path: string; url: string }[]).map((p) => ({ ...p, caption: "" })),
    },
  ];
  report.issues = d.issues ? [{ description: d.issues, cause: "อื่น ๆ", impact_hours: 0, responsible: "", action: "" }] : [];
  report.status = "submitted";
  return { ...report, version: Number(d.version ?? 0), updated_by: d.created_by ?? null, legacy: true };
}

/** รายงานของวันที่เลือก (realtime) */
export function useDcr(projectId: string | undefined, date: string, settings: DcrSettings | null) {
  const key = `${projectId}/${date}`;
  const [state, setState] = useState<{ key: string; snap: DocumentSnapshot | null; error?: string }>({ key: "", snap: null });
  useEffect(() => {
    if (!projectId || !date) return;
    return onSnapshot(
      reportRef(projectId, date),
      (snap) => setState({ key, snap }),
      (e) => setState({ key, snap: null, error: e.message }),
    );
  }, [projectId, date, key]);
  const current = state.key === key ? state : null;
  return {
    report: current?.snap && settings ? toDcr(current.snap, settings) : null,
    loading: !current || !settings,
    error: current?.error,
  };
}

/** รายงานฉบับล่าสุดก่อนวันที่กำหนด — ใช้ "คัดลอกจากเมื่อวาน" */
export async function previousReport(projectId: string, date: string, settings: DcrSettings) {
  const q = query(sectionCol(projectId, "daily_reports"), where("report_date", "<", date), orderBy("report_date", "desc"), limit(1));
  const snap = (await getDocs(q)).docs[0];
  return snap ? toDcr(snap, settings) : null;
}

export type NewPhotos = Record<string, { file: File; caption: string }[]>;

/**
 * บันทึกรายงาน (สร้างใหม่หรือแก้ไข)
 * - ฉบับใหม่: ออกเลขที่รายงานจาก settings.report_counter ใน transaction เดียวกัน และกันมีรายงานซ้ำวันเดียวกัน
 * - ฉบับเดิม: ตรวจ version ถ้ามีคนบันทึกหลังเราเปิดฟอร์ม → ConflictError (เว้นแต่ force)
 * - รูปใหม่อัปโหลดก่อน ถ้าบันทึกไม่สำเร็จลบทิ้ง; รูปที่ถูกเอาออกลบหลังบันทึกสำเร็จ
 */
export async function saveDcr(
  projectId: string,
  data: DcrData,
  opts: { baseVersion: number | null; actor: string; force?: boolean; newPhotos: NewPhotos; removedPaths: string[] },
): Promise<{ reportNo: number; version: number; progress: DcrData["progress"] }> {
  const ref = reportRef(projectId, data.report_date);
  const uploads = Object.entries(opts.newPhotos).flatMap(([itemId, list]) =>
    list.map((p) => ({ itemId, caption: p.caption, file: p.file, path: storagePath(projectId, "daily_reports", data.report_date, `${newId()}.jpg`) })),
  );
  const stored = await uploadFiles(uploads.map(({ path, file }) => ({ path, file })));
  const added = new Map<string, Photo[]>();
  uploads.forEach((u, i) => added.set(u.itemId, [...(added.get(u.itemId) ?? []), { ...stored[i], caption: u.caption }]));
  const progress = data.progress.map((p) => ({ ...p, photos: [...p.photos, ...(added.get(p.id) ?? [])] }));

  let reportNo = data.report_no;
  let version = 0;
  try {
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      const settingsSnap = await tx.get(settingsRef(projectId));
      const isLegacy = snap.exists() && snap.get("schema") !== 2;
      if (opts.baseVersion === null && snap.exists() && !isLegacy) {
        throw new DataError("มีรายงานของวันนี้อยู่แล้ว — เปิดฉบับนั้นเพื่อแก้ไขแทน");
      }
      const currentVersion = Number(snap.get("version") ?? 0);
      if (opts.baseVersion !== null && !opts.force && currentVersion !== opts.baseVersion) {
        throw new ConflictError(snap.get("updated_by") ?? null);
      }
      if (!reportNo) {
        reportNo = Number(settingsSnap.get("report_counter") ?? 0) + 1;
        tx.set(settingsRef(projectId), { report_counter: reportNo }, { merge: true });
      }
      tx.set(ref, {
        ...data,
        progress,
        report_no: reportNo,
        schema: 2,
        version: (version = currentVersion + 1),
        ...(snap.exists() && !isLegacy ? {} : { created_at: serverTimestamp(), created_by: opts.actor }),
        updated_at: serverTimestamp(),
        updated_by: opts.actor,
      });
    });
  } catch (e) {
    await deleteFiles(stored.map((s) => s.path));
    throw e;
  }
  await deleteFiles(opts.removedPaths);
  return { reportNo, version, progress };
}

/** เปลี่ยนสถานะ + ลงชื่อ (ส่งตรวจ / ตรวจแล้ว / รับทราบ / ตีกลับเป็นร่าง) */
export async function setDcrStatus(
  projectId: string,
  date: string,
  status: DcrStatus,
  signer: { name: string; email: string | null },
  actor: string,
) {
  const ref = reportRef(projectId, date);
  const field = { draft: null, submitted: "prepared", reviewed: "reviewed", acknowledged: "acknowledged" }[status];
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.get("schema") !== 2) throw new DataError("ไม่พบรายงานนี้");
    const signatures = { ...(snap.get("signatures") ?? {}) };
    if (field) signatures[field] = { ...signer, at: new Date().toISOString() };
    // ตีกลับเป็นร่าง: ล้างลายเซ็นตรวจ/รับทราบ (ต้องตรวจใหม่หลังแก้)
    if (status === "draft") Object.assign(signatures, { reviewed: null, acknowledged: null });
    tx.update(ref, {
      status,
      signatures,
      version: Number(snap.get("version") ?? 0) + 1,
      updated_at: serverTimestamp(),
      updated_by: actor,
    });
  });
}
