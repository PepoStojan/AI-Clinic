import "server-only";

import { getAuditById } from "../supabase/repositories/audits";
import { listAuditTargetsByAuditId } from "../supabase/repositories/audit-targets";
import { listComponentResultsByAuditId } from "../supabase/repositories/component-results";
import { listChecklistItemsByAuditId } from "../supabase/repositories/checklist-items";
import { listGroupedGapsByAuditId } from "../supabase/repositories/grouped-gaps";
import { getLatestReport, upsertReportForAudit, type ReportRow } from "../supabase/repositories/reports";
import { assembleCanonicalReport } from "./assemble";
import { runPreFlightChecklist } from "./pre-pdf-gate";
import type { Database } from "../supabase/database.types";

/**
 * Builds the canonical report object for an audit, runs the pre-PDF hard
 * gate against it, and persists both to the `reports` table -- rerun-safe
 * (updates the same logical report row rather than creating a new one;
 * see upsertReportForAudit).
 */
export async function runReportAssembly(auditId: string): Promise<ReportRow> {
  const audit = await getAuditById(auditId);
  if (!audit) {
    throw new Error(`runReportAssembly failed: no audit found for id ${auditId}`);
  }

  const [targets, componentResults, checklistItems, groupedGaps, existingReport] = await Promise.all([
    listAuditTargetsByAuditId(auditId),
    listComponentResultsByAuditId(auditId),
    listChecklistItemsByAuditId(auditId),
    listGroupedGapsByAuditId(auditId),
    getLatestReport(auditId),
  ]);

  const reportVersion = existingReport?.report_version ?? 1;

  const report = assembleCanonicalReport({ audit, targets, componentResults, groupedGaps, reportVersion });
  const gate = runPreFlightChecklist({ report, checklistItems, targets });

  report.metadata.ready_for_pdf = gate.readyForPdf;
  report.metadata.blocking_reasons = gate.blockingReasons;

  return upsertReportForAudit(auditId, {
    canonical_report_json: report as unknown as Database["public"]["Tables"]["reports"]["Insert"]["canonical_report_json"],
    pre_pdf_checklist_json: gate.checklist as unknown as Database["public"]["Tables"]["reports"]["Insert"]["pre_pdf_checklist_json"],
    ready_for_pdf: gate.readyForPdf,
    blocking_reasons: gate.blockingReasons as unknown as Database["public"]["Tables"]["reports"]["Insert"]["blocking_reasons"],
    status: gate.readyForPdf ? "READY" : "DRAFT",
  });
}
