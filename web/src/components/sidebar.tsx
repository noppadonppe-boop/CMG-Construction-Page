"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActualPathname } from "@/lib/static-export";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { ROLE_LABEL, type Permission } from "@/lib/auth/roles";
import { usePendingUserCount } from "@/lib/db/users";
import { menuVisibleIn, useMenus } from "@/lib/db/menus";
import { useProjects } from "@/lib/db/projects";
import { rememberLastProject, switchProjectHref, useCurrentProjectId } from "@/lib/project-context";
import { Avatar } from "./avatar";
import { SideMenuIcon } from "./side-menu-icon";
import { ProfileMenu } from "./profile-menu";

const icons = {
  dash: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  project: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1",
  daily: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  issues: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  docs: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  progress: "M3 17l6-6 4 4 8-8M14 7h7v7",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  back: "M19 12H5M12 19l-7-7 7-7",
  cards: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  forms: "M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8M8 16h5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};

/** เมนูแสดงเฉพาะเมื่อมีสิทธิ์ (สิทธิ์รวมจากทุก role ของผู้ใช้) — match = เงื่อนไขไฮไลต์ ถ้าไม่ระบุใช้ href */
type NavItem = { href: string; label: string; icon: keyof typeof icons; permission?: Permission; match?: (pathname: string) => boolean };
type NavSection = { title?: string; items: NavItem[] };

const under = (prefix: string) => (pathname: string) => pathname === prefix || pathname.startsWith(prefix + "/");

// นอกโครงการ: หน้าเลือกโครงการ + ภาพรวม/รายงานรวมสำหรับผู้บริหาร
const globalSections: NavSection[] = [
  {
    items: [
      { href: "/", label: "โครงการทั้งหมด", icon: "project", match: (p) => p === "/" },
      { href: "/overview", label: "ภาพรวมผู้บริหาร", icon: "dash", permission: "report.view" },
      { href: "/reports", label: "รายงานรวม", icon: "reports", permission: "report.view" },
    ],
  },
  {
    title: "ทั่วไป",
    items: [
      { href: "/projects", label: "จัดการโครงการ", icon: "settings", permission: "project.edit", match: (p) => p === "/projects" || p === "/projects/new" },
      { href: "/form-standards", label: "มาตรฐานแบบฟอร์ม", icon: "forms" },
    ],
  },
];

// ในโครงการ: ทุกเมนูแสดงเฉพาะข้อมูลของโครงการนี้
function projectSections(id: string): NavSection[] {
  const q = `?project=${id}`;
  return [
    {
      items: [
        { href: `/projects/${id}`, label: "ภาพรวมโครงการ", icon: "dash", match: (p) => p === `/projects/${id}` },
        { href: `/daily-reports${q}`, label: "รายงานประจำวัน", icon: "daily", permission: "daily.view", match: under("/daily-reports") },
        { href: `/issues${q}`, label: "ปัญหา / ความปลอดภัย", icon: "issues", permission: "issue.view", match: under("/issues") },
        { href: `/documents${q}`, label: "เอกสาร / แบบ", icon: "docs", permission: "document.view", match: under("/documents") },
        { href: `/projects/${id}/progress`, label: "ความคืบหน้า", icon: "progress", permission: "progress.edit" },
        { href: `/reports${q}`, label: "รายงานสัปดาห์", icon: "reports", permission: "report.view", match: under("/reports") },
        {
          href: `/projects/${id}/report-settings`,
          label: "ตั้งค่าโครงการ",
          icon: "settings",
          permission: "project.edit",
          match: (p) => under(`/projects/${id}/edit`)(p) || under(`/projects/${id}/report-settings`)(p),
        },
      ],
    },
    { title: "ทั่วไป", items: [{ href: "/form-standards", label: "มาตรฐานแบบฟอร์ม", icon: "forms" }] },
  ];
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d={d} />
    </svg>
  );
}

function ActiveNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = useActualPathname();
  const projectId = useCurrentProjectId();
  return <Nav pathname={pathname} projectId={projectId} onNavigate={onNavigate} />;
}

function navClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/5 ${active ? "bg-primary/20 text-white" : ""}`;
}

/** ลิงก์กลับหน้ารวม — ผู้ที่มีโครงการเดียวต้องส่ง ?all ไม่งั้นหน้าแรกจะพากลับเข้าโครงการทันที */
function useAllProjectsHref() {
  const { projects } = useProjects();
  return projects.length === 1 ? "/?all" : "/";
}

function Nav({ pathname, projectId, onNavigate }: { pathname: string | null; projectId: string | null; onNavigate: () => void }) {
  const { can } = useAuth();
  const pending = usePendingUserCount(can("user.manage"));
  const { menus } = useMenus();
  const { byId } = useProjects();
  const allHref = useAllProjectsHref();
  const project = projectId ? byId.get(projectId) : undefined;
  const sections = project ? projectSections(project.id) : globalSections;
  // เมนูเพิ่มเติม: นอกโครงการเห็นเฉพาะเมนูทุกโครงการ ในโครงการเห็นเมนูของโครงการนั้นด้วย (ลิงก์พา ?project= ไปต่อ)
  const sideMenus = menus.filter((m) => menuVisibleIn(m, project?.id ?? null));
  const menuQuery = project ? `?project=${project.id}` : "";
  // pathname = null คือ fallback ระหว่างรออ่าน URL — ไม่ไฮไลต์อะไร
  const isActive = (item: Pick<NavItem, "href" | "match">) => pathname !== null && (item.match ?? under(item.href))(pathname);
  return (
    <>
      <div className="flex flex-col gap-1">
        {project && (
          <>
            <Link href={allHref} onClick={onNavigate} className={`${navClass(false)} text-xs opacity-80`}>
              <Icon d={icons.back} />
              โครงการทั้งหมด
            </Link>
            <div className="mb-1 rounded-lg border border-white/10 px-2.5 py-2">
              <div className="text-[11px] opacity-60">{project.code}</div>
              <div className="line-clamp-2 font-semibold text-white">{project.name}</div>
            </div>
          </>
        )}
        {sections.map((s, i) => {
          const items = s.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={i} className="flex flex-col gap-1">
              {s.title && <div className="px-2.5 pt-3.5 pb-1 text-[11px] tracking-wider uppercase opacity-55">{s.title}</div>}
              {items.map((item) => (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={navClass(isActive(item))}>
                  <Icon d={icons[item.icon]} />
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
        {/* เมนูที่ผู้ดูแลสร้างเอง — ภายในเป็น Card ลิงก์ */}
        {sideMenus.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="px-2.5 pt-3.5 pb-1 text-[11px] tracking-wider uppercase opacity-55">เมนูเพิ่มเติม</div>
            {sideMenus.map((m) => (
              <Link key={m.id} href={`/m/${m.id}${menuQuery}`} onClick={onNavigate} className={navClass(isActive({ href: `/m/${m.id}` }))}>
                <SideMenuIcon menu={m} />
                <span className="truncate">{m.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* มุมซ้ายล่าง: จัดการ Cards + จัดการผู้ใช้ — เห็นเฉพาะผู้มีสิทธิ์ */}
      {(can("menu.manage") || can("user.manage")) && (
        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
          {can("menu.manage") && (
            <Link href="/menus" onClick={onNavigate} className={navClass(isActive({ href: "/menus" }))}>
              <Icon d={icons.cards} />
              จัดการ Cards
            </Link>
          )}
          {can("user.manage") && (
            <Link href="/admin" onClick={onNavigate} className={navClass(isActive({ href: "/admin" }))}>
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

/** แถบบนเมื่ออยู่ในโครงการ: กลับหน้ารวม + สลับโครงการโดยอยู่หมวดเดิม */
function ProjectBar() {
  const router = useRouter();
  const pathname = useActualPathname();
  const projectId = useCurrentProjectId();
  const { byId, projects } = useProjects();
  const allHref = useAllProjectsHref();
  const project = projectId ? byId.get(projectId) : undefined;

  useEffect(() => {
    if (project) rememberLastProject(project.id);
  }, [project]);

  if (!project) return <div className="flex-1" />;
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-2" aria-label="โครงการปัจจุบัน">
      <Link href={allHref} className="hidden whitespace-nowrap text-muted hover:text-primary sm:inline">
        ← โครงการทั้งหมด
      </Link>
      <span className="hidden text-muted sm:inline">/</span>
      <select
        aria-label="สลับโครงการ"
        className="input w-auto min-w-0 truncate py-1.5 font-semibold"
        value={project.id}
        onChange={(e) => router.push(switchProjectHref(pathname, e.target.value))}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
          </option>
        ))}
      </select>
    </nav>
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
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4 text-base font-bold text-white">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[#1f5eff] to-[#00b3a4] text-xs">CMG</div>
          Project Hub
        </Link>
        <ProfileCard />
        {/* เมนูขึ้นกับ URL (หน้าไหน/โครงการไหน) ต้องอ่าน URL ตอน runtime จึงอยู่หลัง Suspense; fallback คือเมนูรวมแบบไม่ไฮไลต์ */}
        <Suspense fallback={<Nav pathname={null} projectId={null} onNavigate={() => setOpen(false)} />}>
          <ActiveNav onNavigate={() => setOpen(false)} />
        </Suspense>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-[5] flex print:hidden items-center gap-3 border-b border-border bg-surface px-4 py-2.5 md:px-7 md:py-3.5">
          <button className="grid size-9 flex-none place-items-center rounded-lg text-muted md:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <Suspense fallback={<div className="flex-1" />}>
            <ProjectBar />
          </Suspense>
          <ProfileMenu />
        </header>
        <main className="mx-auto max-w-[1280px] px-4 pt-4 pb-12 md:px-7 md:pt-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
