import "server-only";

import { getAuditById, updateAuditStatus } from "../supabase/repositories/audits";
import { listAuditTargetsByAuditId } from "../supabase/repositories/audit-targets";
import { runBrandRecognitionComponent } from "../brand-recognition/run-component";
import { runPromptVisibilityComponent } from "../prompt-visibility/run-component";
import { runSocialProfilesComponent } from "../social-profiles/run-component";
import { runDirectoriesComponent } from "../directories/run-component";
import { runTechnicalAccessibilityComponent } from "../technical-accessibility/run-component";
import { runGapDetection } from "../gap-detection/run-gap-detection";
import { runGapInterpretation } from "../gap-interpretation/run-gap-interpretation";
import { runReportAssembly } from "../report/run-report-assembly";
import { runPdfGeneration } from "../pdf/run-pdf-generation";

/**
 * UI-001's orchestration glue -- the minimum needed to run the already-
 * built pipeline end to end for one audit. Every step below is a plain
 * function that already existed before this task; nothing here
 * reimplements or redesigns component logic. Trigger.dev's task (see
 * src/trigger/run-audit.ts) is a thin wrapper that just calls this.
 *
 * Status semantics for the exceptional outcomes (spec only lists BLOCKED/
 * PARTIAL/FAILED without further distinction, so this is a documented,
 * deliberate interpretation):
 *   - BLOCKED: the pipeline ran to completion (every step executed) but
 *     the pre-PDF gate failed -- exact reasons are already persisted on
 *     reports.blocking_reasons by runReportAssembly, nothing duplicated
 *     onto the audits row.
 *   - PARTIAL: one or more of the 5 component runners threw an
 *     unexpected exception (a true bug/crash, NOT a normal provider-
 *     unavailable result, which every component already absorbs
 *     internally without throwing) -- some data is missing, but the rest
 *     of the pipeline still ran on whatever data exists.
 *   - FAILED: a true system-level failure escaped the whole pipeline
 *     (e.g. the audit/homepage target itself can't be loaded, or gap
 *     detection/interpretation/report assembly itself throws).
 */
export async function runAuditPipeline(auditId: string): Promise<void> {
  try {
    await updateAuditStatus(auditId, "PROCESSING");

    const audit = await getAuditById(auditId);
    if (!audit) {
      throw new Error(`runAuditPipeline: no audit found for id ${auditId}`);
    }

    const targets = await listAuditTargetsByAuditId(auditId);
    const homepageTarget = targets.find((t) => t.target_type === "homepage");
    if (!homepageTarget) {
      throw new Error(`runAuditPipeline: audit ${auditId} has no homepage target`);
    }

    const componentJobs: (() => Promise<unknown>)[] = [
      () =>
        runBrandRecognitionComponent({
          auditId,
          companyName: audit.company_name,
          registeredDomain: audit.registered_domain,
          websiteUrl: audit.website_url,
          productName: homepageTarget.name,
        }),
      () =>
        runPromptVisibilityComponent({
          auditId,
          companyName: audit.company_name,
          registeredDomain: audit.registered_domain,
          targets: targets.map((t) => ({
            id: t.id,
            prompts: Array.isArray(t.prompts) ? (t.prompts as string[]) : [],
          })),
        }),
      () =>
        runSocialProfilesComponent({
          auditId,
          companyName: audit.company_name,
          registeredDomain: audit.registered_domain,
          websiteUrl: audit.website_url,
        }),
      () =>
        runDirectoriesComponent({
          auditId,
          companyName: audit.company_name,
          registeredDomain: audit.registered_domain,
        }),
      () => runTechnicalAccessibilityComponent({ auditId, websiteUrl: audit.website_url }),
    ];

    // Run in parallel where safe -- each component is already audit-
    // scoped and retry-safe. allSettled so one component's unexpected
    // crash never stops the others from running.
    const results = await Promise.allSettled(componentJobs.map((job) => job()));
    let anyComponentCrashed = false;
    for (const result of results) {
      if (result.status === "rejected") {
        anyComponentCrashed = true;
         
        console.error(`[run-audit-pipeline] a component crashed for audit ${auditId}:`, result.reason);
      }
    }

    await updateAuditStatus(auditId, "VALIDATING");
    await runGapDetection(auditId);
    await runGapInterpretation(auditId);
    const report = await runReportAssembly(auditId);

    if (report.ready_for_pdf) {
      await updateAuditStatus(auditId, "GENERATING_PDF");
      await runPdfGeneration(auditId);
      await updateAuditStatus(auditId, "COMPLETED", { completed_at: new Date().toISOString() });
      return;
    }

    await updateAuditStatus(auditId, anyComponentCrashed ? "PARTIAL" : "BLOCKED");
  } catch (error) {
     
    console.error(`[run-audit-pipeline] unrecoverable failure for audit ${auditId}:`, error);
    await updateAuditStatus(auditId, "FAILED").catch(() => {
      // Best-effort -- if even this write fails, there's nothing further
      // to do; the caller (Trigger.dev) will see the run itself failed.
    });
    throw error;
  }
}
