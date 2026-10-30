"use client";

import { addDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc, writeBatch, type DocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase/client";
import { DataError, deleteFiles, newId, uploadFile, type StoredFile } from "./common";
import { menuIconPath, menuRef, menusCol } from "./paths";

// เมนูเพิ่มเติมใน sidebar: menus/{id} — Card ทั้งหมดของเมนูเก็บเป็น array ในเอกสารเดียว (ลำดับใน array = ลำดับบนหน้า)
// Card 1 ใบ = ลิงก์ 1 รายการ · ไอคอนรูปภาพเก็บใน Storage แยก ในเอกสารเก็บแค่ path + url
// project_ids = โครงการที่เมนู/Card แสดง: เมนู [] = ทุกโครงการ, Card [] = ตามเมนู (Card เลือกได้เฉพาะโครงการของเมนู)
// การซ่อนตามโครงการทำที่หน้าเว็บ — ผู้ใช้ที่ล็อกอินยังอ่านเอกสารเมนูได้ทั้งหมด

/** ขนาดของ Card บนตาราง 12 คอลัมน์: w = กว้างกี่คอลัมน์, h = สูงกี่แถว (แถวละ 24px) */
export const GRID_COLS = 12;
export const MAX_ROWS = 12;

export const CARD_COLORS = [
  "#2563eb", "#0ea5e9", "#0891b2", "#0d9488", "#059669", "#16a34a", "#65a30d", "#f59e0b", "#f97316",
  "#ef4444", "#f43f5e", "#ec4899", "#c026d3", "#9333ea", "#7c3aed", "#4f46e5", "#475569", "#52525b",
];

/** ไอคอนรูปภาพในฟอร์ม: ไฟล์เดิมใน Storage, รูปใหม่ที่ยังไม่อัปโหลด (Blob) หรือไม่มี */
export type IconValue = StoredFile | Blob | null;

/** ไอคอนของเมนู/Card — แสดงตามลำดับ: รูปภาพ → ไอคอนจากชุด (glyph) → emoji → ตัวอักษรแรกของชื่อ */
export interface IconFields {
  emoji: string;
  /** ชื่อไอคอนในชุด GLYPHS ("" = ไม่ใช้) */
  glyph: string;
  icon: StoredFile | null;
  color: string;
}

export interface MenuCard extends IconFields {
  id: string;
  name: string;
  /** "#" = ยังไม่มี URL */
  url: string;
  description: string;
  active: boolean;
  w: number;
  h: number;
  /** [] = ตามเมนู */
  project_ids: string[];
}

export interface CustomMenu extends IconFields {
  id: string;
  name: string;
  order: number;
  cards: MenuCard[];
  /** [] = ทุกโครงการ */
  project_ids: string[];
}

type WithIconInput<T> = Omit<T, "icon"> & { icon: IconValue };
export type MenuInput = WithIconInput<Pick<CustomMenu, "name" | "project_ids" | keyof IconFields>>;
export type CardInput = WithIconInput<Omit<MenuCard, "id">>;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

const toIds = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x !== ""))] : []);

function toIcon(v: unknown): StoredFile | null {
  const f = v as Partial<StoredFile> | null | undefined;
  return f?.path && f.url ? { path: f.path, url: f.url } : null;
}

function toCard(c: Partial<MenuCard>): MenuCard {
  return {
    id: c.id ?? newId(),
    name: c.name ?? "",
    url: c.url ?? "#",
    description: c.description ?? "",
    emoji: c.emoji ?? "",
    glyph: c.glyph ?? "",
    icon: toIcon(c.icon),
    color: c.color ?? CARD_COLORS[0],
    active: Boolean(c.active),
    w: clamp(c.w, 1, GRID_COLS, 2),
    h: clamp(c.h, 2, MAX_ROWS, 5),
    project_ids: toIds(c.project_ids),
  };
}

/**
 * อ่าน array Card จากเอกสาร — ข้อมูลช่วงที่ Card เป็นกลุ่มลิงก์ (มี links) ถูกแตกเป็น Card ละลิงก์
 * (ขนาดตามกลุ่มเดิม) กลุ่มที่ยังไม่มีลิงก์กลายเป็น Card ที่ยังไม่มี URL
 */
function toCards(raw: unknown): MenuCard[] {
  return ((raw ?? []) as (Partial<MenuCard> & { links?: Partial<MenuCard>[] })[]).flatMap(({ links, ...c }) =>
    Array.isArray(links) && links.length > 0
      ? links.map((l) => toCard({ ...l, w: c.w, h: c.h }))
      : [toCard(Array.isArray(links) ? { ...c, url: "#" } : c)],
  );
}

function toMenu(snap: DocumentSnapshot): CustomMenu {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: d.name ?? "",
    emoji: d.emoji ?? "",
    glyph: d.glyph ?? "",
    icon: toIcon(d.icon),
    color: d.color ?? CARD_COLORS[0],
    order: Number(d.order ?? 0),
    cards: toCards(d.cards),
    project_ids: toIds(d.project_ids),
  };
}

/** แสดงในโครงการนี้ไหม — projectId = null คือหน้านอกโครงการ ซึ่งเห็นเฉพาะที่ตั้งเป็นทุกโครงการ */
const inProject = (ids: string[], projectId: string | null) => ids.length === 0 || (projectId !== null && ids.includes(projectId));

export const menuVisibleIn = (menu: CustomMenu, projectId: string | null) => inProject(menu.project_ids, projectId);

export const cardVisibleIn = (menu: CustomMenu, card: MenuCard, projectId: string | null) =>
  menuVisibleIn(menu, projectId) && inProject(card.project_ids, projectId);

/** ลิงก์ที่เปิดได้จริง — รับเฉพาะ http(s) เพื่อกัน javascript: และลิงก์แปลก ๆ */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** เมนูเพิ่มเติมทั้งหมด (realtime) เรียงตามลำดับที่ตั้งไว้ */
export function useMenus() {
  const [state, setState] = useState<{ menus: CustomMenu[]; loading: boolean; error?: string }>({ menus: [], loading: true });
  useEffect(
    () =>
      onSnapshot(
        menusCol(),
        (snap) => setState({ menus: snap.docs.map(toMenu).toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name)), loading: false }),
        (e) => setState({ menus: [], loading: false, error: e.message }),
      ),
    [],
  );
  return state;
}

// ---------- ไอคอนรูปภาพ ----------

/**
 * อัปโหลดไอคอนใหม่ (ถ้ามี) → บันทึกข้อมูล → ลบไฟล์ไอคอนเก่าที่ไม่ใช้แล้ว
 * ถ้าบันทึกไม่สำเร็จ ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง จะได้ไม่มีไฟล์ค้างใน Storage
 */
async function withIcon(prev: StoredFile | null, next: IconValue, write: (icon: StoredFile | null) => Promise<void>) {
  const uploaded = next instanceof Blob ? await uploadFile(menuIconPath(`${newId()}.${next.type === "image/png" ? "png" : "webp"}`), next) : null;
  const icon = uploaded ?? (next as StoredFile | null);
  try {
    await write(icon);
  } catch (e) {
    if (uploaded) await deleteFiles([uploaded.path]);
    throw e;
  }
  if (prev && prev.path !== icon?.path) await deleteFiles([prev.path]);
}

// ---------- เมนู ----------

export async function createMenu({ icon, ...input }: MenuInput, order: number, actor: string): Promise<string> {
  let id = "";
  await withIcon(null, icon, async (stored) => {
    const ref = await addDoc(menusCol(), {
      ...input,
      icon: stored,
      order,
      cards: [],
      created_at: serverTimestamp(),
      created_by: actor,
      updated_at: serverTimestamp(),
      updated_by: actor,
    });
    id = ref.id;
  });
  return id;
}

export async function updateMenu(menu: CustomMenu, { icon, ...input }: MenuInput, actor: string) {
  await withIcon(menu.icon, icon, (stored) => updateDoc(menuRef(menu.id), { ...input, icon: stored, updated_at: serverTimestamp(), updated_by: actor }));
}

export async function deleteMenu(menu: CustomMenu) {
  await deleteDoc(menuRef(menu.id));
  await deleteFiles([menu.icon?.path ?? "", ...menu.cards.map((c) => c.icon?.path ?? "")]);
}

/** บันทึกลำดับเมนูใหม่ตาม array ที่ส่งมา — เขียนเฉพาะเมนูที่ลำดับเปลี่ยน */
export async function reorderMenus(menus: CustomMenu[]) {
  const batch = writeBatch(db());
  menus.forEach((m, order) => m.order !== order && batch.update(menuRef(m.id), { order }));
  await batch.commit();
}

// ---------- Card ----------

/**
 * แก้ Card ใน transaction — อ่าน array ล่าสุดก่อนแก้ จึงไม่ทับ Card ที่คนอื่นเพิ่ง เพิ่ม/แก้ พร้อมกัน
 */
async function editCards(menuId: string, actor: string, change: (cards: MenuCard[]) => MenuCard[]) {
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(menuRef(menuId));
    if (!snap.exists()) throw new DataError("เมนูนี้ถูกลบไปแล้ว");
    tx.update(menuRef(menuId), { cards: change(toMenu(snap).cards), updated_at: serverTimestamp(), updated_by: actor });
  });
}

export const addCard = (menuId: string, { icon, ...input }: CardInput, actor: string) =>
  withIcon(null, icon, (stored) => editCards(menuId, actor, (cards) => [...cards, toCard({ ...input, icon: stored, id: newId() })]));

export const updateCard = (menuId: string, card: MenuCard, { icon, ...input }: CardInput, actor: string) =>
  withIcon(card.icon, icon, (stored) =>
    editCards(menuId, actor, (cards) => {
      if (!cards.some((c) => c.id === card.id)) throw new DataError("Card นี้ถูกลบไปแล้ว");
      return cards.map((c) => (c.id === card.id ? toCard({ ...input, icon: stored, id: card.id }) : c));
    }),
  );

/** เปิด/ปิด Active โดยไม่ต้องเปิดฟอร์ม */
export const setCardActive = (menuId: string, cardId: string, active: boolean, actor: string) =>
  editCards(menuId, actor, (cards) => cards.map((c) => (c.id === cardId ? { ...c, active } : c)));

export async function deleteCard(menuId: string, card: MenuCard, actor: string) {
  await editCards(menuId, actor, (cards) => cards.filter((c) => c.id !== card.id));
  if (card.icon) await deleteFiles([card.icon.path]);
}

/** เลื่อน Card ไปก่อนหน้า (-1) หรือถัดไป (+1) */
export const moveCard = (menuId: string, cardId: string, step: -1 | 1, actor: string) =>
  editCards(menuId, actor, (cards) => {
    const i = cards.findIndex((c) => c.id === cardId);
    const j = i + step;
    if (i < 0 || j < 0 || j >= cards.length) return cards;
    const next = [...cards];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
