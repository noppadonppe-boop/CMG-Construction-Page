"use client";

import { deleteDoc, doc, runTransaction, serverTimestamp, type DocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase/client";
import type { Tone } from "../format";
import { DataError, deleteFiles, newId, toIso, uploadFile, type StoredFile } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";
import { projectRef, sectionCol, storagePath } from "./paths";

// Material Request ของโครงการ: projects/{id}/material_requests/{auto}
// 1 Request = 1 เอกสาร — ข้อมูลขอเบิก + การรับของทุกครั้ง (array receipts) อยู่ในเอกสารเดียวกัน
// ทั้ง 3 ตารางบนหน้าเว็บ (Request / รับของ / สถานะ) อ่านจากเอกสารชุดนี้ · ลบการรับ = เอาออกจาก array ยอดจึงคืนเอง
// เลขรัน Request No. เก็บที่เอกสารโครงการ ฟิลด์ material_request_counter
// ไฟล์แนบ: Storage .../projects/{id}/material_requests/{docId}/{ไฟล์}

export type MaterialApproval = "pending" | "approved" | "rejected";

export const materialApproval: Record<MaterialApproval, { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "ok" },
  pending: { label: "Pending", tone: "warn" },
  rejected: { label: "Rejected", tone: "bad" },
};

export interface MaterialFile extends StoredFile {
  file_name: string;
  size: number;
}

export interface MaterialReceipt {
  id: string;
  quantity: number;
  /** YYYY-MM-DD — วันที่ของมาถึงหน้างานจริง */
  receive_date: string;
  do_no: string;
  approval: MaterialApproval;
  remark: string;
  files: MaterialFile[];
  /** ผู้กดรับ และเวลาที่บันทึก (ISO) — ระบบใส่เอง */
  received_by: string;
  received_at: string;
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
  receipts: MaterialReceipt[];
  created_at: string;
  created_by: string;
}

export type NewMaterialRequest = Pick<MaterialRequest, "description" | "spec" | "unit" | "quantity" | "require_schedule" | "remark">;
export type NewMaterialReceipt = Pick<MaterialReceipt, "quantity" | "receive_date" | "do_no" | "approval" | "remark">;

const toFiles = (v: unknown) => (Array.isArray(v) ? (v as MaterialFile[]).filter((f) => f?.path && f.url) : []);

function toReceipt(v: Partial<MaterialReceipt>): MaterialReceipt {
  return {
    id: v.id ?? newId(),
    quantity: Number(v.quantity ?? 0),
    receive_date: v.receive_date ?? "",
    do_no: v.do_no ?? "",
    approval: v.approval && v.approval in materialApproval ? v.approval : "approved",
    remark: v.remark ?? "",
    files: toFiles(v.files),
    received_by: v.received_by ?? "",
    received_at: v.received_at ?? "",
  };
}

function toRequest(snap: DocumentSnapshot): MaterialRequest {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    no: d.no ?? "",
    description: d.description ?? "",
    spec: d.spec ?? "",
    unit: d.unit ?? "",
    quantity: Number(d.quantity ?? 0),
    require_schedule: d.require_schedule ?? "",
    remark: d.remark ?? "",
    files: toFiles(d.files),
    receipts: (Array.isArray(d.receipts) ? d.receipts : [])
      .map(toReceipt)
      .toSorted((a: MaterialReceipt, b: MaterialReceipt) => a.received_at.localeCompare(b.received_at)),
    created_at: toIso(d.created_at),
    created_by: d.created_by ?? "",
  };
}

/** ยอดของ Request — การรับทุกครั้งนับเข้ายอดทันที ยกเว้น Rejected */
export interface MaterialBalance {
  received: number;
  remaining: number;
  last_receive_date: string | null;
  status: { label: string; tone: Tone };
}

export const countsToward = (r: MaterialReceipt) => r.approval !== "rejected";

export function materialBalance(request: MaterialRequest, today: string): MaterialBalance {
  const received = request.receipts.filter(countsToward).reduce((s, r) => s + r.quantity, 0);
  const late = !!request.require_schedule && request.require_schedule < today;
  const status: MaterialBalance["status"] =
    received >= request.quantity
      ? { label: "รับครบ", tone: "ok" }
      : received > 0
        ? late ? { label: "รับบางส่วน · เลยกำหนด", tone: "bad" } : { label: "รับบางส่วน", tone: "info" }
        : late ? { label: "รอรับของ · เลยกำหนด", tone: "bad" } : { label: "รอรับของ", tone: "warn" };
  return {
    received,
    remaining: Math.max(0, request.quantity - received),
    last_receive_date: request.receipts.map((r) => r.receive_date).toSorted().at(-1) ?? null,
    status,
  };
}

export function useMaterialRequests(project: ProjectRecord | undefined) {
  const { items, loading, error } = useProjectSection(project ? [project] : [], "material_requests", toRequest);
  return { requests: items.toSorted((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true })), loading, error };
}

/** Request No. = MR-{ท้ายรหัสโครงการ}-{เลขรัน 3 หลัก} เช่น PRJ-2026-J-078 → MR-078-001 */
function requestNo(projectCode: string, n: number) {
  const suffix = projectCode.split("-").at(-1)?.trim();
  return ["MR", suffix, String(n).padStart(3, "0")].filter(Boolean).join("-");
}

const requestRef = (projectId: string, id: string) => doc(sectionCol(projectId, "material_requests"), id);

async function uploadAll(projectId: string, docId: string, files: File[]): Promise<MaterialFile[]> {
  const uploaded: MaterialFile[] = [];
  try {
    for (const f of files) {
      const stored = await uploadFile(storagePath(projectId, "material_requests", docId, `${newId()}-${f.name}`), f);
      uploaded.push({ ...stored, file_name: f.name, size: f.size });
    }
    return uploaded;
  } catch (e) {
    await deleteFiles(uploaded.map((u) => u.path));
    throw e;
  }
}

/**
 * เพิ่มรายการขอเบิก — อัปโหลดไฟล์แนบก่อน แล้วออกเลขรันใน transaction เดียวกับการบันทึก (ไม่ได้เลขซ้ำแม้เพิ่มพร้อมกัน)
 * ถ้าบันทึกไม่สำเร็จ ลบไฟล์ที่อัปไปแล้วทิ้ง
 */
export async function createMaterialRequest(projectId: string, input: NewMaterialRequest, files: File[], actor: string): Promise<string> {
  const ref = doc(sectionCol(projectId, "material_requests"));
  const uploaded = await uploadAll(projectId, ref.id, files);
  let no = "";
  try {
    await runTransaction(db(), async (tx) => {
      const project = await tx.get(projectRef(projectId));
      if (!project.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
      const n = Number(project.get("material_request_counter") ?? 0) + 1;
      no = requestNo(project.get("code") ?? "", n);
      tx.update(projectRef(projectId), { material_request_counter: n });
      tx.set(ref, { ...input, no, files: uploaded, receipts: [], created_at: serverTimestamp(), created_by: actor });
    });
  } catch (e) {
    await deleteFiles(uploaded.map((u) => u.path));
    throw e;
  }
  return no;
}

/** บันทึกรับของ — ตรวจยอดคงเหลือกับข้อมูลล่าสุดใน transaction จึงรับเกินไม่ได้แม้มีคนรับพร้อมกัน */
export async function receiveMaterial(projectId: string, requestId: string, input: NewMaterialReceipt, files: File[], actor: string) {
  const ref = requestRef(projectId, requestId);
  const uploaded = await uploadAll(projectId, requestId, files);
  try {
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError("ไม่พบ Request นี้ อาจถูกลบไปแล้ว");
      const request = toRequest(snap);
      const { remaining } = materialBalance(request, "");
      if (input.approval !== "rejected" && input.quantity > remaining)
        throw new DataError(`รับเกินยอดคงเหลือ — เหลือรับได้อีก ${remaining.toLocaleString("th-TH")} ${request.unit}`);
      const receipt: MaterialReceipt = { ...input, id: newId(), files: uploaded, received_by: actor, received_at: new Date().toISOString() };
      tx.update(ref, { receipts: [...request.receipts, receipt], updated_at: serverTimestamp(), updated_by: actor });
    });
  } catch (e) {
    await deleteFiles(uploaded.map((u) => u.path));
    throw e;
  }
}

async function updateReceipts(projectId: string, requestId: string, actor: string, change: (receipts: MaterialReceipt[]) => MaterialReceipt[]) {
  const ref = requestRef(projectId, requestId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new DataError("ไม่พบ Request นี้ อาจถูกลบไปแล้ว");
    tx.update(ref, { receipts: change(toRequest(snap).receipts), updated_at: serverTimestamp(), updated_by: actor });
  });
}

export async function updateReceiptApproval(projectId: string, requestId: string, receiptId: string, approval: MaterialApproval, actor: string) {
  await updateReceipts(projectId, requestId, actor, (list) => list.map((r) => (r.id === receiptId ? { ...r, approval } : r)));
}

/** ลบการรับของ 1 ครั้ง (MasterAdmin) — ยอดคืนกลับไปที่ Request */
export async function deleteReceipt(projectId: string, request: MaterialRequest, receiptId: string, actor: string) {
  await updateReceipts(projectId, request.id, actor, (list) => list.filter((r) => r.id !== receiptId));
  await deleteFiles(request.receipts.find((r) => r.id === receiptId)?.files.map((f) => f.path) ?? []);
}

/** ลบ Request ทั้งรายการ พร้อมการรับของและไฟล์แนบทั้งหมด (MasterAdmin) */
export async function deleteMaterialRequest(projectId: string, request: MaterialRequest) {
  await deleteDoc(requestRef(projectId, request.id));
  await deleteFiles([...request.files, ...request.receipts.flatMap((r) => r.files)].map((f) => f.path));
}

/** ไฟล์ทั้งหมดในเอกสาร Request — ใช้ตอนลบโครงการ */
export const materialRequestFiles = (data: { files?: unknown; receipts?: unknown }): StoredFile[] => [
  ...toFiles(data.files),
  ...(Array.isArray(data.receipts) ? data.receipts.flatMap((r: { files?: unknown }) => toFiles(r?.files)) : []),
];
