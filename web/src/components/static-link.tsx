"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ComponentProps } from "react";
import { STATIC_PLACEHOLDER } from "@/lib/static-placeholder";

const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const TO = "__to";

// route ที่มี id — static export สร้างไว้หน้าเดียวที่ "_" (ดู static-placeholder.ts)
const DYNAMIC = [/^\/m\/[^/]+$/, /^\/projects\/[^/]+(\/(edit|progress|report-settings))?$/, /^\/(daily-reports|documents|issues)\/[^/]+\/[^/]+(\/edit)?$/];

/**
 * ลิงก์ไปหน้าที่มี id: บน web.app ไฟล์ของ id จริงไม่มี Next จึงต้องโหลดหน้าใหม่ทั้งหน้า (จอกะพริบ)
 * ลิงก์นี้เปลี่ยนหน้าแบบ client-side ไปที่หน้า "_" ที่ build ไว้ แล้ว StaticUrlRestore ค่อยใส่ URL จริงกลับ
 */
export function StaticLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  return <Link href={toStaticHref(href)} {...props} />;
}

export function toStaticHref(href: string) {
  if (!STATIC) return href;
  const hashIndex = href.indexOf("#");
  const hash = hashIndex < 0 ? "" : href.slice(hashIndex);
  const [path, search = ""] = (hashIndex < 0 ? href : href.slice(0, hashIndex)).split("?");
  if (!DYNAMIC.some((re) => re.test(path)) || path.split("/").includes("new")) return href;
  const params = new URLSearchParams(search);
  params.set(TO, path);
  const segs = path.split("/");
  const idIndexes = ["daily-reports", "documents", "issues"].includes(segs[1]) ? [2, 3] : [2];
  const placeholder = segs.map((seg, i) => (idIndexes.includes(i) ? STATIC_PLACEHOLDER : seg)).join("/");
  return `${placeholder}?${params}${hash}`;
}

/** หลังเปลี่ยนไปหน้า "_" แล้ว แทน URL ในแถบที่อยู่ด้วย URL จริง (Next ซิงก์ replaceState เข้ากับ router) */
export function StaticUrlRestore() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!STATIC) return;
    const params = new URLSearchParams(window.location.search);
    const to = params.get(TO);
    if (!to) return;
    params.delete(TO);
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${to}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }, [pathname, searchParams]);
  return null;
}
