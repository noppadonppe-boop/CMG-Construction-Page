"use client";

import { useEffect } from "react";
import { EmptyState, PageHeader } from "@/components/ui";

/** ไม่มีเมนูในแถบข้าง — เปิดผ่าน URL /material-request (หรือผูกกับ Card) แล้วส่งต่อไประบบ Material Request ภายนอก */
const TARGET = process.env.NEXT_PUBLIC_MATERIAL_REQUEST_URL;

export default function MaterialRequestPage() {
  useEffect(() => {
    if (!TARGET) return;
    // ส่ง query string (เช่น ?project=...) ต่อไปด้วย
    const url = new URL(TARGET);
    new URLSearchParams(window.location.search).forEach((v, k) => url.searchParams.set(k, v));
    window.location.replace(url.toString());
  }, []);

  return (
    <>
      <PageHeader title="Material Request" subtitle="ขอวัสดุ" />
      <EmptyState>{TARGET ? "กำลังเปิดระบบ Material Request..." : "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_MATERIAL_REQUEST_URL"}</EmptyState>
    </>
  );
}
