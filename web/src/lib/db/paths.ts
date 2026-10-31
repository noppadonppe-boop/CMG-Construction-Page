import { collection, doc } from "firebase/firestore";
import { db } from "../firebase/client";

// โครงสร้างข้อมูลทั้งหมดของแอป (ทุกคนใช้ชุดเดียวกัน — มองเห็นได้ตามโครงการที่ถูก assign):
//
//   Cmg-Cons-Page-Claude / root
//     ├─ appMeta / config                       ข้อมูลระบบ (ผู้ใช้คนแรก, จำนวนผู้ใช้)
//     ├─ users / {email}                        โปรไฟล์ผู้ใช้ + role + โครงการที่ได้รับ assign
//     ├─ activityLogs / {auto}                  ประวัติ REGISTER / LOGIN
//     ├─ projectCodes / {CODE}                  จองรหัสโครงการไม่ให้ซ้ำ
//     ├─ formStandards / {auto}                 มาตรฐานแบบฟอร์มกลาง (โครงการเลือกใช้ผ่านฟิลด์ form_standards)
//     ├─ menus / {auto}                         เมนูเพิ่มเติมใน sidebar → Card (กลุ่ม) → ลิงก์ย่อย
//     └─ projects / {projectId}                 ข้อมูลโครงการ + ความคืบหน้ารายเดือน
//          ├─ daily_reports / {YYYY-MM-DD}      รายงานประจำวัน (1 ฉบับ/วัน)
//          ├─ issues / {auto}                   ปัญหา / ความปลอดภัย / RFI
//          ├─ documents / {auto}                เอกสาร / แบบ + revision
//          ├─ material_requests / {auto}        Material Request — ข้อมูลขอเบิก + การรับของทุกครั้งในเอกสารเดียว
//          └─ email_setup / config              รายชื่อผู้รับ + เนื้อหาอีเมลรายงานประจำวัน
//
//   Storage: Cmg-Cons-Page-Claude/root/projects/{projectId}/{เมนู}/{docId}/{ไฟล์}
//            Cmg-Cons-Page-Claude/root/menus/icons/{ไฟล์}   ไอคอนรูปภาพของเมนู / Card / ลิงก์

export const APP_NAME = "Cmg-Cons-Page-Claude";

export type ProjectSection = "daily_reports" | "issues" | "documents" | "material_requests";

export const rootRef = () => doc(db(), APP_NAME, "root");
export const appMetaRef = () => doc(rootRef(), "appMeta", "config");
export const usersCol = () => collection(rootRef(), "users");
export const userRef = (email: string) => doc(usersCol(), email.toLowerCase());
export const activityLogsCol = () => collection(rootRef(), "activityLogs");
export const projectCodeRef = (code: string) => doc(rootRef(), "projectCodes", code.toUpperCase());
export const formStandardsCol = () => collection(rootRef(), "formStandards");
export const formStandardRef = (id: string) => doc(formStandardsCol(), id);
export const formStandardPath = (id: string, fileName: string) => `${APP_NAME}/root/form_standards/${id}/${fileName}`;
export const menusCol = () => collection(rootRef(), "menus");
export const menuRef = (menuId: string) => doc(menusCol(), menuId);
export const menuIconPath = (fileName: string) => `${APP_NAME}/root/menus/icons/${fileName}`;
export const projectsCol =() => collection(rootRef(), "projects");
export const projectRef = (projectId: string) => doc(projectsCol(), projectId);
export const sectionCol = (projectId: string, section: ProjectSection) => collection(projectRef(projectId), section);
export const emailSetupRef = (projectId: string) => doc(projectRef(projectId), "email_setup", "config");

export const storagePath = (projectId: string, section: ProjectSection, docId: string, fileName: string) =>
  `${APP_NAME}/root/projects/${projectId}/${section}/${docId}/${fileName}`;
