// Live smoke verification for COMP-002 Prompt Visibility.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATAFORSEO_LOGIN,
// and DATAFORSEO_PASSWORD. Skipped automatically otherwise. Deliberately a
// SINGLE audit / SINGLE target / SINGLE prompt run exercising all 4
// providers once (cost control -- matches COMP-001's live smoke test, not a
// brand-by-brand or prompt-by-prompt matrix). Asserts structural
// correctness (terminal statuses, internally consistent counts, no
// duplicate rows), not exact mention outcomes, since live LLM/SERP output
// is non-deterministic.

import { afterAll, describe, expect, it } from "vitest";
import { PROMPT_VISIBILITY_PROVIDERS } from "../../src/lib/audit/checklist";
import { runPromptVisibilityComponent } from "../../src/lib/prompt-visibility/run-component";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { listChecklistItemsByAuditId } from "../../src/lib/supabase/repositories/checklist-items";
import { listComponentResultsByAuditId } from "../../src/lib/supabase/repositories/component-results";

const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
);

const TERMINAL_CHECKLIST_STATUSES = new Set(["COMPLETED", "GAP_FOUND", "COULD_NOT_VERIFY", "FAILED"]);
const CANONICAL_MENTION_CLASSES = new Set([
  "Strong Mention",
  "Mentioned",
  "Cited Only",
  "Ambiguous",
  "Not Mentioned",
  "No Result",
]);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("COMP-002 Prompt Visibility (live smoke test)", () => {
  it("runs all 4 providers once for one real prompt and reaches a consistent terminal state", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Stripe",
      websiteUrl: "https://stripe.com",
      mainPrompts: ["What is Stripe?"],
    });
    createdAuditIds.push(audit.auditId);

    const result = await runPromptVisibilityComponent({
      auditId: audit.auditId,
      companyName: "Stripe",
      registeredDomain: "stripe.com",
      targets: [{ id: audit.homepageTarget.id, prompts: ["What is Stripe?"] }],
    });

    // Structural checks only -- live LLM/SERP output is non-deterministic.
    expect(result.providers).toHaveLength(4);
    for (const provider of PROMPT_VISIBILITY_PROVIDERS) {
      const outcome = result.providers.find((p) => p.provider === provider);
      expect(outcome).toBeDefined();
      expect(CANONICAL_MENTION_CLASSES.has(outcome!.mentionClass)).toBe(true);
    }

    // Counts must be internally consistent regardless of what was returned.
    expect(result.summary.totalChecks).toBe(4);
    expect(result.summary.evaluableChecks).toBeLessThanOrEqual(result.summary.totalChecks);
    expect(result.summary.evaluableChecks).toBe(result.summary.totalChecks - result.summary.noResult);

    const checklist = (await listChecklistItemsByAuditId(audit.auditId)).filter(
      (row) => row.component_name === "prompt_visibility"
    );
    expect(checklist).toHaveLength(4); // 1 target x 1 prompt x 4 providers
    for (const row of checklist) {
      expect(TERMINAL_CHECKLIST_STATUSES.has(row.status)).toBe(true);
    }

    // No Result is never a gap.
    for (const row of checklist) {
      const provider = row.check_key.split(":")[1];
      const outcome = result.providers.find((p) => p.provider === provider);
      if (outcome?.mentionClass === "No Result") {
        expect(row.status).toBe("COULD_NOT_VERIFY");
      }
    }

    const componentResults = await listComponentResultsByAuditId(audit.auditId);
    const promptVisibilityResult = componentResults.find((row) => row.component_name === "prompt_visibility");
    expect(promptVisibilityResult).toBeDefined();
    expect(promptVisibilityResult!.status).toBe("COMPLETED");

    // No duplicate component_results row: exactly one for this audit.
    expect(componentResults.filter((row) => row.component_name === "prompt_visibility")).toHaveLength(1);
  }, 180_000);
});
