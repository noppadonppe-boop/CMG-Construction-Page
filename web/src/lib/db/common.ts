"use client";

import { Timestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "../firebase/client";

/** ข้อผิดพลาดที่แสดงให้ผู้ใช้เห็นได้ตรง ๆ */
export class DataError extends Error {}

/**
 * มีคนอื่นบันทึกข้อมูลชุดเดียวกันหลังจากที่เราเปิดฟอร์ม — ไม่บันทึกทับเงียบ ๆ
 * ฟอร์มจะเก็บข้อความที่กรอกไว้ แล้วให้ผู้ใช้เลือก "บันทึกทับ" เอง
 */
export class ConflictError extends Error {
  constructor(public by: string | null) {
    super(`ข้อมูลนี้ถูกแก้ไขโดย ${by ?? "ผู้ใช้อื่น"} หลังจากที่คุณเปิดฟอร์ม`);
  }
}

export const toIso = (v: unknown, fallback = new Date().toISOString()) =>
  v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : fallback;

export type StoredFile = { path: string; url: string };

/** อัปโหลดไฟล์จากเบราว์เซอร์ตรงเข้า Storage (ไม่ผ่าน server — รองรับไฟล์ใหญ่ มีความคืบหน้า) */
export function uploadFile(path: string, file: Blob, onProgress?: (fraction: number) => void): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const fileRef = ref(storage(), path);
    const task = uploadBytesResumable(fileRef, file, { contentType: file.type || "application/octet-stream" });
    task.on(
      "state_changed",
      (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      reject,
      () => getDownloadURL(fileRef).then((url) => resolve({ path, url }), reject),
    );
  });
}

/** อัปโหลดหลายไฟล์ — ถ้าพังกลางทาง ลบไฟล์ที่อัปไปแล้วก่อน throw */
export async function uploadFiles(files: { path: string; file: Blob }[]): Promise<StoredFile[]> {
  const done: StoredFile[] = [];
  try {
    for (const f of files) done.push(await uploadFile(f.path, f.file));
    return done;
  } catch (e) {
    await deleteFiles(done.map((d) => d.path));
    throw e;
  }
}

export async function deleteFiles(paths: string[]) {
  await Promise.allSettled(paths.filter(Boolean).map((p) => deleteObject(ref(storage(), p))));
}

export const newId = () => crypto.randomUUID();
