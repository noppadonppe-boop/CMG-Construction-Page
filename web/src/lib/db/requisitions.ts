"use client";

import { deleteDoc, doc, runTransaction, serverTimestamp, type DocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase/client";
import type { Tone } from "../format";
import { DataError, newId, toIso } from "./common";
import type { ProjectRecord } from "./projects";
import { useProjectSection } from "./sections";
import { projectRef, sectionCol } from "./paths";

// ใบขอเบิกวัสดุ (Material Requisition): projects/{id}/material_requisitions/{auto}
// 1 ใบ = หลายรายการวัสดุ + ขั้นตอนอนุมัติ: draft → submitted → approved | rejected (rejected แก้แล้วส่งใหม่ได้)
// เลขเอกสาร MRQ-{ท้ายรหัสโครงการ}-{เลขรัน 3 หลัก} เก็บตัวนับที่เอกสารโครงการ ฟิลด์ requisition_counter
// ประวัติทุกขั้น (ส่ง / อนุมัติ / ปฏิเสธ) เก็บใน approval_log ใช้พิมพ์ลงช่องลายเซ็นใน PDF

export type RequisitionStatus = "draft" | "submitted" | "approved" | "rejected";

export const requisitionStatus: Record<RequisitionStatus, { label: string; tone: Tone }> = {
  draft: { label: "ร่าง", tone: "info" },
  submitted: { label: "รออนุมัติ", tone: "warn" },
  approved: { label: "อนุมัติแล้ว", tone: "ok" },
  rejected: { label: "ไม่อนุมัติ", tone: "bad" },
};

export type RequisitionPriority = "normal" | "urgent";
export const requisitionPriority: Record<RequisitionPriority, string> = { normal: "ปกติ", urgent: "ด่วน" };

export interface RequisitionItem {
  id: string;
  description: string;
  spec: string;
  unit: string;
  quantity: number;
  remark: string;
}

export type ApprovalAction = "submit" | "approve" | "reject";

export interface ApprovalEntry {
  action: ApprovalAction;
  by: string;
  name: string;
  at: string;
  comment: string;
}

export interface Requisition {
  id: string;
  no: string;
  status: RequisitionStatus;
  /** YYYY-MM-DD */
  request_date: string;
  /** YYYY-MM-DD */
  require_date: string;
  priority: RequisitionPriority;
  /** ส่วนงาน / ตำแหน่งที่ใช้ เช่น ฐานราก F1-F6 */
  work_area: string;
  purpose: string;
  requester_name: string;
  items: RequisitionItem[];
  approval_log: ApprovalEntry[];
  created_at: string;
  created_by: string;
}

export type RequisitionInput = Pick<Requisition, "request_date" | "require_date" | "priority" | "work_area" | "purpose" | "requester_name" | "items">;

const toItem = (v: Partial<RequisitionItem>): RequisitionItem => ({
  id: v.id ?? newId(),
  description: v.description ?? "",
  spec: v.spec ?? "",
  unit: v.unit ?? "",
  quantity: Number(v.quantity ?? 0),
  remark: v.remark ?? "",
});

function toRequisition(snap: DocumentSnapshot): Requisition {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    no: d.no ?? "",
    status: d.status in requisitionStatus ? d.status : "draft",
    request_date: d.request_date ?? "",
    require_date: d.require_date ?? "",
    priority: d.priority === "urgent" ? "urgent" : "normal",
    work_area: d.work_area ?? "",
    purpose: d.purpose ?? "",
    requester_name: d.requester_name ?? "",
    items: Array.isArray(d.items) ? d.items.map(toItem) : [],
    approval_log: Array.isArray(d.approval_log) ? d.approval_log : [],
    created_at: toIso(d.created_at),
    created_by: d.created_by ?? "",
  };
}

export function useRequisitions(project: ProjectRecord | undefined) {
  const { items, loading, error } = useProjectSection(project ? [project] : [], "material_requisitions", toRequisition);
  return { requisitions: items.toSorted((a, b) => b.no.localeCompare(a.no, undefined, { numeric: true })), loading, error };
}

/** รายการล่าสุดของแต่ละขั้น — ใช้พิมพ์ในช่องลายเซ็น */
export const lastEntry = (r: Requisition, action: ApprovalAction) => r.approval_log.findLast((e) => e.action === action);

/** แก้ไข/ลบได้เฉพาะตอนยังเป็นร่าง หรือถูกปฏิเสธ (แก้แล้วส่งใหม่) */
export const isEditable = (r: Requisition) => r.status === "draft" || r.status === "rejected";

function requisitionNo(projectCode: string, n: number) {
  const suffix = projectCode.split("-").at(-1)?.trim();
  return ["MRQ", suffix, String(n).padStart(3, "0")].filter(Boolean).join("-");
}

const requisitionRef = (projectId: string, id: string) => doc(sectionCol(projectId, "material_requisitions"), id);

function clean(input: RequisitionInput): RequisitionInput {
  const items = input.items
    .map((i) => ({ ...i, description: i.description.trim(), spec: i.spec.trim(), unit: i.unit.trim(), remark: i.remark.trim() }))
    .filter((i) => i.description || i.quantity);
  if (items.length === 0) throw new DataError("ต้องมีรายการวัสดุอย่างน้อย 1 รายการ");
  if (items.some((i) => !i.description || !i.unit || !(i.quantity > 0))) throw new DataError("ทุกรายการต้องมี Description, Unit และ Quantity มากกว่า 0");
  return { ...input, purpose: input.purpose.trim(), work_area: input.work_area.trim(), requester_name: input.requester_name.trim(), items };
}

/** สร้างใบขอเบิก (สถานะร่าง) — ออกเลขเอกสารใน transaction เดียวกับการบันทึก */
export async function createRequisition(projectId: string, input: RequisitionInput, actor: string): Promise<{ id: string; no: string }> {
  const data = clean(input);
  const ref = doc(sectionCol(projectId, "material_requisitions"));
  let no = "";
  await runTransaction(db(), async (tx) => {
    const project = await tx.get(projectRef(projectId));
    if (!project.exists()) throw new DataError("โครงการนี้ถูกลบไปแล้ว");
    const n = Number(project.get("requisition_counter") ?? 0) + 1;
    no = requisitionNo(project.get("code") ?? "", n);
    tx.update(projectRef(projectId), { requisition_counter: n });
    tx.set(ref, { ...data, no, status: "draft", approval_log: [], created_at: serverTimestamp(), created_by: actor });
  });
  return { id: ref.id, no };
}

async function mutate(projectId: string, id: string, change: (current: Requisition) => Record<string, unknown>) {
  const ref = requisitionRef(projectId, id);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new DataError("ไม่พบใบขอเบิกนี้ อาจถูกลบไปแล้ว");
    tx.update(ref, { ...change(toRequisition(snap)), updated_at: serverTimestamp() });
  });
}

export function updateRequisition(projectId: string, id: string, input: RequisitionInput, actor: string) {
  const data = clean(input);
  return mutate(projectId, id, (cur) => {
    if (!isEditable(cur)) throw new DataError("ใบขอเบิกที่ส่งอนุมัติแล้วแก้ไขไม่ได้");
    return { ...data, updated_by: actor };
  });
}

const entry = (action: ApprovalAction, by: string, name: string, comment: string): ApprovalEntry => ({
  action, by, name, comment: comment.trim(), at: new Date().toISOString(),
});

/** ส่งขออนุมัติ — จากร่าง หรือแก้ไขหลังถูกปฏิเสธ */
export function submitRequisition(projectId: string, id: string, by: string, name: string) {
  return mutate(projectId, id, (cur) => {
    if (!isEditable(cur)) throw new DataError("ใบขอเบิกนี้ส่งอนุมัติไปแล้ว");
    return { status: "submitted", approval_log: [...cur.approval_log, entry("submit", by, name, "")] };
  });
}

/** อนุมัติ / ไม่อนุมัติ — ตรวจสถานะล่าสุดใน transaction กันสองคนตัดสินพร้อมกัน; ไม่อนุมัติต้องมีเหตุผล */
export function decideRequisition(projectId: string, id: string, decision: "approve" | "reject", by: string, name: string, comment: string) {
  if (decision === "reject" && !comment.trim()) throw new DataError("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
  return mutate(projectId, id, (cur) => {
    if (cur.status !== "submitted") throw new DataError("ใบขอเบิกนี้ไม่ได้อยู่ในสถานะรออนุมัติ (อาจมีผู้อื่นตัดสินไปแล้ว)");
    return { status: decision === "approve" ? "approved" : "rejected", approval_log: [...cur.approval_log, entry(decision, by, name, comment)] };
  });
}

export async function deleteRequisition(projectId: string, id: string) {
  await deleteDoc(requisitionRef(projectId, id));
}
