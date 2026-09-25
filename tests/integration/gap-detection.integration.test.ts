// Live/integration verification for CORE-002 Gap Detection + Grouping.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY only -- no
// external provider calls anywhere in this task. Skipped automatically
// otherwise. Uses one controlled audit fixture with hand-written
// component_results rows (not real component runs) so the exact expected
// gap set is known ahead of time.

import { afterAll, describe, expect, it } from "vitest";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { upsertComponentResult } from "../../src/lib/supabase/repositories/component-results";
import { listGroupedGapsByAuditId } from "../../src/lib/supabase/repositories/grouped-gaps";
import { runGapDetection } from "../../src/lib/gap-detection/run-gap-detection";

const hasCredentials = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("CORE-002 Gap Detection + Grouping (integration)", () => {
  it("produces exactly the expected grouped gaps, is idempotent on rerun, and removes stale gaps when source facts change", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Acme",
      websiteUrl: "https://acme.example",
      mainPrompts: ["What is Acme?"],
    });
    createdAuditIds.push(audit.auditId);

    // Controlled fixture: one confirmed brand gap, one confirmed social
    // gap (Facebook only -- LinkedIn stays clean), one directory gap, one
    // technical gap, plus N/A/Cannot-Verify/clean rows throughout that
    // must NEVER produce a gap.
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "brand_recognition",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        providers: [
          { provider: "openai", recognitionStatus: "Accurate", evidence: "correct" },
          { provider: "gemini", recognitionStatus: "Inaccurate", evidence: "wrong facts" },
          { provider: "claude", recognitionStatus: "No Result", evidence: "" },
        ],
      },
    });

    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "social_profiles",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        platforms: [
          { platform: "linkedin", profileStatus: "Found", connected: "Yes", evidence: "" },
          { platform: "facebook", profileStatus: "Found", connected: "No", evidence: "" },
          { platform: "youtube", profileStatus: "N/A — Could Not Verify", connected: "N/A", evidence: "" },
        ],
      },
    });

    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "directories",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        platforms: [
          { platform: "g2", status: "Found", evidence: "" },
          { platform: "capterra", status: "Not Found", evidence: "" },
        ],
      },
    });

    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "technical_accessibility",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        crawlers: [
          { crawler: "googlebot", userAgent: "Googlebot", status: "Allowed", reason: "" },
          { crawler: "gptbot", userAgent: "GPTBot", status: "Blocked", reason: "Disallow: /" },
          { crawler: "bingbot", userAgent: "Bingbot", status: "Cannot Verify", reason: "fetch failed" },
        ],
      },
    });

    const firstRun = await runGapDetection(audit.auditId);
    expect(firstRun).toHaveLength(4); // brand, social(not_connected), directories, technical(blocked)

    const gapTypes = firstRun.map((g) => `${g.component_name}:${g.gap_type}`).sort();
    expect(gapTypes).toEqual(
      ["brand_recognition:inaccurate_descriptions", "directories:limited_presence", "social_profiles:not_connected", "technical_accessibility:blocked"].sort()
    );

    // Every gap traces to real affected checks/evidence; no N/A row ever
    // sneaks in (e.g. youtube must never appear anywhere).
    for (const gap of firstRun) {
      expect((gap.affected_checks_json as unknown[]).length).toBeGreaterThan(0);
      expect((gap.evidence_json as unknown[]).length).toBeGreaterThan(0);
      expect(gap.validation_status).toBe("PENDING");
      expect(gap.interpretation_json).toBeNull();
      expect(JSON.stringify(gap.affected_checks_json)).not.toContain("youtube");
      expect(JSON.stringify(gap.affected_checks_json)).not.toContain("linkedin");
    }

    // Rerun with unchanged source facts -- idempotent, no duplicates.
    const secondRun = await runGapDetection(audit.auditId);
    expect(secondRun).toHaveLength(4);
    const allGapsAfterRerun = await listGroupedGapsByAuditId(audit.auditId);
    expect(allGapsAfterRerun).toHaveLength(4);

    // Now change the source facts: GPTBot is fixed (Allowed), so the
    // technical gap must disappear on rebuild -- stale gap removal.
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "technical_accessibility",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        crawlers: [
          { crawler: "googlebot", userAgent: "Googlebot", status: "Allowed", reason: "" },
          { crawler: "gptbot", userAgent: "GPTBot", status: "Allowed", reason: "" },
          { crawler: "bingbot", userAgent: "Bingbot", status: "Cannot Verify", reason: "fetch failed" },
        ],
      },
    });

    const thirdRun = await runGapDetection(audit.auditId);
    expect(thirdRun).toHaveLength(3);
    expect(thirdRun.some((g) => g.component_name === "technical_accessibility")).toBe(false);

    const finalGaps = await listGroupedGapsByAuditId(audit.auditId);
    expect(finalGaps).toHaveLength(3); // stale technical_accessibility gap is gone, not lingering
  }, 30_000);
});
