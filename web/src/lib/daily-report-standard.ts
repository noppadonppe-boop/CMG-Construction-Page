/** รูปแบบรายงานประจำวันในระบบ — แยกจากเอกสาร/ไฟล์มาตรฐานทั่วไป */
export const DAILY_REPORT_TEMPLATE_KEY = "construction-dcr-v1" as const;

export type DailyReportStandardSnapshot = {
  id: string;
  code: string;
  name: string;
  rev: string;
  template: typeof DAILY_REPORT_TEMPLATE_KEY;
};

/** หัวข้อในมาตรฐาน DCR ที่อ้างอิงจากรูปแบบรายงานไซต์งานที่แนบมา */
export const DAILY_REPORT_STANDARD_SECTIONS = [
  { number: "01", title: "ข้อมูลโครงการและเวลาทำงาน", detail: "โครงการ ผู้เกี่ยวข้อง สถานที่ วันที่ และเวลาเข้างาน" },
  { number: "02", title: "สภาพอากาศและสภาพหน้างาน", detail: "เช้า–บ่าย อุณหภูมิ ปริมาณฝน และเวลาที่สูญเสีย" },
  { number: "03", title: "กำลังคน", detail: "บุคลากร Staff และแรงงาน Direct labor พร้อมชั่วโมงงานรวม" },
  { number: "04", title: "เครื่องจักรและวัสดุเข้าไซต์", detail: "ชั่วโมงใช้งาน/ว่าง สถานะ และผลตรวจรับวัสดุ" },
  { number: "05", title: "ความคืบหน้างาน", detail: "พื้นที่ หมวดงาน ปริมาณวันนี้ ยอดสะสม และภาพประกอบ" },
  { number: "06", title: "ความปลอดภัยและคุณภาพ", detail: "Toolbox talk อุบัติเหตุ Near miss การตรวจงาน และ NCR" },
  { number: "07", title: "ประเด็นที่ต้องติดตาม", detail: "ปัญหา สาเหตุ ผลกระทบ ผู้รับผิดชอบ และแนวทางแก้ไข" },
  { number: "08", title: "แผนงานพรุ่งนี้", detail: "งาน กำลังคน และทรัพยากร/การขอตรวจที่ต้องเตรียม" },
  { number: "09", title: "การลงนามและส่งรายงาน", detail: "จัดทำ ตรวจสอบ และรับทราบในระบบ" },
] as const;
