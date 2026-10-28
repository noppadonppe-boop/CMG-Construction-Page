"use client";

import { onSnapshot, type QueryDocumentSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { ProjectRecord } from "./projects";
import { sectionCol, type ProjectSection } from "./paths";

type Snapshots = { key: string; byProject: Record<string, QueryDocumentSnapshot[]>; loaded: string[]; error?: string };

/**
 * ฟังข้อมูลเมนูหนึ่ง (รายงาน/เรื่อง/เอกสาร) จากหลายโครงการพร้อมกันแบบ realtime
 * ข้อมูลแต่ละเมนูเก็บอยู่ใต้โครงการของตัวเอง จึงเปิด listener 1 ตัวต่อโครงการ แล้วรวมผล
 */
export function useProjectSection<T>(
  projects: ProjectRecord[],
  section: ProjectSection,
  map: (snap: QueryDocumentSnapshot, project: ProjectRecord) => T,
) {
  // เปิด listener ใหม่เฉพาะเมื่อ "ชุดโครงการ" เปลี่ยน ไม่ใช่ทุกครั้งที่ข้อมูลโครงการเปลี่ยน
  const ids = projects.map((p) => p.id).toSorted();
  const key = `${section}:${ids.join(",")}`;
  const [state, setState] = useState<Snapshots>({ key: "", byProject: {}, loaded: [] });

  useEffect(() => {
    const projectIds = key.slice(key.indexOf(":") + 1).split(",").filter(Boolean);
    // ผลจาก listener ชุดเก่าที่ยังค้างอยู่จะถูกทิ้ง เพราะ key ไม่ตรง
    const update = (id: string, patch: Partial<Pick<Snapshots, "error">> & { docs?: QueryDocumentSnapshot[] }) =>
      setState((prev) => {
        const base = prev.key === key ? prev : { key, byProject: {}, loaded: [] };
        return {
          ...base,
          byProject: patch.docs ? { ...base.byProject, [id]: patch.docs } : base.byProject,
          loaded: base.loaded.includes(id) ? base.loaded : [...base.loaded, id],
          error: patch.error ?? base.error,
        };
      });
    const unsubscribes = projectIds.map((id) =>
      onSnapshot(
        sectionCol(id, section),
        (snap) => update(id, { docs: snap.docs }),
        (e) => update(id, { error: e.message }),
      ),
    );
    return () => unsubscribes.forEach((u) => u());
  }, [key, section]);

  const current = state.key === key ? state : null;
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // แปลงข้อมูลตอน render เพื่อให้ชื่อโครงการล่าสุดเสมอ (เปลี่ยนชื่อโครงการแล้วทุกหน้าเปลี่ยนตาม)
  const items = useMemo(
    () =>
      Object.entries(current?.byProject ?? {}).flatMap(([id, docs]) => {
        const project = byId.get(id);
        return project ? docs.map((d) => map(d, project)) : [];
      }),
    [current, byId, map],
  );
  return { items, loading: ids.some((id) => !current?.loaded.includes(id)), error: current?.error };
}
