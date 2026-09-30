"use server";

import { revalidatePath } from "next/cache";
import { getAuditById, softDeleteAudit, updateAuditStatus } from "@/lib/supabase/repositories/audits";
import { triggerAuditPipeline, triggerPdfRegeneration } from "@/lib/trigger/run-audit-client";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { isTerminalAuditStatus } from "@/lib/audit/constants";

export async function retryQueueAction(auditId: string): Promise<{ success: boolean; error?: string }> {
  // AUDIT-DELETE-001B: existence check BEFORE enqueueing -- triggerAuditPipeline
  // has no audit lookup of its own, so without this a deleted audit's
  // Trigger.dev task could still be enqueued (getAuditById already excludes
  // deleted_at IS NOT NULL rows, so this doubles as the deleted-audit guard).
  const audit = await getAuditById(auditId);
  if (!audit) return { success: false, error: "Audit not found." };

  try {
    await triggerAuditPipeline(auditId);
    await updateAuditStatus(auditId, "QUEUED");
    revalidatePath(`/audits/${auditId}`);
    return { success: true };
  } catch (error) {

    console.error(`[retry-queue] failed to queue audit ${auditId}:`, error);
    return { success: false, error: "Could not start the audit run. Please try again." };
  }
}

/** Re-runs the whole pipeline for an audit that ended BLOCKED/PARTIAL/FAILED. */
export async function retryAuditAction(auditId: string): Promise<{ success: boolean; error?: string }> {
  const audit = await getAuditById(auditId);
  if (!audit) return { success: false, error: "Audit not found." };

  try {
    await triggerAuditPipeline(auditId);
    await updateAuditStatus(auditId, "QUEUED");
    revalidatePath(`/audits/${auditId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Could not restart the audit. Please try again." };
  }
}

export async function regeneratePdfAction(auditId: string): Promise<{ success: boolean; error?: string }> {
  // AUDIT-DELETE-001B: getLatestReport() queries `reports` directly and has
  // no knowledge of deleted_at -- without this check a deleted audit's PDF
  // could still be regenerated (and thus re-downloadable) via this action.
  const audit = await getAuditById(auditId);
  if (!audit) return { success: false, error: "Audit not found." };

  const report = await getLatestReport(auditId);
  if (!report || !report.ready_for_pdf) {
    return { success: false, error: "Report is not ready for PDF generation." };
  }
  try {
    // Via Trigger.dev (never in-process here) -- Playwright must not run
    // inside a Vercel Server Action. Also skips re-running the 5
    // components: regenerating a PDF should never re-spend provider
    // budget on already-confirmed findings.
    await triggerPdfRegeneration(auditId);
    revalidatePath(`/audits/${auditId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Could not start PDF regeneration." };
  }
}

export type DeleteAuditResult = { success: true } | { success: false; error: string };

/**
 * AUDIT-DELETE-001B: soft-deletes a terminal-status audit. Server-side
 * double-checks status (never trusts the UI's snapshot): a pre-check here
 * gives a clear, specific error message, and softDeleteAudit()'s own
 * atomic conditional UPDATE is the actual source of truth/safety net
 * regardless of what this pre-check saw.
 */
export async function deleteAuditAction(auditId: string): Promise<DeleteAuditResult> {
  if (!auditId) return { success: false, error: "Invalid audit id." };

  const audit = await getAuditById(auditId);
  if (!audit) return { success: false, error: "Audit not found." };
  if (!isTerminalAuditStatus(audit.status)) {
    return { success: false, error: "This audit is still in progress and can't be deleted yet." };
  }

  let deleted;
  try {
    deleted = await softDeleteAudit(auditId);
  } catch {
    return { success: false, error: "Could not delete the audit. Please try again." };
  }

  if (!deleted) {
    // Raced: deleted or its status changed between the check above and the
    // write itself -- softDeleteAudit()'s WHERE clause caught it.
    return { success: false, error: "This audit can no longer be deleted." };
  }

  revalidatePath("/audits");
  revalidatePath(`/audits/${auditId}`);
  return { success: true };
}
