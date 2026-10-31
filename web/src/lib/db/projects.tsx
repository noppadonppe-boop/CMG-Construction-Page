"use client";

import {
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
} from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/context";
import { db } from "../firebase/client";
import type { ProgressSnapshot, Project, ProjectInput, ProjectSummary } from "../types";
import { ConflictError, DataError, deleteFiles, toIso, type StoredFile } from "./common";
import { emailSetupFiles } from "./email-setup";
import { materialRequestFiles } from "./materials";
import { emailSetupRef, projectCodeRef, projectRef, projectsCol, sectionCol, type ProjectSection } from "./paths";

/** โครงการพร้อมข้อมูลสำหรับกันการบันทึกทับกัน */
export interface ProjectRecord extends ProjectSummary {
  progress: ProgressSnapshot[];
  /** เพิ่มขึ้นทุกครั้งที่แก้ข้อมูล/ความคืบหน้า — ใช้ตรวจว่ามีคนอื่นแก้หลังเราเปิดฟอร์มหรือไม่ */
  version: number;
  updated_by: string | null;
  updated_at: string;
  /** id ของมาตรฐานแบบฟอร์มที่โครงการเลือกใช้ */
  form_standards: string[];
}

function latest(snapshots: ProgressSnapshot[]) {
  const last = snapshots.filter((s) => s.actual_pct !== null).at(-1);
  return { planned_pct: last?.planned_pct ?? 0, actual_pct: last?.actual_pct ?? 0 };
}

function toProject(snap: DocumentSnapshot): ProjectRecord {
  const d = snap.data() ?? {};
  const progress = ((d.progress ?? []) as ProgressSnapshot[]).toSorted((a, b) => a.as_of.localeCompare(b.as_of));
  return {
    id: snap.id,
    code: d.code ?? "",
    name: d.name ?? "",
    client: d.client ?? null,
    location: d.location ?? null,
    manager_name: d.manager_name ?? null,
    contract_value: Number(d.contract_value ?? 0),
    start_date: d.start_date ?? "",
    end_date: d.end_date ?? "",
    status: d.status ?? "planning",
    progress,
    ...latest(progress),
    version: Number(d.version ?? 0),
    updated_by: d.updated_by ?? null,
    updated_at: toIso(d.updated_at),
    form_standards: (d.form_standards ?? []) as string[],
  };
}

// ───────────── Realtime: โครงการที่ผู้ใช้มองเห็น ─────────────

type ProjectsState = { projects: ProjectRecord[]; loading: boolean; error?: string; byId: Map<string, ProjectRecord> };
const ProjectsContext = createContext<ProjectsState | null>(null);

/**
 * ฟังรายการโครงการแบบ realtime ครั้งเดียวทั้งแอป
 * - มีสิทธิ์ project.viewAll (MasterAdmin/Admin) → ทุกโครงการ
 * - คนอื่น → เฉพาะโครงการที่ถูก assign (assignedProjects)
 */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { userProfile, can } = useAuth();
  const viewAll = can("project.viewAll");
  const assignedKey = (userProfile?.assignedProjects ?? []).toSorted().join(",");
  const key = `${viewAll ? "all" : "assigned"}:${assignedKey}`;
  const [state, setState] = useState<{ key: string; byChunk: Record<number, ProjectRecord[]>; arrived: number[]; error?: string }>({
    key: "",
    byChunk: {},
    arrived: [],
  });

  // where(documentId(), "in") รับได้ครั้งละ 30 id
  const ids = assignedKey ? assignedKey.split(",") : [];
  const chunkCount = viewAll ? 1 : Math.ceil(ids.length / 30);

  useEffect(() => {
    const assigned = assignedKey ? assignedKey.split(",") : [];
    const queries = viewAll
      ? [projectsCol()]
      : Array.from({ length: Math.ceil(assigned.length / 30) }, (_, i) =>
          query(projectsCol(), where(documentId(), "in", assigned.slice(i * 30, i * 30 + 30))),
        );
    // ผลจาก listener ชุดเก่า (ก่อนเปลี่ยน role/assign) ถูกทิ้งเพราะ key ไม่ตรง
    const update = (i: number, patch: { projects?: ProjectRecord[]; error?: string }) =>
      setState((prev) => {
        const base = prev.key === key ? prev : { key, byChunk: {}, arrived: [] };
        return {
          ...base,
          byChunk: patch.projects ? { ...base.byChunk, [i]: patch.projects } : base.byChunk,
          arrived: base.arrived.includes(i) ? base.arrived : [...base.arrived, i],
          error: patch.error ?? base.error,
        };
      });
    const unsubscribes = queries.map((q, i) =>
      onSnapshot(
        q,
        (snap) => update(i, { projects: snap.docs.map(toProject) }),
        (e) => update(i, { error: e.message }),
      ),
    );
    return () => unsubscribes.forEach((u) => u());
  }, [viewAll, assignedKey, key]);

  const current = state.key === key ? state : null;
  const loading = (current?.arrived.length ?? 0) < chunkCount;
  const error = current?.error;
  const byChunk = current?.byChunk;

  const value = useMemo<ProjectsState>(() => {
    const projects = Object.values(byChunk ?? {})
      .flat()
      .toSorted((a, b) => a.code.localeCompare(b.code));
    return { projects, loading, error, byId: new Map(projects.map((p) => [p.id, p])) };
  }, [byChunk, loading, error]);

  return <ProjectsContext value={value}>{children}</ProjectsContext>;
}

export function useProjects() {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error("useProjects ต้องอยู่ภายใน <ProjectsProvider>");
  return value;
}

/** โครงการที่ใช้งานอยู่ (สำหรับ dropdown ในฟอร์มต่าง ๆ) */
export const projectOptions = (projects: Project[]) =>
  projects.filter((p) => p.status !== "completed").map((p) => ({ id: p.id, name: p.name }));

// ───────────── บันทึก ─────────────

const DUPLICATE_CODE = "รหัสโครงการนี้มีอยู่แล้ว";

/** สร้างโครงการ — จองรหัสใน projectCodes/{CODE} ใน transaction เดียวกัน จึงไม่มีทางได้รหัสซ้ำแม้กดพร้อมกัน */
export async function createProject(input: ProjectInput, actor: string): Promise<string> {
  const ref = doc(projectsCol());
  await runTransaction(db(), async (tx) => {
    const codeRef = projectCodeRef(input.code);
    if ((await tx.get(codeRef)).exists()) throw new DataError(DUPLICATE_CODE);
    tx.set(codeRef, { project_id: ref.id });
    tx.set(ref, {
      ...input,
      progress: [],
      issue_counters: {},
      version: 1,
      created_at: serverTimestamp(),
      created_by: actor,
      updated_at: serverTimestamp(),
      updated_by: actor,
    });
  });
  return ref.id;
}

/** แก้ข้อมูลโครงการ — ถ้ามีคนแก้หลังเราเปิดฟอร์ม (version ไม่ตรง) จะ throw ConflictError เว้นแต่ force */
export async function updateProject(id: string, input: ProjectInput, expectedVersion: number, actor: string, force = false) {
  const ref = projectRef(id);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
    const current = toProject(snap);
    if (!force && current.version !== expectedVersion) throw new ConflictError(current.updated_by);

    const codeChanged = current.code !== input.code;
    const newCodeRef = projectCodeRef(input.code);
    if (codeChanged) {
      const taken = await tx.get(newCodeRef);
      if (taken.exists() && taken.get("project_id") !== id) throw new DataError(DUPLICATE_CODE);
    }
    if (codeChanged) {
      tx.delete(projectCodeRef(current.code));
      tx.set(newCodeRef, { project_id: id });
    }
    tx.update(ref, { ...input, version: current.version + 1, updated_at: serverTimestamp(), updated_by: actor });
  });
}

export async function updateProgress(id: string, progress: ProgressSnapshot[], expectedVersion: number, actor: string, force = false) {
  const ref = projectRef(id);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
    const current = toProject(snap);
    if (!force && current.version !== expectedVersion) throw new ConflictError(current.updated_by);
    tx.update(ref, { progress, version: current.version + 1, updated_at: serverTimestamp(), updated_by: actor });
  });
}

const SECTIONS: ProjectSection[] = ["daily_reports", "issues", "documents", "material_requests"];

/** จำนวนข้อมูลที่จะถูกลบไปพร้อมโครงการ */
export async function countProjectData(id: string) {
  const [reports, issues, documents] = await Promise.all(SECTIONS.map((s) => getDocs(sectionCol(id, s))));
  return { reports: reports.size, issues: issues.size, documents: documents.size };
}

/** ลบโครงการพร้อมข้อมูลทุกเมนูในโครงการ และไฟล์/รูปทั้งหมดใน Storage */
export async function deleteProject(id: string, code: string) {
  const [snaps, emailFiles] = await Promise.all([Promise.all(SECTIONS.map((s) => getDocs(sectionCol(id, s)))), emailSetupFiles(id)]);
  const docs = snaps.flatMap((s) => s.docs);
  const files = [
    ...docs.flatMap((d) => [...((d.get("photos") ?? []) as StoredFile[]), ...((d.get("revisions") ?? []) as StoredFile[]), ...materialRequestFiles(d.data())]),
    ...emailFiles,
  ];
  const refs = [...docs.map((d) => d.ref), emailSetupRef(id), projectCodeRef(code), projectRef(id)];
  // batch หนึ่งเขียนได้ไม่เกิน 500 รายการ — ลบข้อมูลลูกก่อน ตัวโครงการอยู่ชุดสุดท้าย
  for (let i = 0; i < refs.length; i += 500) {
    const batch = writeBatch(db());
    refs.slice(i, i + 500).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteFiles(files.map((f) => f.path));
}
