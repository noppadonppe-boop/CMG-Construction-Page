"use client";

import { onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase/client";
import { toProfile } from "../auth/service";
import type { UserRole } from "../auth/roles";
import type { UserProfile, UserStatus } from "../auth/types";
import { userRef, usersCol } from "./paths";

/** ผู้ใช้ทั้งหมด (realtime) — ใช้ในหน้าจัดการผู้ใช้ของ MasterAdmin */
export function useUsers(enabled: boolean) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      usersCol(),
      (snap) => {
        setUsers(snap.docs.map((d) => toProfile(d)!).filter(Boolean));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [enabled]);
  return { users, loading, error };
}

/** จำนวนผู้ใช้ที่รออนุมัติ (realtime) — แสดงเป็นแจ้งเตือนที่เมนูจัดการผู้ใช้ */
export function usePendingUserCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(usersCol(), where("status", "==", "pending")),
      (snap) => setCount(snap.size),
      () => setCount(0),
    );
  }, [enabled]);
  return enabled ? count : 0;
}

export type AdminUserPatch = Partial<{
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  role: UserRole[];
  status: UserStatus;
  assignedProjects: string[];
}>;

export class UserUpdateError extends Error {}

/**
 * MasterAdmin แก้ข้อมูลผู้ใช้ — ทำใน transaction เพื่อกันไม่ให้ระบบเหลือ MasterAdmin ที่ใช้งานได้เป็นศูนย์
 * (เช่น ถอด role ตัวเอง หรือปฏิเสธ MasterAdmin คนสุดท้าย)
 */
export async function updateUserByAdmin(email: string, patch: AdminUserPatch, actorEmail: string, allUsers: UserProfile[]) {
  const ref = userRef(email);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    const current = toProfile(snap);
    if (!current) throw new UserUpdateError("ไม่พบผู้ใช้นี้แล้ว");
    const next = { ...current, ...patch };
    const isActiveMaster = (u: Pick<UserProfile, "role" | "status">) => u.role.includes("MasterAdmin") && u.status === "approved";
    if (isActiveMaster(current) && !isActiveMaster(next)) {
      const others = allUsers.filter((u) => u.email !== email && isActiveMaster(u));
      if (others.length === 0) throw new UserUpdateError("ต้องมี MasterAdmin ที่ใช้งานได้อย่างน้อย 1 คน");
    }
    if (patch.role && patch.role.length === 0) throw new UserUpdateError("ต้องมีอย่างน้อย 1 role");
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), updatedBy: actorEmail });
  });
}
