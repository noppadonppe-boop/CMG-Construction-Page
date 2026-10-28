"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useRef, useState, type ReactNode } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { ROLE_LABEL, type Permission } from "@/lib/auth/roles";
import { usePendingUserCount } from "@/lib/db/users";
import { useMenus } from "@/lib/db/menus";
import { Avatar } from "./avatar";
import { MenuDialog } from "./menu-dialog";
import { ProfileMenu } from "./profile-menu";

const icons = {
  dash: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  project: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1",
  daily: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  issues: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  docs: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  plus: "M12 5v14M5 12h14",
  forms: "M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8M8 16h5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};

/** เมนูแสดงเฉพาะเมื่อมีสิทธิ์ (สิทธิ์รวมจากทุก role ของผู้ใช้) */
type NavItem = { href: string; label: string; icon: keyof typeof icons; permission?: Permission };

const sections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "ภาพรวม", icon: "dash" },
      { href: "/projects", label: "โครงการ", icon: "project" },
      { href: "/form-standards", label: "มาตรฐานแบบฟอร์ม", icon: "forms" },
    ],
  },
  {
    title: "หน้างาน",
    items: [
      { href: "/daily-reports", label: "รายงานประจำวัน", icon: "daily", permission: "daily.view" },
      { href: "/issues", label: "ปัญหา / ความปลอดภัย", icon: "issues", permission: "issue.view" },
    ],
  },
  {
    title: "ข้อมูล",
    items: [
      { href: "/documents", label: "เอกสาร / แบบ", icon: "docs", permission: "document.view" },
      { href: "/reports", label: "รายงาน", icon: "reports", permission: "report.view" },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d={d} />
    </svg>
  );
}

function ActiveNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return <Nav isActive={(href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"))} onNavigate={onNavigate} />;
}

function navClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/5 ${active ? "bg-primary/20 text-white" : ""}`;
}

function Nav({ isActive, onNavigate }: { isActive: (href: string) => boolean; onNavigate: () => void }) {
  const { can } = useAuth();
  const pending = usePendingUserCount(can("user.manage"));
  const { menus } = useMenus();
  const router = useRouter();
  const addMenuRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div className="flex flex-col gap-1">
        {sections.map((s, i) => {
          const items = s.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={i} className="flex flex-col gap-1">
              {s.title && <div className="px-2.5 pt-3.5 pb-1 text-[11px] tracking-wider uppercase opacity-55">{s.title}</div>}
              {items.map((item) => (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={navClass(isActive(item.href))}>
                  <Icon d={icons[item.icon]} />
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
        {/* เมนูที่ผู้ดูแลสร้างเอง — ภายในเป็น Card ลิงก์ */}
        {menus.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="px-2.5 pt-3.5 pb-1 text-[11px] tracking-wider uppercase opacity-55">เมนูเพิ่มเติม</div>
            {menus.map((m) => (
              <Link key={m.id} href={`/m/${m.id}`} onClick={onNavigate} className={navClass(isActive(`/m/${m.id}`))}>
                <span className="grid size-[18px] flex-none place-items-center text-[15px] leading-none">
                  {m.emoji || <i className="size-2.5 rounded-full" style={{ background: m.color }} />}
                </span>
                <span className="truncate">{m.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* มุมซ้ายล่าง: เพิ่มเมนู + จัดการผู้ใช้ — เห็นเฉพาะผู้มีสิทธิ์ */}
      {(can("menu.manage") || can("user.manage")) && (
        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
          {can("menu.manage") && (
            <>
              <button type="button" onClick={() => addMenuRef.current?.showModal()} className={`${navClass(false)} text-left`}>
                <Icon d={icons.plus} />
                เพิ่มเมนู
              </button>
              <MenuDialog
                dialogRef={addMenuRef}
                nextOrder={(menus.at(-1)?.order ?? -1) + 1}
                onSaved={(id) => {
                  onNavigate();
                  router.push(`/m/${id}`);
                }}
              />
            </>
          )}
          {can("user.manage") && (
            <Link href="/admin" onClick={onNavigate} className={navClass(isActive("/admin"))}>
              <Icon d={icons.users} />
              จัดการผู้ใช้งาน
              {pending > 0 && (
                <span className="ml-auto rounded-full bg-bad px-2 text-[11px] font-semibold text-white" aria-label={`รออนุมัติ ${pending} คน`}>
                  {pending}
                </span>
              )}
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** การ์ดโปรไฟล์บนสุดของ sidebar: รูป ชื่อ และสิทธิ์ */
function ProfileCard() {
  const { userProfile } = useAuth();
  if (!userProfile) return null;
  const name = displayName(userProfile);
  return (
    <div className="mb-3 rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-2.5">
        <Avatar src={userProfile.photoURL} name={name} size={40} />
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{name}</div>
          <div className="truncate text-xs opacity-70">{userProfile.position || userProfile.email}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {userProfile.role.map((r) => (
          <span key={r} className={`rounded px-1.5 py-0.5 text-[10px] ${r === "MasterAdmin" ? "bg-warn/30 text-white" : "bg-white/10"}`}>
            {ROLE_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr] print:block">
      {open && <div className="fixed inset-0 z-10 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-20 flex w-60 print:hidden flex-col gap-1 overflow-y-auto bg-side px-3 py-5 text-side-text transition-transform md:sticky md:top-0 md:h-screen md:w-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-4 text-base font-bold text-white">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[#1f5eff] to-[#00b3a4] text-xs">CMG</div>
          Project Hub
        </div>
        <ProfileCard />
        {/* เมนูที่ไฮไลต์ตาม URL ต้องอ่าน URL ตอน runtime จึงอยู่หลัง Suspense; fallback คือเมนูเดียวกันแบบไม่ไฮไลต์ */}
        <Suspense fallback={<Nav isActive={() => false} onNavigate={() => setOpen(false)} />}>
          <ActiveNav onNavigate={() => setOpen(false)} />
        </Suspense>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-[5] flex print:hidden items-center gap-3 border-b border-border bg-surface px-4 py-2.5 md:px-7 md:py-3.5">
          <button className="grid size-9 place-items-center rounded-lg text-muted md:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="flex-1" />
          <ProfileMenu />
        </header>
        <main className="mx-auto max-w-[1280px] px-4 pt-4 pb-12 md:px-7 md:pt-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
