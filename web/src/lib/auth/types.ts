import type { Timestamp } from "firebase/firestore";
import type { UserRole } from "./roles";

export type UserStatus = "pending" | "approved" | "rejected";

/** Cmg-Cons-Page-Claude/root/users/{email} */
export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  /** กำหนดโดย MasterAdmin — มีได้หลาย role, สิทธิ์รวมกัน */
  role: UserRole[];
  status: UserStatus;
  /** id ของโครงการที่มองเห็นได้ */
  assignedProjects: string[];
  createdAt: Timestamp | null;
  photoURL?: string;
  isFirstUser: boolean;
}

/** Cmg-Cons-Page-Claude/root/appMeta/config */
export interface AppMetaConfig {
  firstUserRegistered: boolean;
  totalUsers: number;
  createdAt: Timestamp;
}

export type ActivityAction = "REGISTER" | "LOGIN" | "LOGOUT";
