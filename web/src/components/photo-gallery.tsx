"use client";

import { useRef, useState } from "react";

/* eslint-disable @next/next/no-img-element -- รูปมาจาก signed URL / data URL ที่เปลี่ยนทุก request จึงไม่ผ่าน next/image */

/** แถบรูปย่อ กดเพื่อดูรูปเต็มจอ เลื่อนดูรูปถัดไปได้ */
export function PhotoGallery({ photos, size = "md" }: { photos: string[]; size?: "sm" | "md" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  if (photos.length === 0) return null;

  const open = (i: number) => {
    setIndex(i);
    dialogRef.current?.showModal();
  };
  const step = (d: number) => setIndex((i) => (i + d + photos.length) % photos.length);
  const thumb = size === "sm" ? "size-12" : "size-20";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => open(i)}
            className={`${thumb} cursor-pointer overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-primary`}
            aria-label={`ดูรูปที่ ${i + 1}`}
          >
            <img src={src} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        <div className="relative flex items-center gap-2">
          {photos.length > 1 && (
            <button type="button" onClick={() => step(-1)} className="cursor-pointer px-2 text-3xl text-white" aria-label="รูปก่อนหน้า">
              ‹
            </button>
          )}
          <img src={photos[index]} alt={`รูปที่ ${index + 1}`} className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain" />
          {photos.length > 1 && (
            <button type="button" onClick={() => step(1)} className="cursor-pointer px-2 text-3xl text-white" aria-label="รูปถัดไป">
              ›
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-white">
          <span>
            {index + 1} / {photos.length}
          </span>
          <form method="dialog">
            <button className="cursor-pointer rounded-lg bg-white/15 px-3 py-1">ปิด ✕</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
