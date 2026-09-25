"use server";

import { createAuditWithChecklist, AuditCreationFailedError, AuditValidationError } from "@/lib/audit/create-audit";
import { updateAuditStatus } from "@/lib/supabase/repositories/audits";
import { triggerAuditPipeline } from "@/lib/trigger/run-audit-client";

export interface NewAuditActionInput {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  websiteUrl: string;
  productServiceName?: string;
  mainPrompts: string[];
  additionalTargets?: { name?: string; url: string; prompts?: string[] }[];
}

export type NewAuditActionResult =
  | { success: true; auditId: string; auditCode: string; queued: boolean }
  | { success: false; error: string };

/**
 * Creates the audit via the existing createAuditWithChecklist (never
 * reimplemented here), then hands it to Trigger.dev. CREATED only
 * transitions to QUEUED when the trigger submission itself succeeds --
 * a failed submission leaves the audit CREATED, never falsely QUEUED,
 * and is still reported back as a created audit so the caller can offer
 * a retry rather than losing the work.
 */
export async function createAuditAction(input: NewAuditActionInput): Promise<NewAuditActionResult> {
  let auditId: string;
  let auditCode: string;
  try {
    const result = await createAuditWithChecklist(input);
    auditId = result.auditId;
    auditCode = result.auditCode;
  } catch (error) {
    if (error instanceof AuditValidationError) {
      return { success: false, error: error.issues.join(" ") };
    }
    if (error instanceof AuditCreationFailedError) {
      return { success: false, error: "Could not create the audit. Please try again." };
    }
    return { success: false, error: "Unexpected error creating the audit." };
  }

  try {
    await triggerAuditPipeline(auditId);
    await updateAuditStatus(auditId, "QUEUED");
    return { success: true, auditId, auditCode, queued: true };
  } catch (error) {
     
    console.error(`[new-audit] failed to queue audit ${auditId}:`, error);
    return { success: true, auditId, auditCode, queued: false };
  }
}
