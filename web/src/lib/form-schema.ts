/** โครงสร้างแบบฟอร์มดิจิทัลที่ผู้ดูแลออกแบบได้จากหน้า "เพิ่มแบบฟอร์ม" */
export const FORM_FIELD_TYPES = {
  text: { label: "ข้อความสั้น", icon: "T" },
  textarea: { label: "ข้อความหลายบรรทัด", icon: "¶" },
  number: { label: "ตัวเลข", icon: "#" },
  date: { label: "วันที่", icon: "ปฏิทิน" },
  time: { label: "เวลา", icon: "นาฬิกา" },
  select: { label: "ตัวเลือก", icon: "รายการ" },
  checkbox: { label: "ช่องทำเครื่องหมาย", icon: "✓" },
  table: { label: "ตารางรายการ", icon: "ตาราง" },
  photo: { label: "รูปภาพ", icon: "รูป" },
  signature: { label: "ลายเซ็น", icon: "เซ็น" },
} as const;

export type FormFieldType = keyof typeof FORM_FIELD_TYPES;

export type DigitalFormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  unit?: string;
  options?: string[];
  columns?: string[];
};

export type DigitalFormSection = {
  id: string;
  title: string;
  description: string;
  fields: DigitalFormField[];
};

export type DigitalFormSchema = {
  version: 1;
  sections: DigitalFormSection[];
};

export const FORM_FIELD_TYPE_KEYS = Object.keys(FORM_FIELD_TYPES) as FormFieldType[];

export function newFormElementId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const field = (id: string, label: string, type: FormFieldType, extra: Partial<DigitalFormField> = {}): DigitalFormField => ({
  id,
  label,
  type,
  required: false,
  ...extra,
});

/** แบบตั้งต้นจาก Daily Report ที่แนบมา ผู้ใช้แก้ไขต่อได้ทุกส่วน */
export function dailyReportFormSchema(): DigitalFormSchema {
  return {
    version: 1,
    sections: [
      {
        id: "dcr-project",
        title: "ข้อมูลโครงการและเวลาทำงาน",
        description: "โครงการ ผู้เกี่ยวข้อง สถานที่ วันที่ และเวลาทำงาน",
        fields: [
          field("project-name", "ชื่อโครงการ", "text", { required: true, placeholder: "ระบุชื่อโครงการ" }),
          field("report-date", "วันที่รายงาน", "date", { required: true }),
          field("report-number", "เลขที่รายงาน", "text", { placeholder: "เช่น DR-180" }),
          field("working-hours", "เวลาทำงาน / OT", "text", { placeholder: "เช่น 08:00–17:00" }),
        ],
      },
      {
        id: "dcr-weather",
        title: "สภาพอากาศและสภาพหน้างาน",
        description: "สภาพอากาศ อุณหภูมิ ปริมาณฝน และเวลาที่สูญเสีย",
        fields: [
          field("sky", "สภาพอากาศ", "select", { options: ["Clear / แจ่มใส", "Cloudy / มีเมฆ", "Rain / ฝนตก", "Storm / พายุ"] }),
          field("temperature", "อุณหภูมิ", "number", { unit: "°C" }),
          field("rainfall", "ปริมาณฝน", "number", { unit: "mm" }),
          field("site-condition", "สภาพหน้างาน / เวลาที่สูญเสีย", "textarea"),
        ],
      },
      {
        id: "dcr-manpower",
        title: "กำลังคน",
        description: "บุคลากร Staff และแรงงาน Direct labor พร้อมชั่วโมงงานรวม",
        fields: [
          field("manpower", "รายการกำลังคน", "table", { columns: ["ประเภทแรงงาน", "Main", "Sub", "รวม", "ชั่วโมงงาน"] }),
        ],
      },
      {
        id: "dcr-equipment-material",
        title: "เครื่องจักรและวัสดุเข้าไซต์",
        description: "สถานะเครื่องจักร ชั่วโมงใช้งาน และผลตรวจรับวัสดุ",
        fields: [
          field("equipment", "เครื่องจักร / อุปกรณ์", "table", { columns: ["รายการ", "เมื่อวาน", "วันนี้", "รวม", "สถานะ"] }),
          field("materials", "วัสดุที่ส่งเข้าไซต์", "table", { columns: ["วัสดุ", "ผู้ส่ง", "จำนวน", "หน่วย", "ผลตรวจรับ"] }),
        ],
      },
      {
        id: "dcr-progress",
        title: "ความคืบหน้างาน",
        description: "พื้นที่ หมวดงาน ปริมาณวันนี้ ยอดสะสม และภาพประกอบ",
        fields: [
          field("progress-items", "รายการความคืบหน้า", "table", { required: true, columns: ["พื้นที่ / หมวดงาน", "รายละเอียด", "วันนี้", "หน่วย", "สะสม", "%"] }),
          field("progress-photos", "ภาพความคืบหน้า", "photo"),
        ],
      },
      {
        id: "dcr-safety-quality",
        title: "ความปลอดภัยและคุณภาพ",
        description: "Toolbox talk อุบัติเหตุ Near miss การตรวจงาน และ NCR",
        fields: [
          field("toolbox-talk", "จัด Toolbox talk แล้ว", "checkbox"),
          field("accidents", "จำนวนอุบัติเหตุ", "number", { unit: "ครั้ง" }),
          field("near-miss", "จำนวน Near miss", "number", { unit: "ครั้ง" }),
          field("inspection-ncr", "ผลตรวจงาน / NCR", "textarea"),
        ],
      },
      {
        id: "dcr-issues",
        title: "ประเด็นที่ต้องติดตาม",
        description: "ปัญหา สาเหตุ ผลกระทบ ผู้รับผิดชอบ และแนวทางแก้ไข",
        fields: [
          field("issues", "รายการปัญหาและการติดตาม", "table", { columns: ["ประเด็น", "สาเหตุ / ผลกระทบ", "ผู้รับผิดชอบ", "กำหนดเสร็จ", "สถานะ"] }),
        ],
      },
      {
        id: "dcr-tomorrow",
        title: "แผนงานพรุ่งนี้",
        description: "งาน กำลังคน ทรัพยากร และการขอตรวจที่ต้องเตรียม",
        fields: [
          field("tomorrow-plan", "รายการแผนงานพรุ่งนี้", "table", { columns: ["งาน / พื้นที่", "กำลังคน", "ทรัพยากร", "ผู้รับผิดชอบ", "หมายเหตุ"] }),
        ],
      },
      {
        id: "dcr-signatures",
        title: "การลงนามและส่งรายงาน",
        description: "ผู้จัดทำ ผู้ตรวจสอบ และผู้รับทราบ",
        fields: [
          field("prepared-by", "ผู้จัดทำ", "signature", { required: true }),
          field("reviewed-by", "ผู้ตรวจสอบ", "signature"),
          field("acknowledged-by", "ผู้รับทราบ", "signature"),
        ],
      },
    ],
  };
}

export function blankDigitalFormSchema(): DigitalFormSchema {
  return {
    version: 1,
    sections: [{ id: newFormElementId("section"), title: "หมวดที่ 1", description: "", fields: [] }],
  };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean).slice(0, 30) : undefined;
}

function isFieldType(value: unknown): value is FormFieldType {
  return typeof value === "string" && FORM_FIELD_TYPE_KEYS.includes(value as FormFieldType);
}

/** ป้องกันข้อมูล schema ที่เก่าหรือถูกแก้ไขผิดรูปแบบใน Firestore ทำให้หน้าอ่านต่อได้ */
export function normalizeDigitalFormSchema(value: unknown): DigitalFormSchema | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { sections?: unknown };
  if (!Array.isArray(raw.sections)) return null;
  const sections = raw.sections.slice(0, 30).flatMap((sectionValue, sectionIndex) => {
    if (!sectionValue || typeof sectionValue !== "object") return [];
    const section = sectionValue as { id?: unknown; title?: unknown; description?: unknown; fields?: unknown };
    const fields = Array.isArray(section.fields)
      ? section.fields.slice(0, 50).flatMap((fieldValue, fieldIndex) => {
          if (!fieldValue || typeof fieldValue !== "object") return [];
          const rawField = fieldValue as Record<string, unknown>;
          const type = isFieldType(rawField.type) ? rawField.type : "text";
          const label = cleanString(rawField.label) || `ฟิลด์ที่ ${fieldIndex + 1}`;
          return [{
            id: cleanString(rawField.id) || `field-${sectionIndex + 1}-${fieldIndex + 1}`,
            label,
            type,
            required: rawField.required === true,
            placeholder: cleanString(rawField.placeholder) || undefined,
            unit: cleanString(rawField.unit) || undefined,
            options: cleanList(rawField.options),
            columns: cleanList(rawField.columns),
          } satisfies DigitalFormField];
        })
      : [];
    return [{
      id: cleanString(section.id) || `section-${sectionIndex + 1}`,
      title: cleanString(section.title) || `หมวดที่ ${sectionIndex + 1}`,
      description: cleanString(section.description),
      fields,
    } satisfies DigitalFormSection];
  });
  return { version: 1, sections };
}
