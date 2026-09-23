// Exercises the live Trigger.dev project (infra.trigger-smoke-test).
//
// Requires TRIGGER_SECRET_KEY in the environment. Skipped automatically
// otherwise -- not part of `npm test`, run explicitly with
// `npm run test:integration` after the key has been set.

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runs } from "@trigger.dev/sdk";
import type { triggerSmokeTest } from "../../src/trigger/smoke-test";
import { runTriggerSmokeTest } from "../../src/lib/trigger/client";

const hasCredentials = Boolean(process.env.TRIGGER_SECRET_KEY);

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
]);

// Polls runs.retrieve() rather than the realtime runs.subscribeToRun()
// stream: the SSE-based subscription did not resolve within this plain
// Node/vitest process even though runs completed in ~2-10s per the
// `trigger.dev dev` worker log, so plain polling is the reliable choice
// for a one-off verification script.
async function waitForRun(runId: string, timeoutMs = 25_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await runs.retrieve<typeof triggerSmokeTest>(runId);
    if (TERMINAL_STATUSES.has(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Run ${runId} did not reach a terminal status within ${timeoutMs}ms`);
}

describe.skipIf(!hasCredentials)("INFRA-002 Trigger.dev smoke test", () => {
  it(
    "runs infra.trigger-smoke-test and returns the deterministic result",
    async () => {
      const handle = await runTriggerSmokeTest({
        auditId: "test-audit-id",
        message: "trigger-smoke-test",
      });
      const run = await waitForRun(handle.id);

      expect(run.status).toBe("COMPLETED");
      expect(run.output).toEqual({ ok: true, auditId: "test-audit-id" });
    },
    30_000
  );

  it(
    "is idempotent for duplicate triggers of the same audit id",
    async () => {
      const auditId = `idempotency-${randomUUID()}`;

      const first = await runTriggerSmokeTest({ auditId, message: "first" });
      const second = await runTriggerSmokeTest({ auditId, message: "second" });

      expect(second.id).toBe(first.id);

      const run = await waitForRun(first.id);
      expect(run.status).toBe("COMPLETED");
      expect(run.output).toEqual({ ok: true, auditId });
    },
    30_000
  );

  it(
    "runs two different audit ids independently",
    async () => {
      const auditIdA = `dummy-audit-a-${randomUUID()}`;
      const auditIdB = `dummy-audit-b-${randomUUID()}`;

      const handleA = await runTriggerSmokeTest({ auditId: auditIdA, message: "audit-a" });
      const handleB = await runTriggerSmokeTest({ auditId: auditIdB, message: "audit-b" });

      expect(handleA.id).not.toBe(handleB.id);

      const runA = await waitForRun(handleA.id);
      const runB = await waitForRun(handleB.id);

      expect(runA.status).toBe("COMPLETED");
      expect(runA.output).toEqual({ ok: true, auditId: auditIdA });
      expect(runB.status).toBe("COMPLETED");
      expect(runB.output).toEqual({ ok: true, auditId: auditIdB });
    },
    30_000
  );
});
