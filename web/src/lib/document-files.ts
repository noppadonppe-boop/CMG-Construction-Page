// กติกาไฟล์เอกสาร

/** ไฟล์แบบ PDF ขนาดใหญ่อัปโหลดตรงจากเบราว์เซอร์เข้า Storage จึงรับได้ใหญ่กว่ารูปหน้างาน */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/** ตัดอักขระที่ใช้ใน path ไม่ได้ เหลือชื่อไฟล์ที่อ่านออก (รองรับภาษาไทย) */
export function safeFileName(name: string) {
  return name.replace(/[\/#?%*:|"<>\u0000-\u001f]/g, "_").slice(-120) || "file";
}
