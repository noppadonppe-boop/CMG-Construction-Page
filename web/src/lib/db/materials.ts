"use client";

import { doc, runTransaction, serverTimestamp, type DocumentSnapshot } from "firebase/firestore";
import { nextMaterialStatus } from "../../../server/lib/material-workflow-state";
import { materialRequestRows } from "../material-request-items";
import { auth, currentUserIdToken, db } from "../firebase/client";
import type { Tone } from "../format";
import { DataError, deleteFiles, newId, toIso, uploadFile, type StoredFile } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";
import { projectRef, sectionCol, storagePath, userRef } from "./paths";
import { cleanMaterialSubmission, normalizeMaterialSubmission, materialRequestFieldErrors, materialReceiptFieldErrors, MaterialFieldValidationError, type MaterialSubmission } from "../material-submission";

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
  item_id?: string;
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
  area?: string;
  document_profile_id?: string;
  document_profile_name?: string;
  workflow_status?: "draft" | "pending_cm" | "pending_pm" | "approved";
  workflow_version?: number;
  rejection_reason?: string;
  email_status?: "pending" | "sending" | "sent" | "failed";
  email_error?: string;
  approval_history?: { stage: string; action: string; email: string; name: string; reason: string; at: string }[];
  items?: MaterialRequestItem[];
  /** Present only on a per-item view of a request. */
  request_id?: string;
  item_id?: string;
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
  /** Cover, submission history and contents; absent on legacy requests. */
  submission?: MaterialSubmission | null;
}

export type MaterialRequestItem = Pick<MaterialRequest, "description" | "spec" | "area" | "unit" | "quantity" | "require_schedule" | "remark"> & { id: string };

export type NewMaterialRequest = Pick<MaterialRequest, "description" | "spec" | "area" | "unit" | "quantity" | "require_schedule" | "remark" | "submission" | "document_profile_id" | "document_profile_name">;
export type NewMaterialReceipt = Pick<MaterialReceipt, "quantity" | "receive_date" | "do_no" | "approval" | "remark">;

const toFiles = (v: unknown) => (Array.isArray(v) ? (v as MaterialFile[]).filter((f) => f?.path && f.url) : []);

function toReceipt(v: Partial<MaterialReceipt>): MaterialReceipt {
  return {
    id: v.id ?? newId(),
    ...(v.item_id ? { item_id: v.item_id } : {}),
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
    workflow_status: d.workflow_status,
    workflow_version: d.workflow_version,
    rejection_reason: d.rejection_reason || "",
    email_status: d.email_status,
    email_error: d.email_error || "",
    approval_history: d.approval_history || [],
    items: Array.isArray(d.items) ? d.items : undefined,
    no: d.no ?? "",
    description: d.description ?? "",
    spec: d.spec ?? "",
    unit: d.unit ?? "",
    quantity: Number(d.quantity ?? 0),
    require_schedule: d.require_schedule ?? "",
    remark: d.remark ?? "",
    area: d.area ?? "",
    document_profile_id: d.document_profile_id ?? "",
    document_profile_name: d.document_profile_name ?? "",
    files: toFiles(d.files),
    receipts: (Array.isArray(d.receipts) ? d.receipts : [])
      .map(toReceipt)
      .toSorted((a: MaterialReceipt, b: MaterialReceipt) => a.received_at.localeCompare(b.received_at)),
    created_at: toIso(d.created_at),
    created_by: d.created_by ?? "",
    submission: normalizeMaterialSubmission(d.submission),
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
  const errors = materialRequestFieldErrors({ ...input, submission: input.submission ? cleanMaterialSubmission(input.submission) : null });
  if (Object.keys(errors).length) throw new MaterialFieldValidationError(errors);
  return await createMaterialRequestWithItems(projectId, [input], files, actor);
}

/** One document and one counter increment for all material items. */
export async function createMaterialRequestWithItems(projectId: string, inputs: NewMaterialRequest[], files: File[], actor: string, draft?: MaterialRequest, keepDraft = false): Promise<string> {
  if (!inputs.length || inputs.length > 50) throw new DataError("เพิ่มวัสดุได้ 1–50 รายการต่อครั้ง");
  const submission = inputs[0].submission ? cleanMaterialSubmission(inputs[0].submission) : null;
  if (submission) { submission.checked_by = ""; submission.reviewed_by = ""; submission.approved_by = ""; }
  const errors: Record<string, string> = {};
  const items = inputs.map((input, index) => {
    for (const [key, message] of Object.entries(materialRequestFieldErrors({ ...input, submission }))) {
      errors[["description", "spec", "area", "unit", "quantity", "require_schedule", "remark"].includes(key) ? `items.${index}.${key}` : key] = message;
    }
    return { id: newId(), description: input.description.trim(), spec: input.spec.trim(), area: (input.area || "").trim(), unit: input.unit.trim(), quantity: Number(input.quantity), require_schedule: input.require_schedule, remark: input.remark.trim() };
  });
  if (Object.keys(errors).length) throw new MaterialFieldValidationError(errors);
  if (files.some((f) => f.size > 20 * 1024 * 1024)) throw new DataError("ไฟล์แนบต้องไม่เกิน 20 MB ต่อไฟล์");
  const ref = draft ? requestRef(projectId, draft.id) : doc(sectionCol(projectId, "material_requests"));
  const uploaded = await uploadAll(projectId, ref.id, files);
  try {
    return await runTransaction(db(), async (tx) => {
      const project = await tx.get(projectRef(projectId));
      if (!project.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
      if (draft) {
        const snap = await tx.get(ref);
        const profile = (await tx.get(userRef(actor))).data();
        const mayEdit = profile?.status === "approved" && (snap.get("created_by") === actor || profile.role?.includes("MasterAdmin"));
        const current = toRequest(snap);
        if (!snap.exists() || current.workflow_status !== "draft" || current.workflow_version !== draft.workflow_version || !mayEdit) throw new DataError("ไม่มีสิทธิ์แก้ไข หรือ Draft นี้เปลี่ยนแปลงไปแล้ว");
        tx.update(ref, { ...inputs[0], submission, items, files: [...current.files, ...uploaded], workflow_status: keepDraft ? "draft" : "pending_cm", workflow_version: (current.workflow_version || 0) + 1, rejection_reason: keepDraft ? (current.rejection_reason || "") : "", updated_at: serverTimestamp(), updated_by: actor });
        return current.no;
      }
      const counter = Number(project.get("material_request_counter") ?? 0) + 1;
      const no = requestNo(project.get("code") ?? "", counter);
      tx.set(ref, { ...inputs[0], workflow_status: "pending_cm", workflow_version: 1, approval_history: [], submission, items, no, files: uploaded, receipts: [], created_at: serverTimestamp(), created_by: actor });
      tx.update(projectRef(projectId), { material_request_counter: counter });
      return no;
    });
  } catch (e) {
    await deleteFiles(uploaded.map((file) => file.path));
    throw e;
  }
}

/** บันทึกรับของ — ตรวจยอดคงเหลือกับข้อมูลล่าสุดใน transaction จึงรับเกินไม่ได้แม้มีคนรับพร้อมกัน */
export async function receiveMaterial(projectId: string, requestId: string, input: NewMaterialReceipt, files: File[], actor: string, itemId?: string) {
  const errors = materialReceiptFieldErrors(input, Infinity);
  if (Object.keys(errors).length) throw new MaterialFieldValidationError(errors);
  const ref = requestRef(projectId, requestId);
  const uploaded = await uploadAll(projectId, requestId, files);
  try {
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError("ไม่พบ Request นี้ อาจถูกลบไปแล้ว");
      const request = toRequest(snap);
      if (request.workflow_status && request.workflow_status !== "approved") throw new DataError("ต้องผ่านการอนุมัติจาก CM และ PM ก่อนรับของ");
      const row = request.items?.length ? materialRequestRows(request).find((item) => item.item_id === itemId) : request;
      if (!row) throw new DataError("ไม่พบรายการวัสดุที่ต้องการรับ");
      const { remaining } = materialBalance(row, "");
      const latestErrors = materialReceiptFieldErrors(input, remaining);
      if (Object.keys(latestErrors).length) throw new MaterialFieldValidationError(latestErrors);
      const receipt: MaterialReceipt = { ...input, ...(row.item_id ? { item_id: row.item_id } : {}), id: newId(), files: uploaded, received_by: actor, received_at: new Date().toISOString() };
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
  await updateReceipts(projectId, request.request_id || request.id, actor, (list) => list.filter((r) => r.id !== receiptId));
  await deleteFiles(request.receipts.find((r) => r.id === receiptId)?.files.map((f) => f.path) ?? []);
}

/** ลบ Request ทั้งรายการ พร้อมการรับของและไฟล์แนบทั้งหมด (MasterAdmin) */
export async function deleteMaterialRequest(projectId: string, request: MaterialRequest) {
  const ref = requestRef(projectId, request.request_id || request.id);
  const paths = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return [];
    const current = toRequest(snap);
    tx.delete(ref);
    return [...current.files, ...current.receipts.flatMap((receipt) => receipt.files)].map((file) => file.path);
  });
  await deleteFiles(paths);
}

/** ไฟล์ทั้งหมดในเอกสาร Request — ใช้ตอนลบโครงการ */
export const materialRequestFiles = (data: { files?: unknown; receipts?: unknown }): StoredFile[] => [
  ...toFiles(data.files),
  ...(Array.isArray(data.receipts) ? data.receipts.flatMap((r: { files?: unknown }) => toFiles(r?.files)) : []),
];

export async function reviewMaterialRequest(projectId: string, request: MaterialRequest, action: "approve" | "reject" | "retry_email", reason = "") {
  const email = auth().currentUser?.email?.toLowerCase();
  if (!email) throw new DataError("กรุณาเข้าสู่ระบบใหม่");
  const id = request.request_id || request.id;
  if (action !== "retry_email") {
    if (reason.length > 500 || (action === "reject" && !reason.trim())) throw new DataError("กรุณาระบุเหตุผล Reject ไม่เกิน 500 ตัวอักษร");
    const status = await runTransaction(db(), async (tx) => {
      const ref = requestRef(projectId, id);
      const [snap, profileSnap] = await Promise.all([tx.get(ref), tx.get(userRef(email))]);
      const profile = profileSnap.data();
      if (!snap.exists() || profile?.status !== "approved") throw new DataError("ไม่พบรายการหรือไม่มีสิทธิ์ใช้งาน");
      const current = toRequest(snap);
      const roles: string[] = Array.isArray(profile.role) ? profile.role : [];
      if (!roles.some((role) => ["MasterAdmin", "Admin"].includes(role)) && !profile.assignedProjects?.includes(projectId)) throw new DataError("ไม่มีสิทธิ์ในโครงการนี้");
      if (!current.workflow_status || current.workflow_version !== request.workflow_version) throw new DataError("รายการเปลี่ยนไปแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
      let status: NonNullable<MaterialRequest["workflow_status"]>;
      try { status = nextMaterialStatus(current.workflow_status, action, roles); } catch (error) { throw new DataError((error as Error).message); }
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || email;
      const submission = { ...current.submission, reviewed_by: "", ...(status === "draft" ? { checked_by: "", approved_by: "" } : status === "pending_pm" ? { checked_by: name } : { approved_by: name }) };
      const history = [...(current.approval_history || []), { stage: current.workflow_status === "pending_cm" ? "CM" : "PM", action, email, name, reason: reason.trim(), at: new Date().toISOString() }];
      tx.update(ref, { workflow_status: status, workflow_version: (current.workflow_version || 0) + 1, submission, rejection_reason: action === "reject" ? reason.trim() : "", approval_history: history, ...(status === "approved" ? { email_status: "pending" } : {}), updated_at: serverTimestamp(), updated_by: email });
      return status;
    });
    if (status !== "approved") return { success: true, status, emailError: "" };
  }
  // Delivery failures must never undo an approval or block a rejection.
  try {
    const base = process.env.NODE_ENV === "production" ? "" : (process.env.NEXT_PUBLIC_MAIL_API_URL || "http://localhost:3001").replace(/\/+$/, "");
    const response = await fetch(base + "/api/material-workflow", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await currentUserIdToken() }, body: JSON.stringify({ projectId, requestId: id, action: "retry_email" }) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "ส่งอีเมลไม่สำเร็จ");
    return result as { success: boolean; status: string; emailError: string };
  } catch (error) {
    return { success: true, status: "approved", emailError: error instanceof TypeError ? "ติดต่อบริการอีเมลไม่ได้ สถานะ Approved บันทึกแล้ว กรุณาลองส่งอีเมลอีกครั้ง" : (error as Error).message };
  }
}
