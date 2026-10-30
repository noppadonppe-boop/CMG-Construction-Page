"use client";

import { addDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc, writeBatch, type DocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase/client";
import { DataError, deleteFiles, newId, uploadFile, type StoredFile } from "./common";
import { menuIconPath, menuRef, menusCol } from "./paths";

// เมนูเพิ่มเติมใน sidebar: menus/{id} → Card (กลุ่ม) → ลิงก์ย่อย
// Card และลิงก์ทั้งหมดของเมนูเก็บเป็น array ซ้อนในเอกสารเดียว (ลำดับใน array = ลำดับบนหน้า)
// ไอคอนรูปภาพเก็บใน Storage แยก — ในเอกสารเก็บแค่ path + url

/** ขนาดของ Card บนตาราง 12 คอลัมน์: w = กว้างกี่คอลัมน์, h = สูงกี่แถว (แถวละ 24px) */
export const GRID_COLS = 12;
export const MAX_ROWS = 16;

export const CARD_COLORS = [
  "#2563eb", "#0ea5e9", "#0891b2", "#0d9488", "#059669", "#16a34a", "#65a30d", "#f59e0b", "#f97316",
  "#ef4444", "#f43f5e", "#ec4899", "#c026d3", "#9333ea", "#7c3aed", "#4f46e5", "#475569", "#52525b",
];

/** ไอคอนในฟอร์ม: ไฟล์เดิมใน Storage, รูปใหม่ที่ยังไม่อัปโหลด (Blob) หรือไม่มี */
export type IconValue = StoredFile | Blob | null;

export interface MenuLink {
  id: string;
  name: string;
  /** "#" = ยังไม่มี URL */
  url: string;
  description: string;
  emoji: string;
  icon: StoredFile | null;
  color: string;
  active: boolean;
}

export interface MenuCard {
  id: string;
  name: string;
  description: string;
  emoji: string;
  icon: StoredFile | null;
  color: string;
  w: number;
  h: number;
  links: MenuLink[];
}

export interface CustomMenu {
  id: string;
  name: string;
  emoji: string;
  icon: StoredFile | null;
  color: string;
  order: number;
  cards: MenuCard[];
}

export type MenuInput = Pick<CustomMenu, "name" | "emoji" | "color"> & { icon: IconValue };
export type CardInput = Omit<MenuCard, "id" | "links" | "icon"> & { icon: IconValue };
export type LinkInput = Omit<MenuLink, "id" | "icon"> & { icon: IconValue };

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

function toIcon(v: unknown): StoredFile | null {
  const f = v as Partial<StoredFile> | null | undefined;
  return f?.path && f.url ? { path: f.path, url: f.url } : null;
}

function toLink(l: Partial<MenuLink>): MenuLink {
  return {
    id: l.id ?? newId(),
    name: l.name ?? "",
    url: l.url ?? "#",
    description: l.description ?? "",
    emoji: l.emoji ?? "",
    icon: toIcon(l.icon),
    color: l.color ?? CARD_COLORS[0],
    active: Boolean(l.active),
  };
}

function toCard(c: Partial<MenuCard> & { url?: string; active?: boolean }): MenuCard {
  // ข้อมูลรุ่นเก่า: Card เป็นลิงก์ตัวเดียว (มี url ไม่มี links) → แปลงเป็นกลุ่มที่มีลิงก์ 1 รายการ
  const legacy = !Array.isArray(c.links) && c.url !== undefined;
  return {
    id: c.id ?? newId(),
    name: c.name ?? "",
    description: legacy ? "" : (c.description ?? ""),
    emoji: c.emoji ?? "",
    icon: toIcon(c.icon),
    color: c.color ?? CARD_COLORS[0],
    w: clamp(c.w, 1, GRID_COLS, 3),
    h: clamp(c.h, 3, MAX_ROWS, 7),
    // id ลิงก์ที่แปลงมาต้องคงที่ทุกครั้งที่อ่าน ไม่งั้นแก้/ลบลิงก์นี้ใน transaction จะหาไม่เจอ
    links: legacy ? [toLink({ ...c, id: `${c.id}-link`, icon: null })] : ((c.links ?? []) as Partial<MenuLink>[]).map(toLink),
  };
}

function toMenu(snap: DocumentSnapshot): CustomMenu {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: d.name ?? "",
    emoji: d.emoji ?? "",
    icon: toIcon(d.icon),
    color: d.color ?? CARD_COLORS[0],
    order: Number(d.order ?? 0),
    cards: ((d.cards ?? []) as Partial<MenuCard>[]).map(toCard),
  };
}

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

// ---------- ไอคอน ----------

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

const cardIconPaths = (c: MenuCard) => [c.icon?.path ?? "", ...c.links.map((l) => l.icon?.path ?? "")];

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
  await deleteFiles([menu.icon?.path ?? "", ...menu.cards.flatMap(cardIconPaths)]);
}

/** เลื่อนเมนูไปก่อนหน้า (-1) หรือถัดไป (+1) — เขียนลำดับใหม่ให้ทุกเมนู กันกรณี order ซ้ำกัน */
export async function moveMenu(menus: CustomMenu[], menuId: string, step: -1 | 1) {
  const i = menus.findIndex((m) => m.id === menuId);
  const j = i + step;
  if (i < 0 || j < 0 || j >= menus.length) return;
  const next = [...menus];
  [next[i], next[j]] = [next[j], next[i]];
  const batch = writeBatch(db());
  next.forEach((m, order) => m.order !== order && batch.update(menuRef(m.id), { order }));
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

/** สลับตำแหน่งรายการใน array — ใช้ได้ทั้ง Card และลิงก์ */
function swap<T extends { id: string }>(items: T[], id: string, step: -1 | 1): T[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export async function addCard(menuId: string, { icon, ...input }: CardInput, actor: string): Promise<string> {
  const id = newId();
  await withIcon(null, icon, (stored) => editCards(menuId, actor, (cards) => [...cards, toCard({ ...input, icon: stored, id, links: [] })]));
  return id;
}

export const updateCard = (menuId: string, card: MenuCard, { icon, ...input }: CardInput, actor: string) =>
  withIcon(card.icon, icon, (stored) =>
    editCards(menuId, actor, (cards) => {
      const current = cards.find((c) => c.id === card.id);
      if (!current) throw new DataError("Card นี้ถูกลบไปแล้ว");
      return cards.map((c) => (c.id === card.id ? toCard({ ...input, icon: stored, id: card.id, links: current.links }) : c));
    }),
  );

export async function deleteCard(menuId: string, card: MenuCard, actor: string) {
  await editCards(menuId, actor, (cards) => cards.filter((c) => c.id !== card.id));
  await deleteFiles(cardIconPaths(card));
}

/** เลื่อน Card ไปก่อนหน้า (-1) หรือถัดไป (+1) */
export const moveCard = (menuId: string, cardId: string, step: -1 | 1, actor: string) =>
  editCards(menuId, actor, (cards) => swap(cards, cardId, step));

// ---------- ลิงก์ใน Card ----------

function editLinks(menuId: string, cardId: string, actor: string, change: (links: MenuLink[]) => MenuLink[]) {
  return editCards(menuId, actor, (cards) => {
    if (!cards.some((c) => c.id === cardId)) throw new DataError("Card นี้ถูกลบไปแล้ว");
    return cards.map((c) => (c.id === cardId ? { ...c, links: change(c.links) } : c));
  });
}

export const addLink = (menuId: string, cardId: string, { icon, ...input }: LinkInput, actor: string) =>
  withIcon(null, icon, (stored) => editLinks(menuId, cardId, actor, (links) => [...links, toLink({ ...input, icon: stored, id: newId() })]));

export const updateLink = (menuId: string, cardId: string, link: MenuLink, { icon, ...input }: LinkInput, actor: string) =>
  withIcon(link.icon, icon, (stored) =>
    editLinks(menuId, cardId, actor, (links) => {
      if (!links.some((l) => l.id === link.id)) throw new DataError("ลิงก์นี้ถูกลบไปแล้ว");
      return links.map((l) => (l.id === link.id ? toLink({ ...input, icon: stored, id: link.id }) : l));
    }),
  );

/** เปิด/ปิด Active โดยไม่ต้องเปิดฟอร์ม */
export const setLinkActive = (menuId: string, cardId: string, linkId: string, active: boolean, actor: string) =>
  editLinks(menuId, cardId, actor, (links) => links.map((l) => (l.id === linkId ? { ...l, active } : l)));

export async function deleteLink(menuId: string, cardId: string, link: MenuLink, actor: string) {
  await editLinks(menuId, cardId, actor, (links) => links.filter((l) => l.id !== link.id));
  if (link.icon) await deleteFiles([link.icon.path]);
}

export const moveLink = (menuId: string, cardId: string, linkId: string, step: -1 | 1, actor: string) =>
  editLinks(menuId, cardId, actor, (links) => swap(links, linkId, step));
