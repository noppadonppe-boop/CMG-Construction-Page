"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import type { Permission } from "@/lib/auth/roles";
import { EmptyState } from "./ui";

/** แสดงเนื้อหาเฉพาะเมื่อผู้ใช้มีสิทธิ์ (จาก role ใดก็ได้ที่มี) */
export function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <EmptyState>คุณไม่มีสิทธิ์ใช้งานส่วนนี้ — ติดต่อ Master Admin เพื่อขอสิทธิ์</EmptyState>;
  return <>{children}</>;
}

/** ข้อความเมื่อผู้ใช้ยังไม่ได้รับ assign โครงการใดเลย */
export function NoProjects() {
  const { can } = useAuth();
  return (
    <EmptyState>
      {can("project.create")
        ? "ยังไม่มีโครงการ — สร้างโครงการแรกได้ที่เมนูโครงการ"
        : "คุณยังไม่ได้รับมอบหมายโครงการ — ติดต่อ Master Admin เพื่อ assign โครงการ"}
    </EmptyState>
  );
}
