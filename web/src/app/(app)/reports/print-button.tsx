"use client";

/** เปิดหน้าต่างพิมพ์ของเบราว์เซอร์ — เลือก "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF (ฟอนต์ไทยแสดงถูกต้อง) */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      🖨️ พิมพ์ / PDF
    </button>
  );
}
