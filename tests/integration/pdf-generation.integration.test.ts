// Live/integration verification for PDF-001 Playwright PDF Generation.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY only (no
// provider API calls -- rendering is local Playwright/Chromium). Skipped
// automatically otherwise. One controlled ready_for_pdf report fixture,
// one real PDF generation, one real upload to the private audit-reports
// bucket, one real signed URL.

import { afterAll, describe, expect, it } from "vitest";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { getReportSignedUrl, AUDIT_REPORTS_BUCKET } from "../../src/lib/supabase/storage";
import { upsertComponentResult } from "../../src/lib/supabase/repositories/component-results";
import { createGroupedGap } from "../../src/lib/supabase/repositories/grouped-gaps";
import { runReportAssembly } from "../../src/lib/report/run-report-assembly";
import { runPdfGeneration } from "../../src/lib/pdf/run-pdf-generation";

const hasCredentials = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  for (const auditId of createdAuditIds) {
    await supabase.storage.from(AUDIT_REPORTS_BUCKET).remove([`${auditId}/report.pdf`]);
  }
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("PDF-001 Playwright PDF Generation (live verification)", () => {
  it("generates, uploads, and makes downloadable a real PDF for a ready_for_pdf report", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Acme Corp",
      websiteUrl: "https://acme.example",
      mainPrompts: ["What is Acme?"],
    });
    createdAuditIds.push(audit.auditId);

    const supabase = getSupabaseServerClient();
    await supabase.from("checklist_items").update({ status: "COMPLETED" }).eq("audit_id", audit.auditId);

    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "brand_recognition",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        providers: [
          { provider: "openai", recognitionStatus: "Accurate", evidence: "Correctly describes Acme as a widget maker." },
          { provider: "gemini", recognitionStatus: "Inaccurate", evidence: "Describes an unrelated company." },
        ],
        summary: { recognized_by: 2, accuracy_confirmed: 1, accuracy_unavailable: 0, provider_could_not_verify: 0 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "prompt_visibility",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        providers: [
          { targetId: audit.homepageTarget.id, promptIndex: 0, prompt: "What is Acme?", provider: "chatgpt", mentionClass: "Strong Mention", evidence: "Named directly." },
        ],
        summary: { evaluableChecks: 1, strongMentions: 1, mentioned: 0, citedOnly: 0, ambiguous: 0, notMentioned: 0, noResult: 0 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "social_profiles",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        platforms: [
          { platform: "linkedin", profileStatus: "Found", connected: "Yes", profileUrl: "https://linkedin.com/company/acme" },
          { platform: "facebook", profileStatus: "Found", connected: "No", profileUrl: "https://facebook.com/acme" },
        ],
        summary: { totalPlatforms: 8, profilesFound: 2, profilesConnected: 1, profilesNotFound: 6, profilesUnverified: 0, profilesCouldNotVerify: 0 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "directories",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        platforms: [{ platform: "g2", status: "Found", listingUrl: "https://g2.com/products/acme" }],
        summary: { totalDirectories: 10, listingsFound: 1, listingsNotFound: 9, listingsUnverified: 0, listingsCouldNotVerify: 0 },
      },
    });
    await upsertComponentResult({
      audit_id: audit.auditId,
      component_name: "technical_accessibility",
      status: "COMPLETED",
      raw_result_json: {},
      normalized_result_json: {
        robotsTxtStatus: "Found",
        llmsTxtStatus: "Not Found",
        crawlers: [
          { crawler: "googlebot", userAgent: "Googlebot", status: "Allowed", reason: "" },
          { crawler: "gptbot", userAgent: "GPTBot", status: "Blocked", reason: 'robots.txt disallows the entire site ("Disallow: /") for this crawler.' },
        ],
        summary: { totalCrawlers: 6, allowed: 5, restricted: 0, blocked: 1, cannotVerify: 0 },
      },
    });

    await createGroupedGap({
      audit_id: audit.auditId,
      gap_key: "social_profiles:not_connected",
      component_name: "social_profiles",
      gap_type: "not_connected",
      title: "Facebook profile is not connected to your website",
      affected_checks_json: [{ platform: "facebook" }],
      evidence_json: [{ platform: "facebook", profileStatus: "Found", connected: "No" }],
      deterministic_reason: "1 platform(s) have a verified profile that is not connected to the official website.",
      interpretation_json: {
        what_we_observed: "A Facebook profile was found, but we could not verify a connection back to the official website.",
        what_this_suggests: "The brand relationship between the website and this social profile is less explicit.",
        what_to_consider: "Consider linking the official website and Facebook profile where appropriate.",
      },
      validation_status: "PASSED",
    });
    await createGroupedGap({
      audit_id: audit.auditId,
      gap_key: "technical_accessibility:blocked",
      component_name: "technical_accessibility",
      gap_type: "blocked",
      title: "GPTBot is blocked",
      affected_checks_json: [{ crawler: "gptbot", userAgent: "GPTBot" }],
      evidence_json: [{ crawler: "GPTBot", status: "Blocked" }],
      deterministic_reason: "1 crawler(s) are fully blocked by robots.txt.",
      interpretation_json: {
        what_we_observed: "GPTBot is fully blocked by robots.txt directives.",
        what_this_suggests: "OpenAI's crawler cannot currently access site content.",
        what_to_consider: "Review whether blocking GPTBot aligns with business objectives.",
      },
      validation_status: "PASSED",
    });

    const report = await runReportAssembly(audit.auditId);
    expect(report.ready_for_pdf).toBe(true);

    const generated = await runPdfGeneration(audit.auditId);
    expect(generated.status).toBe("GENERATED");
    expect(generated.pdf_storage_path).toBe(`${audit.auditId}/report.pdf`);
    expect(generated.generated_at).not.toBeNull();

    // Save locally for manual inspection.
    const { data: downloaded, error: downloadError } = await supabase.storage
      .from(AUDIT_REPORTS_BUCKET)
      .download(generated.pdf_storage_path!);
    expect(downloadError).toBeNull();
    const buffer = Buffer.from(await downloaded!.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(1000); // a real PDF, not an empty/broken file
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");

    // Signed URL works without making the bucket public.
    const signedUrl = await getReportSignedUrl(generated.pdf_storage_path!);
    expect(signedUrl).toMatch(/^https:\/\//);

    // Rerun is safe: regenerating overwrites the same object path, no duplicate.
    const regenerated = await runPdfGeneration(audit.auditId);
    expect(regenerated.pdf_storage_path).toBe(generated.pdf_storage_path);
  }, 60_000);
});
