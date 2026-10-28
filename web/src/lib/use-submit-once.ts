"use client";

import { useRef, useTransition } from "react";

/**
 * กันกดบันทึกซ้ำ: ดับเบิลคลิกเร็ว ๆ ก่อนปุ่มถูก disable จะไม่ส่งข้อมูลรอบสอง
 * (useTransition อย่างเดียวไม่พอ เพราะ pending เปลี่ยนหลัง render รอบถัดไป)
 */
export function useSubmitOnce() {
  const [pending, startTransition] = useTransition();
  const running = useRef(false);

  function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    startTransition(async () => {
      try {
        await task();
      } finally {
        running.current = false;
      }
    });
  }

  return [pending, run] as const;
}
