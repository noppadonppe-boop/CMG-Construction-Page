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
  formatDocNo,
  normalizeDcrRows,
  reportCode,
  type Company,
  type DcrData,
  type DcrSettings,
  type DcrStatus,
  type Photo,
} from "../dcr";
import { normalizeReportLang } from "../dcr-i18n";
import { layoutPagesForStore, normalizeLayoutPages, type LayoutPage, type LayoutTemplate } from "../dcr-layout";
import { ConflictError, DataError, deleteFiles, newId, uploadFile, uploadFiles } from "./common";
import { APP_NAME, projectRef, sectionCol, storagePath } from "./paths";

// รายงานประจำวัน (DCR) — เก็บในโครงการของตัวเอง
//   projects/{projectId}/settings/dcr               บริษัท/โลโก้ รายการช่าง/เครื่องจักร เลขรันรายงาน
//   projects/{projectId}/daily_reports/{YYYY-MM-DD} รายงาน 1 ฉบับต่อวัน (schema 2)
//   projects/{projectId}/settings/dcr_layouts       แม่แบบจัดหน้าหัวข้อ H ของโครงการ
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
    show_consultant: d.show_consultant !== false,
    subcontractors: d.subcontractors ?? [],
    equipment: d.equipment ?? [],
    report_counter: Number(d.report_counter ?? 0),
    doc_format: { ...base.doc_format, ...(d.doc_format ?? {}) },
    report_lang: normalizeReportLang(d.report_lang),
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

/** ตั้งเลขที่รายงานฉบับถัดไป (เช่น ต่อจากเลขเอกสารเดิมของโครงการ) */
export async function setNextReportNo(projectId: string, next: number, actor: string) {
  await runTransaction(db(), async (tx) => {
    tx.set(settingsRef(projectId), { report_counter: Math.max(0, Math.floor(next) - 1), updated_at: serverTimestamp(), updated_by: actor }, { merge: true });
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
  if (d.schema === 2) return { ...normalizeDcrRows(d as DcrData), form_standard: d.form_standard ?? null, version: Number(d.version ?? 0), updated_by: d.updated_by ?? null, legacy: false };
  // schema 1: weather / workers / work_done / equipment[] / issues / photos
  const report = blankReport(d.report_date ?? snap.id, settings);
  const sky = d.weather === "rain" ? "heavy_rain" : d.weather === "cloudy" ? "cloudy" : "clear";
  report.weather.am.sky = sky;
  report.weather.pm.sky = sky;
  if (report.manpower.direct[0]) {
    const workers = Number(d.workers ?? 0);
    report.manpower.direct[report.manpower.direct.length - 1] = { ...report.manpower.direct.at(-1)!, total: workers, present: workers };
  }
  report.equipment = ((d.equipment ?? []) as string[]).map((name) => ({ name, owner: "", quantity: 1, status: "working" as const, remark: "" }));
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
/** รูปใหม่ของช่องในหัวข้อ H: slotId → ไฟล์ */
export type NewLayoutImages = Record<string, File>;

/**
 * บันทึกรายงาน (สร้างใหม่หรือแก้ไข)
 * - ฉบับใหม่: ออกเลขที่รายงานจาก settings.report_counter ใน transaction เดียวกัน และกันมีรายงานซ้ำวันเดียวกัน
 * - ฉบับเดิม: ตรวจ version ถ้ามีคนบันทึกหลังเราเปิดฟอร์ม → ConflictError (เว้นแต่ force)
 * - รูปใหม่อัปโหลดก่อน ถ้าบันทึกไม่สำเร็จลบทิ้ง; รูปที่ถูกเอาออกลบหลังบันทึกสำเร็จ
 */
export async function saveDcr(
  projectId: string,
  data: DcrData,
  opts: { baseVersion: number | null; actor: string; force?: boolean; newPhotos: NewPhotos; newLayoutImages?: NewLayoutImages; removedPaths: string[]; projectCode: string },
): Promise<{ reportNo: number; docNo: string; version: number; progress: DcrData["progress"]; layoutPages: LayoutPage[] }> {
  const ref = reportRef(projectId, data.report_date);
  const uploads = Object.entries(opts.newPhotos).flatMap(([itemId, list]) =>
    list.map((p) => ({ itemId, caption: p.caption, file: p.file, path: storagePath(projectId, "daily_reports", data.report_date, `${newId()}.jpg`) })),
  );
  const slotIds = new Set(data.layout_pages.flatMap((p) => p.slots.map((s) => s.id)));
  const layoutUploads = Object.entries(opts.newLayoutImages ?? {})
    .filter(([slotId]) => slotIds.has(slotId))
    .map(([slotId, file]) => ({ slotId, file, path: storagePath(projectId, "daily_reports", data.report_date, `layout-${newId()}.jpg`) }));
  const stored = await uploadFiles([...uploads, ...layoutUploads].map(({ path, file }) => ({ path, file })));
  const added = new Map<string, Photo[]>();
  uploads.forEach((u, i) => added.set(u.itemId, [...(added.get(u.itemId) ?? []), { ...stored[i], caption: u.caption }]));
  const progress = data.progress.map((p) => ({ ...p, photos: [...p.photos, ...(added.get(p.id) ?? [])] }));
  const slotImages = new Map(layoutUploads.map((u, i) => [u.slotId, stored[uploads.length + i]]));
  const layoutPages = data.layout_pages.map((p) => ({ ...p, slots: p.slots.map((s) => (slotImages.has(s.id) ? { ...s, image: slotImages.get(s.id)! } : s)) }));

  let reportNo = data.report_no;
  let docNo = data.doc_no ?? "";
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
      docNo = data.doc_no ?? "";
      if (!reportNo) {
        reportNo = Number(settingsSnap.get("report_counter") ?? 0) + 1;
        tx.set(settingsRef(projectId), { report_counter: reportNo }, { merge: true });
        docNo = formatDocNo(settingsSnap.get("doc_format"), opts.projectCode, reportNo);
      }
      tx.set(ref, {
        ...data,
        progress,
        layout_pages: layoutPagesForStore(layoutPages),
        report_no: reportNo,
        ...(docNo ? { doc_no: docNo } : {}),
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
  return { reportNo, docNo: docNo || reportCode(opts.projectCode, reportNo), version, progress, layoutPages };
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

// ───────────── แม่แบบจัดหน้า (หัวข้อ H) ─────────────

export const layoutTemplatesRef = (projectId: string) => doc(projectRef(projectId), "settings", "dcr_layouts");

export type LayoutTemplates = { templates: LayoutTemplate[]; default_id: string | null };

function toLayoutTemplates(snap: DocumentSnapshot): LayoutTemplates {
  if (!snap.exists()) return { templates: [], default_id: null };
  const d = snap.data();
  const templates = ((d.templates ?? []) as Record<string, unknown>[]).map((t) => ({
    id: String(t.id),
    name: String(t.name ?? ""),
    pages: normalizeLayoutPages(t.pages),
    updated_by: String(t.updated_by ?? ""),
    updated_at: String(t.updated_at ?? ""),
  }));
  const default_id = templates.some((t) => t.id === d.default_id) ? (d.default_id as string) : null;
  return { templates, default_id };
}

/** แม่แบบจัดหน้าของโครงการ (realtime) */
export function useLayoutTemplates(projectId: string | undefined) {
  const [state, setState] = useState<{ key: string; value: LayoutTemplates | null; error?: string }>({ key: "", value: null });
  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(
      layoutTemplatesRef(projectId),
      (snap) => setState({ key: projectId, value: toLayoutTemplates(snap) }),
      (e) => setState({ key: projectId, value: null, error: e.message }),
    );
  }, [projectId]);
  const current = state.key === projectId ? state : null;
  return { layouts: current?.value ?? null, loading: !!projectId && !current, error: current?.error };
}

/** แก้รายการแม่แบบใน transaction — อ่านค่าล่าสุดก่อนแก้ เพื่อไม่ทับแม่แบบที่คนอื่นเพิ่งบันทึก */
async function changeLayoutTemplates(projectId: string, actor: string, fn: (current: LayoutTemplates) => LayoutTemplates) {
  const ref = layoutTemplatesRef(projectId);
  await runTransaction(db(), async (tx) => {
    const next = fn(toLayoutTemplates(await tx.get(ref)));
    tx.set(ref, {
      templates: next.templates.map((t) => ({ ...t, pages: layoutPagesForStore(t.pages) })),
      default_id: next.default_id,
      updated_at: serverTimestamp(),
      updated_by: actor,
    });
  });
}

/** บันทึกแม่แบบ — ชื่อซ้ำกับแม่แบบเดิม = บันทึกทับแม่แบบนั้น · โครงการยังไม่มีแม่แบบเริ่มต้น = แม่แบบนี้เป็นค่าเริ่มต้น */
export function saveLayoutTemplate(projectId: string, name: string, pages: LayoutPage[], actor: string, makeDefault: boolean) {
  return changeLayoutTemplates(projectId, actor, ({ templates, default_id }) => {
    const existing = templates.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
    const template: LayoutTemplate = { id: existing?.id ?? newId(), name: name.trim(), pages, updated_by: actor, updated_at: new Date().toISOString() };
    return {
      templates: existing ? templates.map((t) => (t.id === existing.id ? template : t)) : [...templates, template],
      default_id: makeDefault || !default_id ? template.id : default_id,
    };
  });
}

export const deleteLayoutTemplate = (projectId: string, id: string, actor: string) =>
  changeLayoutTemplates(projectId, actor, ({ templates, default_id }) => ({ templates: templates.filter((t) => t.id !== id), default_id: default_id === id ? null : default_id }));

/** แม่แบบเริ่มต้น: รายงานฉบับใหม่ของโครงการจะได้หน้า H ตามแม่แบบนี้ (null = ไม่มี) */
export const setDefaultLayoutTemplate = (projectId: string, id: string | null, actor: string) =>
  changeLayoutTemplates(projectId, actor, (current) => ({ ...current, default_id: id }));
