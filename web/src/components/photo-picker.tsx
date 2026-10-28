"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PHOTO_BYTES, MAX_PHOTO_DIMENSION, MAX_PHOTOS } from "@/lib/photos";

export type PickedPhoto = { id: string; file: File; preview: string };

/** ย่อรูปเป็น JPEG ด้านยาวไม่เกิน MAX_PHOTO_DIMENSION (หมุนตาม EXIF ให้ด้วย) */
export async function compress(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new Error("compress failed");
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function PhotoPicker({
  photos,
  onChange,
  onBusyChange,
}: {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // คืนหน่วยความจำของ preview เมื่อออกจากหน้า
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);
    const room = MAX_PHOTOS - photos.length;
    const selected = Array.from(files).slice(0, room);
    if (files.length > room) setError(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูป`);

    setBusy(true);
    onBusyChange(true);
    const added: PickedPhoto[] = [];
    for (const original of selected) {
      try {
        const file = await compress(original);
        added.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
      } catch {
        setError(`เปิดไฟล์ "${original.name}" ไม่ได้ — รองรับเฉพาะรูป JPG / PNG / WebP`);
      }
    }
    const tooBig = added.filter((p) => p.file.size > MAX_PHOTO_BYTES);
    if (tooBig.length) setError("รูปบางรูปมีขนาดใหญ่เกินไป");
    onChange([...photos, ...added.filter((p) => p.file.size <= MAX_PHOTO_BYTES)]);
    setBusy(false);
    onBusyChange(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(id: string) {
    const photo = photos.find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview ใช้ next/image ไม่ได้ */}
            <img src={p.preview} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-full bg-black/60 text-xs text-white"
              aria-label="ลบรูป"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-surface-2 text-center text-xs text-muted hover:border-primary hover:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
            {busy ? (
              "กำลังย่อรูป..."
            ) : (
              <span>
                <span className="block text-xl leading-none">📷</span>
                เพิ่มรูป
              </span>
            )}
            {/* ไม่ใส่ name: ไฟล์จริงที่ส่งคือรูปที่ย่อแล้ว (แนบใน action ของฟอร์ม) */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        )}
      </div>
      <p className={`mt-1 text-xs ${error ? "text-bad" : "text-muted"}`}>
        {error ?? `${photos.length}/${MAX_PHOTOS} รูป · ย่อขนาดอัตโนมัติก่อนส่ง`}
      </p>
    </div>
  );
}
