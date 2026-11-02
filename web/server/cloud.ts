import { onRequest } from "firebase-functions/v2/https";
// สร้าง PDF ด้วย headless Chromium จึงต้องใช้หน่วยความจำและเวลามากกว่าการส่งเมลอย่างเดียว
export const smtpMail = onRequest({ region: "asia-southeast1", secrets: ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"], maxInstances: 3, memory: "2GiB", timeoutSeconds: 120 }, async (req, res) => {
  const { app } = await import("./index");
  app(req, res);
});
