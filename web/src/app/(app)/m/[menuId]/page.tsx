"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useMenus } from "@/lib/db/menus";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { GroupCard } from "../../menus/group-card";

/** หน้าแสดงเมนูสำหรับผู้ใช้ทั่วไป — การเพิ่ม/ลบ/แก้ ทำที่หน้า /menus */
export default function CustomMenuPage() {
  const { menuId } = useParams<{ menuId: string }>();
  const { can } = useAuth();
  const { menus, loading, error } = useMenus();
  const menu = menus.find((m) => m.id === menuId);

  if (loading) return <Skeleton />;
  if (error) return <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">โหลดเมนูไม่สำเร็จ: {error}</p>;
  if (!menu) return <EmptyState>ไม่พบเมนูนี้ อาจถูกลบไปแล้ว</EmptyState>;

  const manageHref = `/menus?menu=${menu.id}`;
  const linkCount = menu.cards.reduce((n, c) => n + c.links.length, 0);
  return (
    <>
      <PageHeader
        title={`${menu.emoji && !menu.icon ? menu.emoji + " " : ""}${menu.name}`}
        subtitle={`${menu.cards.length} Cards · ${linkCount} ลิงก์`}
        actions={can("menu.manage") && <Link href={manageHref} className="btn">จัดการเมนูนี้</Link>}
      />
      {menu.cards.length === 0 ? (
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
          {menu.cards.map((card) => (
            <GroupCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </>
  );
}
