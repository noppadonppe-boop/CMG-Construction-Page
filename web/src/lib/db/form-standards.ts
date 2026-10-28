"use client";

import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type DocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { safeFileName } from "../document-files";
import { deleteFiles, toIso, uploadFile, type StoredFile } from "./common";
import { formStandardPath, formStandardRef, formStandardsCol, projectRef } from "./paths";

// มาตรฐานแบบฟอร์มกลาง: formStandards/{id} — ไฟล์แบบฟอร์ม (อัปโหลด) หรือลิงก์ภายนอก
// แต่ละโครงการเลือกใช้โดยเก็บ id ไว้ที่ projects/{id}.form_standards

export const FORM_CATEGORIES = {
  general: { label: "ทั่วไป / ธุรการ", icon: "🗂️" },
  construction: { label: "งานก่อสร้าง", icon: "🏗️" },
  qc: { label: "ควบคุมคุณภาพ (QC)", icon: "🔍" },
  safety: { label: "ความปลอดภัย", icon: "⛑️" },
  engineering: { label: "วิศวกรรม / แบบ", icon: "📐" },
  procurement: { label: "จัดซื้อ / พัสดุ", icon: "🛒" },
  finance: { label: "บัญชี / การเงิน", icon: "💰" },
  hr: { label: "บุคคล", icon: "👥" },
} as const;
export type FormCategory = keyof typeof FORM_CATEGORIES;
export const FORM_CATEGORY_KEYS = Object.keys(FORM_CATEGORIES) as FormCategory[];

export interface FormFile extends StoredFile {
  file_name: string;
  size: number;
  content_type: string;
}

export interface FormStandard {
  id: string;
  /** เลขที่แบบฟอร์ม เช่น FM-QC-001 */
  code: string;
  name: string;
  category: FormCategory;
  description: string;
  rev: string;
  /** ไฟล์ที่อัปโหลด หรือ null ถ้าใช้ลิงก์ */
  file: FormFile | null;
  /** ลิงก์ภายนอก (เช่น Google Drive) เมื่อไม่ได้อัปโหลดไฟล์ */
  link: string;
  updated_at: string;
  updated_by: string | null;
}

export type FormStandardInput = Pick<FormStandard, "code" | "name" | "category" | "description" | "rev" | "link">;

function toFormStandard(snap: DocumentSnapshot): FormStandard {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    code: d.code ?? "",
    name: d.name ?? "",
    category: d.category in FORM_CATEGORIES ? d.category : "general",
    description: d.description ?? "",
    rev: d.rev ?? "",
    file: d.file ?? null,
    link: d.link ?? "",
    updated_at: toIso(d.updated_at),
    updated_by: d.updated_by ?? null,
  };
}

/** URL สำหรับเปิดแบบฟอร์ม — ไฟล์ที่อัปโหลดก่อน ถ้าไม่มีใช้ลิงก์ (เฉพาะ http/https) */
export function formHref(f: FormStandard): string | null {
  if (f.file) return f.file.url;
  try {
    const u = new URL(f.link.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** คลังมาตรฐานแบบฟอร์มทั้งหมด (realtime) เรียงตามเลขที่ */
export function useFormStandards() {
  const [state, setState] = useState<{ forms: FormStandard[]; loading: boolean; error?: string }>({ forms: [], loading: true });
  useEffect(
    () =>
      onSnapshot(
        formStandardsCol(),
        (snap) =>
          setState({
            forms: snap.docs.map(toFormStandard).toSorted((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name)),
            loading: false,
          }),
        (e) => setState({ forms: [], loading: false, error: e.message }),
      ),
    [],
  );
  return state;
}

/** id สร้างก่อนอัปโหลด เพื่อให้ไฟล์อยู่ในโฟลเดอร์ของแบบฟอร์มนี้ตั้งแต่แรก */
export const newFormStandardId = () => doc(formStandardsCol()).id;

async function uploadFormFile(id: string, rev: string, file: File, onProgress: (f: number) => void): Promise<FormFile> {
  const path = formStandardPath(id, `${safeFileName(rev || "rev")}_${Date.now()}_${safeFileName(file.name)}`);
  const stored = await uploadFile(path, file, onProgress);
  return { ...stored, file_name: file.name, size: file.size, content_type: file.type || "application/octet-stream" };
}

/**
 * สร้าง/แก้แบบฟอร์ม — ถ้าส่งไฟล์ใหม่มา จะแทนที่ไฟล์เดิม (ลบไฟล์เดิมหลังบันทึกสำเร็จ)
 * ถ้าใส่ลิงก์โดยไม่มีไฟล์ใหม่ และ removeFile = true จะเลิกใช้ไฟล์เดิม
 */
export async function saveFormStandard(
  id: string,
  existing: FormStandard | undefined,
  input: FormStandardInput,
  file: File | null,
  removeFile: boolean,
  actor: string,
  onProgress: (fraction: number) => void,
) {
  const uploaded = file ? await uploadFormFile(id, input.rev, file, onProgress) : null;
  const nextFile = uploaded ?? (removeFile ? null : (existing?.file ?? null));
  try {
    await setDoc(
      formStandardRef(id),
      {
        ...input,
        file: nextFile,
        ...(existing ? {} : { created_at: serverTimestamp(), created_by: actor }),
        updated_at: serverTimestamp(),
        updated_by: actor,
      },
      { merge: true },
    );
  } catch (e) {
    if (uploaded) await deleteFiles([uploaded.path]);
    throw e;
  }
  if (existing?.file && existing.file.path !== nextFile?.path) await deleteFiles([existing.file.path]);
}

/** ลบแบบฟอร์มออกจากคลัง — โครงการที่เคยเลือกไว้จะไม่แสดงรายการนี้อีก */
export async function deleteFormStandard(form: FormStandard) {
  await deleteDoc(formStandardRef(form.id));
  if (form.file) await deleteFiles([form.file.path]);
}

/** ตั้งชุดแบบฟอร์มที่โครงการใช้ — ไม่แตะ version ของโครงการ จึงไม่ชนกับฟอร์มแก้ข้อมูลโครงการ */
export async function setProjectFormStandards(projectId: string, ids: string[], actor: string) {
  await updateDoc(projectRef(projectId), {
    form_standards: [...new Set(ids)],
    form_standards_updated_at: serverTimestamp(),
    form_standards_updated_by: actor,
  });
}
