"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import type { UserRole } from "@/lib/auth/roles";

export function FullPageSpinner({ label = "กำลังตรวจสอบการเข้าสู่ระบบ..." }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="size-10 animate-spin rounded-full border-4 border-border border-t-primary" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

type Decision = "spinner" | "ok" | { redirect: string };

/**
 * ตัดสินใจตามลำดับ:
 * 1) loading → spinner  2) ไม่มี firebaseUser → /login  3) มี user แต่ยังไม่มีโปรไฟล์ → spinner
 * 4) pending → /pending  5) rejected → /login  6) role ไม่อยู่ในรายการ → /
 */
function decide(
  state: ReturnType<typeof useAuth>,
  requireApproved: boolean,
  requireRoles: readonly UserRole[] | undefined,
  next: string,
): Decision {
  if (state.loading) return "spinner";
  if (!state.firebaseUser) return { redirect: `/login?next=${encodeURIComponent(next)}` };
  if (!state.userProfile) return "spinner";
  if (requireApproved && state.userProfile.status === "pending") return { redirect: "/pending" };
  if (requireApproved && state.userProfile.status === "rejected") return { redirect: "/login" };
  if (requireRoles?.length && !state.userProfile.role.some((r) => requireRoles.includes(r))) return { redirect: "/" };
  return "ok";
}

export function ProtectedRoute({
  children,
  requireApproved = true,
  requireRoles,
}: {
  children: ReactNode;
  requireApproved?: boolean;
  requireRoles?: readonly UserRole[];
}) {
  const state = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const next = pathname + (search.size ? `?${search}` : "");
  const decision = decide(state, requireApproved, requireRoles, next);
  const target = typeof decision === "object" ? decision.redirect : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  // มี token แต่ไม่พบโปรไฟล์นานเกินไป (เช่นสร้างโปรไฟล์ไม่สำเร็จ) — ไม่ปล่อยให้หมุนค้างตลอดไป
  const waitingProfile = !state.loading && !!state.firebaseUser && !state.userProfile;
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!waitingProfile) return;
    const timer = setTimeout(() => setStuck(true), 8000);
    return () => {
      clearTimeout(timer);
      setStuck(false);
    };
  }, [waitingProfile]);

  if (decision === "ok") return <>{children}</>;
  if (waitingProfile && stuck) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-sm space-y-3 text-center">
          <p>ไม่พบข้อมูลผู้ใช้ของบัญชี {state.firebaseUser?.email}</p>
          <button className="btn btn-primary" onClick={() => state.logout().then(() => router.replace("/login"))}>
            ออกจากระบบแล้วลองใหม่
          </button>
        </div>
      </div>
    );
  }
  return <FullPageSpinner label={target ? "กำลังพาไปหน้าที่เหมาะสม..." : undefined} />;
}
