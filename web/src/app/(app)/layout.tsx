"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/sidebar";
import { FullPageSpinner, ProtectedRoute } from "@/components/protected-route";
import { ProjectsProvider } from "@/lib/db/projects";

// ทุกหน้าในกลุ่มนี้ต้องล็อกอินและได้รับอนุมัติแล้ว — รายการโครงการที่มองเห็นได้ฟังแบบ realtime ครั้งเดียวทั้งแอป
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ProtectedRoute>
        <ProjectsProvider>
          <AppShell>{children}</AppShell>
        </ProjectsProvider>
      </ProtectedRoute>
    </Suspense>
  );
}
