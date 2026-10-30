"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type FormEvent } from "react";
import { projectOptions, useProjects } from "@/lib/db/projects";
import { todayInBangkok } from "@/lib/format";
import { dailyReportHref } from "@/lib/project-context";
import { PageHeader, Skeleton } from "@/components/ui";
import { Guard, NoProjects } from "@/components/guard";

/** เลือกโครงการ + วันที่ แล้วเปิดฟอร์มรายงาน (ถ้ามีรายงานวันนั้นอยู่แล้ว จะเปิดฉบับเดิมมาแก้ไข) · ?project= = มาจากโครงการที่เปิดอยู่ → เข้าฟอร์มเลย */
export default function NewDailyReportPage() {
  const router = useRouter();
  const preset = useSearchParams().get("project") ?? undefined;
  const { projects, loading } = useProjects();
  const options = projectOptions(projects);
  const direct = preset && options.some((p) => p.id === preset) ? preset : null;
  useEffect(() => {
    if (direct) router.replace(dailyReportHref(direct));
  }, [direct, router]);

  function open(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    router.push(`/daily-reports/${form.get("project")}/${form.get("date")}/edit`);
  }

  return (
    <>
      <PageHeader title="เขียนรายงานประจำวัน" subtitle="เลือกโครงการและวันที่ — ถ้ามีรายงานของวันนั้นแล้ว ระบบจะเปิดฉบับเดิมให้แก้ไข" />
      <Guard permission="daily.create">
        {loading || direct ? (
          <Skeleton />
        ) : options.length === 0 ? (
          <NoProjects />
        ) : (
          <form onSubmit={open} className="card grid max-w-xl gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label" htmlFor="project">โครงการ</label>
              <select id="project" name="project" defaultValue={preset} className="input">
                {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="date">วันที่</label>
              <input id="date" name="date" type="date" required defaultValue={todayInBangkok()} max={todayInBangkok()} className="input" />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button className="btn btn-primary">เปิดฟอร์มรายงาน</button>
            </div>
          </form>
        )}
      </Guard>
    </>
  );
}
