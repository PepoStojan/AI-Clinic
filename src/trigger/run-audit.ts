import { logger, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { runAuditPipeline } from "@/lib/orchestration/run-audit-pipeline";

// UI-001: the one real audit orchestration task. Runs the already-built
// pipeline (5 components -> gap detection -> interpretation -> report
// assembly -> PDF generation) for one audit. All the actual logic lives
// in runAuditPipeline -- this task is deliberately a thin wrapper so the
// pipeline itself stays plain-function-testable without Trigger.dev's
// runtime.

export const auditOrchestrationQueue = queue({
  name: "audit-orchestration",
  concurrencyLimit: 5,
});

export const runAiClinicAudit = schemaTask({
  id: "run-ai-clinic-audit",
  queue: auditOrchestrationQueue,
  // Provider calls (DataForSEO, Apify, Claude) plus Playwright PDF
  // rendering can legitimately take several minutes across 5 components
  // run in parallel -- well above the project's 60s default.
  maxDuration: 600,
  schema: z.object({
    auditId: z.string().min(1),
  }),
  run: async (payload) => {
    logger.info("run-ai-clinic-audit started", { auditId: payload.auditId });
    await runAuditPipeline(payload.auditId);
    logger.info("run-ai-clinic-audit finished", { auditId: payload.auditId });
    return { ok: true as const, auditId: payload.auditId };
  },
});
