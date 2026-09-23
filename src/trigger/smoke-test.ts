import { logger, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

// Example queue only, proving the configurable-concurrency pattern
// (Build Spec section 28). Real provider-specific queues/limits belong to
// each COMP-00x task, not here.
export const infraSmokeTestQueue = queue({
  name: "infra-smoke-test",
  concurrencyLimit: 5,
});

export const triggerSmokeTest = schemaTask({
  id: "infra.trigger-smoke-test",
  queue: infraSmokeTestQueue,
  schema: z.object({
    auditId: z.string().min(1),
    message: z.string().min(1),
  }),
  run: async (payload) => {
    logger.info("infra.trigger-smoke-test received payload", payload);

    return {
      ok: true as const,
      auditId: payload.auditId,
    };
  },
});
