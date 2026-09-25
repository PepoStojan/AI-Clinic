import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { runPdfGeneration } from "@/lib/pdf/run-pdf-generation";

// UI-001 / Vercel-readiness fix: PDF rendering (Playwright/Chromium) must
// never run inside a Vercel Server Action or Route Handler -- Vercel's
// standard serverless runtime has no browser binary and no supported way
// to launch one reliably. Every Playwright call in this app, including a
// standalone "Regenerate PDF" action, goes through Trigger.dev (which has
// the dedicated `playwright()` build extension wired up in
// trigger.config.ts) instead of running in-process on Vercel.
export const regenerateAuditPdf = schemaTask({
  id: "regenerate-audit-pdf",
  maxDuration: 120,
  schema: z.object({
    auditId: z.string().min(1),
  }),
  run: async (payload) => {
    logger.info("regenerate-audit-pdf started", { auditId: payload.auditId });
    await runPdfGeneration(payload.auditId);
    logger.info("regenerate-audit-pdf finished", { auditId: payload.auditId });
    return { ok: true as const, auditId: payload.auditId };
  },
});
