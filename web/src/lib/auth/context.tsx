"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth } from "../firebase/client";
import { userRef } from "../db/paths";
import { permissionsOf, type Permission } from "./roles";
import { fetchProfile, isSessionExpired, logout as logoutService, toProfile } from "./service";
import type { UserProfile } from "./types";

type AuthContextValue = {
  /** ผู้ใช้จาก Firebase Auth (มี token) */
  firebaseUser: User | null;
  /** โปรไฟล์จาก Firestore — null ระหว่างโหลด หรือยังไม่ถูกสร้าง */
  userProfile: UserProfile | null;
  /** true จนกว่าจะรู้ผลการเช็ค token ครั้งแรก (และโหลดโปรไฟล์เสร็จถ้ามี token) — ห้ามเรนเดอร์หน้า Login ระหว่างนี้ */
  loading: boolean;
  /** อ่านโปรไฟล์ใหม่ทันที (ใช้หลังสร้างโปรไฟล์ผู้ใช้ใหม่ เพราะ onAuthStateChanged อาจทำงานก่อนสร้างเสร็จ) */
  refreshProfile: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  /** ตรวจสิทธิ์จาก role ทั้งหมดของผู้ใช้ (ต้อง approved) */
  can: (permission: Permission) => boolean;
  /** โครงการนี้มองเห็นได้ไหม (assign แล้ว หรือมีสิทธิ์เห็นทุกโครงการ) */
  canSeeProject: (projectId: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth(), (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;

      if (user && isSessionExpired()) {
        // session เกินอายุสูงสุด → ออกจากระบบ (onAuthStateChanged จะถูกเรียกอีกครั้งด้วย null)
        signOut(auth()).catch(() => {});
        return;
      }
      setFirebaseUser(user);
      if (!user?.email) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      // ฟังโปรไฟล์แบบ realtime: อนุมัติ/เปลี่ยน role/assign โครงการ มีผลทันทีโดยไม่ต้องรีเฟรช
      unsubscribeProfile = onSnapshot(
        userRef(user.email),
        (snap) => {
          setUserProfile(toProfile(snap));
          setLoading(false);
        },
        () => {
          // อ่านโปรไฟล์ไม่ได้ (เช่น Rules) — ไม่ throw ให้แอปค้าง แค่ถือว่ายังไม่มีโปรไฟล์
          setUserProfile(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const email = auth().currentUser?.email;
    if (!email) return null;
    try {
      const profile = await fetchProfile(email);
      setUserProfile(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutService();
    setUserProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const approved = userProfile?.status === "approved";
    const permissions = approved ? permissionsOf(userProfile.role) : new Set<Permission>();
    const assigned = new Set(userProfile?.assignedProjects ?? []);
    return {
      firebaseUser,
      userProfile,
      loading,
      refreshProfile,
      logout,
      can: (p) => permissions.has(p),
      canSeeProject: (id) => approved && (permissions.has("project.viewAll") || assigned.has(id)),
    };
  }, [firebaseUser, userProfile, loading, refreshProfile, logout]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth ต้องอยู่ภายใน <AuthProvider>");
  return value;
}

export function displayName(profile: Pick<UserProfile, "firstName" | "lastName" | "email">) {
  return `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
}
