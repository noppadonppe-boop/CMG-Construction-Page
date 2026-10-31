"use client";

import { doc, runTransaction, serverTimestamp, updateDoc, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase/client";
import type { Tone } from "../format";
import { DataError, deleteFiles, newId, toIso, uploadFile, type StoredFile } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";
import { projectRef, sectionCol, storagePath } from "./paths";

// Material Request ของโครงการ — 2 คอลเลกชันเชื่อมกันด้วย Request No.
//   projects/{id}/material_requests/{auto}   รายการขอเบิก (เลขรันเก็บที่เอกสารโครงการ ฟิลด์ material_request_counter)
//     ไฟล์แนบของ Request: Storage .../projects/{id}/material_requests/{docId}/{ไฟล์}
//   projects/{id}/material_receipts/{auto}   การรับของแต่ละครั้ง — request_id ชี้ไปที่รายการขอเบิก
// ยอดสะสม/สถานะไม่ได้เก็บ — คำนวณจากการรับของทุกครั้งตอนแสดงผล

export type MaterialApproval = "pending" | "approved" | "rejected";

export const materialApproval: Record<MaterialApproval, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
};

export interface MaterialFile extends StoredFile {
  file_name: string;
  size: number;
}

export interface MaterialRequest {
  id: string;
  no: string;
  description: string;
  spec: string;
  unit: string;
  quantity: number;
  /** YYYY-MM-DD */
  require_schedule: string;
  remark: string;
  files: MaterialFile[];
  created_at: string;
  created_by: string;
}

export interface MaterialReceipt {
  id: string;
  request_id: string;
  /** YYYY-MM-DD */
  receive_date: string;
  quantity: number;
  do_no: string;
  approval: MaterialApproval;
  remark: string;
  created_at: string;
  created_by: string;
}

export type NewMaterialRequest = Omit<MaterialRequest, "id" | "no" | "files" | "created_at" | "created_by">;
export type NewMaterialReceipt = Omit<MaterialReceipt, "id" | "created_at" | "created_by">;

function toRequest(snap: QueryDocumentSnapshot): MaterialRequest {
  const d = snap.data();
  return {
    id: snap.id,
    no: d.no ?? "",
    description: d.description ?? "",
    spec: d.spec ?? "",
    unit: d.unit ?? "",
    quantity: Number(d.quantity ?? 0),
    require_schedule: d.require_schedule ?? "",
    remark: d.remark ?? "",
    files: d.files ?? [],
    created_at: toIso(d.created_at),
    created_by: d.created_by ?? "",
  };
}

function toReceipt(snap: QueryDocumentSnapshot): MaterialReceipt {
  const d = snap.data();
  return {
    id: snap.id,
    request_id: d.request_id ?? "",
    receive_date: d.receive_date ?? "",
    quantity: Number(d.quantity ?? 0),
    do_no: d.do_no ?? "",
    approval: d.approval in materialApproval ? d.approval : "pending",
    remark: d.remark ?? "",
    created_at: toIso(d.created_at),
    created_by: d.created_by ?? "",
  };
}

/** ยอดของ Request หนึ่งรายการ — นับเข้ายอดรับเฉพาะ Approved, Pending แยกไว้ (กันรับซ้ำ), Rejected ไม่นับ */
export interface MaterialBalance {
  received: number;
  pending: number;
  remaining: number;
  last_receive_date: string | null;
  status: { label: string; tone: Tone };
}

export function materialBalance(request: MaterialRequest, receipts: MaterialReceipt[], today: string): MaterialBalance {
  const mine = receipts.filter((r) => r.request_id === request.id);
  const sum = (a: MaterialApproval) => mine.filter((r) => r.approval === a).reduce((s, r) => s + r.quantity, 0);
  const received = sum("approved");
  const pending = sum("pending");
  const late = !!request.require_schedule && request.require_schedule < today;
  const status: MaterialBalance["status"] =
    received >= request.quantity
      ? { label: "รับครบ", tone: "ok" }
      : received > 0
        ? late ? { label: "รับบางส่วน · เลยกำหนด", tone: "bad" } : { label: "รับบางส่วน", tone: "info" }
        : late ? { label: "ยังไม่รับ · เลยกำหนด", tone: "bad" } : { label: "รอรับ", tone: "warn" };
  return {
    received,
    pending,
    remaining: Math.max(0, request.quantity - received),
    last_receive_date: mine.map((r) => r.receive_date).toSorted().at(-1) ?? null,
    status,
  };
}

export function useMaterials(project: ProjectRecord | undefined) {
  const projects = project ? [project] : [];
  const req = useProjectSection(projects, "material_requests", toRequest);
  const rec = useProjectSection(projects, "material_receipts", toReceipt);
  return {
    requests: req.items.toSorted((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true })),
    receipts: rec.items.toSorted((a, b) => b.receive_date.localeCompare(a.receive_date) || b.created_at.localeCompare(a.created_at)),
    loading: req.loading || rec.loading,
    error: req.error ?? rec.error,
  };
}

/** Request No. = MR-{ท้ายรหัสโครงการ}-{เลขรัน 3 หลัก} เช่น PRJ-2026-J-078 → MR-078-001 */
function requestNo(projectCode: string, n: number) {
  const suffix = projectCode.split("-").at(-1)?.trim();
  return ["MR", suffix, String(n).padStart(3, "0")].filter(Boolean).join("-");
}

/**
 * เพิ่มรายการขอเบิก — อัปโหลดไฟล์แนบก่อน แล้วออกเลขรันใน transaction เดียวกับการบันทึก (ไม่ได้เลขซ้ำแม้เพิ่มพร้อมกัน)
 * ถ้าบันทึกไม่สำเร็จ ลบไฟล์ที่อัปไปแล้วทิ้ง
 */
export async function createMaterialRequest(projectId: string, input: NewMaterialRequest, files: File[], actor: string): Promise<string> {
  const ref = doc(sectionCol(projectId, "material_requests"));
  const uploaded: MaterialFile[] = [];
  let no = "";
  try {
    for (const f of files) {
      const stored = await uploadFile(storagePath(projectId, "material_requests", ref.id, `${newId()}-${f.name}`), f);
      uploaded.push({ ...stored, file_name: f.name, size: f.size });
    }
    await runTransaction(db(), async (tx) => {
      const project = await tx.get(projectRef(projectId));
      if (!project.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
      const n = Number(project.get("material_request_counter") ?? 0) + 1;
      no = requestNo(project.get("code") ?? "", n);
      tx.update(projectRef(projectId), { material_request_counter: n });
      tx.set(ref, { ...input, no, files: uploaded, created_at: serverTimestamp(), created_by: actor });
    });
  } catch (e) {
    await deleteFiles(uploaded.map((u) => u.path));
    throw e;
  }
  return no;
}

export async function createMaterialReceipt(projectId: string, input: NewMaterialReceipt, actor: string) {
  await runTransaction(db(), async (tx) => {
    const request = await tx.get(doc(sectionCol(projectId, "material_requests"), input.request_id));
    if (!request.exists()) throw new DataError("ไม่พบ Request นี้ อาจถูกลบไปแล้ว");
    tx.set(doc(sectionCol(projectId, "material_receipts")), { ...input, created_at: serverTimestamp(), created_by: actor });
  });
}

export async function updateReceiptApproval(projectId: string, id: string, approval: MaterialApproval, actor: string) {
  await updateDoc(doc(sectionCol(projectId, "material_receipts"), id), {
    approval,
    approved_at: serverTimestamp(),
    approved_by: actor,
  });
}
