import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // หน้าในแอปเรนเดอร์ในเบราว์เซอร์หลังตรวจการล็อกอิน (ข้อมูล realtime จาก Firestore) จึงไม่เข้าเกณฑ์
    // "instant navigation" ของ server — ตรวจเฉพาะ segment ที่ประกาศ instant เองเท่านั้น
    instantInsights: { validationLevel: "manual-warning" },
  },
  // หน้า Dashboard อยู่ที่ "/" — /dashboard ใช้เป็นทางเข้าเดียวกัน
  async redirects() {
    return [{ source: "/dashboard", destination: "/", permanent: false }];
  },
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
