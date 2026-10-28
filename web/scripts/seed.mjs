// ใส่ข้อมูลตัวอย่างตามโครงสร้าง Cmg-Cons-Page-Claude/root/projects/{id}/{เมนู}
//   npm run seed                        ทุกหมวด
//   npm run seed -- --only issues       เฉพาะหมวดที่ระบุ (projects, daily_reports, issues คั่นด้วย ,)
// อ่านค่า Firebase จาก .env — เขียนทับเฉพาะเอกสารตัวอย่าง (id เดียวกับข้อมูลจำลอง) ไม่ลบข้อมูลอื่น
import { initializeApp } from "firebase/app";
import { doc, getFirestore, serverTimestamp, writeBatch } from "firebase/firestore/lite";
import { mockDailyReports, mockIssues, mockProgress, mockProjects } from "../src/lib/mock-data.ts";

const env = process.env;
if (!env.NEXT_PUBLIC_FIREBASE_API_KEY || !env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  console.error("ไม่พบค่า NEXT_PUBLIC_FIREBASE_* ใน .env");
  process.exit(1);
}
const db = getFirestore(initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }));
const root = doc(db, "Cmg-Cons-Page-Claude", "root");

const onlyArg = process.argv.indexOf("--only");
const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1]?.split(",")) : null;
const wants = (section) => !only || only.has(section);

try {
  const batch = writeBatch(db);
  const counters = {};
  if (wants("issues")) {
    for (const i of mockIssues) {
      counters[i.project_id] ??= {};
      counters[i.project_id][i.category] = Math.max(counters[i.project_id][i.category] ?? 0, Number(i.code.split("-")[1]));
    }
  }
  if (wants("projects")) {
    for (const { id, ...project } of mockProjects) {
      batch.set(doc(root, "projects", id), {
        ...project,
        progress: mockProgress[id] ?? [],
        issue_counters: counters[id] ?? {},
        version: 1,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        created_by: "seed",
        updated_by: "seed",
      });
      batch.set(doc(root, "projectCodes", project.code), { project_id: id });
    }
  } else if (wants("issues")) {
    // ใส่เฉพาะเรื่อง: ต่อเลขรันในโครงการ (merge ไม่ทับข้อมูลโครงการ)
    for (const [projectId, c] of Object.entries(counters)) batch.set(doc(root, "projects", projectId), { issue_counters: c }, { merge: true });
  }
  if (wants("daily_reports")) {
    for (const r of mockDailyReports) {
      const { project_id, report_date, weather, workers, work_done, equipment, issues } = r;
      batch.set(doc(root, "projects", project_id, "daily_reports", report_date), {
        ...{ project_id, report_date, weather, workers, work_done, equipment, issues },
        photos: [],
        created_at: serverTimestamp(),
        created_by: "seed",
      });
    }
  }
  if (wants("issues")) {
    for (const i of mockIssues) {
      const { code, category, title, description, priority, status, assignee, due_date, created_at, closed_at } = i;
      batch.set(doc(root, "projects", i.project_id, "issues", i.id), {
        ...{ code, category, title, description, priority, status, assignee, due_date },
        photos: [],
        created_at: new Date(created_at),
        closed_at: closed_at ? new Date(closed_at) : null,
        created_by: "seed",
      });
    }
  }
  await batch.commit();
  const count = (section, list) => (wants(section) ? list.length : 0);
  console.log(
    `✓ ใส่ ${count("projects", mockProjects)} โครงการ, ${count("daily_reports", mockDailyReports)} รายงาน ` +
      `และ ${count("issues", mockIssues)} เรื่อง (ปัญหา/ความปลอดภัย/RFI) แล้ว`,
  );
  process.exit(0);
} catch (e) {
  console.error("✗", e.code ?? "", e.message);
  process.exit(1);
}
