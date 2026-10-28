"use client";

import { useState } from "react";
import { MAX_DOCUMENT_BYTES } from "@/lib/document-files";
import { formatFileSize } from "@/lib/format";

const maxBytes = MAX_DOCUMENT_BYTES;

/** ไฟล์ที่เลือก + ความคืบหน้าการอัปโหลด (อัปโหลดตรงจากเบราว์เซอร์เข้า Storage) */
export function useDocumentFile() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  /** ตรวจไฟล์ก่อนอัปโหลด — คืนข้อความผิดพลาด หรือ undefined ถ้าผ่าน */
  function check(): string | undefined {
    if (!file) return "กรุณาเลือกไฟล์";
    if (file.size > maxBytes) return `ไฟล์ใหญ่เกิน ${formatFileSize(maxBytes)}`;
  }

  return { file, setFile, progress, setProgress, check };
}

export function FilePicker({
  file,
  onFile,
  progress,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  progress: number | null;
}) {
  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-6 text-center hover:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
        <span className="text-2xl">📄</span>
        {file ? (
          <>
            <span className="font-medium break-all">{file.name}</span>
            <span className="text-xs text-muted">{formatFileSize(file.size)} · กดเพื่อเปลี่ยนไฟล์</span>
          </>
        ) : (
          <>
            <span className="font-medium">เลือกไฟล์</span>
            <span className="text-xs text-muted">PDF, DWG, Excel, Word, รูปภาพ · ไม่เกิน {formatFileSize(maxBytes)}</span>
          </>
        )}
        <input type="file" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      {file && file.size > maxBytes && <p className="mt-1 text-xs text-bad">ไฟล์ใหญ่เกิน {formatFileSize(maxBytes)}</p>}
      {progress !== null && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">กำลังอัปโหลด {Math.round(progress * 100)}%</p>
        </div>
      )}
    </div>
  );
}
