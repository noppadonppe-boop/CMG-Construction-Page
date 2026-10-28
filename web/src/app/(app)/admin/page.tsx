"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { displayName, useAuth } from "@/lib/auth/context";
import { DEPARTMENTS, ROLE_LABEL, ROLES, type UserRole } from "@/lib/auth/roles";
import type { UserProfile, UserStatus } from "@/lib/auth/types";
import { useProjects } from "@/lib/db/projects";
import { updateUserByAdmin, useUsers, UserUpdateError, type AdminUserPatch } from "@/lib/db/users";
import { firebaseErrorMessage } from "@/lib/firebase/errors";
import { formatDateTime, type Tone } from "@/lib/format";
import { EmptyState, PageHeader, Pill, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { MultiSelect } from "@/components/multi-select";
import { ProtectedRoute } from "@/components/protected-route";

const STATUS: Record<UserStatus, { label: string; tone: Tone }> = {
  pending: { label: "รออนุมัติ", tone: "warn" },
  approved: { label: "ใช้งานได้", tone: "ok" },
  rejected: { label: "ไม่อนุมัติ", tone: "bad" },
};
type Filter = UserStatus | "all";

export default function AdminPage() {
  return (
    // จัดการผู้ใช้ได้เฉพาะ MasterAdmin
    <ProtectedRoute requireRoles={["MasterAdmin"]}>
      <UserManagement />
    </ProtectedRoute>
  );
}

function UserManagement() {
  const { users, loading, error } = useUsers(true);
  const { projects } = useProjects();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: users.length, pending: 0, approved: 0, rejected: 0 };
    users.forEach((u) => c[u.status]++);
    return c;
  }, [users]);
  // ค่าเริ่มต้น: ถ้ามีคนรออนุมัติ เปิดแท็บนั้นก่อน
  const active: Filter = filter ?? (counts.pending > 0 ? "pending" : "all");
  const q = search.trim().toLowerCase();
  const shown = users
    .filter((u) => active === "all" || u.status === active)
    .filter((u) => !q || `${u.firstName} ${u.lastName} ${u.email} ${u.position} ${u.department}`.toLowerCase().includes(q))
    .toSorted((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name, hint: p.code }));

  return (
    <>
      <PageHeader title="จัดการผู้ใช้งาน" subtitle="อนุมัติผู้ใช้ กำหนด Role (เลือกได้หลาย Role) และ assign โครงการ · อัปเดตอัตโนมัติ" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
          {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 whitespace-nowrap ${f === active ? "bg-primary-soft font-semibold text-primary" : "text-muted hover:text-text"}`}
            >
              {f === "all" ? "ทั้งหมด" : STATUS[f].label} · {counts[f]}
              {f === "pending" && counts.pending > 0 && <span className="ml-1.5 inline-block size-2 rounded-full bg-bad" />}
            </button>
          ))}
        </nav>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ อีเมล ตำแหน่ง"
          aria-label="ค้นหาผู้ใช้"
          className="input w-full sm:w-64"
        />
      </div>

      {error && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-bad">โหลดรายชื่อไม่สำเร็จ: {error}</p>}
      {loading ? (
        <Skeleton />
      ) : shown.length === 0 ? (
        <EmptyState>{active === "pending" ? "ไม่มีผู้ใช้รออนุมัติ" : "ไม่พบผู้ใช้"}</EmptyState>
      ) : (
        <div className="space-y-3">
          {shown.map((u) => (
            <UserRow key={u.email} user={u} allUsers={users} projectOptions={projectOptions} />
          ))}
        </div>
      )}
    </>
  );
}

function UserRow({
  user,
  allUsers,
  projectOptions,
}: {
  user: UserProfile;
  allUsers: UserProfile[];
  projectOptions: { value: string; label: string; hint: string }[];
}) {
  const { userProfile } = useAuth();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const name = displayName(user);
  const isMe = user.email === userProfile?.email;
  const hasAllProjects = user.role.includes("MasterAdmin") || user.role.includes("Admin");

  // บันทึกทันทีที่เปลี่ยน — คนอื่นที่เปิดหน้านี้อยู่เห็นผลแบบ realtime
  const save = (patch: AdminUserPatch) =>
    startTransition(async () => {
      try {
        await updateUserByAdmin(user.email, patch, userProfile!.email, allUsers);
        setError(undefined);
      } catch (e) {
        setError(e instanceof UserUpdateError ? e.message : "บันทึกไม่สำเร็จ: " + firebaseErrorMessage(e));
      }
    });

  return (
    <article className={`card grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] ${pending ? "opacity-70" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Avatar src={user.photoURL} name={name} size={48} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold">{name}</span>
            {isMe && <span className="text-xs text-muted">(คุณ)</span>}
            {user.isFirstUser && <span className="rounded bg-warn-soft px-1.5 text-[10px] text-warn">ผู้ใช้คนแรก</span>}
          </div>
          <div className="truncate text-xs text-muted">{user.email}</div>
          <div className="truncate text-xs text-muted">
            {[user.position, user.department].filter(Boolean).join(" · ") || "ยังไม่ระบุตำแหน่ง/แผนก"}
          </div>
          {user.createdAt && <div className="text-[11px] text-muted">สมัคร {formatDateTime(user.createdAt.toDate().toISOString())}</div>}
          <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => dialogRef.current?.showModal()}>
            แก้ไขข้อมูล
          </button>
        </div>
      </div>

      <div>
        <div className="label">Role (เลือกได้หลาย Role)</div>
        <MultiSelect<UserRole>
          label={`Role ของ ${name}`}
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          value={user.role}
          onChange={(role) => role.length > 0 && save({ role })}
          disabled={pending}
        />
      </div>

      <div>
        <div className="label">โครงการที่เข้าถึงได้</div>
        {hasAllProjects ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">เห็นทุกโครงการตาม Role</p>
        ) : (
          <MultiSelect<string>
            label={`โครงการของ ${name}`}
            options={projectOptions}
            value={user.assignedProjects}
            onChange={(assignedProjects) => save({ assignedProjects })}
            placeholder="ยังไม่ได้ assign โครงการ"
            disabled={pending}
          />
        )}
      </div>

      <div className="flex flex-col items-start gap-2 lg:items-end">
        <Pill tone={STATUS[user.status].tone}>{STATUS[user.status].label}</Pill>
        <div className="flex flex-wrap gap-1.5">
          {user.status !== "approved" && (
            <button type="button" className="btn btn-primary px-2.5 py-1 text-xs" disabled={pending} onClick={() => save({ status: "approved" })}>
              อนุมัติ
            </button>
          )}
          {user.status !== "rejected" && !isMe && (
            <button type="button" className="btn px-2.5 py-1 text-xs text-bad" disabled={pending} onClick={() => save({ status: "rejected" })}>
              {user.status === "pending" ? "ไม่อนุมัติ" : "ระงับการใช้งาน"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad lg:col-span-4">{error}</p>}
      <EditUserDialog dialogRef={dialogRef} user={user} onSave={save} />
    </article>
  );
}

function EditUserDialog({
  dialogRef,
  user,
  onSave,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  user: UserProfile;
  onSave: (patch: AdminUserPatch) => void;
}) {
  // ค่าในฟอร์มตั้งจากข้อมูล ณ ตอนเปิด — ไม่ถูกเขียนทับระหว่างพิมพ์ แม้ข้อมูลผู้ใช้เปลี่ยนแบบ realtime
  const [formKey, setFormKey] = useState(0);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const v = (k: string) => String(form.get(k) ?? "").trim();
    onSave({ firstName: v("firstName"), lastName: v("lastName"), position: v("position"), department: v("department") });
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setFormKey((k) => k + 1)}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form key={formKey} onSubmit={onSubmit} className="space-y-3 p-5">
        <h2 className="text-lg font-bold">แก้ไขข้อมูลผู้ใช้</h2>
        <p className="text-sm text-muted">{user.email}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`fn-${user.email}`}>ชื่อ</label>
            <input id={`fn-${user.email}`} name="firstName" defaultValue={user.firstName} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor={`ln-${user.email}`}>นามสกุล</label>
            <input id={`ln-${user.email}`} name="lastName" defaultValue={user.lastName} className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`pos-${user.email}`}>ตำแหน่ง</label>
          <input id={`pos-${user.email}`} name="position" defaultValue={user.position} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`dep-${user.email}`}>แผนก</label>
          <select id={`dep-${user.email}`} name="department" defaultValue={user.department} className="input">
            <option value="">— ไม่ระบุ —</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>ยกเลิก</button>
          <button className="btn btn-primary">บันทึก</button>
        </div>
      </form>
    </dialog>
  );
}
