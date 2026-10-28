"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { FullPageSpinner, ProtectedRoute } from "@/components/protected-route";
import { AuthCard } from "../login/auth-ui";

export default function PendingPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      {/* ล็อกอินแล้วเข้าได้ทุกสถานะ */}
      <ProtectedRoute requireApproved={false}>
        <Pending />
      </ProtectedRoute>
    </Suspense>
  );
}

function Pending() {
  const { userProfile, logout } = useAuth();
  const router = useRouter();

  // โปรไฟล์อัปเดตแบบ realtime — ผู้ดูแลอนุมัติเมื่อไหร่ก็พาเข้าแอปทันที
  useEffect(() => {
    if (userProfile?.status === "approved") router.replace("/");
    if (userProfile?.status === "rejected") router.replace("/login");
  }, [userProfile, router]);

  if (!userProfile || userProfile.status !== "pending") return <FullPageSpinner label="กำลังพาไปหน้าที่เหมาะสม..." />;

  return (
    <AuthCard title="รอการอนุมัติ" subtitle="บัญชีของคุณถูกสร้างแล้ว และกำลังรอผู้ดูแลระบบอนุมัติ">
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
        <div className="size-3 animate-pulse rounded-full bg-warn" />
        <div className="min-w-0">
          <div className="truncate font-medium">{displayName(userProfile)}</div>
          <div className="truncate text-xs text-muted">{userProfile.email}</div>
        </div>
      </div>
      <p className="text-sm text-muted">หน้านี้จะพาคุณเข้าสู่ระบบอัตโนมัติเมื่อได้รับอนุมัติ ไม่ต้องรีเฟรช</p>
      <button className="btn w-full" onClick={() => logout().then(() => router.replace("/login"))}>
        ออกจากระบบ
      </button>
    </AuthCard>
  );
}
