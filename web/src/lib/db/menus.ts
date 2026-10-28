"use client";

import { addDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc, type DocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase/client";
import { DataError, newId } from "./common";
import { menuRef, menusCol } from "./paths";

// เมนูเพิ่มเติมใน sidebar: menus/{id} — Card ทั้งหมดของเมนูเก็บเป็น array ในเอกสารเดียว (ลำดับใน array = ลำดับบนหน้า)

/** ขนาดของ Card บนตาราง 12 คอลัมน์: w = กว้างกี่คอลัมน์, h = สูงกี่แถว (แถวละ 24px) */
export const GRID_COLS = 12;
export const MAX_ROWS = 12;

export const CARD_COLORS = [
  "#2563eb", "#0ea5e9", "#0891b2", "#0d9488", "#059669", "#16a34a", "#65a30d", "#f59e0b", "#f97316",
  "#ef4444", "#f43f5e", "#ec4899", "#c026d3", "#9333ea", "#7c3aed", "#4f46e5", "#475569", "#52525b",
];

export interface MenuCard {
  id: string;
  name: string;
  /** "#" = ยังไม่มี URL */
  url: string;
  description: string;
  emoji: string;
  color: string;
  active: boolean;
  w: number;
  h: number;
}

export interface CustomMenu {
  id: string;
  name: string;
  emoji: string;
  color: string;
  order: number;
  cards: MenuCard[];
}

export type MenuInput = Pick<CustomMenu, "name" | "emoji" | "color">;
export type CardInput = Omit<MenuCard, "id">;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

function toCard(c: Partial<MenuCard>): MenuCard {
  return {
    id: c.id ?? newId(),
    name: c.name ?? "",
    url: c.url ?? "#",
    description: c.description ?? "",
    emoji: c.emoji ?? "",
    color: c.color ?? CARD_COLORS[0],
    active: Boolean(c.active),
    w: clamp(c.w, 1, GRID_COLS, 2),
    h: clamp(c.h, 2, MAX_ROWS, 5),
  };
}

function toMenu(snap: DocumentSnapshot): CustomMenu {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: d.name ?? "",
    emoji: d.emoji ?? "",
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

export async function createMenu(input: MenuInput, order: number, actor: string): Promise<string> {
  const ref = await addDoc(menusCol(), {
    ...input,
    order,
    cards: [],
    created_at: serverTimestamp(),
    created_by: actor,
    updated_at: serverTimestamp(),
    updated_by: actor,
  });
  return ref.id;
}

export async function updateMenu(menuId: string, input: MenuInput, actor: string) {
  await updateDoc(menuRef(menuId), { ...input, updated_at: serverTimestamp(), updated_by: actor });
}

export async function deleteMenu(menuId: string) {
  await deleteDoc(menuRef(menuId));
}

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

export const addCard = (menuId: string, input: CardInput, actor: string) =>
  editCards(menuId, actor, (cards) => [...cards, toCard({ ...input, id: newId() })]);

export const updateCard = (menuId: string, cardId: string, input: CardInput, actor: string) =>
  editCards(menuId, actor, (cards) => {
    if (!cards.some((c) => c.id === cardId)) throw new DataError("Card นี้ถูกลบไปแล้ว");
    return cards.map((c) => (c.id === cardId ? toCard({ ...input, id: cardId }) : c));
  });

export const deleteCard = (menuId: string, cardId: string, actor: string) =>
  editCards(menuId, actor, (cards) => cards.filter((c) => c.id !== cardId));

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
