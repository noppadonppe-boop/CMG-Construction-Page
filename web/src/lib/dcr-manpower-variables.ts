import type { HeadcountRow } from "./dcr";

/** Bind to a role name, not its position, so reordering rows does not change a template. */
export function manpowerVariables(group: "indirect" | "direct", rows: HeadcountRow[]) {
  const seen = new Map<string, number>();
  return rows.flatMap((row) => {
    const name = row.label.trim().normalize("NFKC");
    if (!name) return [];
    const identity = name.toLocaleLowerCase();
    const occurrence = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, occurrence);
    const nameLabel = name.replace(/\s+/g, "_");
    const suffix = occurrence > 1 ? `_${occurrence}` : "";
    const groupLabel = group === "indirect" ? "Indirect" : "Direct";
    const key = `C.manpower.${group}.${encodeURIComponent(identity)}.${occurrence}`;
    return ([
      ["Total", row.total, "จำนวนทั้งหมด"],
      ["Work", row.present, "มาทำงาน"],
      ["Leave", Math.max(0, row.total - row.present), "ขาด/ลา"],
    ] as const).map(([field, value, description]) => ({
      key: `${key}.${field}`,
      label: `C_${nameLabel}${suffix}_${field} · ${groupLabel} · ${description}`,
      value: String(value),
    }));
  });
}
