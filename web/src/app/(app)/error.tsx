"use client";

import { useEffect } from "react";

// แสดงแทนหน้าขาวเมื่อโหลดข้อมูลไม่สำเร็จ (เช่น ยังไม่ได้สร้าง Firestore Database หรือ Rules ไม่อนุญาต)
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);

  return (
    <div className="card mx-auto mt-8 max-w-xl space-y-3 text-center">
      <div className="text-3xl">⚠️</div>
      <h1 className="text-lg font-bold">โหลดข้อมูลไม่สำเร็จ</h1>
      {/* production ซ่อนข้อความ error จาก server ไว้ จึงแสดงเฉพาะตอน dev */}
      {process.env.NODE_ENV !== "production" && error.message && (
        <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{error.message}</p>
      )}
      <p className="text-muted">
        ตรวจว่าใน Firebase Console ได้สร้าง Firestore Database และเปิดใช้ Storage แล้ว และ Rules อนุญาตให้อ่าน/เขียนข้อมูลได้
      </p>
      <button className="btn btn-primary" onClick={reset}>
        ลองใหม่
      </button>
    </div>
  );
}
