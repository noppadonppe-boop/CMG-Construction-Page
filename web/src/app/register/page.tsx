"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/context";
import { authErrorMessage, registerWithEmail } from "@/lib/auth/service";
import { FullPageSpinner } from "@/components/protected-route";
import { AuthCard } from "../login/auth-ui";

export default function RegisterPage() {
  const { firebaseUser, userProfile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (userProfile?.status === "pending") router.replace("/pending");
    else if (userProfile?.status === "approved") router.replace("/");
    else if (userProfile?.status === "rejected") router.replace("/login");
  }, [userProfile, router]);

  if (loading) return <FullPageSpinner />;
  if (firebaseUser) return <FullPageSpinner label="กำลังเข้าสู่ระบบ..." />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (k: string) => String(form.get(k) ?? "").trim();
    if (value("password") !== String(form.get("confirm"))) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setError(undefined);
    setBusy(true);
    try {
      await registerWithEmail(value("email"), String(form.get("password")), value("firstName"), value("lastName"), value("position"));
      await refreshProfile();
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="สมัครเข้าใช้งาน" subtitle="หลังสมัคร ผู้ดูแลระบบจะตรวจสอบและอนุมัติการเข้าใช้งาน">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="firstName">ชื่อ</label>
            <input id="firstName" name="firstName" required autoComplete="given-name" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="lastName">นามสกุล</label>
            <input id="lastName" name="lastName" required autoComplete="family-name" className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="position">ตำแหน่ง</label>
          <input id="position" name="position" required className="input" placeholder="เช่น วิศวกรสนาม" />
        </div>
        <div>
          <label className="label" htmlFor="email">อีเมล (ใช้เป็นชื่อผู้ใช้)</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="password">รหัสผ่าน</label>
            <input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="confirm">ยืนยันรหัสผ่าน</label>
            <input id="confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password" className="input" />
          </div>
        </div>
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "กำลังสมัคร..." : "สมัครเข้าใช้งาน"}
        </button>
      </form>
      <p className="text-center text-sm text-muted">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="font-medium text-primary">เข้าสู่ระบบ</Link>
      </p>
    </AuthCard>
  );
}
