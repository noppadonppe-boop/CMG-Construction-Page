// แปลง error ของ Firebase เป็นข้อความภาษาไทยที่บอกว่าต้องแก้ตรงไหน

export function firebaseErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const message = (e as Error)?.message ?? "";
  if (/database \S+ does not exist/i.test(message)) {
    return "ยังไม่ได้สร้าง Firestore Database — เข้า Firebase Console > Firestore Database > Create database";
  }
  if (code === "permission-denied") return "Firestore Rules ไม่อนุญาตให้อ่าน/เขียนข้อมูล";
  if (code === "storage/unauthorized") return "Storage Rules ไม่อนุญาตให้อัปโหลดไฟล์";
  if (
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    (code.startsWith("storage/") && /404/.test(message))
  ) {
    return "ยังไม่ได้เปิดใช้ Firebase Storage — เข้า Firebase Console > Storage > Get started";
  }
  if (code === "unavailable") return "เชื่อมต่อ Firebase ไม่ได้ ตรวจสอบอินเทอร์เน็ต";
  return message || "เกิดข้อผิดพลาดกับ Firebase";
}

/** อ่านข้อมูล: ถ้าพังให้ throw ข้อความที่อ่านเข้าใจ (หน้า error.tsx จะแสดง) */
export async function read<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new Error(firebaseErrorMessage(e));
  }
}
