import "server-only";

import { getLatestReport, updateReport, type ReportRow } from "../supabase/repositories/reports";
import { uploadReportPdf } from "../supabase/storage";
import type { CanonicalReport } from "../report/types";
import { buildReportHtml } from "./html-template";
import { renderHtmlToPdf } from "./render-pdf";

export class PdfGenerationBlockedError extends Error {
  constructor(public readonly blockingReasons: string[]) {
    super(`PDF generation blocked: ready_for_pdf is not true (${blockingReasons.length} blocking reason(s)).`);
    this.name = "PdfGenerationBlockedError";
  }
}

function storagePathFor(auditId: string): string {
  // Deterministic, one path per audit -- a regenerate always overwrites
  // the same object (uploadReportPdf uses upsert: true) rather than
  // creating an uncontrolled duplicate file.
  return `${auditId}/report.pdf`;
}

/**
 * Generates the PDF for an audit's current report row, using ONLY
 * reports.canonical_report_json as content input (Build Spec section 25
 * -- the renderer must never query component_results/grouped_gaps/
 * checklist_items/provider APIs directly). Blocks deterministically when
 * ready_for_pdf !== true, without ever attempting to render.
 */
export async function runPdfGeneration(auditId: string): Promise<ReportRow> {
  const report = await getLatestReport(auditId);
  if (!report) {
    throw new Error(`runPdfGeneration failed: no report found for audit ${auditId}.`);
  }

  if (report.ready_for_pdf !== true) {
    throw new PdfGenerationBlockedError((report.blocking_reasons as string[]) ?? []);
  }

  await updateReport(report.id, { status: "GENERATING" });

  try {
    const canonicalReport = report.canonical_report_json as unknown as CanonicalReport;
    const html = buildReportHtml(canonicalReport);
    const pdf = await renderHtmlToPdf(html);
    const storagePath = storagePathFor(auditId);

    await uploadReportPdf(storagePath, pdf);

    return await updateReport(report.id, {
      status: "GENERATED",
      pdf_storage_path: storagePath,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    await updateReport(report.id, { status: "FAILED" }).catch(() => {
      // Best-effort -- if even this write fails, surface the original error below.
    });
    throw error;
  }
}
