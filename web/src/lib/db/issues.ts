"use client";

import { doc, runTransaction, serverTimestamp, updateDoc, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase/client";
import type { Issue, IssueCategory, IssueStatus, NewIssue } from "../types";
import { DataError, deleteFiles, newId, toIso, uploadFiles, type StoredFile } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";
import { projectRef, sectionCol, storagePath } from "./paths";

// ปัญหา / ความปลอดภัย / RFI: projects/{projectId}/issues/{id}
// เลขรันของแต่ละหมวดเก็บที่เอกสารโครงการ ฟิลด์ issue_counters.{issue|safety|rfi}

const CODE_PREFIX: Record<IssueCategory, string> = { issue: "ISS", safety: "SAF", rfi: "RFI" };

function toIssue(snap: QueryDocumentSnapshot, project: ProjectRecord): Issue {
  const d = snap.data();
  return {
    id: snap.id,
    code: d.code ?? "",
    project_id: project.id,
    project_name: project.name,
    category: d.category ?? "issue",
    title: d.title ?? "",
    description: d.description ?? "",
    priority: d.priority ?? "normal",
    status: d.status ?? "open",
    assignee: d.assignee ?? null,
    due_date: d.due_date ?? null,
    photos: ((d.photos ?? []) as StoredFile[]).map((p) => p.url),
    created_at: toIso(d.created_at),
    closed_at: d.closed_at ? toIso(d.closed_at) : null,
  };
}

export function useIssues(projects: ProjectRecord[]) {
  const { items, loading, error } = useProjectSection(projects, "issues", toIssue);
  return { issues: items.toSorted((a, b) => b.created_at.localeCompare(a.created_at)), loading, error };
}

/** แจ้งเรื่องใหม่ — ออกเลขรันใน transaction เดียวกับการบันทึก จึงไม่ได้เลขซ้ำแม้แจ้งพร้อมกัน */
export async function createIssue(input: NewIssue, photos: File[], actor: string): Promise<string> {
  const issueRef = doc(sectionCol(input.project_id, "issues"));
  const uploaded = await uploadFiles(
    photos.map((file) => ({ path: storagePath(input.project_id, "issues", issueRef.id, `${newId()}.jpg`), file })),
  );
  try {
    await runTransaction(db(), async (tx) => {
      const project = await tx.get(projectRef(input.project_id));
      if (!project.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
      const n = Number(project.get(`issue_counters.${input.category}`) ?? 0) + 1;
      tx.update(projectRef(input.project_id), { [`issue_counters.${input.category}`]: n });
      // project_id ไม่ต้องเก็บ — เอกสารอยู่ใต้โครงการอยู่แล้ว
      const { category, title, description, priority, assignee, due_date } = input;
      tx.set(issueRef, {
        ...{ category, title, description, priority, assignee, due_date },
        code: `${CODE_PREFIX[input.category]}-${String(n).padStart(3, "0")}`,
        status: "open",
        photos: uploaded,
        created_at: serverTimestamp(),
        created_by: actor,
        updated_at: serverTimestamp(),
        closed_at: null,
      });
    });
  } catch (e) {
    await deleteFiles(uploaded.map((u) => u.path));
    throw e;
  }
  return issueRef.id;
}

export async function updateIssueStatus(projectId: string, id: string, status: IssueStatus, actor: string) {
  await updateDoc(doc(sectionCol(projectId, "issues"), id), {
    status,
    closed_at: status === "closed" ? serverTimestamp() : null,
    updated_at: serverTimestamp(),
    updated_by: actor,
  });
}
