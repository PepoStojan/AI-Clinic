import "server-only";

import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { triggerSmokeTest } from "@/trigger/smoke-test";

// Demonstrates the pattern future audit-scoped tasks will reuse: trigger
// by task id with a type-only import (never import the task instance into
// backend code -- see @trigger.dev/sdk/skills/trigger-authoring-tasks),
// keyed by an audit-scoped idempotency key so duplicate delivery/retries
// never start a second run for the same logical work. This guards
// Trigger.dev run identity, distinct from the DB-level
// checklist_items.idempotency_key (src/lib/audit/idempotency.ts), which
// guards row identity.
export async function runTriggerSmokeTest(payload: { auditId: string; message: string }) {
  const idempotencyKey = await idempotencyKeys.create(`infra-smoke-test:${payload.auditId}`, {
    scope: "global",
  });

  return tasks.trigger<typeof triggerSmokeTest>("infra.trigger-smoke-test", payload, {
    idempotencyKey,
  });
}
