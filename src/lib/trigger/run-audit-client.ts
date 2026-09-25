import "server-only";

import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { runAiClinicAudit } from "@/trigger/run-audit";
import type { regenerateAuditPdf } from "@/trigger/regenerate-pdf";

// Same pattern as runTriggerSmokeTest (INFRA-002): trigger by task id with
// a type-only import, keyed by an audit-scoped idempotency key so a
// duplicate submission (e.g. a retried form action) never starts a
// second orchestration run for the same audit.
export async function triggerAuditPipeline(auditId: string) {
  const idempotencyKey = await idempotencyKeys.create(`run-ai-clinic-audit:${auditId}`, {
    scope: "global",
  });

  return tasks.trigger<typeof runAiClinicAudit>(
    "run-ai-clinic-audit",
    { auditId },
    { idempotencyKey }
  );
}

/**
 * Regenerates only the PDF for an audit whose report is already
 * ready_for_pdf -- via Trigger.dev, never by calling Playwright in-process
 * (see src/trigger/regenerate-pdf.ts for why).
 */
export async function triggerPdfRegeneration(auditId: string) {
  const idempotencyKey = await idempotencyKeys.create(`regenerate-audit-pdf:${auditId}:${Date.now()}`, {
    scope: "global",
  });

  return tasks.trigger<typeof regenerateAuditPdf>(
    "regenerate-audit-pdf",
    { auditId },
    { idempotencyKey }
  );
}
