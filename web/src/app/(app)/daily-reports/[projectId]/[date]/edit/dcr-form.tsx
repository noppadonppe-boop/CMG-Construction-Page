"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import {
  blankReport,
  carryOver,
  DELAY_CAUSES,
  EQUIPMENT_STATUS,
  EQUIPMENT_STATUS_LABEL,
  manpowerTotals,
  newProgressItem,
  normalizeDcrRows,
  sumRows,
  formatDocNo,
  newCompany,
  reportDocNo,
  SITE_CONDITIONS,
  SKY,
  SKY_ICON,
  SKY_LABEL,
  WORK_STATUS,
  WORK_STATUS_LABEL,
  workingHours,
  type Company,
  type DcrData,
  type DcrSettings,
  type EquipmentRow,
  type HalfDay,
  type HeadcountRow,
  type Photo,
} from "@/lib/dcr";
import { ConflictError, DataError } from "@/lib/db/common";
import {
  deleteLayoutTemplate,
  previousReport,
  saveDcr,
  saveDcrSettings,
  saveLayoutTemplate,
  setDcrStatus,
  setDefaultLayoutTemplate,
  useLayoutTemplates,
  type DcrRecord,
} from "@/lib/db/dcr";
import { fromTemplate, hasContent, toTemplatePages, type LayoutPage, type LayoutSlot } from "@/lib/dcr-layout";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate, todayInBangkok } from "@/lib/format";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { compress } from "@/components/photo-picker";
import { CompanyLogo } from "@/components/company-logo";
import { ConflictNotice } from "@/components/conflict-notice";
import { DAILY_REPORT_STANDARD_SECTIONS, sectionLetters, type DailyReportStandardSnapshot } from "@/lib/daily-report-standard";
import { LayoutEditor, type FreshImage } from "./layout-editor";

type NewPhoto = { id: string; file: File; preview: string; caption: string };

type ReportHead = { project_name: string; project_no: string; client: string; consultant: string; show_consultant: boolean; contractor: string; subcontractors: Company[] };
const MATERIAL_UNITS = ["ตัน", "กก.", "ลบ.ม.", "ตร.ม.", "ม.", "เส้น", "ชิ้น", "ถุง", "ชุด", "คัน", "เที่ยว"];
const WORK_CATEGORIES = ["งานโครงสร้าง", "งานเหล็ก", "งานคอนกรีต", "งานสถาปัตย์", "งานระบบ MEP", "งานดิน / ฐานราก", "งานภายนอก"];
const draftKey = (projectId: string, date: string) => `cmg.dcr-draft:${projectId}:${date}`;
const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v)) || 0);

/**
 * ฟอร์มรายงานประจำวัน — ข้อมูลที่กรอกอยู่ใน state ของฟอร์ม (สำรองในเครื่องอัตโนมัติ)
 * ข้อมูลบน server เปลี่ยนระหว่างกรอกจะไม่ล้างฟอร์ม แต่แสดงแจ้งเตือน และตรวจ version ตอนบันทึก
 */
export function DcrForm({
  project,
  settings,
  existing,
  date,
  live,
  standard,
}: {
  project: ProjectRecord;
  settings: DcrSettings;
  existing: DcrRecord | null;
  date: string;
  live: DcrRecord | null;
  standard: DailyReportStandardSnapshot | null;
}) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [data, setData] = useState<DcrData>(() => stripRecord(existing) ?? blankReport(date, settings, standard));
  const [baseVersion, setBaseVersion] = useState<number | null>(existing && !existing.legacy ? existing.version : null);
  const [newPhotos, setNewPhotos] = useState<Record<string, NewPhoto[]>>({});
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  // H: รูปใหม่ของช่อง (slotId → ไฟล์) อัปโหลดตอนบันทึกรายงาน · แม่แบบจัดหน้าของโครงการ
  const [layoutImages, setLayoutImages] = useState<Record<string, FreshImage>>({});
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const { layouts } = useLayoutTemplates(project.id);
  const defaultApplied = useRef(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<DcrData | null>(null);
  const [pending, run] = useSubmitOnce();
  const key = draftKey(project.id, data.report_date);
  // ส่วน A: ค่าหัวรายงานของโครงการ (เก็บใน settings) — แก้ได้ แล้วบันทึกใช้ต่อในรายงานวันถัดไป
  const [head, setHead] = useState<ReportHead>(() => ({
    project_name: settings.project_name || project.name,
    project_no: settings.project_no || project.code,
    client: settings.client.name || project.client || "",
    consultant: settings.consultants[0]?.name ?? "",
    show_consultant: settings.show_consultant,
    contractor: settings.contractor.name,
    subcontractors: settings.subcontractors,
  }));
  const [headDirty, setHeadDirty] = useState(false);
  const [newSub, setNewSub] = useState("");
  const editHead = (patch: Partial<ReportHead>) => {
    setHead((h) => ({ ...h, ...patch }));
    setHeadDirty(true);
  };
  function addSubcontractor() {
    const name = newSub.trim();
    if (!name) return;
    const company = newCompany(name);
    editHead({ subcontractors: [...head.subcontractors, company] });
    update((d) => ({ ...d, subcontractors_today: [...d.subcontractors_today, company.id] }));
    setNewSub("");
  }
  async function persistHead() {
    await saveDcrSettings(
      project.id,
      {
        ...settings,
        // เท่ากับข้อมูลโครงการหลัก = ไม่ต้องเก็บ (ถ้าแก้โครงการหลักภายหลังจะตามไปด้วย)
        project_name: head.project_name.trim() === project.name ? "" : head.project_name.trim(),
        project_no: head.project_no.trim() === project.code ? "" : head.project_no.trim(),
        client: { ...settings.client, name: head.client.trim() },
        // ช่องเดียวในส่วน A = ที่ปรึกษารายแรก (รายอื่นแก้ที่หน้าตั้งค่าโครงการ)
        consultants: settings.consultants.length
          ? settings.consultants.map((c, i) => (i === 0 ? { ...c, name: head.consultant.trim() } : c))
          : head.consultant.trim()
            ? [newCompany(head.consultant.trim())]
            : [],
        show_consultant: head.show_consultant,
        contractor: { ...settings.contractor, name: head.contractor.trim() },
        subcontractors: head.subcontractors,
        working_hours: { start: data.working_hours.start, end: data.working_hours.end },
      },
      userProfile!.email,
    );
    setHeadDirty(false);
  }
  function saveHead() {
    if (!userProfile) return;
    setError(undefined);
    run(async () => {
      try {
        await persistHead();
        setNotice("บันทึกข้อมูลโครงการ (ส่วน A) แล้ว — รายงานวันถัดไปของโครงการนี้จะใช้ค่านี้");
      } catch (e) {
        setError(e instanceof ConflictError ? "มีผู้อื่นแก้ตั้งค่าโครงการพร้อมกัน — โหลดหน้าใหม่แล้วลองอีกครั้ง" : "บันทึกข้อมูลโครงการไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  // มีร่างที่ยังไม่ได้บันทึกค้างในเครื่อง (เช่น ปิดหน้าไปก่อน) → เสนอให้กู้คืน
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage ได้หลัง mount เท่านั้น
      if (saved) setRestorable(JSON.parse(saved));
    } catch {}
  }, [key]);

  const update = (fn: (d: DcrData) => DcrData) =>
    setData((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });

  // ฉบับใหม่: ดึง Total ของกำลังคนจากรายงานฉบับก่อน — ผู้ใช้กรอกแค่ "มาทำงาน"
  useEffect(() => {
    if (existing) return;
    let cancelled = false;
    previousReport(project.id, date, settings)
      .then((prev) => {
        if (cancelled || !prev) return;
        const withTotals = (rows: HeadcountRow[]) => rows.map((r) => ({ label: r.label, total: r.total, present: 0 }));
        setData((d) =>
          // เริ่มกรอกตัวเลขแล้ว (หรือกู้ร่าง) → ไม่ทับ
          [...d.manpower.indirect, ...d.manpower.direct].some((r) => r.total || r.present)
            ? d
            : { ...d, manpower: { indirect: withTotals(prev.manpower.indirect), direct: withTotals(prev.manpower.direct) } },
        );
        setNotice(`ดึง Total ของกำลังคนจากรายงานวันที่ ${formatDate(prev.report_date)} แล้ว — กรอกจำนวนที่มาทำงานวันนี้`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ดึงครั้งเดียวตอนเปิดฉบับใหม่
  }, []);

  const remoteChange = live && !live.legacy && baseVersion !== null && live.version !== baseVersion ? { by: live.updated_by } : null;
  const createdElsewhere = live && !live.legacy && baseVersion === null;
  const hours = workingHours(data.working_hours.start, data.working_hours.end);
  const totals = manpowerTotals(data.manpower, hours);
  const locked = data.status === "reviewed" || data.status === "acknowledged";

  async function copyYesterday() {
    setError(undefined);
    try {
      const prev = await previousReport(project.id, data.report_date, settings);
      if (!prev) return setNotice("ไม่พบรายงานก่อนหน้า");
      update((d) => carryOver(prev, d));
      setNotice(`คัดลอกกำลังคน เครื่องจักร และแผนงานจากรายงานวันที่ ${formatDate(prev.report_date)} แล้ว — ตรวจตัวเลขก่อนบันทึก`);
    } catch (e) {
      setError("อ่านรายงานก่อนหน้าไม่สำเร็จ: " + firebaseErrorMessage(e));
    }
  }

  function save(submit: boolean, force = false) {
    if (!userProfile) return;
    const missing = Boolean(L.activities) && data.progress.every((p) => !p.description.trim());
    if (submit && missing) return setError("กรุณากรอกงานที่ดำเนินการวันนี้ (หัวข้อ D) อย่างน้อย 1 รายการก่อนส่งตรวจ");
    setError(undefined);
    setConflict(null);
    run(async () => {
      try {
        if (headDirty) await persistHead();
        // เก็บมาตรฐานที่ใช้เป็น snapshot ตั้งแต่บันทึกครั้งแรก เพื่อไม่ให้ประวัติรายงานเปลี่ยนตามคลังแบบฟอร์ม
        const dataToSave = data.form_standard === appliedStandard ? data : { ...data, form_standard: appliedStandard };
        const result = await saveDcr(project.id, dataToSave, {
          baseVersion: force ? (live?.version ?? baseVersion) : baseVersion,
          actor: userProfile.email,
          force,
          newPhotos: Object.fromEntries(Object.entries(newPhotos).map(([id, list]) => [id, list.map((p) => ({ file: p.file, caption: p.caption }))])),
          newLayoutImages: Object.fromEntries(Object.entries(layoutImages).map(([id, img]) => [id, img.file])),
          removedPaths,
          projectCode: settings.project_no || project.code,
        });
        Object.values(newPhotos).flat().forEach((p) => URL.revokeObjectURL(p.preview));
        setNewPhotos({});
        Object.values(layoutImages).forEach((img) => URL.revokeObjectURL(img.preview));
        setLayoutImages({});
        setRemovedPaths([]);
        setData((d) => ({ ...d, report_no: result.reportNo, doc_no: result.docNo, progress: result.progress, layout_pages: result.layoutPages, form_standard: dataToSave.form_standard }));
        setBaseVersion(result.version);
        try {
          localStorage.removeItem(key);
        } catch {}
        if (submit) {
          await setDcrStatus(project.id, data.report_date, "submitted", signer(), userProfile.email);
          router.push(`/daily-reports/${project.id}/${data.report_date}`);
        } else {
          setNotice(`บันทึกร่างแล้ว · ${result.docNo}`);
        }
      } catch (e) {
        if (e instanceof ConflictError) setConflict(e.message);
        else setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  const signer = () => ({ name: `${displayName(userProfile!)}${userProfile!.position ? ` (${userProfile!.position})` : ""}`, email: userProfile!.email });

  // ── รูปภาพ: ผูกกับรายการงานใน D (รูปที่บันทึกแล้วอยู่ใน progress[].photos, รูปใหม่รออัปโหลดอยู่ใน newPhotos) ──
  async function addPhotos(itemId: string, files: FileList | null) {
    if (!files?.length) return;
    setPhotoBusy(true);
    const added: NewPhoto[] = [];
    for (const f of Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 12)) {
      try {
        const file = await compress(f);
        added.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), caption: "" });
      } catch {}
    }
    setNewPhotos((m) => ({ ...m, [itemId]: [...(m[itemId] ?? []), ...added] }));
    setPhotoBusy(false);
  }
  const setSaved = (itemId: string, fn: (photos: Photo[]) => Photo[]) =>
    update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === itemId ? { ...x, photos: fn(x.photos) } : x)) }));
  const setFresh = (itemId: string, fn: (photos: NewPhoto[]) => NewPhoto[]) => setNewPhotos((m) => ({ ...m, [itemId]: fn(m[itemId] ?? []) }));
  function moveSaved(from: string, to: string, photo: Photo) {
    update((d) => ({
      ...d,
      progress: d.progress.map((x) => (x.id === from ? { ...x, photos: x.photos.filter((p) => p.path !== photo.path) } : x.id === to ? { ...x, photos: [...x.photos, photo] } : x)),
    }));
  }
  function moveFresh(from: string, to: string, photo: NewPhoto) {
    setNewPhotos((m) => ({ ...m, [from]: (m[from] ?? []).filter((p) => p.id !== photo.id), [to]: [...(m[to] ?? []), photo] }));
  }
  function removeItem(itemId: string) {
    const item = data.progress.find((x) => x.id === itemId);
    if (item) setRemovedPaths((r) => [...r, ...item.photos.map((ph) => ph.path)]);
    (newPhotos[itemId] ?? []).forEach((p) => URL.revokeObjectURL(p.preview));
    setNewPhotos((m) => {
      const next = { ...m };
      delete next[itemId];
      return next;
    });
    update((d) => ({ ...d, progress: d.progress.filter((x) => x.id !== itemId) }));
  }
  const setItem = (itemId: string, patch: Partial<DcrData["progress"][number]>) =>
    update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === itemId ? { ...x, ...patch } : x)) }));

  // ── H: รูปของช่อง — รูปเดิมที่ถูกแทน/เอาออก ลบจาก Storage หลังบันทึกสำเร็จ ──
  function dropLayoutImages(slots: LayoutSlot[]) {
    const saved = slots.flatMap((s) => (s.image?.path ? [s.image.path] : []));
    if (saved.length) setRemovedPaths((r) => [...r, ...saved]);
    setLayoutImages((m) => {
      const next = { ...m };
      for (const s of slots) {
        if (next[s.id]) URL.revokeObjectURL(next[s.id].preview);
        delete next[s.id];
      }
      return next;
    });
  }
  async function pickLayoutImage(slotId: string, f: File) {
    if (!f.type.startsWith("image/")) return setError("ไฟล์ที่เลือกไม่ใช่รูปภาพ");
    setLayoutBusy(true);
    try {
      const file = await compress(f);
      const slot = data.layout_pages.flatMap((p) => p.slots).find((s) => s.id === slotId);
      if (slot) dropLayoutImages([slot]);
      update((d) => ({ ...d, layout_pages: d.layout_pages.map((p) => ({ ...p, slots: p.slots.map((s) => (s.id === slotId ? { ...s, image: null } : s)) })) }));
      setLayoutImages((m) => ({ ...m, [slotId]: { file, preview: URL.createObjectURL(file) } }));
    } catch {
      setError("อ่านรูปไม่สำเร็จ — ลองไฟล์ JPG หรือ PNG");
    }
    setLayoutBusy(false);
  }
  const setLayoutPages = (fn: (pages: LayoutPage[]) => LayoutPage[]) => update((d) => ({ ...d, layout_pages: fn(d.layout_pages) }));
  function applyTemplate(id: string, mode: "replace" | "append") {
    const t = layouts?.templates.find((x) => x.id === id);
    if (!t) return;
    const slots = data.layout_pages.flatMap((p) => p.slots);
    if (mode === "replace" && slots.some(hasContent) && !confirm(`แทนที่หน้า ${L.layout ?? "H"} ปัจจุบันด้วยแม่แบบ “${t.name}”? เนื้อหาในหน้าปัจจุบันจะหายไป`)) return;
    if (mode === "replace") dropLayoutImages(slots);
    setLayoutPages((pages) => (mode === "replace" ? fromTemplate(t.pages) : [...pages, ...fromTemplate(t.pages)]));
    setNotice(`${mode === "replace" ? "ใช้" : "เพิ่ม"}แม่แบบ “${t.name}” แล้ว`);
  }
  async function saveTemplate(name: string, keepText: boolean, makeDefault: boolean) {
    if (!userProfile) return false;
    setTemplateBusy(true);
    try {
      await saveLayoutTemplate(project.id, name, toTemplatePages(data.layout_pages, keepText), userProfile.email, makeDefault);
      setNotice(`บันทึกแม่แบบ “${name.trim()}” กับโครงการแล้ว — ใช้ได้ในรายงานวันถัดไป`);
      return true;
    } catch (e) {
      setError("บันทึกแม่แบบไม่สำเร็จ: " + firebaseErrorMessage(e));
      return false;
    } finally {
      setTemplateBusy(false);
    }
  }
  function changeTemplates(action: () => Promise<void>) {
    setTemplateBusy(true);
    action()
      .catch((e) => setError("แก้แม่แบบไม่สำเร็จ: " + firebaseErrorMessage(e)))
      .finally(() => setTemplateBusy(false));
  }

  const subsToday = head.subcontractors.filter((s) => data.subcontractors_today.includes(s.id));
  const appliedStandard = data.form_standard ?? standard;
  // หัวข้อที่มาตรฐานเปิดใช้ + ตัวอักษรที่เรียงใหม่
  const L = sectionLetters(appliedStandard?.sections);
  const nav = [
    ...DAILY_REPORT_STANDARD_SECTIONS.filter((s) => L[s.key]).map((s) => ({ id: s.key, letter: L[s.key]!, title: s.title })),
    { id: "signoff", letter: "✓", title: "ลงนามและส่ง" },
  ];
  const docLabel = data.report_no ? reportDocNo(data, project.code) : null;
  const nextDocNo = formatDocNo(settings.doc_format, project.code, settings.report_counter + 1);
  const itemLabel = (i: number) => {
    const p = data.progress[i];
    return `${L.activities ?? "งาน"}-${i + 1} ${p.zone || p.description.slice(0, 24) || ""}`.trim();
  };
  const photoCount = data.progress.reduce((s, p) => s + p.photos.length + (newPhotos[p.id]?.length ?? 0), 0);

  // ฉบับใหม่: มีแม่แบบเริ่มต้น (★) ของโครงการ → ตั้งหน้า H ตามแม่แบบนั้นครั้งเดียว
  useEffect(() => {
    if (existing || defaultApplied.current || !layouts || !L.layout) return;
    defaultApplied.current = true;
    const t = layouts.templates.find((x) => x.id === layouts.default_id);
    if (!t || data.layout_pages.length) return;
    update((d) => (d.layout_pages.length ? d : { ...d, layout_pages: fromTemplate(t.pages) }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- แจ้งครั้งเดียวเมื่อใช้แม่แบบเริ่มต้น
    setNotice(`ใช้แม่แบบจัดหน้าเริ่มต้น “${t.name}” กับหัวข้อ ${L.layout} แล้ว`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ทำครั้งเดียวเมื่อแม่แบบโหลดเสร็จ
  }, [layouts]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={copyYesterday} disabled={locked}>ดึงข้อมูลจากเมื่อวาน</button>
            <Link href={`/projects/${project.id}/report-settings`} className="btn">ตั้งค่าบริษัท/โลโก้</Link>
          </div>
          <span className="rounded-full bg-warn-soft px-3 py-1 text-xs text-warn">
            {docLabel ?? "ฉบับใหม่ (ออกเลขเมื่อบันทึก)"} · สำรองร่างในเครื่องอัตโนมัติ
          </span>
        </div>

        {restorable && (
          <Banner tone="info">
            มีร่างที่ยังไม่ได้บันทึกค้างอยู่ในเครื่องนี้
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => { setData(normalizeDcrRows(restorable)); setRestorable(null); }}>กู้คืนร่าง</button>
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => { try { localStorage.removeItem(key); } catch {} setRestorable(null); }}>ทิ้ง</button>
          </Banner>
        )}
        {createdElsewhere && <Banner tone="warn">มีผู้ใช้อื่นเพิ่งสร้างรายงานของวันนี้ — ข้อมูลที่คุณกรอกยังอยู่ ถ้าบันทึกจะถูกแจ้งว่ามีรายงานแล้ว</Banner>}
        {locked && <Banner tone="warn">รายงานนี้ผ่านการตรวจแล้ว แก้ไขไม่ได้ — ผู้ตรวจต้อง “ตีกลับแก้ไข” ก่อน</Banner>}
        <ConflictNotice remoteChange={remoteChange} conflictMessage={conflict} onReload={() => { if (live) { setData(stripRecord(live)!); setBaseVersion(live.version); setConflict(null); } }} onForceSave={() => save(false, true)} busy={pending} />
        {notice && <Banner tone="ok">{notice}</Banner>}
        {appliedStandard ? (
          <div className="rounded-lg border border-primary/25 bg-primary-soft px-3 py-2 text-sm text-primary">
            <b>มาตรฐานที่ใช้:</b> {appliedStandard.name}{appliedStandard.code && ` (${appliedStandard.code})`}{appliedStandard.rev && ` · Rev. ${appliedStandard.rev}`}
            <span className="ml-2 text-xs">บันทึกชื่อมาตรฐานนี้ไว้กับรายงานฉบับนี้</span>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            รายงานนี้ใช้รูปแบบพื้นฐานของระบบ — กำหนดมาตรฐานรายงานประจำวันได้ที่ <Link href={`/projects/${project.id}`} className="text-primary hover:underline">รายละเอียดโครงการ</Link>
          </div>
        )}

        <fieldset disabled={locked} className="space-y-3">
          {/* A. ข้อมูลโครงการ */}
          <Section letter="A" title="ข้อมูลโครงการ" en="Project information" id="dcr-sec-project">
            {[settings.client, settings.contractor, ...subsToday].some((c) => c.logo) && (
              <div className="mb-2 flex flex-wrap items-center gap-3">
                {[settings.client, ...(head.show_consultant ? settings.consultants : []), settings.contractor, ...subsToday].map((c) => <CompanyLogo key={c.id} company={c} size={32} />)}
              </div>
            )}
            <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" role="switch" className="dcr-switch" checked={head.show_consultant} onChange={(e) => editHead({ show_consultant: e.target.checked })} />
              แสดง Consultant / PMC
            </label>
            <div className="overflow-x-auto">
              <table className="dcr dcr-edit min-w-[560px]">
                <colgroup><col style={{ width: "17%" }} /><col /><col style={{ width: "15%" }} /><col style={{ width: "27%" }} /></colgroup>
                <tbody>
                  <tr>
                    <th>Project Name</th><td><input aria-label="Project Name" className="dcr-cell" value={head.project_name} onChange={(e) => editHead({ project_name: e.target.value })} /></td>
                    <th>Project No.</th><td><input aria-label="Project No." className="dcr-cell" value={head.project_no} onChange={(e) => editHead({ project_no: e.target.value })} /></td>
                  </tr>
                  <tr>
                    <th>Client</th><td><input aria-label="Client" className="dcr-cell" value={head.client} onChange={(e) => editHead({ client: e.target.value })} /></td>
                    <th>Date</th>
                    <td>
                      <input
                        type="date"
                        aria-label="วันที่รายงาน"
                        className="dcr-cell"
                        value={data.report_date}
                        max={todayInBangkok()}
                        onChange={(e) => {
                          // รายงานเก็บวันละ 1 ฉบับ — เปลี่ยนวันที่ = เปิดรายงานของวันนั้น (ร่างของวันนี้สำรองในเครื่องแล้ว)
                          if (e.target.value && e.target.value !== data.report_date) router.push(`/daily-reports/${project.id}/${e.target.value}/edit`);
                        }}
                      />
                    </td>
                  </tr>
                  {head.show_consultant && (
                    <tr>
                      <th>Consultant / PMC</th>
                      <td colSpan={3}>
                        <div className="flex items-center gap-2">
                          <input aria-label="Consultant / PMC" className="dcr-cell" placeholder="ชื่อบริษัทที่ปรึกษา / PMC" value={head.consultant} onChange={(e) => editHead({ consultant: e.target.value })} />
                          {settings.consultants.length > 1 && <span className="shrink-0 text-xs text-muted">+ {settings.consultants.slice(1).map((c) => c.name).join(", ")}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th>Main Contractor</th><td><input aria-label="Main Contractor" className="dcr-cell" value={head.contractor} onChange={(e) => editHead({ contractor: e.target.value })} /></td>
                    <th>Doc. no.</th>
                    <td>
                      <Fixed>
                        {docLabel ?? <span className="text-muted">{nextDocNo} <span className="text-[11px]">(ออกเลขเมื่อบันทึก)</span></span>}
                      </Fixed>
                    </td>
                  </tr>
                  <tr>
                    <th>Subcontractor</th>
                    <td colSpan={3}>
                      <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                        {head.subcontractors.map((s) => (
                          <Chip
                            key={s.id}
                            on={data.subcontractors_today.includes(s.id)}
                            onClick={() => update((d) => ({ ...d, subcontractors_today: d.subcontractors_today.includes(s.id) ? d.subcontractors_today.filter((x) => x !== s.id) : [...d.subcontractors_today, s.id] }))}
                          >
                            {data.subcontractors_today.includes(s.id) ? "✓ " : "+ "}{s.name || "ไม่มีชื่อ"}
                          </Chip>
                        ))}
                        <input
                          aria-label="เพิ่มผู้รับเหมาช่วง"
                          className="dcr-cell w-52 py-0.5 text-xs"
                          placeholder="+ พิมพ์ชื่อผู้รับเหมาช่วง แล้วกด Enter"
                          value={newSub}
                          onChange={(e) => setNewSub(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addSubcontractor();
                            }
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Working hours</th>
                    <td colSpan={3}>
                      <div className="flex max-w-md items-center gap-1.5">
                        <input type="time" aria-label="เริ่มงาน" className="dcr-cell" value={data.working_hours.start} onChange={(e) => { setHeadDirty(true); update((d) => ({ ...d, working_hours: { ...d.working_hours, start: e.target.value } })); }} />
                        <span className="shrink-0 text-muted">–</span>
                        <input type="time" aria-label="เลิกงาน" className="dcr-cell" value={data.working_hours.end} onChange={(e) => { setHeadDirty(true); update((d) => ({ ...d, working_hours: { ...d.working_hours, end: e.target.value } })); }} />
                        <span className="shrink-0 text-xs text-muted">OT</span>
                        <input aria-label="ช่วงทำงานล่วงเวลา" className="dcr-cell" placeholder="17:00–19:00" value={data.working_hours.overtime} onChange={(e) => update((d) => ({ ...d, working_hours: { ...d.working_hours, overtime: e.target.value } }))} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs text-muted">แก้แล้วกดบันทึก ค่าจะใช้ต่อในรายงานวันถัดไปของโครงการนี้ (ไม่เปลี่ยนข้อมูลโครงการหลัก) · รูปแบบ Doc. no. แก้ได้ที่ <Link href={`/projects/${project.id}/report-settings`} className="text-primary">ตั้งค่าโครงการ</Link></span>
              {headDirty ? <span className="text-xs text-warn">● ยังไม่บันทึก</span> : <span className="text-xs text-ok">✓ ใช้ค่าของโครงการ</span>}
              <button type="button" className="btn ml-auto px-2.5 py-1 text-xs" disabled={pending || !headDirty} onClick={saveHead}>บันทึกเป็นค่าของโครงการ</button>
            </div>
          </Section>

          {/* B. สภาพอากาศ */}
          {L.weather && (<Section letter={L.weather} title="รายงานสภาพอากาศ" en="Weather report" id="dcr-sec-weather">
            <div className="overflow-x-auto">
              <table className="dcr dcr-edit min-w-[640px]">
                <colgroup><col style={{ width: "13%" }} /><col style={{ width: "19%" }} /><col style={{ width: "18%" }} /><col style={{ width: "17%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col /></colgroup>
                <thead>
                  <tr><th>ช่วงเวลา</th><th>สภาพอากาศ</th><th>สถานะ</th><th className="text-center">อุณหภูมิ สูง/ต่ำ °C</th><th className="text-center">ฝน มม.</th><th className="text-center">ชม.สูญเสีย</th><th>สภาพพื้นที่</th></tr>
                </thead>
                <tbody>
                  {(["am", "pm"] as const).map((half, i) => (
                    <tr key={half}>
                      <td>{half === "am" ? "เช้า 08–12" : "บ่าย 13–17"}</td>
                      <td><HalfDaySelect field="sky" value={data.weather[half]} onChange={(patch) => update((d) => ({ ...d, weather: { ...d.weather, [half]: { ...d.weather[half], ...patch } } }))} /></td>
                      <td><HalfDaySelect field="status" value={data.weather[half]} onChange={(patch) => update((d) => ({ ...d, weather: { ...d.weather, [half]: { ...d.weather[half], ...patch } } }))} /></td>
                      {i === 0 && (
                        <>
                          <td rowSpan={2} className="align-middle">
                            <div className="flex items-center gap-1">
                              <input aria-label="อุณหภูมิสูงสุด" type="number" inputMode="decimal" className="dcr-cell" value={data.weather.temp_high ?? ""} onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, temp_high: e.target.value === "" ? null : Number(e.target.value) } }))} />
                              <span className="text-muted">/</span>
                              <input aria-label="อุณหภูมิต่ำสุด" type="number" inputMode="decimal" className="dcr-cell" value={data.weather.temp_low ?? ""} onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, temp_low: e.target.value === "" ? null : Number(e.target.value) } }))} />
                            </div>
                          </td>
                          <td rowSpan={2} className="align-middle"><input aria-label="ปริมาณฝน (มม.)" type="number" min={0} inputMode="decimal" className="dcr-cell" value={data.weather.rain_mm} onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, rain_mm: num(e.target.value) } }))} /></td>
                          <td rowSpan={2} className="align-middle"><input aria-label="ชั่วโมงสูญเสียจากสภาพอากาศ" type="number" min={0} step="0.5" inputMode="decimal" className={`dcr-cell ${data.weather.lost_hours ? "text-bad" : ""}`} value={data.weather.lost_hours} onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, lost_hours: num(e.target.value) } }))} /></td>
                          <td rowSpan={2} className="align-middle">
                            <select aria-label="สภาพพื้นที่" className="dcr-cell" value={data.weather.site_condition} onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, site_condition: e.target.value } }))}>
                              {SITE_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={7}>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs text-muted">หมายเหตุ</span>
                        <input aria-label="หมายเหตุสภาพอากาศ" className="dcr-cell" value={data.weather.remark} placeholder="หยุดงาน 14:30–17:00 เนื่องจากฝนตกหนัก" onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, remark: e.target.value } }))} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>)}

          {/* C. กำลังคน (ซ้าย) · เครื่องจักร (ขวา) */}
          {L.manpower && (<Section letter={L.manpower} title="กำลังคนและเครื่องจักร" en="Manpower & equipment on site" id="dcr-sec-manpower">
            <div className="grid items-start gap-3 md:grid-cols-2">
              <div className="space-y-3">
                <HeadcountTable title="Indirect Manpower (Staff)" addLabel="เพิ่มตำแหน่ง" rows={data.manpower.indirect} onChange={(fn) => update((d) => ({ ...d, manpower: { ...d.manpower, indirect: fn(d.manpower.indirect) } }))} />
                <HeadcountTable title="Direct Manpower (Labor)" addLabel="เพิ่มประเภทช่าง" rows={data.manpower.direct} onChange={(fn) => update((d) => ({ ...d, manpower: { ...d.manpower, direct: fn(d.manpower.direct) } }))} />
              </div>
              <div className="space-y-3">
                <EditTable
                  title="Equipment on site"
                  headers={[["เครื่องจักร / เจ้าของ"], ["จำนวน", "15%", true], ["สถานะทำงาน", "24%"], ["หมายเหตุ", "24%"]]}
                  rows={data.equipment}
                  onChange={(equipment) => update((d) => ({ ...d, equipment }))}
                  blank={{ name: "", owner: "", quantity: 1, status: "working", remark: "" } as EquipmentRow}
                  addLabel="เพิ่มเครื่องจักร"
                  empty="ยังไม่มีเครื่องจักร"
                  footer={data.equipment.length > 0 && <tr className="dcr-total"><td>รวม</td><td className="num">{data.equipment.reduce((s, e) => s + e.quantity, 0)}</td><td colSpan={3}>คัน</td></tr>}
                  render={(r, set) => [
                    <div key="n" className="space-y-1">
                      <input aria-label="ชื่อเครื่องจักร" className="dcr-cell" placeholder="ชื่อเครื่องจักร" value={r.name} onChange={(e) => set({ ...r, name: e.target.value })} />
                      <input aria-label="เจ้าของ" className="dcr-cell text-xs" placeholder="เจ้าของ" value={r.owner} onChange={(e) => set({ ...r, owner: e.target.value })} />
                    </div>,
                    <input key="q" aria-label="จำนวนเครื่องจักร" type="number" min={0} inputMode="numeric" className="dcr-cell" value={r.quantity} onFocus={(e) => e.target.select()} onChange={(e) => set({ ...r, quantity: num(e.target.value) })} />,
                    <select key="s" aria-label="สถานะทำงาน" className={`dcr-cell ${r.status === "breakdown" ? "text-bad" : r.status === "idle" ? "text-warn" : "text-ok"}`} value={r.status} onChange={(e) => set({ ...r, status: e.target.value as typeof r.status })}>
                      {EQUIPMENT_STATUS.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS_LABEL[s]}</option>)}
                    </select>,
                    <input key="r" aria-label="หมายเหตุเครื่องจักร" className="dcr-cell" placeholder="—" value={r.remark} onChange={(e) => set({ ...r, remark: e.target.value })} />,
                  ]}
                />
                <datalist id="dcr-units">{MATERIAL_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
                <EditTable
                  title="วัสดุเข้าไซต์ (Material delivery)"
                  headers={[["รายการ"], ["หน่วย", "16%"], ["จำนวน", "16%", true], ["หมายเหตุ", "25%"]]}
                  rows={data.materials}
                  onChange={(materials) => update((d) => ({ ...d, materials }))}
                  blank={{ item: "", unit: "", quantity: 0, remark: "" }}
                  addLabel="เพิ่มวัสดุ"
                  empty="ไม่มีวัสดุเข้าวันนี้"
                  render={(r, set) => [
                    <input key="i" aria-label="วัสดุ" className="dcr-cell" value={r.item} placeholder="คอนกรีต 240 ksc" onChange={(e) => set({ ...r, item: e.target.value })} />,
                    <input key="u" aria-label="หน่วย" className="dcr-cell" list="dcr-units" value={r.unit} placeholder="ลบ.ม." onChange={(e) => set({ ...r, unit: e.target.value })} />,
                    <input key="q" aria-label="จำนวนวัสดุ" type="number" min={0} step="any" inputMode="decimal" className="dcr-cell" value={r.quantity} onFocus={(e) => e.target.select()} onChange={(e) => set({ ...r, quantity: num(e.target.value) })} />,
                    <input key="r" aria-label="หมายเหตุวัสดุ" className="dcr-cell" placeholder="ผ่านตรวจ / รอตรวจ" value={r.remark} onChange={(e) => set({ ...r, remark: e.target.value })} />,
                  ]}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Indirect มาทำงาน / Total" value={`${totals.indirect.present} / ${totals.indirect.total}`} unit="คน" />
              <Stat label="Direct มาทำงาน / Total" value={`${totals.direct.present} / ${totals.direct.total}`} unit="คน" />
              <Stat label="รวมมาทำงาน" value={totals.total} unit="คน" strong />
              <Stat label={`ชั่วโมงงาน (${hours} ชม./คน)`} value={Math.round(totals.manHours).toLocaleString("th-TH")} unit="ชม." />
            </div>
          </Section>)}

          {/* D. งานที่ทำวันนี้ */}
          {L.activities && (<Section letter={L.activities} title="งานที่ดำเนินการวันนี้" en="Today's activities" id="dcr-sec-activities">
            <datalist id="dcr-work-categories">{WORK_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="space-y-2">
              {data.progress.map((p, i) => {
                const photos = p.photos.length + (newPhotos[p.id]?.length ?? 0);
                return (
                  <ItemCard key={p.id} n={i + 1} onRemove={data.progress.length > 1 ? () => removeItem(p.id) : undefined}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label="พื้นที่ / Zone" className="dcr-cell" placeholder="พื้นที่ / Zone เช่น ชั้น 6 โซน B" value={p.zone} onChange={(e) => setItem(p.id, { zone: e.target.value })} />
                      <input aria-label="หมวดงาน" className="dcr-cell" list="dcr-work-categories" placeholder="หมวดงาน (เลือกหรือพิมพ์)" value={p.category} onChange={(e) => setItem(p.id, { category: e.target.value })} />
                    </div>
                    <textarea aria-label="รายละเอียดงาน" rows={2} className="dcr-cell" placeholder="รายละเอียดงานที่ทำวันนี้" value={p.description} onChange={(e) => setItem(p.id, { description: e.target.value })} />
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input aria-label="ปริมาณวันนี้" className="dcr-cell" placeholder="ปริมาณวันนี้ เช่น 45 ลบ.ม." value={p.quantity} onChange={(e) => setItem(p.id, { quantity: e.target.value })} />
                      <input aria-label="ยอดสะสม" className="dcr-cell" placeholder="สะสม เช่น 62%" value={p.cumulative} onChange={(e) => setItem(p.id, { cumulative: e.target.value })} />
                      <label className={`btn cursor-pointer justify-center px-2.5 py-1 text-xs ${photoBusy ? "opacity-60" : ""}`}>
                        📷 แนบรูป{photos > 0 && ` (${photos})`}
                        <input type="file" accept="image/*" multiple className="sr-only" disabled={photoBusy} onChange={(e) => { addPhotos(p.id, e.target.files); e.target.value = ""; }} />
                      </label>
                    </div>
                  </ItemCard>
                );
              })}
            </div>
            <AddButton label="เพิ่มรายการงาน" onClick={() => update((d) => ({ ...d, progress: [...d.progress, newProgressItem()] }))} />

            <div className="mt-3 rounded-lg bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold text-muted">ความปลอดภัย / คุณภาพ (Safety & Quality)</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="หัวข้อ Toolbox talk" value={data.safety.toolbox_topic} placeholder="การทำงานบนที่สูง" onChange={(toolbox_topic) => update((d) => ({ ...d, safety: { ...d.safety, toolbox_topic } }))} />
                <NumberField label="ผู้เข้าร่วม (คน)" value={data.safety.toolbox_attendees} onChange={(v) => update((d) => ({ ...d, safety: { ...d.safety, toolbox_attendees: num(v) } }))} />
                <NumberField label="อุบัติเหตุ (ครั้ง)" value={data.safety.incidents} onChange={(v) => update((d) => ({ ...d, safety: { ...d.safety, incidents: num(v) } }))} />
                <NumberField label="Near miss (ครั้ง)" value={data.safety.near_miss} onChange={(v) => update((d) => ({ ...d, safety: { ...d.safety, near_miss: num(v) } }))} />
                <TextField label="ข้อสังเกตความปลอดภัย" value={data.safety.remark} onChange={(remark) => update((d) => ({ ...d, safety: { ...d.safety, remark } }))} />
                <TextField label="ขอตรวจงาน / ผล (ITP)" value={data.quality.inspections} placeholder="ตรวจเหล็กเสา ชั้น 7 · ผ่าน" onChange={(inspections) => update((d) => ({ ...d, quality: { ...d.quality, inspections } }))} />
                <TextField label="NCR" value={data.quality.ncr} placeholder="ไม่มี" onChange={(ncr) => update((d) => ({ ...d, quality: { ...d.quality, ncr } }))} />
              </div>
            </div>
          </Section>)}

          {/* E. ปัญหาและอุปสรรค */}
          {L.issues && (<Section letter={L.issues} title="ปัญหาและอุปสรรค" en="Problems & obstacles" id="dcr-sec-issues">
            {data.issues.length === 0 && <p className="rounded-lg border border-dashed border-border py-3 text-center text-sm text-muted">ไม่มีปัญหาและอุปสรรค</p>}
            <div className="space-y-2">
              {data.issues.map((x, i) => {
                const set = (patch: Partial<typeof x>) => update((d) => ({ ...d, issues: d.issues.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
                return (
                  <ItemCard key={i} n={i + 1} onRemove={() => update((d) => ({ ...d, issues: d.issues.filter((_, j) => j !== i) }))}>
                    <textarea aria-label="ปัญหา" rows={2} className="dcr-cell" placeholder="ปัญหาหรืออุปสรรคที่พบ" value={x.description} onChange={(e) => set({ description: e.target.value })} />
                    <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_1fr]">
                      <select aria-label="สาเหตุ" className="dcr-cell" value={x.cause} onChange={(e) => set({ cause: e.target.value })}>
                        {DELAY_CAUSES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5">
                        <input aria-label="ชั่วโมงที่กระทบ" type="number" min={0} step="0.5" className="dcr-cell" value={x.impact_hours} onChange={(e) => set({ impact_hours: num(e.target.value) })} />
                        <span className="shrink-0 text-xs text-muted">ชม. ที่กระทบ</span>
                      </label>
                      <input aria-label="ผู้รับผิดชอบ" className="dcr-cell" placeholder="ผู้รับผิดชอบ" value={x.responsible} onChange={(e) => set({ responsible: e.target.value })} />
                    </div>
                    <input aria-label="แนวทางแก้ไข" className="dcr-cell" placeholder="แนวทางแก้ไข" value={x.action} onChange={(e) => set({ action: e.target.value })} />
                  </ItemCard>
                );
              })}
            </div>
            <AddButton label="เพิ่มปัญหา" onClick={() => update((d) => ({ ...d, issues: [...d.issues, { description: "", cause: DELAY_CAUSES[0], impact_hours: 0, responsible: "", action: "" }] }))} />
            <p className="mt-2 text-xs text-muted">ปัญหาที่ต้องติดตามจนปิดงาน แจ้งเพิ่มได้ที่ <Link href={`/issues/new?project=${project.id}`} className="text-primary">เมนูปัญหา / RFI</Link></p>
          </Section>)}

          {/* F. แผนงานพรุ่งนี้ */}
          {L.tomorrow && (<Section letter={L.tomorrow} title="งานที่วางแผนวันพรุ่งนี้" en="Tomorrow's plan" id="dcr-sec-tomorrow">
            {data.tomorrow.length === 0 && <p className="rounded-lg border border-dashed border-border py-3 text-center text-sm text-muted">ยังไม่มีแผนงาน</p>}
            <div className="space-y-2">
              {data.tomorrow.map((t, i) => {
                const set = (patch: Partial<typeof t>) => update((d) => ({ ...d, tomorrow: d.tomorrow.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
                return (
                  <ItemCard key={i} n={i + 1} onRemove={() => update((d) => ({ ...d, tomorrow: d.tomorrow.filter((_, j) => j !== i) }))}>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,0.8fr)]">
                      <input aria-label="งาน" className="dcr-cell" placeholder="งานที่จะทำพรุ่งนี้" value={t.task} onChange={(e) => set({ task: e.target.value })} />
                      <label className="flex items-center gap-1.5">
                        <input aria-label="จำนวนคน" type="number" min={0} className="dcr-cell" value={t.manpower} onChange={(e) => set({ manpower: num(e.target.value) })} />
                        <span className="shrink-0 text-xs text-muted">คน</span>
                      </label>
                      <input aria-label="ทรัพยากร" className="dcr-cell" placeholder="เครื่องจักร / วัสดุ / ขอตรวจ" value={t.resources} onChange={(e) => set({ resources: e.target.value })} />
                    </div>
                  </ItemCard>
                );
              })}
            </div>
            <AddButton label="เพิ่มแผนงาน" onClick={() => update((d) => ({ ...d, tomorrow: [...d.tomorrow, { task: "", manpower: 0, resources: "" }] }))} />
          </Section>)}

          {/* G. เอกสารแนบ */}
          {L.attachments && (<Section letter={L.attachments} title="เอกสารแนบ / ภาพประกอบ" en="Attachments" hint={photoCount ? `${photoCount} รูป` : undefined} id="dcr-sec-attachments">
            <Attachments
              items={data.progress.map((p, i) => ({ id: p.id, label: itemLabel(i), saved: p.photos, fresh: newPhotos[p.id] ?? [] }))}
              busy={photoBusy}
              prefix={L.attachments}
              onAdd={addPhotos}
              onSavedChange={setSaved}
              onFreshChange={setFresh}
              onRemoveSaved={(itemId, photo) => { setRemovedPaths((r) => [...r, photo.path]); setSaved(itemId, (list) => list.filter((x) => x.path !== photo.path)); }}
              onMoveSaved={moveSaved}
              onMoveFresh={moveFresh}
            />
          </Section>)}

          {/* H. เอกสารแนบแบบจัดหน้า */}
          {L.layout && (<Section letter={L.layout} title="เอกสารแนบ (จัดหน้า)" en="Attachment pages" hint={data.layout_pages.length ? `${data.layout_pages.length} หน้า` : undefined} id="dcr-sec-layout">
            <LayoutEditor
              pages={data.layout_pages}
              onChange={setLayoutPages}
              letter={L.layout}
              docNo={docLabel ?? nextDocNo}
              locked={locked}
              fresh={layoutImages}
              imageBusy={layoutBusy}
              onPickImage={pickLayoutImage}
              onDropImages={dropLayoutImages}
              layouts={layouts}
              templateBusy={templateBusy}
              onSaveTemplate={saveTemplate}
              onApplyTemplate={applyTemplate}
              onDeleteTemplate={(id) => changeTemplates(() => deleteLayoutTemplate(project.id, id, userProfile!.email))}
              onSetDefault={(id) => changeTemplates(() => setDefaultLayoutTemplate(project.id, id, userProfile!.email))}
            />
          </Section>)}
        </fieldset>

        {/* ลงนามและส่ง */}
        <Section letter="✓" title="ลงนามและส่งรายงาน" en="Sign-off" id="dcr-sec-signoff">
          <div className="grid gap-2 sm:grid-cols-3">
            <SignBox title="จัดทำโดย (Prepared)" sig={data.signatures.prepared} fallback={userProfile ? `${displayName(userProfile)} — ลงชื่อเมื่อส่งตรวจ` : ""} />
            <SignBox title="ตรวจสอบโดย (Reviewed)" sig={data.signatures.reviewed} fallback="ผู้จัดการโครงการ" />
            <SignBox title="รับทราบ (Acknowledged)" sig={data.signatures.acknowledged} fallback="ที่ปรึกษา / Client" />
          </div>
          {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-bad">{error}</p>}
          {!locked && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted">ส่งตรวจแล้วจะลงชื่อ “จัดทำโดย” ให้อัตโนมัติ</span>
              {data.report_no > 0 && <Link href={`/daily-reports/${project.id}/${data.report_date}`} className="btn">ดูตัวอย่างก่อนพิมพ์</Link>}
              <button type="button" className="btn" disabled={pending} onClick={() => save(false)}>{pending ? "กำลังบันทึก..." : "บันทึกร่าง"}</button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save(true)}>ส่งให้ PM ตรวจ</button>
            </div>
          )}
        </Section>
      </div>

      {/* สารบัญข้างฟอร์ม (จอใหญ่) */}
      <nav className="hidden lg:block" aria-label="ส่วนของรายงาน">
        <div className="sticky top-20 space-y-0.5 text-sm">
          {nav.map(({ id, letter, title }) => (
            <button key={id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-muted hover:bg-surface-2 hover:text-text" onClick={() => document.getElementById(`dcr-sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span className="grid size-5 shrink-0 place-items-center rounded bg-primary-soft text-[11px] font-bold text-primary">{letter}</span>
              {title}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** ตัดฟิลด์ที่ไม่ใช่ข้อมูลรายงานออก (version / legacy) */
function stripRecord(r: DcrRecord | null): DcrData | null {
  if (!r) return null;
  const { version: _v, updated_by: _u, legacy: _l, ...data } = r;
  void _v;
  void _u;
  void _l;
  return data;
}

// ───────────── ชิ้นส่วนฟอร์ม ─────────────

function Section({ id, letter, title, en, hint, children }: { id: string; letter: string; title: string; en: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 border-b-2 border-primary pb-1.5 font-semibold">
        <span className="dcr-letter">{letter}</span>
        {title}
        <span className="text-xs font-normal text-muted">{en}</span>
        {hint && <span className="ml-auto text-xs font-normal text-muted">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn" | "ok"; children: ReactNode }) {
  const cls = { info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok" }[tone];
  return <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${cls}`} role="status">{children}</div>;
}

/** ค่าที่ดึงมาจากโครงการ — แก้ในฟอร์มนี้ไม่ได้ */
function Fixed({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-surface-2 px-2 py-1 text-[13px]">{children}</div>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="dcr-cell" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="dcr-cell" type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-primary bg-primary-soft text-primary" : "border-dashed border-border text-muted hover:text-text"}`}>
      {children}
    </button>
  );
}

function HalfDaySelect({ field, value, onChange }: { field: "sky" | "status"; value: HalfDay; onChange: (patch: Partial<HalfDay>) => void }) {
  if (field === "sky") {
    return (
      <select aria-label="สภาพอากาศ" className="dcr-cell" value={value.sky} onChange={(e) => onChange({ sky: e.target.value as HalfDay["sky"] })}>
        {SKY.map((s) => <option key={s} value={s}>{SKY_ICON[s]} {SKY_LABEL[s]}</option>)}
      </select>
    );
  }
  const tone = value.status === "workable" ? "text-ok" : value.status === "partial" ? "text-warn" : "text-bad";
  return (
    <select aria-label="สถานะการทำงาน" className={`dcr-cell font-medium ${tone}`} value={value.status} onChange={(e) => onChange({ status: e.target.value as HalfDay["status"] })}>
      {WORK_STATUS.map((s) => <option key={s} value={s}>{WORK_STATUS_LABEL[s]}</option>)}
    </select>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="mt-2 rounded-md border border-dashed border-text/30 px-2.5 py-1 text-xs text-primary hover:border-primary" onClick={onClick}>
      + {label}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} className="grid size-6 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad" onClick={onClick}>
      ✕
    </button>
  );
}

/** การ์ดรายการแบบมีเลขข้อ (D / E / F) */
function ItemCard({ n, onRemove, children }: { n: number; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)_24px] items-start gap-2 rounded-lg border border-border bg-surface-2/40 p-2.5">
      <span className="mt-1 grid size-6 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{n}</span>
      <div className="space-y-2">{children}</div>
      {onRemove ? <RemoveButton label={`ลบรายการที่ ${n}`} onClick={onRemove} /> : <span />}
    </div>
  );
}

function HeadcountTable({ title, addLabel, rows, onChange }: { title: string; addLabel: string; rows: HeadcountRow[]; onChange: (fn: (rows: HeadcountRow[]) => HeadcountRow[]) => void }) {
  const set = (i: number, patch: Partial<HeadcountRow>) => onChange((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sum = sumRows(rows);
  const absent = (r: { total: number; present: number }) => Math.max(0, r.total - r.present);
  return (
    <div>
      <table className="dcr dcr-edit">
        <colgroup><col /><col style={{ width: "17%" }} /><col style={{ width: "19%" }} /><col style={{ width: "14%" }} /><col style={{ width: "32px" }} /></colgroup>
        <thead>
          <tr><th colSpan={5} className="dcr-sub">{title}</th></tr>
          <tr><th>ตำแหน่ง / ประเภท</th><th className="num">Total</th><th className="num">มาทำงาน</th><th className="num">ขาด/ลา</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input aria-label="ตำแหน่ง" className="dcr-cell" value={r.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
              <td><input aria-label={`${r.label} Total`} type="number" min={0} inputMode="numeric" className="dcr-cell" value={r.total} onFocus={(e) => e.target.select()} onChange={(e) => set(i, { total: num(e.target.value) })} /></td>
              <td><input aria-label={`${r.label} มาทำงาน`} type="number" min={0} inputMode="numeric" className="dcr-cell font-semibold" value={r.present} onFocus={(e) => e.target.select()} onChange={(e) => set(i, { present: num(e.target.value) })} /></td>
              <td className={`num ${absent(r) ? "font-semibold text-warn" : "text-muted"}`}>{absent(r) || "–"}</td>
              <td><RemoveButton label={`ลบแถว ${r.label}`} onClick={() => onChange((all) => all.filter((_, j) => j !== i))} /></td>
            </tr>
          ))}
          <tr className="dcr-total"><td>รวม</td><td className="num">{sum.total}</td><td className="num">{sum.present}</td><td className="num">{absent(sum)}</td><td /></tr>
        </tbody>
      </table>
      <AddButton label={addLabel} onClick={() => onChange((all) => [...all, { label: "", total: 0, present: 0 }])} />
    </div>
  );
}

/** ตารางแถวแก้ไขได้ — headers: [ชื่อ, ความกว้าง, ชิดขวา] */
function EditTable<T>({
  title,
  headers,
  rows,
  onChange,
  blank,
  addLabel,
  empty,
  footer,
  render,
}: {
  title: string;
  headers: [string, string?, boolean?][];
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  addLabel: string;
  empty: string;
  footer?: ReactNode;
  render: (row: T, set: (r: T) => void) => ReactNode[];
}) {
  return (
    <div>
      <table className="dcr dcr-edit">
        <colgroup>{headers.map(([h, w]) => <col key={h} style={w ? { width: w } : undefined} />)}<col style={{ width: "32px" }} /></colgroup>
        <thead>
          <tr><th colSpan={headers.length + 1} className="dcr-sub">{title}</th></tr>
          <tr>{headers.map(([h, , right]) => <th key={h} className={right ? "num" : ""}>{h}</th>)}<th /></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={headers.length + 1} className="text-center text-muted">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              {render(r, (next) => onChange(rows.map((x, j) => (j === i ? next : x)))).map((cell, c) => <td key={c}>{cell}</td>)}
              <td><RemoveButton label="ลบแถว" onClick={() => onChange(rows.filter((_, j) => j !== i))} /></td>
            </tr>
          ))}
          {footer}
        </tbody>
      </table>
      <AddButton label={addLabel} onClick={() => onChange([...rows, structuredClone(blank)])} />
    </div>
  );
}

/* eslint-disable @next/next/no-img-element -- รูปจาก Storage / blob preview */
type AttachmentItem = { id: string; label: string; saved: Photo[]; fresh: NewPhoto[] };

/** G: รูปทั้งหมดของรายงาน — เลขรูป G-{ข้อ}.{ลำดับ} ตามรายการงานใน D ที่ผูกไว้ */
function Attachments({
  items,
  prefix,
  busy,
  onAdd,
  onSavedChange,
  onFreshChange,
  onRemoveSaved,
  onMoveSaved,
  onMoveFresh,
}: {
  items: AttachmentItem[];
  prefix: string;
  busy: boolean;
  onAdd: (itemId: string, files: FileList | null) => void;
  onSavedChange: (itemId: string, fn: (photos: Photo[]) => Photo[]) => void;
  onFreshChange: (itemId: string, fn: (photos: NewPhoto[]) => NewPhoto[]) => void;
  onRemoveSaved: (itemId: string, photo: Photo) => void;
  onMoveSaved: (from: string, to: string, photo: Photo) => void;
  onMoveFresh: (from: string, to: string, photo: NewPhoto) => void;
}) {
  const [target, setTarget] = useState<string>();
  const [over, setOver] = useState(false);
  const targetId = items.some((x) => x.id === target) ? target! : items[0]?.id;
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (targetId) onAdd(targetId, e.dataTransfer.files);
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        รูปใหม่ผูกกับงาน
        <div className="w-56">{targetId && <ItemSelect items={items} value={targetId} onChange={setTarget} />}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`grid min-h-40 cursor-pointer place-items-center rounded-lg border-2 border-dashed p-3 text-center text-xs ${over ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:border-primary hover:text-primary"}`}
        >
          {busy ? "กำลังย่อรูป..." : <span><span className="text-2xl">☁️</span><br />ลากรูปมาวาง<br />หรือกดเพื่อเลือก<br /><span className="text-[11px] opacity-70">JPG, PNG · สูงสุดครั้งละ 12 รูป</span></span>}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={busy || !targetId} onChange={(e) => { if (targetId) onAdd(targetId, e.target.files); e.target.value = ""; }} />
        </label>
        {items.flatMap((item, i) => [
          ...item.saved.map((ph, j) => (
            <PhotoCard key={ph.path} src={ph.url} code={`${prefix}-${i + 1}.${j + 1}`} caption={ph.caption}
              onCaption={(caption) => onSavedChange(item.id, (list) => list.map((x) => (x.path === ph.path ? { ...x, caption } : x)))}
              onRemove={() => onRemoveSaved(item.id, ph)}
              select={<ItemSelect items={items} value={item.id} onChange={(to) => onMoveSaved(item.id, to, ph)} />} />
          )),
          ...item.fresh.map((ph, j) => (
            <PhotoCard key={ph.id} fresh src={ph.preview} code={`${prefix}-${i + 1}.${item.saved.length + j + 1}`} caption={ph.caption}
              onCaption={(caption) => onFreshChange(item.id, (list) => list.map((x) => (x.id === ph.id ? { ...x, caption } : x)))}
              onRemove={() => { URL.revokeObjectURL(ph.preview); onFreshChange(item.id, (list) => list.filter((x) => x.id !== ph.id)); }}
              select={<ItemSelect items={items} value={item.id} onChange={(to) => onMoveFresh(item.id, to, ph)} />} />
          )),
        ])}
      </div>
    </div>
  );
}

function ItemSelect({ items, value, onChange }: { items: AttachmentItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <select aria-label="ผูกกับรายการงาน" className="dcr-cell text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
      {items.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
  );
}

function PhotoCard({ src, code, caption, fresh, onCaption, onRemove, select }: { src: string; code: string; caption: string; fresh?: boolean; onCaption: (v: string) => void; onRemove: () => void; select: ReactNode }) {
  return (
    <figure className={`overflow-hidden rounded-lg border bg-surface ${fresh ? "border-primary/50" : "border-border"}`}>
      <div className="relative">
        <img src={src} alt={caption || code} className="aspect-[4/3] w-full object-cover" />
        <span className="absolute top-1 left-1 rounded bg-primary px-1.5 text-[11px] font-semibold text-white">{code}</span>
        {fresh && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">รอบันทึก</span>}
        <button type="button" aria-label={`ลบรูป ${code}`} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-xs text-white" onClick={onRemove}>✕</button>
      </div>
      <figcaption className="space-y-1 p-1.5">
        <input aria-label={`คำบรรยายรูป ${code}`} className="dcr-cell text-xs" placeholder="คำบรรยาย" value={caption} onChange={(e) => onCaption(e.target.value)} />
        {select}
      </figcaption>
    </figure>
  );
}

function Stat({ label, value, unit, strong }: { label: string; value: ReactNode; unit: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${strong ? "bg-primary-soft text-primary" : "bg-surface-2"}`}>
      <div className={`text-xs ${strong ? "" : "text-muted"}`}>{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value} <span className="text-xs font-normal">{unit}</span></div>
    </div>
  );
}

function SignBox({ title, sig, fallback }: { title: string; sig: DcrData["signatures"]["prepared"]; fallback: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-sm">
      <div className="text-xs text-muted">{title}</div>
      {sig ? (
        <>
          <div>{sig.name}</div>
          <div className="text-xs text-ok">✓ {new Date(sig.at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
        </>
      ) : (
        <div className="text-muted">{fallback}</div>
      )}
    </div>
  );
}
