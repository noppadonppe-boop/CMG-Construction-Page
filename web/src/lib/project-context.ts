"use client";

import { useSearchParams } from "next/navigation";
import { useActualPathname } from "./static-export";

// หน้าที่มี id โครงการอยู่ใน path — /projects/{id}, /daily-reports/{id}/..., /issues/{id}/..., /documents/{id}/...
const SCOPED_PATH = /^\/(?:projects|daily-reports|issues|documents)\/([^/]+)/;
const LAST_PROJECT_KEY = "cmg:lastProject";

/** โครงการที่ผู้ใช้กำลังทำงานอยู่ อ่านจาก URL (path หรือ ?project=) — null = อยู่นอก workspace ของโครงการ */
export function useCurrentProjectId(): string | null {
  const pathname = useActualPathname();
  const params = useSearchParams();
  const match = pathname.match(SCOPED_PATH);
  if (match && match[1] !== "new") return decodeURIComponent(match[1]);
  return params.get("project");
}

/** URL เดิมแต่เปลี่ยนเป็นโครงการอื่น — หน้ารายละเอียดของรายการจะกลับไปหน้ารายการของหมวดนั้น */
export function switchProjectHref(pathname: string, nextId: string) {
  const menu = pathname.match(/^\/m\/[^/]+/);
  if (menu) return `${menu[0]}?project=${nextId}`;
  const sub = pathname.match(/^\/projects\/[^/]+(\/(?:edit|progress|report-settings))?/);
  if (sub) return `/projects/${nextId}${sub[1] ?? ""}`;
  const section = pathname.match(/^\/(daily-reports|issues|documents|reports)/)?.[1];
  if (section) return `/${section}?project=${nextId}`;
  return `/projects/${nextId}`;
}

// เก็บไว้ในเครื่องของผู้ใช้เท่านั้น — ใช้เรียง "เปิดล่าสุด" ในหน้าเลือกโครงการ
export function rememberLastProject(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {}
}

export function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}
