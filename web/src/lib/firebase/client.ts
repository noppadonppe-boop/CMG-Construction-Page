import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "./config";

// Firebase ฝั่งเบราว์เซอร์ — ทุกการอ่าน/เขียนทำในชื่อผู้ใช้ที่ล็อกอินอยู่ และฟังการเปลี่ยนแปลงแบบ realtime

export const firebaseApp = () => getApps()[0] ?? initializeApp(firebaseConfig);

let authInstance: Auth | undefined;

/** Auth เก็บ token ไว้ใน localStorage (จำการล็อกอินถาวรจนกว่าจะออกจากระบบ) */
export function auth(): Auth {
  if (!authInstance) {
    try {
      authInstance = initializeAuth(firebaseApp(), {
        persistence: browserLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      // ถูก initialize ไปแล้ว (เช่น Fast Refresh ตอน dev)
      authInstance = getAuth(firebaseApp());
    }
  }
  return authInstance;
}

export const db = () => getFirestore(firebaseApp());
export const storage = () => getStorage(firebaseApp());
