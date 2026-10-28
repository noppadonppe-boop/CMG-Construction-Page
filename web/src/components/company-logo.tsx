/* eslint-disable @next/next/no-img-element -- โลโก้จาก Firebase Storage URL */
import type { Company } from "@/lib/dcr";

/** โลโก้บริษัท — ไม่มีโลโก้แสดงอักษรย่อในกรอบ */
export function CompanyLogo({ company, size = 44 }: { company: Pick<Company, "name" | "logo">; size?: number }) {
  const style = { width: size, height: size };
  if (company.logo?.url) {
    return <img src={company.logo.url} alt={company.name} style={style} className="flex-none rounded object-contain" />;
  }
  return (
    <span
      style={{ ...style, fontSize: Math.max(10, size * 0.28) }}
      className="grid flex-none place-items-center rounded border border-dashed border-border text-center font-semibold text-muted"
      aria-label={`ยังไม่มีโลโก้ ${company.name}`}
    >
      {company.name.trim().slice(0, 3) || "LOGO"}
    </span>
  );
}
