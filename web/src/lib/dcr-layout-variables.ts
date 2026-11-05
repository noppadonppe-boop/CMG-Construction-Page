import { normalizeHeadcount } from "./dcr-headcount";
import { manpowerSummaryVariables, manpowerVariables } from "./dcr-manpower-variables";
import { manpowerTotals, workingHours, type DcrData } from "./dcr";
import { DCR_TEXT, translateValue, type ReportLang } from "./dcr-i18n";
type Head = { project_name: string; project_no: string; client: string; consultant: string; contractor: string; subcontractors: string; location: string; doc_no: string };
export type LayoutVariable = { key: string; label: string; value: string; weatherTable?: Pick<DcrData["weather"], "am" | "pm"> };
export function layoutVariables(r: DcrData, head: Head, lang: ReportLang = "th"): LayoutVariable[] {
  r = { ...r, manpower: { ...r.manpower, indirect: r.manpower.indirect.map(normalizeHeadcount), direct: r.manpower.direct.map(normalizeHeadcount) } };
  const t = DCR_TEXT[lang];
  const totals = manpowerTotals(r.manpower, workingHours(r.working_hours.start, r.working_hours.end));
  const rows = <T,>(items: T[], fn: (item: T) => string) => items.map(fn).filter(Boolean).join("\n");
  const fields: [string, string, unknown][] = [
    ["A.project_name", "A · ชื่อโครงการ", head.project_name], ["A.project_no", "A · เลขที่โครงการ", head.project_no], ["A.client", "A · เจ้าของโครงการ", head.client], ["A.consultant", "A · ที่ปรึกษา", head.consultant], ["A.contractor", "A · ผู้รับเหมาหลัก", head.contractor], ["A.subcontractors", "A · ผู้รับเหมาช่วง", head.subcontractors], ["A.location", "A · สถานที่", head.location], ["A.date", "A · วันที่รายงาน", r.report_date ? t.shortDate(r.report_date) : ""], ["A.doc_no", "A · เลขที่เอกสาร", head.doc_no], ["A.start", "A · เวลาเริ่มงาน", r.working_hours.start], ["A.end", "A · เวลาเลิกงาน", r.working_hours.end], ["A.ot", "A · ล่วงเวลา", r.working_hours.overtime],
    ["B.am_sky", "B · อากาศเช้า", t.sky[r.weather.am.sky]], ["B.am_status", "B · สถานะงานเช้า", t.work[r.weather.am.status]], ["B.pm_sky", "B · อากาศบ่าย", t.sky[r.weather.pm.sky]], ["B.pm_status", "B · สถานะงานบ่าย", t.work[r.weather.pm.status]], ["B.high", "B · อุณหภูมิสูงสุด", r.weather.temp_high], ["B.low", "B · อุณหภูมิต่ำสุด", r.weather.temp_low], ["B.rain", "B · ปริมาณฝน", r.weather.rain_mm], ["B.lost", "B · ชั่วโมงสูญเสีย", r.weather.lost_hours], ["B.site", "B · สภาพพื้นที่", translateValue(t, r.weather.site_condition)], ["B.remark", "B · หมายเหตุอากาศ", r.weather.remark],
    ["C.indirect", "C · กำลังคน Indirect", rows(r.manpower.indirect, x => [x.label, x.present, x.total].join(" · "))], ["C.direct", "C · กำลังคน Direct", rows(r.manpower.direct, x => [x.label, x.present, x.total].join(" · "))], ["C.equipment", "C · เครื่องจักร", rows(r.equipment, x => [x.name, x.owner, x.quantity, t.equip[x.status], x.remark].filter(Boolean).join(" · "))], ["C.materials", "C · วัสดุ", rows(r.materials, x => [x.item, x.quantity, x.unit, x.remark].filter(Boolean).join(" · "))],
    ["D.progress", "D · งานที่ทำวันนี้", rows(r.progress, x => [x.zone, x.category, x.description, x.quantity, x.cumulative].filter(Boolean).join(" · "))], ["D.toolbox", "D · หัวข้อ Toolbox", r.safety.toolbox_topic], ["D.attendees", "D · ผู้เข้าร่วม Toolbox", r.safety.toolbox_attendees], ["D.incidents", "D · อุบัติเหตุ", r.safety.incidents], ["D.near_miss", "D · เหตุการณ์เกือบเกิดอุบัติเหตุ", r.safety.near_miss], ["D.safety_remark", "D · หมายเหตุความปลอดภัย", r.safety.remark], ["D.inspections", "D · ตรวจสอบคุณภาพ", r.quality.inspections], ["D.ncr", "D · NCR", r.quality.ncr],
    ["E.issues", "E · ปัญหาและอุปสรรค", rows(r.issues, x => [x.description, translateValue(t, x.cause), x.impact_hours || "", x.responsible, x.action].filter(Boolean).join(" · "))], ["F.plan", "F · แผนงานพรุ่งนี้", rows(r.tomorrow, x => [x.task, x.manpower || "", x.resources].filter(Boolean).join(" · "))], ["G.captions", "G · คำบรรยายรูปภาพ", rows(r.progress.flatMap(x => x.photos), x => x.caption)],
  ];
  const columns = <T,>(section: string, items: T[], definitions: [string, string, (item: T) => unknown][]) => {
    for (const [key, label, get] of definitions) fields.push([section + "." + key, section + " · " + label, rows(items, item => String(get(item) ?? ""))]);
  };
  columns("C", r.manpower.indirect, [["indirect_role", "ตำแหน่ง Indirect", x => x.label], ["indirect_total", "จำนวน Indirect ทั้งหมด", x => x.total], ["indirect_present", "Indirect มาทำงาน", x => x.present], ["indirect_leave", "Indirect ขาด/ลา", x => x.total - x.present]]);
  columns("C", r.manpower.direct, [["direct_role", "ตำแหน่ง Direct", x => x.label], ["direct_total", "จำนวน Direct ทั้งหมด", x => x.total], ["direct_present", "Direct มาทำงาน", x => x.present], ["direct_leave", "Direct ขาด/ลา", x => x.total - x.present]]);
  for (const col of r.manpower.direct_columns ?? []) {
    const name = col.name.trim() || "(ไม่มีชื่อ)";
    columns("C", r.manpower.direct, [["direct_col_" + col.id, "Direct · " + name, x => x.cols?.[col.id] ?? 0]]);
  }
  columns("C", r.equipment, [["equipment_name", "ชื่อเครื่องจักร", x => x.name], ["equipment_owner", "เจ้าของเครื่องจักร", x => x.owner], ["equipment_quantity", "จำนวนเครื่องจักร", x => x.quantity], ["equipment_status", "สถานะเครื่องจักร", x => t.equip[x.status]], ["equipment_remark", "หมายเหตุเครื่องจักร", x => x.remark]]);
  columns("C", r.materials, [["material_item", "รายการวัสดุ", x => x.item], ["material_unit", "หน่วยวัสดุ", x => x.unit], ["material_quantity", "จำนวนวัสดุ", x => x.quantity], ["material_remark", "หมายเหตุวัสดุ", x => x.remark]]);
  columns("D", r.progress, [["zone", "พื้นที่ทำงาน", x => x.zone], ["category", "ประเภทงาน", x => x.category], ["description", "รายละเอียดงาน", x => x.description], ["quantity", "ปริมาณวันนี้", x => x.quantity], ["cumulative", "ปริมาณสะสม", x => x.cumulative]]);
  columns("E", r.issues, [["description", "รายละเอียดปัญหา", x => x.description], ["cause", "สาเหตุ", x => translateValue(t, x.cause)], ["impact", "ชั่วโมงผลกระทบ", x => x.impact_hours], ["responsible", "ผู้รับผิดชอบ", x => x.responsible], ["action", "การแก้ไข", x => x.action]]);
  columns("F", r.tomorrow, [["task", "งานพรุ่งนี้", x => x.task], ["manpower", "กำลังคนพรุ่งนี้", x => x.manpower], ["resources", "ทรัพยากรพรุ่งนี้", x => x.resources]]);
  return [
    { key: "B.table", label: "B · ตารางสภาพอากาศ", value: `${t.am}: ${t.sky[r.weather.am.sky]} · ${t.work[r.weather.am.status]}\n${t.pm}: ${t.sky[r.weather.pm.sky]} · ${t.work[r.weather.pm.status]}`, weatherTable: { am: r.weather.am, pm: r.weather.pm } },
    ...fields.map(([key, label, value]) => ({ key, label, value: value == null || value === "" ? "" : String(value) })),
    ...manpowerVariables("indirect", r.manpower.indirect),
    ...manpowerVariables("direct", r.manpower.direct, r.manpower.direct_columns),
    ...manpowerSummaryVariables("indirect", r.manpower.indirect),
    ...manpowerSummaryVariables("direct", r.manpower.direct, r.manpower.direct_columns),
    { key: "C.manpower.sum.total", label: "C · รวมทั้งหมดทุกประเภท", value: String(totals.registered) },
    { key: "C.manpower.sum.leave", label: "C · รวมขาด/ลาทุกประเภท", value: String(totals.registered - totals.total) },
    { key: "C.manpower.sum.present", label: "C · รวมมาทำงานทุกประเภท", value: String(totals.total) },
    { key: "C.manpower.sum.manHours", label: "C · ชั่วโมงงานรวม", value: String(Math.round(totals.manHours)) },
  ];
}
