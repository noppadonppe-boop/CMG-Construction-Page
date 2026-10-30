import type { ReactNode } from "react";
import { STATIC_PLACEHOLDER } from "@/lib/static-placeholder";

// Static export (web.app) สร้างหน้านี้ไว้หน้าเดียวที่ "_" — Firebase Hosting ส่งทุก id มาที่หน้านี้ แล้วหน้าอ่าน id จาก URL จริง
export function generateStaticParams() {
  return [{ projectId: STATIC_PLACEHOLDER }];
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
