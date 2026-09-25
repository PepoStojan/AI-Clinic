import "server-only";

import { chromium } from "playwright";

// PDF-001: single Playwright responsibility -- render one HTML string to
// an A4 portrait PDF buffer. No content decisions here; the HTML it
// receives is already the complete, final document.

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
