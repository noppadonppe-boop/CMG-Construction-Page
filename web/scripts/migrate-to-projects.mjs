// ย้ายข้อมูลจากโครงสร้างเดิม → โครงสร้างใหม่ที่ข้อมูลแต่ละเมนูอยู่ใต้โครงการของตัวเอง
//
//   เดิม:  root/daily_reports/{projectId}_{date}   root/issues/{id}   root/documents/{id}   root.counters
//   ใหม่:  root/projects/{projectId}/daily_reports/{date}
//          root/projects/{projectId}/issues/{id}      (+ projects.issue_counters)
//          root/projects/{projectId}/documents/{id}
//          root/projectCodes/{CODE}                   (จองรหัสโครงการไม่ให้ซ้ำ)
//
//   npm run migrate            ดูว่าจะย้ายอะไรบ้าง (ไม่เขียนจริง)
//   npm run migrate -- --apply ย้ายจริง (รันซ้ำได้ — ข้อมูลที่ย้ายแล้วจะไม่ถูกย้ายซ้ำ)
//
// ไฟล์ใน Storage ไม่ถูกย้าย: เอกสารที่ย้ายยังชี้ไปที่ path/url เดิมซึ่งยังใช้ได้
import { initializeApp } from "firebase/app";
import { collection, deleteField, doc, getDocs, getFirestore, updateDoc, writeBatch } from "firebase/firestore/lite";

const env = process.env;
if (!env.NEXT_PUBLIC_FIREBASE_API_KEY || !env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  console.error("ไม่พบค่า NEXT_PUBLIC_FIREBASE_* ใน .env");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const db = getFirestore(initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }));
const root = doc(db, "Cmg-Cons-Page-Claude", "root");

const ops = []; // [{ kind: "set"|"delete"|"update", ref, data }]
const log = (...a) => console.log(apply ? "✓" : "•", ...a);

try {
  const projects = (await getDocs(collection(root, "projects"))).docs;
  const projectIds = new Set(projects.map((p) => p.id));
  const counters = {}; // projectId → { issue, safety, rfi }

  for (const p of projects) {
    const code = String(p.get("code") ?? "").toUpperCase();
    if (code) ops.push({ kind: "set", ref: doc(root, "projectCodes", code), data: { project_id: p.id } });
    if (p.get("version") === undefined) ops.push({ kind: "update", ref: p.ref, data: { version: 1 } });
  }

  // รายงานประจำวัน
  for (const d of (await getDocs(collection(root, "daily_reports"))).docs) {
    const data = d.data();
    delete data.project_name;
    if (!projectIds.has(data.project_id)) { log("ข้ามรายงาน", d.id, "(ไม่พบโครงการ)"); continue; }
    ops.push({ kind: "set", ref: doc(root, "projects", data.project_id, "daily_reports", data.report_date), data });
    ops.push({ kind: "delete", ref: d.ref });
    log("รายงาน", d.id, "→", `projects/${data.project_id}/daily_reports/${data.report_date}`);
  }

  // ปัญหา / ความปลอดภัย / RFI
  for (const d of (await getDocs(collection(root, "issues"))).docs) {
    const data = d.data();
    const project_id = data.project_id;
    delete data.project_name;
    delete data.project_id;
    if (!projectIds.has(project_id)) { log("ข้ามเรื่อง", d.id, "(ไม่พบโครงการ)"); continue; }
    ops.push({ kind: "set", ref: doc(root, "projects", project_id, "issues", d.id), data });
    ops.push({ kind: "delete", ref: d.ref });
    const n = Number(String(data.code ?? "").split("-")[1] ?? 0);
    counters[project_id] ??= {};
    counters[project_id][data.category] = Math.max(counters[project_id][data.category] ?? 0, n);
    log("เรื่อง", data.code, "→", `projects/${project_id}/issues/${d.id}`);
  }

  // เอกสาร
  for (const d of (await getDocs(collection(root, "documents"))).docs) {
    const data = d.data();
    const project_id = data.project_id;
    delete data.project_name;
    delete data.project_id;
    if (!projectIds.has(project_id)) { log("ข้ามเอกสาร", d.id, "(ไม่พบโครงการ)"); continue; }
    ops.push({ kind: "set", ref: doc(root, "projects", project_id, "documents", d.id), data });
    ops.push({ kind: "delete", ref: d.ref });
    log("เอกสาร", d.id, "→", `projects/${project_id}/documents/${d.id}`);
  }

  // เลขรันของเรื่องเปลี่ยนจาก "ทั้งระบบ" เป็น "รายโครงการ" — ต่อจากเลขสูงสุดเดิมของโครงการนั้น
  for (const [projectId, c] of Object.entries(counters)) {
    ops.push({ kind: "update", ref: doc(root, "projects", projectId), data: Object.fromEntries(Object.entries(c).map(([k, v]) => [`issue_counters.${k}`, v])) });
  }

  console.log(`\nรวม ${ops.length} คำสั่ง (${projects.length} โครงการ)`);
  if (!apply) {
    console.log("ยังไม่ได้เขียนจริง — รัน `npm run migrate -- --apply` เพื่อย้าย");
    process.exit(0);
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.kind === "set") batch.set(op.ref, op.data);
      else if (op.kind === "update") batch.update(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
  await updateDoc(root, { counters: deleteField() }).catch(() => {});
  console.log("✓ ย้ายข้อมูลเสร็จ");
  process.exit(0);
} catch (e) {
  console.error("✗", e.code ?? "", e.message);
  process.exit(1);
}
