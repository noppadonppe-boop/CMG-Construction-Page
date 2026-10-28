"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { ConflictError, DataError } from "@/lib/db/common";
import { deleteLogo, saveDcrSettings, uploadLogo, useDcrSettings } from "@/lib/db/dcr";
import { useProjects } from "@/lib/db/projects";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { newCompany, type Company, type DcrSettings } from "@/lib/dcr";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { Guard } from "@/components/guard";
import { CompanyLogo } from "@/components/company-logo";
import { ConflictNotice } from "@/components/conflict-notice";

export default function ReportSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { byId, loading } = useProjects();
  const project = byId.get(id);
  const { settings, loading: loadingSettings } = useDcrSettings(project?.id, project?.client ?? null);

  if (loading || (project && loadingSettings)) return <Skeleton />;
  if (!project || !settings) return <EmptyState>ไม่พบโครงการ หรือคุณไม่ได้รับมอบหมายโครงการนี้</EmptyState>;
  return (
    <>
      <PageHeader
        eyebrow={`โครงการ / ${project.code}`}
        title="ตั้งค่ารายงานประจำวัน"
        subtitle={`${project.name} · บริษัทและโลโก้บนหัวรายงาน, เวลาทำงาน, รายการช่างและเครื่องจักรตั้งต้น`}
        actions={<Link href={`/projects/${project.id}`} className="btn">กลับไปโครงการ</Link>}
      />
      <Guard permission="project.edit">
        {/* key = id: ฟอร์มเริ่มจากค่าตอนเปิด ไม่ถูกล้างเมื่อมีคนอื่นบันทึก (มีแจ้งเตือนแทน) */}
        <SettingsForm key={project.id} projectId={project.id} initial={settings} live={settings} />
      </Guard>
    </>
  );
}

function SettingsForm({ projectId, initial, live }: { projectId: string; initial: DcrSettings; live: DcrSettings }) {
  const { userProfile } = useAuth();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, run] = useSubmitOnce();
  // โลโก้ที่อัปโหลดในรอบนี้แต่ยังไม่บันทึก — ถ้ายกเลิก/เปลี่ยนใหม่จะลบทิ้ง
  const uploadedThisSession = useRef(new Set<string>());
  const removedOnSave = useRef<Company["logo"][]>([]);
  const remoteChange = live.version !== s.version ? { by: null } : null;

  const update = (patch: Partial<DcrSettings>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  function save(force = false) {
    if (!userProfile) return;
    if (!s.client.name.trim() || !s.contractor.name.trim()) return setError("กรุณากรอกชื่อ Client และ Contractor");
    setError(undefined);
    setConflict(null);
    run(async () => {
      try {
        await saveDcrSettings(projectId, s, userProfile.email, force);
        await Promise.all(removedOnSave.current.map(deleteLogo));
        removedOnSave.current = [];
        uploadedThisSession.current.clear();
        setS((prev) => ({ ...prev, version: (force ? live.version : prev.version) + 1 }));
        setSaved(true);
      } catch (e) {
        if (e instanceof ConflictError) setConflict(e.message);
        else setError(e instanceof DataError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });
  }

  const companyProps = {
    projectId,
    onUploaded: (path: string) => uploadedThisSession.current.add(path),
    onRemoved: (logo: Company["logo"]) => {
      if (!logo) return;
      // โลโก้ที่เพิ่งอัปในรอบนี้ลบได้ทันที ส่วนโลโก้เดิมลบหลังบันทึกสำเร็จ
      if (uploadedThisSession.current.has(logo.path)) deleteLogo(logo);
      else removedOnSave.current.push(logo);
    },
  };

  return (
    <div className="grid max-w-4xl gap-4">
      <ConflictNotice
        remoteChange={remoteChange}
        conflictMessage={conflict}
        onReload={() => {
          setS(live);
          setConflict(null);
        }}
        onForceSave={() => save(true)}
        busy={pending}
      />

      <section className="card space-y-4">
        <h3 className="font-semibold">บริษัทและโลโก้บนหัวรายงาน</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <CompanyEditor label="Client / เจ้าของงาน" company={s.client} onChange={(client) => update({ client })} {...companyProps} />
          <CompanyEditor label="Main contractor / ผู้รับเหมาหลัก" company={s.contractor} onChange={(contractor) => update({ contractor })} {...companyProps} />
        </div>
        <CompanyList
          label="Consultant / ที่ปรึกษา / CM"
          addLabel="เพิ่มที่ปรึกษา"
          companies={s.consultants}
          onChange={(consultants) => update({ consultants })}
          {...companyProps}
        />
        <CompanyList
          label="Subcontractor / ผู้รับเหมาช่วง"
          addLabel="เพิ่มผู้รับเหมาช่วง"
          companies={s.subcontractors}
          onChange={(subcontractors) => update({ subcontractors })}
          {...companyProps}
        />
        <p className="text-xs text-muted">โลโก้: PNG, JPG, SVG หรือ WebP ไม่เกิน 2 MB · แนะนำพื้นหลังโปร่งใส สัดส่วนใกล้เคียงสี่เหลี่ยมจัตุรัส</p>
      </section>

      <section className="card grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold">เวลาทำงานปกติ</h3>
          <div className="flex items-center gap-2">
            <input type="time" aria-label="เวลาเริ่มงาน" className="input" value={s.working_hours.start} onChange={(e) => update({ working_hours: { ...s.working_hours, start: e.target.value } })} />
            <span className="text-muted">–</span>
            <input type="time" aria-label="เวลาเลิกงาน" className="input" value={s.working_hours.end} onChange={(e) => update({ working_hours: { ...s.working_hours, end: e.target.value } })} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-semibold">เครื่องจักรประจำไซต์</h3>
          <LinesEditor
            label="เครื่องจักร (1 บรรทัดต่อ 1 รายการ: ชื่อ | เจ้าของ)"
            lines={s.equipment.map((e) => (e.owner ? `${e.name} | ${e.owner}` : e.name))}
            onChange={(lines) => update({ equipment: lines.map((l) => ({ name: l.split("|")[0].trim(), owner: (l.split("|")[1] ?? "").trim() })) })}
            placeholder={"ทาวเวอร์เครน TC-01 | CMG\nปั๊มคอนกรีต 36 ม. | เช่า"}
          />
        </div>
        <LinesEditor label="ตำแหน่ง Indirect / Staff (1 บรรทัดต่อ 1 ตำแหน่ง)" lines={s.indirect_roles} onChange={(indirect_roles) => update({ indirect_roles })} />
        <LinesEditor label="ประเภทช่าง Direct labor (1 บรรทัดต่อ 1 ประเภท)" lines={s.trades} onChange={(trades) => update({ trades })} />
      </section>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-ok">บันทึกแล้ว</span>}
        <button className="btn btn-primary" onClick={() => save()} disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </div>
    </div>
  );
}

type CompanyHandlers = { projectId: string; onUploaded: (path: string) => void; onRemoved: (logo: Company["logo"]) => void };

function CompanyEditor({
  label,
  company,
  onChange,
  onDelete,
  projectId,
  onUploaded,
  onRemoved,
}: { label: string; company: Company; onChange: (c: Company) => void; onDelete?: () => void } & CompanyHandlers) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const logo = await uploadLogo(projectId, file);
      if (logo) onUploaded(logo.path);
      onRemoved(company.logo);
      onChange({ ...company, logo });
    } catch (e) {
      setError(e instanceof DataError ? e.message : "อัปโหลดไม่สำเร็จ: " + firebaseErrorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="label">{label}</div>
      <div className="flex items-center gap-3">
        <CompanyLogo company={company} size={56} />
        <div className="min-w-0 flex-1 space-y-2">
          <input aria-label={`ชื่อ ${label}`} className="input" value={company.name} placeholder="ชื่อบริษัท" onChange={(e) => onChange({ ...company, name: e.target.value })} />
          <div className="flex flex-wrap gap-1.5">
            <label className={`btn cursor-pointer px-2.5 py-1 text-xs ${busy ? "opacity-60" : ""}`}>
              {busy ? "กำลังอัปโหลด..." : company.logo ? "เปลี่ยนโลโก้" : "อัปโหลดโลโก้"}
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            {company.logo && (
              <button
                type="button"
                className="btn px-2.5 py-1 text-xs"
                onClick={() => {
                  onRemoved(company.logo);
                  onChange({ ...company, logo: null });
                }}
              >
                เอาโลโก้ออก
              </button>
            )}
            {onDelete && (
              <button type="button" className="btn px-2.5 py-1 text-xs text-bad" onClick={onDelete}>
                ลบบริษัท
              </button>
            )}
          </div>
          {error && <p className="text-xs text-bad">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function CompanyList({
  label,
  addLabel,
  companies,
  onChange,
  ...handlers
}: { label: string; addLabel: string; companies: Company[]; onChange: (c: Company[]) => void } & CompanyHandlers) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label}</h4>
        <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => onChange([...companies, newCompany()])}>
          + {addLabel}
        </button>
      </div>
      {companies.length === 0 ? (
        <p className="text-sm text-muted">ยังไม่มี</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {companies.map((c, i) => (
            <CompanyEditor
              key={c.id}
              label={`${label.split(" /")[0]} ${i + 1}`}
              company={c}
              onChange={(next) => onChange(companies.map((x) => (x.id === c.id ? next : x)))}
              onDelete={() => {
                handlers.onRemoved(c.logo);
                onChange(companies.filter((x) => x.id !== c.id));
              }}
              {...handlers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinesEditor({ label, lines, onChange, placeholder }: { label: string; lines: string[]; onChange: (l: string[]) => void; placeholder?: string }) {
  // แก้เป็นข้อความ แล้วแปลงเป็นรายการตอนพิมพ์ (บรรทัดว่างตัดทิ้ง)
  const [text, setText] = useState(lines.join("\n"));
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        aria-label={label}
        className="input min-h-36"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean));
        }}
      />
    </div>
  );
}
