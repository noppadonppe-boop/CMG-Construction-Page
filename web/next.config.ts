import type { NextConfig } from "next";

// STATIC_EXPORT=1 → build เป็นไฟล์ static ใน out/ สำหรับ Firebase Hosting (web.app) — ดู npm run build:static
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.108"],
  env: { NEXT_PUBLIC_STATIC_EXPORT: staticExport ? "1" : "" },
  // static export ใช้ Partial Prerendering ไม่ได้ — ปิด cacheComponents / partialPrefetching เฉพาะตอน export
  ...(staticExport ? { output: "export" } : { cacheComponents: true, partialPrefetching: true }),
  experimental: {
    // หน้าในแอปเรนเดอร์ในเบราว์เซอร์หลังตรวจการล็อกอิน (ข้อมูล realtime จาก Firestore) จึงไม่เข้าเกณฑ์
    // "instant navigation" ของ server — ตรวจเฉพาะ segment ที่ประกาศ instant เองเท่านั้น
    instantInsights: { validationLevel: "manual-warning" },
  },
  // หน้า Dashboard อยู่ที่ "/" — /dashboard ใช้เป็นทางเข้าเดียวกัน (static export ทำ redirect นี้ที่ firebase.json แทน)
  ...(!staticExport && {
    async rewrites() {
      const apiOrigin = (process.env.MAIL_API_URL || process.env.NEXT_PUBLIC_MAIL_API_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
      return ["/api/material-document-preview", "/api/material-attachment"].map((source) => ({ source, destination: `${apiOrigin}${source}` }));
    },
    async redirects() {
      return [{ source: "/dashboard", destination: "/", permanent: false }];
    },
  }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
