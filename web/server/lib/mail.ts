import nodemailer from "nodemailer";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const transporter = nodemailer.createTransport({
  host: getRequiredEnv("SMTP_HOST"),
  port: Number(getRequiredEnv("SMTP_PORT")),
  secure: getRequiredEnv("SMTP_SECURE") === "true",
  auth: {
    user: getRequiredEnv("SMTP_USER"),
    pass: getRequiredEnv("SMTP_PASS"),
  },
});

export const mailFrom = getRequiredEnv("MAIL_FROM");

export async function verifyMailer() {
  await transporter.verify();
}
