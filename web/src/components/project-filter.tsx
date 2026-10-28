"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** ตัวกรองโครงการ — เปลี่ยนแล้วอัปเดต ?project= ใน URL */
export function ProjectFilter({ projects, basePath }: { projects: { id: string; name: string }[]; basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      aria-label="กรองตามโครงการ"
      className="input w-auto max-w-full"
      value={params.get("project") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("project", e.target.value);
        else next.delete("project");
        router.push(`${basePath}${next.size ? `?${next}` : ""}`);
      }}
    >
      <option value="">ทุกโครงการ</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
