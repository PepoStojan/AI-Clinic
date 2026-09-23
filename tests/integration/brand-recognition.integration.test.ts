// Live smoke verification for COMP-001 Brand Recognition.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATAFORSEO_LOGIN,
// and DATAFORSEO_PASSWORD. Skipped automatically otherwise. Deliberately a
// SINGLE audit / SINGLE component run exercising all 4 providers once --
// per the task's cost-control directive, not a brand-by-brand test matrix.
// Asserts structural correctness (terminal statuses, internally consistent
// counts), not exact recognition outcomes, since live LLM answers are
// non-deterministic.

import { afterAll, describe, expect, it } from "vitest";
import {
  BRAND_RECOGNITION_CHECK_KEYS,
  runBrandRecognitionComponent,
} from "../../src/lib/brand-recognition/run-component";
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
const CANONICAL_RECOGNITION_STATUSES = new Set([
  "Accurate",
  "Partially Accurate",
  "Inaccurate",
  "Not Recognized",
  "No Result",
]);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("COMP-001 Brand Recognition (live smoke test)", () => {
  it("runs all 4 providers once for a real audit and reaches a consistent terminal state", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Stripe",
      websiteUrl: "https://stripe.com",
      mainPrompts: ["What is Stripe?"],
    });
    createdAuditIds.push(audit.auditId);

    const result = await runBrandRecognitionComponent({
      auditId: audit.auditId,
      companyName: "Stripe",
      registeredDomain: "stripe.com",
      websiteUrl: "https://stripe.com",
    });

    // Structural checks only -- live LLM output is non-deterministic.
    expect(result.providers).toHaveLength(4);
    for (const key of BRAND_RECOGNITION_CHECK_KEYS) {
      const outcome = result.providers.find((p) => p.provider === key);
      expect(outcome).toBeDefined();
      expect(CANONICAL_RECOGNITION_STATUSES.has(outcome!.recognitionStatus)).toBe(true);
    }

    // Counts must be internally consistent regardless of what was returned.
    expect(result.summary.accuracy_confirmed).toBeLessThanOrEqual(result.summary.recognized_by);
    expect(result.summary.recognized_by + result.summary.provider_could_not_verify).toBeLessThanOrEqual(4);
    expect(result.summary.narrative.length).toBeGreaterThan(0);

    const checklist = (await listChecklistItemsByAuditId(audit.auditId)).filter(
      (row) => row.component_name === "brand_recognition"
    );
    expect(checklist).toHaveLength(4);
    for (const row of checklist) {
      expect(TERMINAL_CHECKLIST_STATUSES.has(row.status)).toBe(true);
    }
    // No result is not a gap: providers with recognitionStatus "No Result"
    // must never be checklist status GAP_FOUND.
    for (const row of checklist) {
      const outcome = result.providers.find((p) => p.provider === row.check_key);
      if (outcome?.recognitionStatus === "No Result") {
        expect(row.status).toBe("COULD_NOT_VERIFY");
      }
    }

    const componentResults = await listComponentResultsByAuditId(audit.auditId);
    const brandRecognitionResult = componentResults.find(
      (row) => row.component_name === "brand_recognition"
    );
    expect(brandRecognitionResult).toBeDefined();
    expect(brandRecognitionResult!.status).toBe("COMPLETED");

    // No duplicate component_results row: exactly one for this audit.
    expect(componentResults.filter((row) => row.component_name === "brand_recognition")).toHaveLength(1);
  }, 120_000);
});
