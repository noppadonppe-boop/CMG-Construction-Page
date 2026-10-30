// บทบาทและสิทธิ์ — ผู้ใช้ 1 คนมีได้หลาย role และได้สิทธิ์รวมของทุก role ที่มี

export const ROLES = ["MasterAdmin", "Admin", "Executive", "ProjectManager", "Engineer", "QS", "Staff"] as const;
export type UserRole = (typeof ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  MasterAdmin: "Master Admin",
  Admin: "ผู้ดูแลระบบ",
  Executive: "ผู้บริหาร",
  ProjectManager: "ผู้จัดการโครงการ",
  Engineer: "วิศวกร / หน้างาน",
  QS: "QS / ประมาณราคา",
  Staff: "พนักงานทั่วไป",
};

export const DEPARTMENTS = [
  "ผู้บริหาร",
  "บริหารโครงการ",
  "วิศวกรรมโยธา / โครงสร้าง",
  "สถาปัตยกรรม",
  "งานระบบ (MEP)",
  "QS / ประมาณราคา",
  "ความปลอดภัย (จป.)",
  "จัดซื้อ",
  "บัญชี / การเงิน",
  "ธุรการ",
] as const;

export type Permission =
  | "project.viewAll" // เห็นทุกโครงการโดยไม่ต้อง assign
  | "project.create"
  | "project.edit"
  | "project.delete"
  | "progress.edit"
  | "daily.view"
  | "daily.create"
  | "issue.view"
  | "issue.create"
  | "issue.update"
  | "document.view"
  | "document.upload"
  | "document.approve"
  | "document.delete"
  | "report.view"
  | "report.export"
  | "form.manage" // จัดการคลังมาตรฐานแบบฟอร์มกลาง (เพิ่ม/แก้/ลบ/อัปโหลด)
  | "menu.manage" // สร้าง/แก้เมนูเพิ่มเติมและ Card ใน sidebar — เฉพาะ MasterAdmin
  | "user.manage";

const VIEW: Permission[] = ["daily.view", "issue.view", "document.view"];

const ROLE_PERMISSIONS: Record<UserRole, Permission[] | "all"> = {
  MasterAdmin: "all",
  Admin: [
    "project.viewAll", "project.create", "project.edit", "project.delete", "progress.edit",
    ...VIEW, "daily.create", "issue.create", "issue.update",
    "document.upload", "document.approve", "document.delete", "report.view", "report.export", "form.manage",
  ],
  Executive: [...VIEW, "report.view", "report.export"],
  ProjectManager: [
    "project.edit", "progress.edit", ...VIEW, "daily.create", "issue.create", "issue.update",
    "document.upload", "document.approve", "report.view", "report.export",
  ],
  Engineer: [...VIEW, "daily.create", "issue.create", "issue.update", "document.upload", "report.view"],
  QS: [...VIEW, "document.upload", "report.view", "report.export"],
  Staff: [...VIEW],
};

const ALL_PERMISSIONS = new Set<Permission>(
  Object.values(ROLE_PERMISSIONS).flatMap((p) => (p === "all" ? [] : p)).concat("user.manage", "menu.manage"),
);

/** สิทธิ์รวมของทุก role */
export function permissionsOf(roles: readonly UserRole[]): Set<Permission> {
  if (roles.includes("MasterAdmin")) return new Set(ALL_PERMISSIONS);
  return new Set(roles.flatMap((r) => (ROLE_PERMISSIONS[r] === "all" ? [] : (ROLE_PERMISSIONS[r] as Permission[]))));
}

/** เก็บเฉพาะ role ที่รู้จัก ไม่ซ้ำ เรียงตามลำดับใน ROLES */
export function normalizeRoles(value: unknown): UserRole[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return ROLES.filter((r) => list.includes(r));
}
