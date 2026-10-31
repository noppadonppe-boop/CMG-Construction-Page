"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouteParams } from "@/lib/static-export";
import { useAuth } from "@/lib/auth/context";
import { cardVisibleIn, menuVisibleIn, useMenus } from "@/lib/db/menus";
import { useProjects } from "@/lib/db/projects";
import { useCurrentProjectId } from "@/lib/project-context";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { LinkCard } from "../../menus/link-card";
import { MaterialRequestDialog } from "./material-request-dialog";

/** เมนูที่มีปุ่มเปิด Material Request form — จับจากชื่อเมนู */
const isMaterialMenu = (name: string) => /material\s*request/i.test(name);

/** หน้าแสดงเมนูสำหรับผู้ใช้ทั่วไป — การเพิ่ม/ลบ/แก้ ทำที่หน้า "จัดการ Cards" (/menus) */
export default function CustomMenuPage() {
  return (
    // อ่าน ?project= จาก URL ตอน runtime จึงต้องอยู่หลัง Suspense
    <Suspense fallback={<Skeleton />}>
      <CustomMenu />
    </Suspense>
  );
}

function CustomMenu() {
  const { menuId } = useRouteParams<{ menuId: string }>("/m/[menuId]");
  const { can } = useAuth();
  const { menus, loading, error } = useMenus();
  const { byId, loading: loadingProjects } = useProjects();
  // ใช้เฉพาะโครงการที่ผู้ใช้เห็นได้ — ?project= ที่ไม่รู้จักถือเป็นหน้านอกโครงการ
  const requested = useCurrentProjectId();
  const projectId = requested && byId.has(requested) ? requested : null;
  const menu = menus.find((m) => m.id === menuId);
  const [materialOpen, setMaterialOpen] = useState(false);

  if (loading || loadingProjects) return <Skeleton />;
  if (error) return <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">โหลดเมนูไม่สำเร็จ: {error}</p>;
  if (!menu) return <EmptyState>ไม่พบเมนูนี้ อาจถูกลบไปแล้ว</EmptyState>;
  if (!menuVisibleIn(menu, projectId))
    return <EmptyState>{projectId ? "เมนูนี้ไม่ได้แสดงในโครงการนี้" : "เมนูนี้แสดงเฉพาะในบางโครงการ — เลือกโครงการก่อน"}</EmptyState>;

  const cards = menu.cards.filter((c) => cardVisibleIn(menu, c, projectId));
  const project = projectId ? byId.get(projectId) : undefined;
  const showMaterial = !!project && isMaterialMenu(menu.name);
  const manageHref = `/menus?menu=${menu.id}${projectId ? `&scope=${projectId}` : ""}`;
  return (
    <>
      <PageHeader
        title={`${menu.emoji && !menu.icon ? menu.emoji + " " : ""}${menu.name}`}
        subtitle={`${cards.length} Cards`}
        actions={
          <>
            {showMaterial && (
              <button type="button" className="btn btn-primary" onClick={() => setMaterialOpen(true)}>📦 Material Request form</button>
            )}
            {can("menu.manage") && <Link href={manageHref} className="btn">จัดการ Cards</Link>}
          </>
        }
      />
      {cards.length === 0 ? (
        <EmptyState>
          ยังไม่มี Card ในเมนูนี้
          {can("menu.manage") && (
            <div className="mt-3">
              <Link href={manageHref} className="btn btn-primary">+ เพิ่ม Card แรก</Link>
            </div>
          )}
        </EmptyState>
      ) : (
        <div className="card-grid">
          {cards.map((card) => (
            <LinkCard key={card.id} card={card} />
          ))}
        </div>
      )}
      {showMaterial && materialOpen && <MaterialRequestDialog project={project} onClose={() => setMaterialOpen(false)} />}
    </>
  );
}
