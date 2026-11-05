"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/sidebar";
import { FullPageSpinner, ProtectedRoute } from "@/components/protected-route";
import { StaticUrlRestore } from "@/components/static-link";
import { ProjectsProvider } from "@/lib/db/projects";
import { MenusProvider } from "@/lib/db/menus";

// ทุกหน้าในกลุ่มนี้ต้องล็อกอินและได้รับอนุมัติแล้ว — รายการโครงการที่มองเห็นได้ฟังแบบ realtime ครั้งเดียวทั้งแอป
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ProtectedRoute>
        <ProjectsProvider>
          <MenusProvider>
            <StaticUrlRestore />
            <AppShell>{children}</AppShell>
          </MenusProvider>
        </ProjectsProvider>
      </ProtectedRoute>
    </Suspense>
  );
}
