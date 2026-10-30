/**
 * Static export (Firebase Hosting / web.app) สร้างหน้าของ route ที่มี id ไว้หน้าเดียวด้วย id นี้
 * แล้ว Hosting ส่งทุก URL ของ route นั้นมาที่หน้าเดียวกัน (ดู rewrites ใน firebase.json)
 * แยกไฟล์จาก static-export.ts ("use client") เพื่อให้ layout ฝั่ง server ใช้ค่าเป็น string ได้
 */
export const STATIC_PLACEHOLDER = "_";
