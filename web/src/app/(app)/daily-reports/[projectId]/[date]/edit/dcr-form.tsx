"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import {
  blankReport,
  carryOver,
  DELAY_CAUSES,
  EQUIPMENT_STATUS,
  EQUIPMENT_STATUS_LABEL,
  manpowerTotals,
  newProgressItem,
  reportCode,
  SITE_CONDITIONS,
  SKY,
  SKY_LABEL,
  WORK_STATUS,
  WORK_STATUS_LABEL,
  workingHours,
  type DcrData,
  type DcrSettings,
  type EquipmentRow,
  type HalfDay,
  type HeadcountRow,
} from "@/lib/dcr";
import { ConflictError, DataError } from "@/lib/db/common";
import { previousReport, saveDcr, setDcrStatus, type DcrRecord } from "@/lib/db/dcr";
import type { ProjectRecord } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/format";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { compress } from "@/components/photo-picker";
import { CompanyLogo } from "@/components/company-logo";
import { ConflictNotice } from "@/components/conflict-notice";
import type { DailyReportStandardSnapshot } from "@/lib/daily-report-standard";

type NewPhoto = { id: string; file: File; preview: string; caption: string };

const SECTIONS = ["ข้อมูลโครงการ", "สภาพอากาศ", "กำลังคน", "เครื่องจักร/วัสดุ", "ความคืบหน้า", "ความปลอดภัย/QC", "ปัญหา", "แผนพรุ่งนี้", "ลงนาม"];
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
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<DcrData | null>(null);
  const [pending, run] = useSubmitOnce();
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const key = draftKey(project.id, data.report_date);

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
    const missing = data.progress.every((p) => !p.description.trim());
    if (submit && missing) return setError("กรุณากรอกความคืบหน้าอย่างน้อย 1 รายการก่อนส่งตรวจ");
    setError(undefined);
    setConflict(null);
    run(async () => {
      try {
        // เก็บมาตรฐานที่ใช้เป็น snapshot ตั้งแต่บันทึกครั้งแรก เพื่อไม่ให้ประวัติรายงานเปลี่ยนตามคลังแบบฟอร์ม
        const dataToSave = data.form_standard === appliedStandard ? data : { ...data, form_standard: appliedStandard };
        const result = await saveDcr(project.id, dataToSave, {
          baseVersion: force ? (live?.version ?? baseVersion) : baseVersion,
          actor: userProfile.email,
          force,
          newPhotos: Object.fromEntries(Object.entries(newPhotos).map(([id, list]) => [id, list.map((p) => ({ file: p.file, caption: p.caption }))])),
          removedPaths,
        });
        Object.values(newPhotos).flat().forEach((p) => URL.revokeObjectURL(p.preview));
        setNewPhotos({});
        setRemovedPaths([]);
        setData((d) => ({ ...d, report_no: result.reportNo, progress: result.progress, form_standard: dataToSave.form_standard }));
        setBaseVersion(result.version);
        try {
          localStorage.removeItem(key);
        } catch {}
        if (submit) {
          await setDcrStatus(project.id, data.report_date, "submitted", signer(), userProfile.email);
          router.push(`/daily-reports/${project.id}/${data.report_date}`);
        } else {
          setNotice(`บันทึกร่างแล้ว · ${reportCode(project.code, result.reportNo)}`);
        }
      } catch (e) {
        if (e instanceof ConflictError) setConflict(e.message);
        else setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  const signer = () => ({ name: `${displayName(userProfile!)}${userProfile!.position ? ` (${userProfile!.position})` : ""}`, email: userProfile!.email });

  const consultants = settings.consultants.map((c) => c.name).filter(Boolean).join(", ") || "—";
  const subsToday = settings.subcontractors.filter((s) => data.subcontractors_today.includes(s.id));
  const appliedStandard = data.form_standard ?? standard;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={copyYesterday} disabled={locked}>คัดลอกจากเมื่อวาน</button>
            <Link href={`/projects/${project.id}/report-settings`} className="btn">ตั้งค่าบริษัท/โลโก้</Link>
          </div>
          <span className="rounded-full bg-warn-soft px-3 py-1 text-xs text-warn">
            {data.report_no ? reportCode(project.code, data.report_no) : "ฉบับใหม่ (ออกเลขเมื่อบันทึก)"} · สำรองร่างในเครื่องอัตโนมัติ
          </span>
        </div>

        {restorable && (
          <Banner tone="info">
            มีร่างที่ยังไม่ได้บันทึกค้างอยู่ในเครื่องนี้
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => { setData(restorable); setRestorable(null); }}>กู้คืนร่าง</button>
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
          {/* 1 */}
          <Section n={1} title="ข้อมูลโครงการ" refCb={(el) => (sectionRefs.current[0] = el)} hint="ดึงจากข้อมูลโครงการและการตั้งค่า">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {[settings.client, ...settings.consultants, settings.contractor, ...subsToday].map((c) => (
                <CompanyLogo key={c.id} company={c} size={36} />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnly label="Client / เจ้าของงาน" value={settings.client.name || project.client || "—"} />
              <ReadOnly label="Consultant / CM" value={consultants} />
              <ReadOnly label="Main contractor" value={settings.contractor.name} />
              <ReadOnly label="Location" value={project.location ?? "—"} />
              <ReadOnly label="วันที่" value={formatDate(data.report_date)} />
              <div>
                <span className="label">เวลาทำงาน / OT</span>
                <div className="flex items-center gap-1">
                  <input type="time" aria-label="เริ่มงาน" className="input px-2" value={data.working_hours.start} onChange={(e) => update((d) => ({ ...d, working_hours: { ...d.working_hours, start: e.target.value } }))} />
                  <input type="time" aria-label="เลิกงาน" className="input px-2" value={data.working_hours.end} onChange={(e) => update((d) => ({ ...d, working_hours: { ...d.working_hours, end: e.target.value } }))} />
                </div>
                <input aria-label="ช่วงทำงานล่วงเวลา" className="input mt-1" placeholder="OT เช่น 17:00–19:00" value={data.working_hours.overtime} onChange={(e) => update((d) => ({ ...d, working_hours: { ...d.working_hours, overtime: e.target.value } }))} />
              </div>
            </div>
            {settings.subcontractors.length > 0 && (
              <div className="mt-3">
                <span className="label">ผู้รับเหมาช่วงที่เข้างานวันนี้</span>
                <div className="flex flex-wrap gap-2">
                  {settings.subcontractors.map((s) => (
                    <Chip
                      key={s.id}
                      on={data.subcontractors_today.includes(s.id)}
                      onClick={() => update((d) => ({ ...d, subcontractors_today: d.subcontractors_today.includes(s.id) ? d.subcontractors_today.filter((x) => x !== s.id) : [...d.subcontractors_today, s.id] }))}
                    >
                      {s.name || "ไม่มีชื่อ"}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* 2 */}
          <Section n={2} title="สภาพอากาศและสภาพหน้างาน" refCb={(el) => (sectionRefs.current[1] = el)}>
            <div className="grid gap-3 md:grid-cols-2">
              <HalfDayEditor title="ช่วงเช้า 08:00–12:00" value={data.weather.am} onChange={(patch) => update((d) => ({ ...d, weather: { ...d.weather, am: { ...d.weather.am, ...patch } } }))} />
              <HalfDayEditor title="ช่วงบ่าย 13:00–17:00" value={data.weather.pm} onChange={(patch) => update((d) => ({ ...d, weather: { ...d.weather, pm: { ...d.weather.pm, ...patch } } }))} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField label="อุณหภูมิสูงสุด (°C)" value={data.weather.temp_high ?? ""} onChange={(v) => update((d) => ({ ...d, weather: { ...d.weather, temp_high: v === "" ? null : Number(v) } }))} />
              <NumberField label="อุณหภูมิต่ำสุด (°C)" value={data.weather.temp_low ?? ""} onChange={(v) => update((d) => ({ ...d, weather: { ...d.weather, temp_low: v === "" ? null : Number(v) } }))} />
              <NumberField label="ปริมาณฝน (มม.)" value={data.weather.rain_mm} onChange={(v) => update((d) => ({ ...d, weather: { ...d.weather, rain_mm: num(v) } }))} />
              <NumberField label="ชั่วโมงสูญเสียจากสภาพอากาศ" step="0.5" value={data.weather.lost_hours} onChange={(v) => update((d) => ({ ...d, weather: { ...d.weather, lost_hours: num(v) } }))} />
              <div>
                <label className="label" htmlFor="site-condition">สภาพพื้นที่</label>
                <select id="site-condition" className="input" value={data.weather.site_condition} onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, site_condition: e.target.value } }))}>
                  {SITE_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="label" htmlFor="weather-remark">หมายเหตุ (เช่น ช่วงเวลาที่หยุดงาน)</label>
                <input id="weather-remark" className="input" value={data.weather.remark} placeholder="หยุดงาน 14:30–17:00 เนื่องจากฝนตกหนัก" onChange={(e) => update((d) => ({ ...d, weather: { ...d.weather, remark: e.target.value } }))} />
              </div>
            </div>
          </Section>

          {/* 3 */}
          <Section n={3} title="กำลังคน (Manpower status)" refCb={(el) => (sectionRefs.current[2] = el)}>
            <HeadcountTable title="Indirect / Staff" rows={data.manpower.indirect} onChange={(fn) => update((d) => ({ ...d, manpower: { ...d.manpower, indirect: fn(d.manpower.indirect) } }))} />
            <div className="h-3" />
            <HeadcountTable title="Direct labor ตามประเภทช่าง" rows={data.manpower.direct} onChange={(fn) => update((d) => ({ ...d, manpower: { ...d.manpower, direct: fn(d.manpower.direct) } }))} />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Indirect" value={totals.indirect.main + totals.indirect.sub} />
              <Stat label="Direct" value={totals.direct.main + totals.direct.sub} />
              <Stat label={`รวม / ชั่วโมงงาน (${hours} ชม.)`} value={`${totals.total} · ${Math.round(totals.manHours).toLocaleString("th-TH")}`} />
            </div>
          </Section>

          {/* 4 */}
          <Section n={4} title="เครื่องจักรและวัสดุเข้าไซต์" refCb={(el) => (sectionRefs.current[3] = el)}>
            <RowsTable
              headers={["เครื่องจักร", "เจ้าของ", "ทำงาน (ชม.)", "ว่าง (ชม.)", "สถานะ"]}
              widths={["32%", "16%", "13%", "13%", "20%"]}
              rows={data.equipment}
              onChange={(equipment) => update((d) => ({ ...d, equipment }))}
              blank={{ name: "", owner: "", work_hours: 0, idle_hours: 0, status: "working" } as EquipmentRow}
              addLabel="เพิ่มเครื่องจักร"
              render={(r, set) => [
                <input key="n" aria-label="ชื่อเครื่องจักร" className="input" value={r.name} onChange={(e) => set({ ...r, name: e.target.value })} />,
                <input key="o" aria-label="เจ้าของ" className="input" value={r.owner} onChange={(e) => set({ ...r, owner: e.target.value })} />,
                <input key="w" aria-label="ชั่วโมงทำงาน" type="number" min={0} step="0.5" className="input" value={r.work_hours} onChange={(e) => set({ ...r, work_hours: num(e.target.value) })} />,
                <input key="i" aria-label="ชั่วโมงว่าง" type="number" min={0} step="0.5" className="input" value={r.idle_hours} onChange={(e) => set({ ...r, idle_hours: num(e.target.value) })} />,
                <select key="s" aria-label="สถานะเครื่องจักร" className="input" value={r.status} onChange={(e) => set({ ...r, status: e.target.value as typeof r.status })}>
                  {EQUIPMENT_STATUS.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS_LABEL[s]}</option>)}
                </select>,
              ]}
            />
            <div className="h-3" />
            <RowsTable
              headers={["วัสดุที่เข้าไซต์", "ปริมาณ", "ผลตรวจรับ"]}
              widths={["46%", "24%", "24%"]}
              rows={data.materials}
              onChange={(materials) => update((d) => ({ ...d, materials }))}
              blank={{ item: "", quantity: "", status: "ผ่าน" }}
              addLabel="เพิ่มวัสดุ"
              render={(r, set) => [
                <input key="i" aria-label="วัสดุ" className="input" value={r.item} placeholder="คอนกรีต 240 ksc" onChange={(e) => set({ ...r, item: e.target.value })} />,
                <input key="q" aria-label="ปริมาณ" className="input" value={r.quantity} placeholder="42 ลบ.ม." onChange={(e) => set({ ...r, quantity: e.target.value })} />,
                <select key="s" aria-label="ผลตรวจรับ" className="input" value={r.status} onChange={(e) => set({ ...r, status: e.target.value })}>
                  {["ผ่าน", "รอตรวจ", "ไม่ผ่าน / ส่งคืน"].map((s) => <option key={s}>{s}</option>)}
                </select>,
              ]}
            />
          </Section>

          {/* 5 */}
          <Section n={5} title="ความคืบหน้างานประจำวัน (Daily progress)" refCb={(el) => (sectionRefs.current[4] = el)}>
            <div className="space-y-3">
              {data.progress.map((p, i) => (
                <div key={p.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <b className="text-sm">รายการที่ {i + 1}</b>
                    {data.progress.length > 1 && (
                      <button type="button" className="text-xs text-bad" onClick={() => { setRemovedPaths((r) => [...r, ...p.photos.map((ph) => ph.path)]); update((d) => ({ ...d, progress: d.progress.filter((x) => x.id !== p.id) })); }}>
                        ลบรายการ
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <TextField label="พื้นที่ / Zone" value={p.zone} placeholder="ชั้น 6 โซน B" onChange={(zone) => update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === p.id ? { ...x, zone } : x)) }))} />
                    <TextField label="หมวดงาน (BOQ)" value={p.category} placeholder="งานโครงสร้าง · เทพื้น" onChange={(category) => update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === p.id ? { ...x, category } : x)) }))} />
                    <TextField label="ปริมาณวันนี้" value={p.quantity} placeholder="42 ลบ.ม." onChange={(quantity) => update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === p.id ? { ...x, quantity } : x)) }))} />
                    <TextField label="สะสม" value={p.cumulative} placeholder="68%" onChange={(cumulative) => update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === p.id ? { ...x, cumulative } : x)) }))} />
                  </div>
                  <label className="label mt-2" htmlFor={`desc-${p.id}`}>รายละเอียดงาน</label>
                  <textarea id={`desc-${p.id}`} rows={2} className="input" value={p.description} onChange={(e) => update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === p.id ? { ...x, description: e.target.value } : x)) }))} />
                  <ProgressPhotos
                    saved={p.photos}
                    fresh={newPhotos[p.id] ?? []}
                    onSavedChange={(photos, removed) => { setRemovedPaths((r) => [...r, ...removed]); update((d) => ({ ...d, progress: d.progress.map((x) => (x.id === p.id ? { ...x, photos } : x)) })); }}
                    onFreshChange={(list) => setNewPhotos((m) => ({ ...m, [p.id]: list }))}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="btn mt-3" onClick={() => update((d) => ({ ...d, progress: [...d.progress, newProgressItem()] }))}>+ เพิ่มรายการงาน</button>
          </Section>

          {/* 6 */}
          <Section n={6} title="ความปลอดภัยและคุณภาพ" refCb={(el) => (sectionRefs.current[5] = el)}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="หัวข้อ Toolbox talk" value={data.safety.toolbox_topic} placeholder="การทำงานบนที่สูง" onChange={(toolbox_topic) => update((d) => ({ ...d, safety: { ...d.safety, toolbox_topic } }))} />
              <NumberField label="ผู้เข้าร่วม (คน)" value={data.safety.toolbox_attendees} onChange={(v) => update((d) => ({ ...d, safety: { ...d.safety, toolbox_attendees: num(v) } }))} />
              <NumberField label="อุบัติเหตุ (ครั้ง)" value={data.safety.incidents} onChange={(v) => update((d) => ({ ...d, safety: { ...d.safety, incidents: num(v) } }))} />
              <NumberField label="Near miss (ครั้ง)" value={data.safety.near_miss} onChange={(v) => update((d) => ({ ...d, safety: { ...d.safety, near_miss: num(v) } }))} />
              <TextField label="ข้อสังเกตความปลอดภัย" value={data.safety.remark} onChange={(remark) => update((d) => ({ ...d, safety: { ...d.safety, remark } }))} />
              <TextField label="ขอตรวจงาน / ผล (ITP)" value={data.quality.inspections} placeholder="ตรวจเหล็กเสา ชั้น 7 · ผ่าน" onChange={(inspections) => update((d) => ({ ...d, quality: { ...d.quality, inspections } }))} />
              <TextField label="NCR" value={data.quality.ncr} placeholder="ไม่มี" onChange={(ncr) => update((d) => ({ ...d, quality: { ...d.quality, ncr } }))} />
            </div>
          </Section>

          {/* 7 */}
          <Section n={7} title="ปัญหาและอุปสรรค" refCb={(el) => (sectionRefs.current[6] = el)}>
            <RowsTable
              headers={["ปัญหา", "สาเหตุ", "กระทบ (ชม.)", "ผู้รับผิดชอบ / การแก้ไข"]}
              widths={["36%", "20%", "12%", "26%"]}
              rows={data.issues}
              onChange={(issues) => update((d) => ({ ...d, issues }))}
              blank={{ description: "", cause: DELAY_CAUSES[0], impact_hours: 0, responsible: "", action: "" }}
              addLabel="เพิ่มปัญหา"
              render={(r, set) => [
                <textarea key="d" aria-label="ปัญหา" rows={2} className="input" value={r.description} onChange={(e) => set({ ...r, description: e.target.value })} />,
                <select key="c" aria-label="สาเหตุ" className="input" value={r.cause} onChange={(e) => set({ ...r, cause: e.target.value })}>
                  {DELAY_CAUSES.map((c) => <option key={c}>{c}</option>)}
                </select>,
                <input key="h" aria-label="ชั่วโมงที่กระทบ" type="number" min={0} step="0.5" className="input" value={r.impact_hours} onChange={(e) => set({ ...r, impact_hours: num(e.target.value) })} />,
                <div key="r" className="space-y-1">
                  <input aria-label="ผู้รับผิดชอบ" className="input" placeholder="ผู้รับผิดชอบ" value={r.responsible} onChange={(e) => set({ ...r, responsible: e.target.value })} />
                  <input aria-label="การแก้ไข" className="input" placeholder="การแก้ไข" value={r.action} onChange={(e) => set({ ...r, action: e.target.value })} />
                </div>,
              ]}
            />
            <p className="mt-2 text-xs text-muted">ปัญหาที่ต้องติดตามจนปิดงาน แจ้งเพิ่มได้ที่ <Link href={`/issues/new?project=${project.id}`} className="text-primary">เมนูปัญหา / RFI</Link></p>
          </Section>

          {/* 8 */}
          <Section n={8} title="แผนงานพรุ่งนี้ (Tomorrow plan)" refCb={(el) => (sectionRefs.current[7] = el)}>
            <RowsTable
              headers={["งาน", "คน", "เครื่องจักร / วัสดุ / ขอตรวจ"]}
              widths={["46%", "12%", "36%"]}
              rows={data.tomorrow}
              onChange={(tomorrow) => update((d) => ({ ...d, tomorrow }))}
              blank={{ task: "", manpower: 0, resources: "" }}
              addLabel="เพิ่มแผนงาน"
              render={(r, set) => [
                <input key="t" aria-label="งาน" className="input" value={r.task} onChange={(e) => set({ ...r, task: e.target.value })} />,
                <input key="m" aria-label="จำนวนคน" type="number" min={0} className="input" value={r.manpower} onChange={(e) => set({ ...r, manpower: num(e.target.value) })} />,
                <input key="r" aria-label="ทรัพยากร" className="input" value={r.resources} onChange={(e) => set({ ...r, resources: e.target.value })} />,
              ]}
            />
          </Section>
        </fieldset>

        {/* 9 */}
        <Section n={9} title="ลงนามและส่งรายงาน" refCb={(el) => (sectionRefs.current[8] = el)}>
          <div className="grid gap-2 sm:grid-cols-3">
            <SignBox title="จัดทำโดย (Prepared)" sig={data.signatures.prepared} fallback={userProfile ? `${displayName(userProfile)} — ลงชื่อเมื่อส่งตรวจ` : ""} />
            <SignBox title="ตรวจสอบโดย (Reviewed)" sig={data.signatures.reviewed} fallback="ผู้จัดการโครงการ" />
            <SignBox title="รับทราบ (Acknowledged)" sig={data.signatures.acknowledged} fallback="ที่ปรึกษา / Client" />
          </div>
          {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-bad">{error}</p>}
          {!locked && (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {data.report_no > 0 && <Link href={`/daily-reports/${project.id}/${data.report_date}`} className="btn">ดูรายงาน</Link>}
              <button type="button" className="btn" disabled={pending} onClick={() => save(false)}>{pending ? "กำลังบันทึก..." : "บันทึกร่าง"}</button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save(true)}>ส่งให้ PM ตรวจ</button>
            </div>
          )}
        </Section>
      </div>

      {/* สารบัญข้างฟอร์ม (จอใหญ่) */}
      <nav className="hidden lg:block" aria-label="ส่วนของรายงาน">
        <div className="sticky top-20 space-y-1 text-sm">
          {SECTIONS.map((s, i) => (
            <button key={s} type="button" className="block w-full rounded-md px-2 py-1 text-left text-muted hover:bg-surface-2 hover:text-text" onClick={() => sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {i + 1}. {s}
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

function Section({ n, title, hint, children, refCb }: { n: number; title: string; hint?: string; children: ReactNode; refCb: (el: HTMLElement | null) => void }) {
  return (
    <section ref={refCb} className="card scroll-mt-20">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-xs text-primary">{n}</span>
        {title}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn" | "ok"; children: ReactNode }) {
  const cls = { info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok" }[tone];
  return <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${cls}`} role="status">{children}</div>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="rounded-lg bg-surface-2 px-3 py-2">{value}</div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange, step = "1" }: { label: string; value: number | string; onChange: (v: string) => void; step?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input tabular-nums" type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Chip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: ReactNode; tone?: "ok" | "bad" | "warn" }) {
  const active = tone === "ok" ? "border-ok bg-ok-soft text-ok" : tone === "bad" ? "border-bad bg-bad-soft text-bad" : tone === "warn" ? "border-warn bg-warn-soft text-warn" : "border-primary bg-primary-soft text-primary";
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1 text-[13px] ${on ? active : "border-border text-muted hover:text-text"}`}>
      {children}
    </button>
  );
}

function HalfDayEditor({ title, value, onChange }: { title: string; value: HalfDay; onChange: (patch: Partial<HalfDay>) => void }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {SKY.map((s) => <Chip key={s} on={value.sky === s} onClick={() => onChange({ sky: s })}>{SKY_LABEL[s]}</Chip>)}
      </div>
      <div className="label mt-2">สถานะการทำงาน</div>
      <div className="flex flex-wrap gap-1.5">
        {WORK_STATUS.map((s) => (
          <Chip key={s} on={value.status === s} tone={s === "workable" ? "ok" : s === "partial" ? "warn" : "bad"} onClick={() => onChange({ status: s })}>
            {WORK_STATUS_LABEL[s]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** onChange รับฟังก์ชันคำนวณจากค่าล่าสุด — กดเร็ว ๆ หลายครั้งก็นับครบ */
function Stepper({ value, onChange, label }: { value: number; onChange: (fn: (v: number) => number) => void; label: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <button type="button" aria-label={`ลด ${label}`} className="grid size-7 place-items-center rounded-md border border-border" onClick={() => onChange((v) => Math.max(0, v - 1))}>−</button>
      <input aria-label={label} type="number" min={0} inputMode="numeric" className="w-12 rounded-md border border-border bg-surface px-1 py-1 text-center tabular-nums" value={value} onChange={(e) => { const v = num(e.target.value); onChange(() => v); }} />
      <button type="button" aria-label={`เพิ่ม ${label}`} className="grid size-7 place-items-center rounded-md border border-border" onClick={() => onChange((v) => v + 1)}>+</button>
    </div>
  );
}

function HeadcountTable({ title, rows, onChange }: { title: string; rows: HeadcountRow[]; onChange: (fn: (rows: HeadcountRow[]) => HeadcountRow[]) => void }) {
  const set = (i: number, fn: (r: HeadcountRow) => HeadcountRow) => onChange((all) => all.map((r, j) => (j === i ? fn(r) : r)));
  return (
    <div>
      <div className="label">{title}</div>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-2 py-1.5 font-medium">ตำแหน่ง / ประเภท</th>
              <th className="px-2 py-1.5 font-medium">Main contractor</th>
              <th className="px-2 py-1.5 font-medium">Subcontractor</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1"><input aria-label="ตำแหน่ง" className="input py-1" value={r.label} onChange={(e) => { const label = e.target.value; set(i, (x) => ({ ...x, label })); }} /></td>
                <td className="px-2 py-1"><Stepper label={`${r.label} main`} value={r.main} onChange={(fn) => set(i, (x) => ({ ...x, main: fn(x.main) }))} /></td>
                <td className="px-2 py-1"><Stepper label={`${r.label} sub`} value={r.sub} onChange={(fn) => set(i, (x) => ({ ...x, sub: fn(x.sub) }))} /></td>
                <td className="px-1"><button type="button" aria-label={`ลบแถว ${r.label}`} className="text-muted hover:text-bad" onClick={() => onChange((all) => all.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="mt-1 text-xs text-primary" onClick={() => onChange((all) => [...all, { label: "", main: 0, sub: 0 }])}>+ เพิ่มแถว</button>
    </div>
  );
}

function RowsTable<T>({
  headers,
  widths,
  rows,
  onChange,
  blank,
  addLabel,
  render,
}: {
  headers: string[];
  widths: string[];
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  addLabel: string;
  render: (row: T, set: (r: T) => void) => ReactNode[];
}) {
  return (
    <div>
      {rows.length > 0 && (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {headers.map((h, i) => <th key={h} style={{ width: widths[i] }} className="px-2 py-1.5 font-medium">{h}</th>)}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border align-top">
                  {render(r, (next) => onChange(rows.map((x, j) => (j === i ? next : x)))).map((cell, c) => <td key={c} className="px-2 py-1">{cell}</td>)}
                  <td className="px-1 pt-2"><button type="button" aria-label="ลบแถว" className="text-muted hover:text-bad" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" className="btn mt-2 px-2.5 py-1 text-xs" onClick={() => onChange([...rows, structuredClone(blank)])}>+ {addLabel}</button>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element -- รูปจาก Storage / blob preview */
function ProgressPhotos({
  saved,
  fresh,
  onSavedChange,
  onFreshChange,
}: {
  saved: DcrData["progress"][number]["photos"];
  fresh: NewPhoto[];
  onSavedChange: (photos: DcrData["progress"][number]["photos"], removedPaths: string[]) => void;
  onFreshChange: (photos: NewPhoto[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: NewPhoto[] = [];
    for (const f of Array.from(files).slice(0, 12)) {
      try {
        const file = await compress(f);
        added.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), caption: "" });
      } catch {}
    }
    onFreshChange([...fresh, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {saved.map((ph, i) => (
        <figure key={ph.path} className="relative">
          <img src={ph.url} alt={ph.caption} className="aspect-[4/3] w-full rounded-lg object-cover" />
          <button type="button" aria-label="ลบรูป" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-xs text-white" onClick={() => onSavedChange(saved.filter((_, j) => j !== i), [ph.path])}>✕</button>
          <input aria-label="คำบรรยายรูป" className="input mt-1 px-2 py-1 text-xs" placeholder="คำบรรยาย" value={ph.caption} onChange={(e) => onSavedChange(saved.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)), [])} />
        </figure>
      ))}
      {fresh.map((ph) => (
        <figure key={ph.id} className="relative">
          <img src={ph.preview} alt={ph.caption} className="aspect-[4/3] w-full rounded-lg object-cover ring-2 ring-primary-soft" />
          <button type="button" aria-label="ลบรูป" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-xs text-white" onClick={() => { URL.revokeObjectURL(ph.preview); onFreshChange(fresh.filter((x) => x.id !== ph.id)); }}>✕</button>
          <input aria-label="คำบรรยายรูป" className="input mt-1 px-2 py-1 text-xs" placeholder="คำบรรยาย" value={ph.caption} onChange={(e) => onFreshChange(fresh.map((x) => (x.id === ph.id ? { ...x, caption: e.target.value } : x)))} />
        </figure>
      ))}
      <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-lg border border-dashed border-border text-center text-xs text-muted hover:border-primary hover:text-primary">
        {busy ? "กำลังย่อรูป..." : <span>📷<br />เพิ่มรูป</span>}
        <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(e) => add(e.target.files)} />
      </label>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SignBox({ title, sig, fallback }: { title: string; sig: DcrData["signatures"]["prepared"]; fallback: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
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
