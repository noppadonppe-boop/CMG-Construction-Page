"use client";

import { useParams, usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { STATIC_PLACEHOLDER } from "./static-placeholder";

const noop = () => () => {};
const isPlaceholderPath = (pathname: string) => pathname.split("/").includes(STATIC_PLACEHOLDER);

/**
 * เหมือน usePathname แต่ถ้าเป็นหน้า placeholder ของ static export จะคืน path จริงในเบราว์เซอร์แทน
 * (ตอน prerender/hydrate ยังคืน path จาก build ก่อน เพื่อให้ HTML ตรงกัน แล้วค่อยอ่าน URL จริง)
 */
export function useActualPathname(): string {
  const pathname = usePathname();
  const location = useSyncExternalStore(noop, () => window.location.pathname, () => null);
  return location && isPlaceholderPath(pathname) ? location : pathname;
}

/**
 * เหมือน useParams แต่อ่าน id จาก URL จริงเมื่อเป็นหน้า placeholder ของ static export
 * pattern = รูปแบบ route เช่น "/m/[menuId]" (ไม่รวม route group อย่าง "(app)")
 */
export function useRouteParams<T extends Record<string, string>>(pattern: string): T {
  const params = useParams<T>();
  const pathname = useActualPathname();
  if (!Object.values(params).includes(STATIC_PLACEHOLDER)) return params;

  const actual = pathname.split("/").filter(Boolean);
  const out: Record<string, string> = { ...params };
  pattern
    .split("/")
    .filter(Boolean)
    .forEach((seg, i) => {
      const key = seg.match(/^\[(\w+)\]$/)?.[1];
      if (key && actual[i]) out[key] = decodeURIComponent(actual[i]);
    });
  return out as T;
}
