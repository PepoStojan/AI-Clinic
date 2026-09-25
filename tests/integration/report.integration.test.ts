// Live/integration verification for REPORT-001 Canonical Report Object +
// Pre-PDF Gate.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY only -- no
// provider API calls needed for this task. Skipped automatically
// otherwise. Two controlled fixtures: one complete audit (all checklist
// rows terminal, all 5 component_results present) and one deliberately
// left with PENDING checklist items (the natural state right after
// checklist creation, before any component has run).

import { afterAll, describe, expect, it } from "vitest";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { upsertComponentResult } from "../../src/lib/supabase/repositories/component-results";
import { createGroupedGap } from "../../src/lib/supabase/repositories/grouped-gaps";
import { getLatestReport } from "../../src/lib/supabase/repositories/reports";
import { runReportAssembly } from "../../src/lib/report/run-report-assembly";

const hasCredentials = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("REPORT-001 Canonical Report + Pre-PDF Gate (integration)", () => {
  it("a complete audit fixture produces ready_for_pdf=true with exact counts, and rerun stays stable", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Acme",
      websiteUrl: "https://acme.example",
      mainPrompts: ["What is Acme?"],
    });
    createdAuditIds.push(audit.auditId);

    const supabase = getSupabaseServerClient();
    // Mark every checklist row terminal -- REPORT-001 only cares about
    // status, not which component logic produced it.
    const { error: updateError } = await supabase
      .from("checklist_items")
      .update({ status: "COMPLETED" })
      .eq("audit_id", audit.auditId);
    expect(updateError).toBeNull();

    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "brand_recognition",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        providers: [
          { provider: "openai", recognitionStatus: "Accurate" },
          { provider: "gemini", recognitionStatus: "Inaccurate" },
          { provider: "claude", recognitionStatus: "No Result" },
        ],
        summary: { recognized_by: 2, accuracy_confirmed: 1, accuracy_unavailable: 0, provider_could_not_verify: 1 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "prompt_visibility",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        providers: [],
        summary: { totalChecks: 4, evaluableChecks: 3, strongMentions: 1, mentioned: 1, citedOnly: 0, ambiguous: 0, notMentioned: 1, noResult: 1 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "social_profiles",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        platforms: [],
        summary: { totalPlatforms: 8, profilesFound: 5, profilesConnected: 4, profilesNotFound: 2, profilesUnverified: 0, profilesCouldNotVerify: 1 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "directories",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        platforms: [],
        summary: { totalDirectories: 10, listingsFound: 6, listingsNotFound: 3, listingsUnverified: 0, listingsCouldNotVerify: 1 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "technical_accessibility",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        crawlers: [],
        summary: { totalCrawlers: 6, allowed: 5, restricted: 0, blocked: 1, cannotVerify: 0 },
      },
    });

    await createGroupedGap({
      audit_id: audit.auditId,
      gap_key: "brand_recognition:inaccurate_descriptions",
      component_name: "brand_recognition",
      gap_type: "inaccurate_descriptions",
      title: "Brand description is inaccurate on gemini",
      affected_checks_json: [{ provider: "gemini" }],
      evidence_json: [{ provider: "gemini", status: "Inaccurate" }],
      deterministic_reason: "1 of 3 AI system(s) returned an inaccurate brand description.",
      interpretation_json: { what_we_observed: "a", what_this_suggests: "b", what_to_consider: "c" },
      validation_status: "PASSED",
    });

    const report1 = await runReportAssembly(audit.auditId);
    expect(report1.ready_for_pdf).toBe(true);
    expect(report1.status).toBe("READY");
    expect(report1.blocking_reasons).toEqual([]);

    const canonical = report1.canonical_report_json as {
      component_results: Record<string, unknown>;
      executive_fact_counts: {
        social_profiles: { total_platforms: number };
        directories: { total_directories: number };
        technical_accessibility: { total_crawlers: number };
        confirmed_gaps_count: number;
      };
      grouped_gaps: unknown[];
      interpretations: unknown[];
    };
    expect(Object.keys(canonical.component_results).sort()).toEqual(
      ["brand_recognition", "directories", "prompt_visibility", "social_profiles", "technical_accessibility"].sort()
    );
    expect(canonical.executive_fact_counts.social_profiles.total_platforms).toBe(8);
    expect(canonical.executive_fact_counts.directories.total_directories).toBe(10);
    expect(canonical.executive_fact_counts.technical_accessibility.total_crawlers).toBe(6);
    expect(canonical.executive_fact_counts.confirmed_gaps_count).toBe(1);
    expect(canonical.grouped_gaps).toHaveLength(1);
    expect(canonical.interpretations).toHaveLength(1);

    // Rerun: same logical report row, no duplicate.
    const report2 = await runReportAssembly(audit.auditId);
    expect(report2.id).toBe(report1.id);
    expect(report2.report_version).toBe(report1.report_version);
    const latest = await getLatestReport(audit.auditId);
    expect(latest?.id).toBe(report1.id);
  }, 30_000);

  it("a fixture left with PENDING checklist items (the natural post-creation state) -> ready_for_pdf=false with an exact blocking reason", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Acme Blocked",
      websiteUrl: "https://acme-blocked.example",
      mainPrompts: ["What is Acme?"],
    });
    createdAuditIds.push(audit.auditId);

    // No component_results, no checklist status changes -- everything is
    // still PENDING right after checklist creation.
    const report = await runReportAssembly(audit.auditId);

    expect(report.ready_for_pdf).toBe(false);
    expect(report.status).toBe("DRAFT");
    expect((report.blocking_reasons as string[]).length).toBeGreaterThan(0);
    expect((report.blocking_reasons as string[]).some((r) => r.includes("PENDING"))).toBe(true);
    expect((report.blocking_reasons as string[]).some((r) => r.includes("brand_recognition"))).toBe(true);
  }, 30_000);
});
