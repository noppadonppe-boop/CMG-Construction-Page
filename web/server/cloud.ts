import { onRequest } from "firebase-functions/v2/https";
export const smtpMail = onRequest({ region: "asia-southeast1", secrets: ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"], maxInstances: 3, timeoutSeconds: 60 }, async (req, res) => {
  const { app } = await import("./index");
  app(req, res);
});
