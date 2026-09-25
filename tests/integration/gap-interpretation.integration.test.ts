// Live verification for AI-001 Evidence-Bound Gap Interpretation.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATAFORSEO_LOGIN,
// and DATAFORSEO_PASSWORD (this task calls the DataForSEO Claude gateway).
// Skipped automatically otherwise. Uses a small controlled grouped_gaps
// fixture (3 gaps across 3 different components) written directly via the
// repository -- not derived from real component runs -- so the exact
// expected shape is known ahead of time. Minimal live calls: one
// interpretation pass over 3 gaps, plus a rerun to confirm idempotency.

import { afterAll, describe, expect, it } from "vitest";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { createGroupedGap, listGroupedGapsByAuditId } from "../../src/lib/supabase/repositories/grouped-gaps";
import { runGapInterpretation } from "../../src/lib/gap-interpretation/run-gap-interpretation";

const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("AI-001 Gap Interpretation (live verification)", () => {
  it("interprets a 3-gap fixture, validates or falls back, and is idempotent on rerun", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Acme",
      websiteUrl: "https://acme.example",
      mainPrompts: ["What is Acme?"],
    });
    createdAuditIds.push(audit.auditId);

    const originalGaps = await Promise.all([
      createGroupedGap({
        audit_id: audit.auditId,
        gap_key: "brand_recognition:inaccurate_descriptions",
        component_name: "brand_recognition",
        gap_type: "inaccurate_descriptions",
        title: "Brand description is inaccurate on gemini",
        affected_checks_json: [{ component: "brand_recognition", provider: "gemini", status: "Inaccurate" }],
        evidence_json: [{ provider: "gemini", status: "Inaccurate", evidence: "Described a different company." }],
        deterministic_reason: "1 of 3 AI system(s) returned a Partially Accurate, Inaccurate, or Not Recognized brand description.",
      }),
      createGroupedGap({
        audit_id: audit.auditId,
        gap_key: "social_profiles:not_connected",
        component_name: "social_profiles",
        gap_type: "not_connected",
        title: "Facebook profile is not connected to your website",
        affected_checks_json: [{ component: "social_profiles", platform: "facebook", profileStatus: "Found", connected: "No" }],
        evidence_json: [{ platform: "facebook", profileStatus: "Found", connected: "No", evidence: "" }],
        deterministic_reason: "1 platform(s) have a verified profile that is not connected to the official website.",
      }),
      createGroupedGap({
        audit_id: audit.auditId,
        gap_key: "technical_accessibility:blocked",
        component_name: "technical_accessibility",
        gap_type: "blocked",
        title: "GPTBot is blocked",
        affected_checks_json: [{ component: "technical_accessibility", crawler: "gptbot", userAgent: "GPTBot", status: "Blocked" }],
        evidence_json: [{ crawler: "GPTBot", status: "Blocked", reason: 'robots.txt disallows the entire site ("Disallow: /") for this crawler.' }],
        deterministic_reason: "1 crawler(s) are fully blocked by robots.txt.",
      }),
    ]);

    const firstRun = await runGapInterpretation(audit.auditId);
    expect(firstRun).toHaveLength(3);

    for (const gap of firstRun) {
      expect(["PASSED", "FALLBACK_FACTS_ONLY", "FAILED"]).toContain(gap.validation_status);
      expect(gap.interpretation_json).not.toBeNull();
      const interpretation = gap.interpretation_json as Record<string, string>;
      expect(Object.keys(interpretation).sort()).toEqual(["what_this_suggests", "what_to_consider", "what_we_observed"]);
      for (const value of Object.values(interpretation)) {
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
      }

      // Identity/source fields are completely untouched by AI-001.
      const original = originalGaps.find((g) => g.id === gap.id)!;
      expect(gap.gap_key).toBe(original.gap_key);
      expect(gap.component_name).toBe(original.component_name);
      expect(gap.gap_type).toBe(original.gap_type);
      expect(gap.title).toBe(original.title);
      expect(gap.affected_checks_json).toEqual(original.affected_checks_json);
      expect(gap.evidence_json).toEqual(original.evidence_json);
      expect(gap.deterministic_reason).toBe(original.deterministic_reason);
    }

    // Rerun: same 3 rows updated in place, never duplicated.
    const secondRun = await runGapInterpretation(audit.auditId);
    expect(secondRun).toHaveLength(3);
    const allRows = await listGroupedGapsByAuditId(audit.auditId);
    expect(allRows).toHaveLength(3);
  }, 60_000);
});
