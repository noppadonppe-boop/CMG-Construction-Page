"use client";

import { deleteField, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { DataError, deleteFiles, uploadFile, type StoredFile } from "./common";
import { APP_NAME, emailSetupRef, projectRef } from "./paths";

// ตั้งค่าอีเมลส่งรายงานประจำวัน — เก็บที่ projects/{id}/email_setup/config
// (แยกจากเอกสารโครงการ จึงไม่ชนกับฟอร์มแก้ข้อมูลโครงการ)
// รุ่นแรกเก็บเป็นฟิลด์ projects/{id}.email_setup — อ่านจากที่เดิมถ้ายังไม่มี config และย้ายมาเมื่อบันทึกครั้งถัดไป

export interface EmailContact {
  id: string;
  name: string;
  email: string;
  company: string;
  position: string;
}

export interface EmailAttachmentFile extends StoredFile {
  file_name: string;
  size: number;
}

export interface EmailSetup {
  contacts: EmailContact[];
  /** id ของ contact */
  to: string[];
  cc: string[];
  subject: string;
  attach_report_pdf: boolean;
  attach_photos: boolean;
  files: EmailAttachmentFile[];
}

/** ตัวแปรที่ใช้ใน Subject ได้ — แทนค่าตอนส่งรายงานจริง */
export const EMAIL_SUBJECT_VARIABLES = [
  { key: "{code}", label: "รหัสโครงการ" },
  { key: "{project}", label: "ชื่อโครงการ" },
  { key: "{date}", label: "วันที่รายงาน" },
] as const;

export const DEFAULT_EMAIL_SUBJECT = "[{code}] Daily Report {date} - {project}";

export const blankEmailSetup = (): EmailSetup => ({
  contacts: [],
  to: [],
  cc: [],
  subject: DEFAULT_EMAIL_SUBJECT,
  attach_report_pdf: true,
  attach_photos: false,
  files: [],
});

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function toEmailSetup(value: unknown): EmailSetup {
  const d = (value ?? {}) as Partial<EmailSetup>;
  const blank = blankEmailSetup();
  const contacts = (d.contacts ?? []).filter((c) => c && c.id && c.email);
  const ids = new Set(contacts.map((c) => c.id));
  return {
    contacts,
    // ตัด id ของคนที่ถูกลบออกจากรายชื่อไปแล้ว
    to: (d.to ?? []).filter((id) => ids.has(id)),
    cc: (d.cc ?? []).filter((id) => ids.has(id)),
    subject: d.subject ?? blank.subject,
    attach_report_pdf: d.attach_report_pdf ?? blank.attach_report_pdf,
    attach_photos: d.attach_photos ?? blank.attach_photos,
    files: d.files ?? [],
  };
}

export async function loadEmailSetup(projectId: string): Promise<EmailSetup> {
  const config = await getDoc(emailSetupRef(projectId));
  if (config.exists()) return toEmailSetup(config.data());
  const project = await getDoc(projectRef(projectId));
  if (!project.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
  return toEmailSetup(project.get("email_setup"));
}

/** ไฟล์แนบทั้งหมดของการตั้งค่า — ใช้ตอนลบโครงการ */
export async function emailSetupFiles(projectId: string): Promise<StoredFile[]> {
  return (await loadEmailSetup(projectId).catch(() => blankEmailSetup())).files;
}

const attachmentPath = (projectId: string, fileName: string) =>
  `${APP_NAME}/root/projects/${projectId}/email_setup/${crypto.randomUUID()}-${fileName}`;

/**
 * บันทึกการตั้งค่า — อัปโหลดไฟล์แนบใหม่ก่อน แล้วลบไฟล์เดิมที่ถูกเอาออกหลังบันทึกสำเร็จ
 * removed = ไฟล์ที่เคยบันทึกไว้แต่ผู้ใช้เอาออก
 */
export async function saveEmailSetup(
  projectId: string,
  setup: EmailSetup,
  newFiles: File[],
  removed: EmailAttachmentFile[],
  actor: string,
) {
  const uploaded: EmailAttachmentFile[] = [];
  try {
    for (const f of newFiles) {
      const stored = await uploadFile(attachmentPath(projectId, f.name), f);
      uploaded.push({ ...stored, file_name: f.name, size: f.size });
    }
    await setDoc(emailSetupRef(projectId), {
      ...setup,
      files: [...setup.files, ...uploaded],
      updated_at: serverTimestamp(),
      updated_by: actor,
    });
  } catch (e) {
    await deleteFiles(uploaded.map((u) => u.path));
    throw e;
  }
  await deleteFiles(removed.map((r) => r.path));
  // ล้างฟิลด์รุ่นแรกในเอกสารโครงการ (ถ้ามี) — ไม่สำคัญถ้าพลาด เพราะ config มีแล้วจะอ่านจาก config ก่อน
  await updateDoc(projectRef(projectId), {
    email_setup: deleteField(),
    email_setup_updated_at: deleteField(),
    email_setup_updated_by: deleteField(),
  }).catch(() => {});
}
