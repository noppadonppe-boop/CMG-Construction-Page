"use client";

import { useState } from "react";

/** รูปโปรไฟล์ (จาก Google) — ถ้าไม่มีรูปหรือโหลดไม่ได้ แสดงอักษรย่อแทน */
export function Avatar({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Google (lh3.googleusercontent.com)
      <img
        src={src}
        alt=""
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="flex-none rounded-full object-cover"
      />
    );
  }
  return (
    <span style={style} className="grid flex-none place-items-center rounded-full bg-primary-soft font-semibold text-primary">
      {name.trim().slice(0, 2) || "?"}
    </span>
  );
}
