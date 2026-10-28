"use client";

import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, updateDoc, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase/client";
import { safeFileName } from "../document-files";
import type { DocumentCategory, DocumentRevision, DocumentStatus, ProjectDocument } from "../types";
import { DataError, deleteFiles, toIso, uploadFile } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";
import { sectionCol, storagePath } from "./paths";

// เอกสาร / แบบ: projects/{projectId}/documents/{id} + ไฟล์ทุก revision ใน Storage

function toDocument(snap: QueryDocumentSnapshot, project: ProjectRecord): ProjectDocument {
  const d = snap.data();
  return {
    id: snap.id,
    project_id: project.id,
    project_name: project.name,
    category: d.category ?? "other",
    doc_no: d.doc_no ?? "",
    title: d.title ?? "",
    status: d.status ?? "pending",
    revisions: (d.revisions ?? []) as DocumentRevision[],
    updated_at: toIso(d.updated_at),
  };
}

export function useDocuments(projects: ProjectRecord[]) {
  const { items, loading, error } = useProjectSection(projects, "documents", toDocument);
  return { documents: items.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at)), loading, error };
}

export type NewDocumentInput = {
  project_id: string;
  category: DocumentCategory;
  doc_no: string;
  title: string;
  status: DocumentStatus;
};

async function uploadRevision(projectId: string, docId: string, rev: string, note: string | null, file: File, onProgress: (f: number) => void) {
  const path = storagePath(projectId, "documents", docId, `${safeFileName(rev)}_${Date.now()}_${safeFileName(file.name)}`);
  const stored = await uploadFile(path, file, onProgress);
  const revision: DocumentRevision = {
    rev,
    note,
    file_name: file.name,
    path: stored.path,
    url: stored.url,
    size: file.size,
    content_type: file.type || "application/octet-stream",
    uploaded_at: new Date().toISOString(),
  };
  return revision;
}

/** id สร้างก่อนอัปโหลด เพื่อให้ไฟล์อยู่ในโฟลเดอร์ของเอกสารนี้ตั้งแต่แรก */
export const newDocumentRef = (projectId: string) => doc(sectionCol(projectId, "documents"));

export async function createDocument(
  docId: string,
  input: NewDocumentInput,
  rev: { rev: string; note: string | null },
  file: File,
  actor: string,
  onProgress: (fraction: number) => void,
) {
  const ref = doc(sectionCol(input.project_id, "documents"), docId);
  const revision = await uploadRevision(input.project_id, docId, rev.rev, rev.note, file, onProgress);
  try {
    await runTransaction(db(), async (tx) => {
      if ((await tx.get(ref)).exists()) throw new DataError("เอกสารนี้ถูกบันทึกไปแล้ว");
      // project_id ไม่ต้องเก็บ — เอกสารอยู่ใต้โครงการอยู่แล้ว
      const { category, doc_no, title, status } = input;
      tx.set(ref, {
        ...{ category, doc_no, title, status },
        revisions: [{ ...revision, uploaded_by: actor }],
        created_at: serverTimestamp(),
        created_by: actor,
        updated_at: serverTimestamp(),
      });
    });
  } catch (e) {
    await deleteFiles([revision.path]);
    throw e;
  }
}

/** อัปโหลดฉบับแก้ไข — สถานะกลับเป็น "รอตรวจ" เพราะเป็นไฟล์ใหม่ที่ยังไม่มีใครตรวจ */
export async function addRevision(
  projectId: string,
  id: string,
  rev: { rev: string; note: string | null },
  file: File,
  actor: string,
  onProgress: (fraction: number) => void,
) {
  const ref = doc(sectionCol(projectId, "documents"), id);
  const same = (r: DocumentRevision) => r.rev.toUpperCase() === rev.rev.toUpperCase();
  const before = await getDoc(ref);
  if (!before.exists()) throw new DataError("เอกสารนี้ถูกลบไปแล้ว");
  if (((before.get("revisions") ?? []) as DocumentRevision[]).some(same)) throw new DataError(`มี Rev. ${rev.rev} อยู่แล้ว`);

  const revision = await uploadRevision(projectId, id, rev.rev, rev.note, file, onProgress);
  try {
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError("เอกสารนี้ถูกลบไปแล้ว");
      const revisions = (snap.get("revisions") ?? []) as DocumentRevision[];
      if (revisions.some(same)) throw new DataError(`มี Rev. ${rev.rev} อยู่แล้ว (เพิ่งมีคนอัปโหลด)`);
      tx.update(ref, { revisions: [...revisions, { ...revision, uploaded_by: actor }], status: "pending", updated_at: serverTimestamp() });
    });
  } catch (e) {
    await deleteFiles([revision.path]);
    throw e;
  }
}

export async function updateDocumentStatus(projectId: string, id: string, status: DocumentStatus, actor: string) {
  await updateDoc(doc(sectionCol(projectId, "documents"), id), { status, updated_at: serverTimestamp(), updated_by: actor });
}

export async function deleteDocument(projectId: string, document: ProjectDocument) {
  await deleteDoc(doc(sectionCol(projectId, "documents"), document.id));
  await deleteFiles(document.revisions.map((r) => r.path));
}
