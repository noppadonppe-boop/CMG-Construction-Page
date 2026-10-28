"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { authErrorMessage, loginWithEmail, loginWithGoogle } from "@/lib/auth/service";
import { FullPageSpinner } from "@/components/protected-route";
import { AuthCard, GoogleButton } from "./auth-ui";

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Login />
    </Suspense>
  );
}

/** ปลายทางหลังล็อกอิน — รับเฉพาะ path ภายในแอป (กัน open redirect) */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/";
}

function Login() {
  const { firebaseUser, userProfile, loading, refreshProfile, logout } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"email" | "google" | null>(null);

  // พาไปหน้าที่เหมาะสมตามสถานะ เมื่อมีโปรไฟล์แล้ว (ทั้งกรณีเพิ่งล็อกอิน และกรณีเปิดเว็บมาแล้วมี token อยู่แล้ว)
  useEffect(() => {
    if (!userProfile) return;
    if (userProfile.status === "pending") router.replace("/pending");
    else if (userProfile.status === "approved") router.replace(next);
  }, [userProfile, next, router]);

  const rejected = userProfile?.status === "rejected";

  // ระหว่างเช็ค token ห้ามแสดงฟอร์ม Login (กันหน้ากระพริบก่อน redirect)
  if (loading) return <FullPageSpinner />;
  // มี token และกำลังจะ redirect → แสดง spinner ต่อ ไม่โชว์ฟอร์ม
  if (firebaseUser && !rejected) return <FullPageSpinner label="กำลังเข้าสู่ระบบ..." />;

  async function run(kind: "email" | "google", action: () => Promise<unknown>) {
    setError(undefined);
    setBusy(kind);
    try {
      await action();
      // ผู้ใช้ใหม่: onAuthStateChanged อาจทำงานก่อนสร้างโปรไฟล์เสร็จ → อ่านโปรไฟล์ใหม่ให้ context อัปเดตแน่นอน
      await refreshProfile();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run("email", () => loginWithEmail(String(form.get("email")), String(form.get("password"))));
  }

  return (
    <AuthCard title="เข้าสู่ระบบ" subtitle="จัดการโครงการ รายงาน และเอกสารในที่เดียว">
      {rejected && (
        <div className="space-y-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          <p>บัญชี {userProfile?.email} ไม่ได้รับอนุมัติให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ</p>
          <button type="button" className="underline" onClick={() => logout()}>
            ใช้บัญชีอื่น
          </button>
        </div>
      )}

      <GoogleButton busy={busy === "google"} disabled={!!busy} onClick={() => run("google", loginWithGoogle)} />

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        หรือใช้อีเมล
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">รหัสผ่าน</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={!!busy}>
          {busy === "email" ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="font-medium text-primary">
          สมัครเข้าใช้งาน
        </Link>
      </p>
    </AuthCard>
  );
}
