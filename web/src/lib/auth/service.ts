import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { addDoc, getDoc, runTransaction, serverTimestamp, updateDoc, type DocumentSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/client";
import { activityLogsCol, appMetaRef, userRef } from "../db/paths";
import { normalizeRoles } from "./roles";
import type { ActivityAction, UserProfile } from "./types";

// Service สำหรับ Login / Register / Logout — แยกจาก UI เพื่อให้หน้าไหนก็เรียกใช้ได้

// ───────────── Session expiry ─────────────
// Firebase จำ token ไว้ใน localStorage อยู่แล้ว (browserLocalPersistence) — ตัวนี้เพิ่มอายุสูงสุดของ session
const SESSION_KEY = "cmg.sessionExpiry";
const SESSION_DAYS = 30;

/** เรียกทันทีหลัง sign-in สำเร็จ ก่อน await อื่นใด — กัน onAuthStateChanged มองว่า session หมดอายุ */
export function setSessionExpiry() {
  try {
    localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // private mode / storage ถูกบล็อก — ใช้ได้ตามปกติ แค่ไม่มีวันหมดอายุเพิ่มเติม
  }
}

export function isSessionExpired() {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value !== null && Date.now() > Number(value);
  } catch {
    return false;
  }
}

function clearSessionExpiry() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ───────────── Errors ─────────────
export class AuthError extends Error {}

export function authErrorMessage(e: unknown): string {
  if (e instanceof AuthError) return e.message;
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-login-credentials":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "auth/invalid-email":
      return "รูปแบบอีเมลไม่ถูกต้อง";
    case "auth/email-already-in-use":
      return "อีเมลนี้สมัครไว้แล้ว — เข้าสู่ระบบแทน";
    case "auth/weak-password":
      return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "ปิดหน้าต่าง Google ก่อนเข้าสู่ระบบเสร็จ";
    case "auth/popup-blocked":
      return "เบราว์เซอร์บล็อกหน้าต่าง Google — อนุญาต popup แล้วลองใหม่";
    case "auth/unauthorized-domain":
      return "โดเมนนี้ยังไม่ได้รับอนุญาต — เพิ่มใน Firebase Console > Authentication > Settings > Authorized domains";
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "ยังไม่ได้เปิดวิธีเข้าสู่ระบบนี้ใน Firebase Console > Authentication > Sign-in method";
    case "auth/too-many-requests":
      return "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่";
    case "auth/network-request-failed":
      return "เชื่อมต่ออินเทอร์เน็ตไม่ได้";
    case "permission-denied":
      return "Firestore Rules ไม่อนุญาตให้บันทึกข้อมูลผู้ใช้";
    default:
      return (e as Error)?.message || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่";
  }
}

// ───────────── Profile ─────────────
export function toProfile(snap: DocumentSnapshot): UserProfile | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid: d.uid ?? "",
    email: d.email ?? snap.id,
    firstName: d.firstName ?? "",
    lastName: d.lastName ?? "",
    position: d.position ?? "",
    department: d.department ?? "",
    role: normalizeRoles(d.role),
    status: d.status ?? "pending",
    assignedProjects: Array.isArray(d.assignedProjects) ? d.assignedProjects : [],
    createdAt: d.createdAt ?? null,
    photoURL: d.photoURL || undefined,
    isFirstUser: Boolean(d.isFirstUser),
  };
}

export async function fetchProfile(email: string): Promise<UserProfile | null> {
  return toProfile(await getDoc(userRef(email)));
}

/** บันทึกประวัติแบบไม่รอผล — ล้มเหลวก็ไม่กระทบการเข้าสู่ระบบ */
export function logActivity(action: ActivityAction, email: string, detail: Record<string, unknown> = {}) {
  addDoc(activityLogsCol(), {
    action,
    email: email.toLowerCase(),
    at: serverTimestamp(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    ...detail,
  }).catch(() => {});
}

type NewProfileInput = { firstName: string; lastName: string; position: string; photoURL?: string };

/**
 * สร้างโปรไฟล์ผู้ใช้ใหม่ใน transaction เดียวกับการอ่าน appMeta/config
 * → ผู้ใช้คนแรกของระบบได้ MasterAdmin + approved, คนต่อ ๆ ไปได้ Staff + pending (รอ MasterAdmin อนุมัติ)
 * ถ้ามีโปรไฟล์อยู่แล้วจะคืนของเดิม (กันสร้างซ้ำเมื่อกดซ้ำ/เปิดหลายแท็บ)
 */
export async function createUserProfile(user: User, input: NewProfileInput): Promise<{ profile: UserProfile; created: boolean }> {
  const email = (user.email ?? "").toLowerCase();
  if (!email) throw new AuthError("บัญชีนี้ไม่มีอีเมล");
  const ref = userRef(email);

  const result = await runTransaction(db(), async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) return { created: false, profile: toProfile(existing)! };

    const meta = await tx.get(appMetaRef());
    const isFirstUser = !meta.exists() || !meta.get("firstUserRegistered");
    const profile = {
      uid: user.uid,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      position: input.position,
      department: "",
      role: isFirstUser ? ["MasterAdmin"] : ["Staff"],
      status: isFirstUser ? "approved" : "pending",
      assignedProjects: [],
      createdAt: serverTimestamp(),
      photoURL: input.photoURL ?? "",
      isFirstUser,
    };
    tx.set(ref, profile);
    tx.set(
      appMetaRef(),
      {
        firstUserRegistered: true,
        totalUsers: Number(meta.get("totalUsers") ?? 0) + 1,
        ...(meta.exists() ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true },
    );
    return { created: true, profile: { ...profile, createdAt: null } as unknown as UserProfile };
  });

  if (result.created) logActivity("REGISTER", email, { firstUser: result.profile.isFirstUser });
  return { profile: (await fetchProfile(email)) ?? result.profile, created: result.created };
}

function splitName(displayName: string | null, email: string) {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: email.split("@")[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ───────────── Login / Register / Logout ─────────────

export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  try {
    await setPersistence(auth(), browserLocalPersistence);
    const { user } = await signInWithEmailAndPassword(auth(), email.trim(), password);
    setSessionExpiry();
    // บัญชีที่มีใน Auth แต่ยังไม่มีโปรไฟล์ (เช่นสร้างจาก Console) → สร้างให้ด้วยกติกาเดียวกับการสมัคร
    const profile = (await fetchProfile(user.email ?? email)) ?? (await createUserProfile(user, { ...splitName(user.displayName, email), position: "" })).profile;
    logActivity("LOGIN", profile.email, { method: "password" });
    return profile;
  } catch (e) {
    throw new AuthError(authErrorMessage(e));
  }
}

export async function loginWithGoogle(): Promise<UserProfile> {
  try {
    await setPersistence(auth(), browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const { user } = await signInWithPopup(auth(), provider);
    setSessionExpiry();
    const email = user.email ?? "";
    let profile = await fetchProfile(email);
    if (!profile) {
      ({ profile } = await createUserProfile(user, { ...splitName(user.displayName, email), position: "", photoURL: user.photoURL ?? undefined }));
    } else if (user.photoURL && profile.photoURL !== user.photoURL) {
      // รูปโปรไฟล์ Google เปลี่ยน — อัปเดตตาม (ไม่ต้องรอ)
      updateDoc(userRef(email), { photoURL: user.photoURL }).catch(() => {});
    }
    logActivity("LOGIN", email, { method: "google" });
    return profile;
  } catch (e) {
    throw new AuthError(authErrorMessage(e));
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  position: string,
): Promise<UserProfile> {
  try {
    await setPersistence(auth(), browserLocalPersistence);
    const { user } = await createUserWithEmailAndPassword(auth(), email.trim(), password);
    setSessionExpiry();
    updateProfile(user, { displayName: `${firstName} ${lastName}`.trim() }).catch(() => {});
    const { profile } = await createUserProfile(user, { firstName, lastName, position });
    return profile;
  } catch (e) {
    throw new AuthError(authErrorMessage(e));
  }
}

export async function logout() {
  const email = auth().currentUser?.email;
  if (email) logActivity("LOGOUT", email);
  clearSessionExpiry();
  await signOut(auth());
}

/** ผู้ใช้แก้ข้อมูลตัวเอง — แก้ได้เฉพาะข้อมูลส่วนตัว (role/สถานะ/โครงการ เป็นของ MasterAdmin) */
export async function updateOwnProfile(
  email: string,
  input: { firstName: string; lastName: string; position: string; department: string },
) {
  await updateDoc(userRef(email), { ...input, updatedAt: serverTimestamp() });
  const user = auth().currentUser;
  if (user) updateProfile(user, { displayName: `${input.firstName} ${input.lastName}`.trim() }).catch(() => {});
}
