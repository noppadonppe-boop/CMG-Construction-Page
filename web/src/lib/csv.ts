"use client";

// สร้างไฟล์ CSV ในเบราว์เซอร์แล้วดาวน์โหลด — ใส่ BOM นำหน้า ไม่งั้น Excel บน Windows อ่านภาษาไทยเพี้ยน

type Cell = string | number | null | undefined;

export function downloadCsv(fileName: string, header: string[], rows: Cell[][]) {
  const escape = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
