import fs from "fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export interface ReportPdfInput {
  html: string;
  htmlClass: string;
  bodyClass: string;
  lang: string;
  baseUrl: string;
  stylesheets: string[];
  inlineStyles: string[];
}

const LOCAL_CHROME_PATHS = [
  process.env.CHROME_PATH?.trim(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((value): value is string => Boolean(value));

// โฮสต์ที่เบราว์เซอร์ฝั่ง server เปิดได้ตอนเรนเดอร์ — ปิดทางอื่นเพื่อกัน SSRF
const ASSET_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com", "fonts.googleapis.com", "fonts.gstatic.com"]);

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

async function launchBrowser() {
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) {
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
  }
  const executablePath = LOCAL_CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error("ไม่พบ Chrome สำหรับสร้าง PDF ในเครื่อง — ตั้งค่า CHROME_PATH ใน .env");
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
}

/** เรนเดอร์ HTML ของรายงานเป็น PDF ด้วยสไตล์พิมพ์ (@media print / @page) เดียวกับปุ่มพิมพ์ในหน้ารายงาน */
export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const origin = new URL(input.baseUrl).origin;
  const sameOriginStyles = input.stylesheets.filter((href) => {
    try {
      return new URL(href).origin === origin;
    } catch {
      return false;
    }
  });
  const html = `<!doctype html><html lang="${attr(input.lang)}" class="${attr(input.htmlClass)}"><head><meta charset="utf-8"><base href="${attr(origin)}/">${sameOriginStyles
    .map((href) => `<link rel="stylesheet" href="${attr(href)}">`)
    .join("")}${input.inlineStyles.map((css) => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`).join("")}</head><body class="${attr(input.bodyClass)}">${input.html.replace(/\sloading="lazy"/g, "")}</body></html>`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) return void request.continue();
      try {
        const parsed = new URL(url);
        if (parsed.origin === origin || ASSET_HOSTS.has(parsed.hostname)) return void request.continue();
      } catch {
        // ตกไป abort
      }
      void request.abort();
    });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 }).catch(() => {});
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
