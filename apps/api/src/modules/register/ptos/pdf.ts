import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import QRCode from "qrcode";

const TEMPLATE_PATH = join(fileURLToPath(import.meta.url), "../../pto-template.html");

export interface PTOPDFData {
  ptoId: string;
  councilName: string;
  residentName: string;
  residentId: string;
  standAddress: string;
  standRef: string;
  allocationDate: string;
  verificationUrl: string;
}

export async function generatePTOPDF(data: PTOPDFData): Promise<Buffer> {
  const template = readFileSync(TEMPLATE_PATH, "utf-8");

  const qrCodeDataUrl = await QRCode.toDataURL(data.verificationUrl, {
    width: 180,
    margin: 1,
  });

  const html = template
    .replace(/\{\{ptoId\}\}/g, data.ptoId)
    .replace(/\{\{councilName\}\}/g, data.councilName)
    .replace(/\{\{residentName\}\}/g, data.residentName)
    .replace(/\{\{residentId\}\}/g, data.residentId)
    .replace(/\{\{standAddress\}\}/g, data.standAddress)
    .replace(/\{\{standRef\}\}/g, data.standRef)
    .replace(/\{\{allocationDate\}\}/g, data.allocationDate)
    .replace(/\{\{verificationUrl\}\}/g, data.verificationUrl)
    .replace(/\{\{qrCodeDataUrl\}\}/g, qrCodeDataUrl);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfUint8 = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdfUint8);
  } finally {
    await browser.close();
  }
}
