// แปลงรายงานประจำวันรูปแบบเดิม (schema 1) → Daily construction report (schema 2)
// และสร้าง projects/{id}/settings/dcr ให้ทุกโครงการ (ชื่อ Client จากข้อมูลโครงการ, เลขรันรายงานเรียงตามวันที่)
//
//   npm run migrate:dcr            ดูว่าจะแปลงอะไรบ้าง (ไม่เขียนจริง)
//   npm run migrate:dcr -- --apply แปลงจริง (รันซ้ำได้ — ฉบับที่แปลงแล้วจะไม่ถูกแตะ)
import { initializeApp } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, writeBatch } from "firebase/firestore/lite";
import { blankReport, defaultSettings } from "../src/lib/dcr.ts";

const env = process.env;
if (!env.NEXT_PUBLIC_FIREBASE_API_KEY || !env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  console.error("ไม่พบค่า NEXT_PUBLIC_FIREBASE_* ใน .env");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const db = getFirestore(initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }));
const root = doc(db, "Cmg-Cons-Page-Claude", "root");

try {
  const batch = writeBatch(db);
  let ops = 0;
  for (const p of (await getDocs(collection(root, "projects"))).docs) {
    const settingsRef = doc(p.ref, "settings", "dcr");
    const existing = await getDoc(settingsRef);
    const settings = existing.exists() ? { ...defaultSettings(p.get("client")), ...existing.data() } : defaultSettings(p.get("client") ?? null);
    let counter = Number(settings.report_counter ?? 0);

    const reports = (await getDocs(collection(p.ref, "daily_reports"))).docs.toSorted((a, b) => a.id.localeCompare(b.id));
    for (const r of reports) {
      const d = r.data();
      if (d.schema === 2) continue;
      const report = blankReport(d.report_date ?? r.id, settings);
      const sky = d.weather === "rain" ? "heavy_rain" : d.weather === "cloudy" ? "cloudy" : "clear";
      report.weather.am.sky = sky;
      report.weather.pm.sky = sky;
      // จำนวนคนเดิมไม่ได้แยกประเภท → ใส่ที่ "กรรมกร / ทั่วไป" (แถวสุดท้ายของ Direct labor)
      report.manpower.direct.at(-1).main = Number(d.workers ?? 0);
      report.equipment = (d.equipment ?? []).map((name) => ({ name, owner: "", work_hours: 0, idle_hours: 0, status: "working" }));
      report.progress = [{ id: "legacy", zone: "", category: "", description: d.work_done ?? "", quantity: "", cumulative: "", photos: (d.photos ?? []).map((ph) => ({ ...ph, caption: "" })) }];
      report.issues = d.issues ? [{ description: d.issues, cause: "อื่น ๆ", impact_hours: 0, responsible: "", action: "" }] : [];
      report.status = "submitted";
      report.report_no = ++counter;
      batch.set(r.ref, { ...report, schema: 2, version: 1, created_at: d.created_at ?? null, created_by: d.created_by ?? "migration", updated_by: "migration" });
      ops++;
      console.log(apply ? "✓" : "•", `${p.get("code")} ${r.id} → DCR no.${report.report_no}`);
    }
    const { report_counter: _c, version: _v, ...rest } = settings;
    void _c;
    void _v;
    batch.set(settingsRef, { ...rest, report_counter: counter, version: Number(settings.version ?? 0) + (existing.exists() ? 0 : 1) }, { merge: true });
    ops++;
  }
  console.log(`\nรวม ${ops} คำสั่ง`);
  if (!apply) {
    console.log("ยังไม่ได้เขียนจริง — รัน `npm run migrate:dcr -- --apply` เพื่อแปลง");
    process.exit(0);
  }
  await batch.commit();
  console.log("✓ แปลงเสร็จ");
  process.exit(0);
} catch (e) {
  console.error("✗", e.code ?? "", e.message);
  process.exit(1);
}
