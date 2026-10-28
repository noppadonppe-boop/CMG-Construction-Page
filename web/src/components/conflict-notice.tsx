"use client";

/**
 * ใช้ในฟอร์มแก้ไข: ข้อมูลอัปเดตแบบ realtime แต่ "ไม่ล้าง" สิ่งที่ผู้ใช้กำลังพิมพ์
 * - remoteChange: มีคนอื่นบันทึกหลังเราเปิดฟอร์ม → แจ้งเตือน พร้อมปุ่มโหลดข้อมูลล่าสุด (ทิ้งที่พิมพ์ไว้)
 * - conflict: กดบันทึกแล้วชนกับการแก้ไขของคนอื่น → ให้เลือกบันทึกทับเอง ไม่ทับเงียบ ๆ
 */
export function ConflictNotice({
  remoteChange,
  conflictMessage,
  onReload,
  onForceSave,
  busy,
}: {
  remoteChange: { by: string | null } | null;
  conflictMessage: string | null;
  onReload: () => void;
  onForceSave: () => void;
  busy: boolean;
}) {
  if (!remoteChange && !conflictMessage) return null;
  return (
    <div className="space-y-2 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
      <p>
        {conflictMessage ?? `ข้อมูลนี้เพิ่งถูกแก้ไขโดย ${remoteChange?.by ?? "ผู้ใช้อื่น"}`} — ข้อความที่คุณกรอกไว้ยังอยู่ครบ
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn px-2.5 py-1 text-xs" onClick={onReload} disabled={busy}>
          ใช้ข้อมูลล่าสุด (ทิ้งที่กรอก)
        </button>
        {conflictMessage && (
          <button type="button" className="btn border-warn px-2.5 py-1 text-xs text-warn" onClick={onForceSave} disabled={busy}>
            บันทึกทับด้วยข้อมูลของฉัน
          </button>
        )}
      </div>
    </div>
  );
}
