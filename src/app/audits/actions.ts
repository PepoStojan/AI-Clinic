"use server";

import { revalidatePath } from "next/cache";
import { getAuditById, updateAuditStatus } from "@/lib/supabase/repositories/audits";
import { triggerAuditPipeline, triggerPdfRegeneration } from "@/lib/trigger/run-audit-client";
import { getLatestReport } from "@/lib/supabase/repositories/reports";

export async function retryQueueAction(auditId: string): Promise<{ success: boolean; error?: string }> {
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
