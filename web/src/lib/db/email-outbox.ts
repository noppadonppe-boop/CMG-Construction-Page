"use client";

import {
  manpowerTotals,
  reportDocNo,
  SKY_ICON,
  summarizeWeather,
  type DcrData,
  type DcrSettings,
} from "../dcr";
import { formatDate } from "../format";
import type { ProjectRecord } from "./projects";
import { DEFAULT_EMAIL_SUBJECT, type EmailSetup } from "./email-setup";
import { currentUserIdToken } from "../firebase/client";

/** รูปแบบไฟล์แนบที่ส่งต่อให้ backend SMTP */
export interface EmailOutboxAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

/** ภาพนิ่งของเอกสารรายงานที่แสดงอยู่ — backend นำไปเรนเดอร์เป็น PDF ด้วยสไตล์พิมพ์เดียวกับปุ่มพิมพ์ */
export interface ReportPdfSnapshot {
  filename: string;
  html: string;
  htmlClass: string;
  bodyClass: string;
  lang: string;
  baseUrl: string;
  stylesheets: string[];
  inlineStyles: string[];
}

export function captureReportPdf(element: HTMLElement, filename: string): ReportPdfSnapshot {
  return {
    filename,
    html: element.outerHTML,
    htmlClass: document.documentElement.className,
    bodyClass: document.body.className,
    lang: element.getAttribute("lang") || document.documentElement.lang || "th",
    baseUrl: window.location.origin,
    stylesheets: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.href),
    inlineStyles: Array.from(document.querySelectorAll("style")).map((s) => s.textContent || "").filter(Boolean),
  };
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function replaceSubject(subject: string, project: ProjectRecord, report: DcrData, date: string) {
  const code = report.report_no ? reportDocNo(report, project.code) : project.code;
  return subject
    .replaceAll("{code}", code)
    .replaceAll("{project}", project.name)
    .replaceAll("{date}", date);
}

function reportLink(projectId: string, date: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/daily-reports/${encodeURIComponent(projectId)}/${encodeURIComponent(date)}`;
}

function buildEmailContent({ project, settings, report, date, includeReportLink }: { project: ProjectRecord; settings: DcrSettings; report: DcrData; date: string; includeReportLink: boolean }) {
  const code = report.report_no ? reportDocNo(report, project.code) : project.code;
  const totals = manpowerTotals(report.manpower);
  const weather = summarizeWeather(report.weather);
  const done = report.progress
    .map((item) => [item.zone, item.category, item.description].filter(Boolean).join(" · "))
    .filter(Boolean);
  const issues = report.issues.map((item) => item.description).filter(Boolean);
  const tomorrow = report.tomorrow.map((item) => item.task).filter(Boolean);
  const link = reportLink(project.id, date);
  const weatherText = weather === "rain" ? "ฝนตก" : weather === "cloudy" ? "มีเมฆ" : "แจ่มใส";
  const subjectProject = settings.project_name || project.name;
  const title = `${code} · ${subjectProject}`;

  const rows = [
    ["โครงการ", subjectProject],
    ["วันที่รายงาน", formatDate(date)],
    ["สภาพอากาศ", `${SKY_ICON[report.weather.am.sky]} ${weatherText}`],
    ["กำลังคน", `${totals.total} คน (ลงทะเบียน ${totals.registered} คน)`],
    ["ชั่วโมงสูญเสีย", `${report.weather.lost_hours || 0} ชั่วโมง`],
  ];
  const rowHtml = rows
    .map(([label, value]) => `<tr><th style="padding:8px 12px;text-align:left;color:#5b6b80;width:150px">${escapeHtml(label)}</th><td style="padding:8px 12px">${escapeHtml(value)}</td></tr>`)
    .join("");
  const listHtml = (items: string[], empty = "ไม่มีข้อมูล") =>
    items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p style="color:#5b6b80">${empty}</p>`;
  const textList = (items: string[], empty = "ไม่มีข้อมูล") => (items.length ? items.map((item) => `- ${item}`).join("\n") : empty);

  const text = [
    title,
    `วันที่: ${formatDate(date)}`,
    `สภาพอากาศ: ${weatherText}`,
    `กำลังคน: ${totals.total} คน (ลงทะเบียน ${totals.registered} คน)`,
    `ชั่วโมงสูญเสีย: ${report.weather.lost_hours || 0} ชั่วโมง`,
    "",
    "งานที่ทำวันนี้:",
    textList(done),
    "",
    "ปัญหาและอุปสรรค:",
    textList(issues),
    "",
    "แผนงานพรุ่งนี้:",
    textList(tomorrow),
    "",
    ...(includeReportLink ? [`เปิดรายงาน: ${link}`] : []),
  ].join("\n");

  const html = `
    <div style="font-family:Arial,'Noto Sans Thai',sans-serif;color:#0f1b2d;line-height:1.55;max-width:720px">
      <h2 style="margin:0 0 4px">${escapeHtml(title)}</h2>
      <p style="margin:0 0 16px;color:#5b6b80">รายงานประจำวัน · ${escapeHtml(formatDate(date))}</p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #d9e0e8">${rowHtml}</table>
      <h3>งานที่ทำวันนี้</h3>${listHtml(done)}
      <h3>ปัญหาและอุปสรรค</h3>${listHtml(issues)}
      <h3>แผนงานพรุ่งนี้</h3>${listHtml(tomorrow)}
      ${includeReportLink ? `<p style="margin-top:20px"><a href="${escapeHtml(link)}" style="background:#1769aa;color:white;padding:10px 16px;border-radius:6px;text-decoration:none">เปิดรายงานใน CMG Project Hub</a></p>` : ""}
      <p style="font-size:12px;color:#5b6b80">อีเมลนี้ถูกส่งจากคิวกลางของระบบ CMG Project Hub</p>
    </div>`;

  return { subject: title, text, html, link };
}

/** ส่งรายงานผ่าน backend SMTP — ค่า SMTP ไม่ถูกส่งมาที่ browser */
export async function sendDailyReportEmail({
  project,
  settings,
  report,
  date,
  setup,
  pdf,
}: {
  project: ProjectRecord;
  settings: DcrSettings;
  report: DcrData;
  date: string;
  setup: EmailSetup;
  /** ภาพนิ่งของรายงาน — แนบเป็น PDF เมื่อ setup.attach_report_pdf เปิดอยู่ */
  pdf?: ReportPdfSnapshot;
}) {
  const contacts = new Map(setup.contacts.map((contact) => [contact.id, contact.email.trim().toLowerCase()]));
  const resolveEmails = (ids: string[]) => ids.map((id) => contacts.get(id)).filter((email): email is string => Boolean(email));
  const to = [...new Set(resolveEmails(setup.to))];
  const cc = [...new Set(resolveEmails(setup.cc))].filter((email) => !to.includes(email));
  if (to.length === 0) throw new Error("ยังไม่ได้ตั้งค่าผู้รับอีเมลใน Setup Email");

  const content = buildEmailContent({ project, settings, report, date, includeReportLink: true });
  const photos = report.progress.flatMap((item) => item.photos).filter((photo) => photo.url).slice(0, 10);
  const savedAttachments: EmailOutboxAttachment[] = setup.files
    .filter((file) => file.url)
    .map((file) => ({ filename: file.file_name, path: file.url }));
  const photoAttachments: EmailOutboxAttachment[] = setup.attach_photos
    ? photos.map((photo, index) => ({ filename: `daily-report-${date}-${index + 1}.jpg`, path: photo.url, contentType: "image/jpeg" }))
    : [];
  const attachments = [...savedAttachments, ...photoAttachments].slice(0, 20);

  const apiBaseUrl = (process.env.NODE_ENV === "production" ? "" : (process.env.NEXT_PUBLIC_MAIL_API_URL || "http://localhost:3001")).replace(/\/+$/, "");
  const idToken = await currentUserIdToken();
  const response = await fetch(`${apiBaseUrl}/api/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      projectId: project.id,
      to,
      ...(cc.length ? { cc } : {}),
      subject: replaceSubject(setup.subject_mode === "system" ? DEFAULT_EMAIL_SUBJECT : setup.subject, project, report, date),
      text: content.text,
      html: content.html,
      ...(attachments.length ? { attachments } : {}),
      ...(setup.attach_report_pdf && pdf ? { pdf } : {}),
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    messageId?: string;
    recipients?: number;
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `Email backend returned HTTP ${response.status}`);
  }

  return {
    id: result.messageId || "sent",
    recipients: result.recipients ?? to.length + cc.length,
    link: content.link,
  };
}
