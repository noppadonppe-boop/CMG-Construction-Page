// ข้อความบนหน้ารายงานประจำวัน 3 ภาษา (ไทย / English / 中文) — แปลเฉพาะป้ายกำกับและค่าที่เลือกจากรายการ
// ข้อความที่ผู้ใช้พิมพ์เอง (รายละเอียดงาน ชื่อบริษัท ฯลฯ) แสดงตามที่พิมพ์

import type { DailySectionKey } from "./daily-report-standard";
import type { EquipmentStatus, Sky, WorkStatus } from "./dcr";
import { formatDate, formatDateTime } from "./format";

export const REPORT_LANGS = { th: "ไทย", en: "English", zh: "中文" } as const;
export type ReportLang = keyof typeof REPORT_LANGS;
export const REPORT_LANG_KEYS = Object.keys(REPORT_LANGS) as ReportLang[];
export const normalizeReportLang = (v: unknown): ReportLang => (typeof v === "string" && v in REPORT_LANGS ? (v as ReportLang) : "th");

const LOCALE: Record<ReportLang, string> = { th: "th-TH", en: "en-GB", zh: "zh-CN" };
const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Dict = {
  title: string;
  subtitle: string;
  docNo: string;
  formStandard: string;
  sections: Record<DailySectionKey, { title: string; sub: string }>;
  projectName: string;
  projectNo: string;
  client: string;
  consultant: string;
  mainContractor: string;
  subcontractor: string;
  date: string;
  contractDay: string;
  location: string;
  workingHours: string;
  period: string;
  weather: string;
  workStatus: string;
  temp: string;
  rain: string;
  lostHours: string;
  siteCondition: string;
  am: string;
  pm: string;
  mm: string;
  hr: string;
  remark: string;
  sky: Record<Sky, string>;
  work: Record<WorkStatus, string>;
  equip: Record<EquipmentStatus, string>;
  /** ค่าที่เก็บเป็นข้อความไทย (สภาพพื้นที่ / สาเหตุปัญหา) → คำแปล */
  values: Record<string, string>;
  indirect: string;
  direct: string;
  position: string;
  total: string;
  present: string;
  absent: string;
  sum: string;
  equipment: string;
  equipCol: string;
  qty: string;
  equipStatus: string;
  vehicles: string;
  noEquipment: string;
  materials: string;
  item: string;
  unit: string;
  statIndirect: string;
  statDirect: string;
  statPresent: string;
  manHours: (hoursPerPerson: number) => string;
  people: string;
  noActivities: string;
  photo: string;
  today: string;
  cumulative: string;
  safety: string;
  quality: string;
  toolbox: string;
  incidents: string;
  nearMiss: string;
  inspections: string;
  none: string;
  noIssues: string;
  impact: string;
  action: string;
  responsible: string;
  noPlan: string;
  manpower: string;
  preparedBy: string;
  reviewedBy: string;
  acknowledged: string;
  roleEngineer: string;
  rolePM: string;
  roleClient: string;
  signed: string;
  dateBlank: string;
  noAttachments: string;
  pageOf: (n: number, total: number) => string;
  longDate: (iso: string) => string;
  shortDate: (iso: string) => string;
  dateTime: (iso: string) => string;
};

const th: Dict = {
  title: "รายงานประจำวันงานก่อสร้าง",
  subtitle: "DAILY CONSTRUCTION REPORT",
  docNo: "เลขที่เอกสาร",
  formStandard: "มาตรฐานแบบฟอร์ม",
  sections: {
    project: { title: "ข้อมูลโครงการ", sub: "Project information" },
    weather: { title: "รายงานสภาพอากาศ", sub: "Weather report" },
    manpower: { title: "กำลังคนและเครื่องจักร", sub: "Manpower & equipment on site" },
    activities: { title: "งานที่ดำเนินการวันนี้", sub: "Today's activities" },
    issues: { title: "ปัญหาและอุปสรรค", sub: "Problems & obstacles" },
    tomorrow: { title: "งานที่วางแผนวันพรุ่งนี้", sub: "Tomorrow's plan" },
    attachments: { title: "เอกสารแนบ / ภาพประกอบ", sub: "Attachments" },
    layout: { title: "เอกสารแนบ (จัดหน้า)", sub: "Attachment pages" },
  },
  projectName: "ชื่อโครงการ",
  projectNo: "เลขที่โครงการ",
  client: "ผู้ว่าจ้าง",
  consultant: "ที่ปรึกษา / PMC",
  mainContractor: "ผู้รับเหมาหลัก",
  subcontractor: "ผู้รับเหมาช่วง",
  date: "วันที่",
  contractDay: "วันตามสัญญา",
  location: "สถานที่",
  workingHours: "เวลาทำงาน",
  period: "ช่วงเวลา",
  weather: "สภาพอากาศ",
  workStatus: "สถานะการทำงาน",
  temp: "อุณหภูมิ สูง/ต่ำ",
  rain: "ปริมาณฝน",
  lostHours: "ชม. สูญเสีย",
  siteCondition: "สภาพพื้นที่",
  am: "เช้า 08:00–12:00",
  pm: "บ่าย 13:00–17:00",
  mm: "มม.",
  hr: "ชม.",
  remark: "หมายเหตุ",
  sky: { clear: "แจ่มใส", cloudy: "มีเมฆ", light_rain: "ฝนเล็กน้อย", heavy_rain: "ฝนหนัก", storm: "พายุ" },
  work: { workable: "ทำงานได้", partial: "ทำได้บางส่วน", stopped: "หยุดงาน" },
  equip: { working: "ใช้งาน", idle: "Standby", breakdown: "เสีย" },
  values: {},
  indirect: "กำลังคน Indirect (Staff)",
  direct: "กำลังคน Direct (Labor)",
  position: "ตำแหน่ง / ประเภท",
  total: "Total",
  present: "มาทำงาน",
  absent: "ขาด/ลา",
  sum: "รวม",
  equipment: "เครื่องจักรในไซต์ (Equipment on site)",
  equipCol: "เครื่องจักร / เจ้าของ",
  qty: "จำนวน",
  equipStatus: "สถานะทำงาน",
  vehicles: "คัน",
  noEquipment: "ไม่มีเครื่องจักรในวันนี้",
  materials: "วัสดุเข้าไซต์ (Material delivery)",
  item: "รายการ",
  unit: "หน่วย",
  statIndirect: "Indirect มาทำงาน / Total",
  statDirect: "Direct มาทำงาน / Total",
  statPresent: "รวมมาทำงาน",
  manHours: (h) => `ชั่วโมงงาน (${h} ชม./คน)`,
  people: "คน",
  noActivities: "ไม่มีการบันทึกงาน",
  photo: "รูป",
  today: "วันนี้",
  cumulative: "สะสม",
  safety: "ความปลอดภัย",
  quality: "คุณภาพ",
  toolbox: "Toolbox talk",
  incidents: "อุบัติเหตุ",
  nearMiss: "Near miss",
  inspections: "ตรวจงาน",
  none: "ไม่มี",
  noIssues: "ไม่มีปัญหาและอุปสรรค",
  impact: "กระทบ",
  action: "แนวทางแก้ไข",
  responsible: "ผู้รับผิดชอบ",
  noPlan: "ยังไม่มีแผนงาน",
  manpower: "กำลังคน",
  preparedBy: "จัดทำโดย",
  reviewedBy: "ตรวจสอบโดย",
  acknowledged: "รับทราบ",
  roleEngineer: "วิศวกรสนาม",
  rolePM: "ผู้จัดการโครงการ",
  roleClient: "ที่ปรึกษา / Client",
  signed: "✓ ลงนามในระบบ",
  dateBlank: "วันที่ ......../......../........",
  noAttachments: "ไม่มีเอกสารแนบ",
  pageOf: (n, total) => `หน้า ${n}/${total}`,
  longDate: (iso) => `${utcDate(iso).toLocaleDateString("th-TH", { weekday: "long", timeZone: "UTC" })} ${formatDate(iso)}`,
  shortDate: (iso) => formatDate(iso),
  dateTime: (iso) => formatDateTime(iso),
};

const en: Dict = {
  title: "DAILY CONSTRUCTION REPORT",
  subtitle: "รายงานประจำวันงานก่อสร้าง",
  docNo: "Doc. no.",
  formStandard: "Form standard",
  sections: {
    project: { title: "Project information", sub: "" },
    weather: { title: "Weather report", sub: "" },
    manpower: { title: "Manpower & equipment on site", sub: "" },
    activities: { title: "Today's activities", sub: "" },
    issues: { title: "Problems & obstacles", sub: "" },
    tomorrow: { title: "Tomorrow's plan", sub: "" },
    attachments: { title: "Attachments / Photos", sub: "" },
    layout: { title: "Attachment pages", sub: "" },
  },
  projectName: "Project Name",
  projectNo: "Project No.",
  client: "Client",
  consultant: "Consultant / PMC",
  mainContractor: "Main Contractor",
  subcontractor: "Subcontractor",
  date: "Date",
  contractDay: "Contract day",
  location: "Location",
  workingHours: "Working hours",
  period: "Period",
  weather: "Weather",
  workStatus: "Work status",
  temp: "Temp. high/low",
  rain: "Rainfall",
  lostHours: "Lost hours",
  siteCondition: "Site condition",
  am: "Morning 08:00–12:00",
  pm: "Afternoon 13:00–17:00",
  mm: "mm",
  hr: "hr",
  remark: "Remark",
  sky: { clear: "Clear", cloudy: "Cloudy", light_rain: "Light rain", heavy_rain: "Heavy rain", storm: "Storm" },
  work: { workable: "Workable", partial: "Partially workable", stopped: "Stopped" },
  equip: { working: "Working", idle: "Standby", breakdown: "Breakdown" },
  values: {
    "แห้ง / ปกติ": "Dry / normal",
    "เปียก": "Wet",
    "เป็นโคลน": "Muddy",
    "น้ำท่วมขัง": "Flooded",
    "สภาพอากาศ": "Weather",
    "วัสดุ": "Materials",
    "แบบ / RFI": "Drawings / RFI",
    "แรงงาน": "Labor",
    "เครื่องจักร": "Equipment",
    "เจ้าของงาน / ที่ปรึกษา": "Client / Consultant",
    "อื่น ๆ": "Others",
  },
  indirect: "Indirect Manpower (Staff)",
  direct: "Direct Manpower (Labor)",
  position: "Position / Trade",
  total: "Total",
  present: "Present",
  absent: "Absent",
  sum: "Total",
  equipment: "Equipment on site",
  equipCol: "Equipment / Owner",
  qty: "Qty",
  equipStatus: "Status",
  vehicles: "units",
  noEquipment: "No equipment today",
  materials: "Material delivery",
  item: "Item",
  unit: "Unit",
  statIndirect: "Indirect present / total",
  statDirect: "Direct present / total",
  statPresent: "Total present",
  manHours: (h) => `Man-hours (${h} hr/person)`,
  people: "persons",
  noActivities: "No activities recorded",
  photo: "Photo",
  today: "Today",
  cumulative: "Cumulative",
  safety: "Safety",
  quality: "Quality",
  toolbox: "Toolbox talk",
  incidents: "Incidents",
  nearMiss: "Near miss",
  inspections: "Inspections",
  none: "None",
  noIssues: "No problems or obstacles",
  impact: "Impact",
  action: "Action",
  responsible: "Responsible",
  noPlan: "No plan yet",
  manpower: "Manpower",
  preparedBy: "Prepared by",
  reviewedBy: "Reviewed by",
  acknowledged: "Acknowledged by",
  roleEngineer: "Site Engineer",
  rolePM: "Project Manager",
  roleClient: "Consultant / Client",
  signed: "✓ Signed in system",
  dateBlank: "Date ......../......../........",
  noAttachments: "No attachments",
  pageOf: (n, total) => `Page ${n}/${total}`,
  longDate: (iso) => utcDate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  shortDate: (iso) => utcDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  dateTime: (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
};

const zh: Dict = {
  title: "施工日报",
  subtitle: "DAILY CONSTRUCTION REPORT",
  docNo: "文件编号",
  formStandard: "表格标准",
  sections: {
    project: { title: "项目信息", sub: "Project information" },
    weather: { title: "天气报告", sub: "Weather report" },
    manpower: { title: "人力与现场设备", sub: "Manpower & equipment on site" },
    activities: { title: "今日施工内容", sub: "Today's activities" },
    issues: { title: "问题与障碍", sub: "Problems & obstacles" },
    tomorrow: { title: "明日施工计划", sub: "Tomorrow's plan" },
    attachments: { title: "附件 / 现场照片", sub: "Attachments" },
    layout: { title: "附件页（排版）", sub: "Attachment pages" },
  },
  projectName: "项目名称",
  projectNo: "项目编号",
  client: "业主",
  consultant: "监理 / 项目管理",
  mainContractor: "总承包商",
  subcontractor: "分包商",
  date: "日期",
  contractDay: "合同工期第几天",
  location: "地点",
  workingHours: "工作时间",
  period: "时段",
  weather: "天气",
  workStatus: "施工状态",
  temp: "最高/最低气温",
  rain: "降雨量",
  lostHours: "损失工时",
  siteCondition: "场地状况",
  am: "上午 08:00–12:00",
  pm: "下午 13:00–17:00",
  mm: "毫米",
  hr: "小时",
  remark: "备注",
  sky: { clear: "晴", cloudy: "多云", light_rain: "小雨", heavy_rain: "大雨", storm: "暴风雨" },
  work: { workable: "可施工", partial: "部分施工", stopped: "停工" },
  equip: { working: "使用中", idle: "待命", breakdown: "故障" },
  values: {
    "แห้ง / ปกติ": "干燥 / 正常",
    "เปียก": "潮湿",
    "เป็นโคลน": "泥泞",
    "น้ำท่วมขัง": "积水",
    "สภาพอากาศ": "天气",
    "วัสดุ": "材料",
    "แบบ / RFI": "图纸 / RFI",
    "แรงงาน": "劳动力",
    "เครื่องจักร": "机械设备",
    "เจ้าของงาน / ที่ปรึกษา": "业主 / 监理",
    "อื่น ๆ": "其他",
  },
  indirect: "间接人员 (管理人员)",
  direct: "直接人员 (工人)",
  position: "职位 / 工种",
  total: "总数",
  present: "出勤",
  absent: "缺勤",
  sum: "合计",
  equipment: "现场设备",
  equipCol: "设备 / 所属单位",
  qty: "数量",
  equipStatus: "运行状态",
  vehicles: "台",
  noEquipment: "今日无设备",
  materials: "进场材料",
  item: "材料名称",
  unit: "单位",
  statIndirect: "间接人员 出勤/总数",
  statDirect: "直接人员 出勤/总数",
  statPresent: "出勤合计",
  manHours: (h) => `工时 (${h} 小时/人)`,
  people: "人",
  noActivities: "无施工记录",
  photo: "照片",
  today: "今日",
  cumulative: "累计",
  safety: "安全",
  quality: "质量",
  toolbox: "班前安全会",
  incidents: "事故",
  nearMiss: "未遂事件",
  inspections: "检查验收",
  none: "无",
  noIssues: "无问题与障碍",
  impact: "影响",
  action: "解决措施",
  responsible: "负责人",
  noPlan: "暂无计划",
  manpower: "人力",
  preparedBy: "编制",
  reviewedBy: "审核",
  acknowledged: "确认",
  roleEngineer: "现场工程师",
  rolePM: "项目经理",
  roleClient: "监理 / 业主",
  signed: "✓ 已在系统签署",
  dateBlank: "日期 ......../......../........",
  noAttachments: "无附件",
  pageOf: (n, total) => `第 ${n}/${total} 页`,
  longDate: (iso) => utcDate(iso).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }),
  shortDate: (iso) => utcDate(iso).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  dateTime: (iso) => new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
};

export const DCR_TEXT: Record<ReportLang, Dict> = { th, en, zh };
export const reportLocale = (lang: ReportLang) => LOCALE[lang];
/** แปลค่าที่เก็บเป็นข้อความไทย — ไม่มีคำแปล (เช่น ผู้ใช้พิมพ์เอง) แสดงตามเดิม */
export const translateValue = (t: Dict, value: string) => t.values[value] ?? value;
