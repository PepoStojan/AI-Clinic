// Live smoke verification for COMP-003 Social Profiles.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATAFORSEO_LOGIN,
// DATAFORSEO_PASSWORD, APIFY_API_TOKEN, and APIFY_SOCIAL_ACTOR_ID. Skipped
// automatically otherwise -- APIFY_API_TOKEN/APIFY_SOCIAL_ACTOR_ID are not
// present in this environment's .env.local (see COMP-003 completion report,
// "Manual Actions Required"), so this test is currently skipped here. One
// SINGLE audit / SINGLE component run against a clearly identifiable
// company (cost control -- one Apify actor run covers all 8 platforms;
// DataForSEO fallback is only invoked per-platform when Apify misses).
// Asserts structural correctness, not exact discovery outcomes, since live
// provider output is non-deterministic.

import { afterAll, describe, expect, it } from "vitest";
import { SOCIAL_PLATFORMS } from "../../src/lib/audit/checklist";
import { runSocialProfilesComponent } from "../../src/lib/social-profiles/run-component";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { listChecklistItemsByAuditId } from "../../src/lib/supabase/repositories/checklist-items";
import { listComponentResultsByAuditId } from "../../src/lib/supabase/repositories/component-results";

const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD &&
    process.env.APIFY_API_TOKEN &&
    process.env.APIFY_SOCIAL_ACTOR_ID
);

const TERMINAL_CHECKLIST_STATUSES = new Set(["COMPLETED", "GAP_FOUND", "COULD_NOT_VERIFY", "FAILED"]);
const CANONICAL_PROFILE_STATUSES = new Set(["Found", "Not Found", "Unverified", "N/A — Could Not Verify"]);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("COMP-003 Social Profiles (live smoke test)", () => {
  it("checks all 8 platforms once for a real audit and reaches a consistent terminal state", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Stripe",
      websiteUrl: "https://stripe.com",
      mainPrompts: ["What is Stripe?"],
    });
    createdAuditIds.push(audit.auditId);

    const result = await runSocialProfilesComponent({
      auditId: audit.auditId,
      companyName: "Stripe",
      registeredDomain: "stripe.com",
      websiteUrl: "https://stripe.com",
    });

    expect(result.platforms).toHaveLength(8);
    for (const platform of SOCIAL_PLATFORMS) {
      const outcome = result.platforms.find((p) => p.platform === platform);
      expect(outcome).toBeDefined();
      expect(CANONICAL_PROFILE_STATUSES.has(outcome!.profileStatus)).toBe(true);
      // Provider failure must never surface as Not Found.
      if (outcome!.unavailableReason) {
        expect(outcome!.profileStatus).toBe("N/A — Could Not Verify");
      }
    }

    expect(result.summary.totalPlatforms).toBe(8);

    const checklist = (await listChecklistItemsByAuditId(audit.auditId)).filter(
      (row) => row.component_name === "social_profiles"
    );
    expect(checklist).toHaveLength(8);
    for (const row of checklist) {
      expect(TERMINAL_CHECKLIST_STATUSES.has(row.status)).toBe(true);
    }
    for (const row of checklist) {
      const outcome = result.platforms.find((p) => p.platform === row.check_key);
      if (outcome?.profileStatus === "N/A — Could Not Verify") {
        expect(row.status).toBe("COULD_NOT_VERIFY");
      }
    }

    const componentResults = await listComponentResultsByAuditId(audit.auditId);
    const socialResult = componentResults.find((row) => row.component_name === "social_profiles");
    expect(socialResult).toBeDefined();
    expect(socialResult!.status).toBe("COMPLETED");
    expect(componentResults.filter((row) => row.component_name === "social_profiles")).toHaveLength(1);
  }, 120_000);
});
