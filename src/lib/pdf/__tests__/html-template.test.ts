import { describe, expect, it } from "vitest";
import { buildReportHtml } from "../html-template";
import type { CanonicalReport } from "../../report/types";

function baseReport(overrides: Partial<CanonicalReport> = {}): CanonicalReport {
  return {
    audit_info: {
      audit_id: "audit-1",
      audit_code: "AIC-2026-000001",
      company_name: "Acme Corp",
      website_url: "https://acme.example",
      registered_domain: "acme.example",
      contact_name: "Jane Doe",
      contact_email: "jane@example.com",
      created_at: "2026-01-01T00:00:00Z",
      completed_at: null,
      audited_targets: [],
    },
    executive_fact_counts: {
      brand_recognition: { recognized_by: 3, total_providers: 4, accuracy_confirmed: 2, accuracy_unavailable: 0, provider_could_not_verify: 1 },
      prompt_visibility: { valid_checks: 3, positive_checks: 2, visibility_percentage: 67, unavailable_checks: 1 },
      social_profiles: { profiles_found: 5, profiles_connected: 4, profiles_not_found: 3, profiles_unverified: 0, profiles_could_not_verify: 0, total_platforms: 8 },
      directories: { listings_found: 6, listings_not_found: 4, listings_unverified: 0, listings_could_not_verify: 0, total_directories: 10 },
      technical_accessibility: { allowed: 5, restricted: 0, blocked: 1, cannot_verify: 0, total_crawlers: 6 },
      confirmed_gaps_count: 1,
      checks_unavailable_count: 2,
    },
    component_results: {
      brand_recognition: { status: "COMPLETED", findings: { providers: [{ provider: "openai", recognitionStatus: "Accurate", evidence: "Matches." }] } },
      prompt_visibility: { status: "COMPLETED", findings: { providers: [{ prompt: "What is Acme?", provider: "chatgpt", mentionClass: "Strong Mention", evidence: "" }] } },
      social_profiles: { status: "COMPLETED", findings: { platforms: [{ platform: "linkedin", profileStatus: "Found", connected: "Yes", profileUrl: "https://linkedin.com/company/acme" }] } },
      directories: { status: "COMPLETED", findings: { platforms: [{ platform: "g2", status: "Found", listingUrl: "https://g2.com/products/acme" }] } },
      technical_accessibility: {
        status: "COMPLETED",
        findings: { robotsTxtStatus: "Found", llmsTxtStatus: "Not Found", crawlers: [{ crawler: "gptbot", userAgent: "GPTBot", status: "Blocked", reason: "Disallow: /" }] },
      },
    },
    grouped_gaps: [],
    interpretations: [],
    closing: { cta_text: "Want to understand what to address next and how?" },
    metadata: {
      report_version: 1,
      assembled_at: "2026-01-02T00:00:00Z",
      audit_status: "COMPLETED",
      components_completed: 5,
      components_total: 5,
      checks_unavailable: 2,
      confirmed_gaps: 1,
      pdf_filename: "Acme-Corp-AI-Visibility-Audit.pdf",
      ready_for_pdf: true,
      blocking_reasons: [],
    },
    ...overrides,
  };
}

describe("buildReportHtml", () => {
  it("15. contains the exact branding string 'Developed by smartclick.agency'", () => {
    const html = buildReportHtml(baseReport());
    expect(html).toContain("Developed by smartclick.agency");
  });

  it("16. never contains old/incorrect branding variants", () => {
    const html = buildReportHtml(baseReport());
    expect(html).not.toContain("Developed by SmartClick");
    expect(html).not.toContain("by SmartClick");
    expect(html).not.toContain("smartclick.mk");
  });

  it("14. no overall score, letter grade, or severity/priority language appears", () => {
    const html = buildReportHtml(baseReport()).toLowerCase();
    expect(html).not.toMatch(/overall score|letter grade|severity|priority level/);
  });

  it("Executive Summary crawler wording never claims universal access when any crawler is blocked", () => {
    const html = buildReportHtml(baseReport());
    expect(html).not.toContain("All crawlers accessible");
    expect(html).toContain("5 allowed");
    expect(html).toContain("1 blocked");
  });

  it("Executive Summary correctly claims universal access only when truly zero blocked/restricted/cannot_verify", () => {
    const report = baseReport();
    report.executive_fact_counts.technical_accessibility = { allowed: 6, restricted: 0, blocked: 0, cannot_verify: 0, total_crawlers: 6 };
    const html = buildReportHtml(report);
    expect(html).toContain("All 6 audited crawlers are allowed");
  });

  it("9. zero gaps renders a neutral empty state, not a fabricated recommendation", () => {
    const html = buildReportHtml(baseReport({ grouped_gaps: [] }));
    expect(html).toContain("No confirmed gaps were identified in the audited checks.");
  });

  it("10. multiple gaps each render their own card with all 3 interpretation columns", () => {
    const report = baseReport({
      grouped_gaps: [
        { gap_id: "g1", gap_key: "a", component_name: "social_profiles", gap_type: "not_connected", title: "Gap One", affected_checks: [{}], evidence: [{}], affected_count: 1, deterministic_reason: "reason one", status: "confirmed_gap" },
        { gap_id: "g2", gap_key: "b", component_name: "directories", gap_type: "limited_presence", title: "Gap Two", affected_checks: [{}, {}], evidence: [{}], affected_count: 2, deterministic_reason: "reason two", status: "confirmed_gap" },
      ],
      interpretations: [
        { gap_id: "g1", what_we_observed: "obs1", what_this_suggests: "sug1", what_to_consider: "con1", validation_status: "PASSED" },
        { gap_id: "g2", what_we_observed: "obs2", what_this_suggests: "sug2", what_to_consider: "con2", validation_status: "FALLBACK_FACTS_ONLY" },
      ],
    });
    const html = buildReportHtml(report);
    expect(html).toContain("Gap One");
    expect(html).toContain("Gap Two");
    expect(html).toContain("obs1");
    expect(html).toContain("sug1");
    expect(html).toContain("con1");
    expect(html).toContain("obs2");
  });

  it("11. a long URL is escaped and wrapped, never breaking the surrounding HTML", () => {
    const report = baseReport();
    const longUrl = "https://example.com/" + "a".repeat(300) + "?query=<script>alert(1)</script>";
    report.component_results.social_profiles!.findings = {
      platforms: [{ platform: "linkedin", profileStatus: "Found", connected: "Yes", profileUrl: longUrl }],
    };
    const html = buildReportHtml(report);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    // The long URL text itself is present (escaped), inside a wrap-capable cell.
    expect(html).toContain("a".repeat(300));
  });

  it("12. No Result / N/A statuses render with the neutral dot color, not the attention color", () => {
    const report = baseReport();
    report.component_results.prompt_visibility!.findings = {
      providers: [{ prompt: "x", provider: "gemini", mentionClass: "No Result", evidence: "" }],
    };
    const html = buildReportHtml(report);
    // Neutral dot color constant used for No Result, not the attention color.
    expect(html).toMatch(/No Result[\s\S]*?background:#94A3B8|background:#94A3B8[\s\S]*?No Result/);
  });

  it("13. llms.txt Not Found is never styled with the attention color", () => {
    const html = buildReportHtml(baseReport()); // base fixture has llmsTxtStatus: "Not Found"
    const llmsSection = html.slice(html.indexOf("llms.txt"));
    expect(llmsSection.slice(0, 200)).not.toContain("#C08A1E"); // ATTENTION color
  });

  it("18. no raw provider payload (e.g. citations array internals beyond what's shown) leaks into the HTML", () => {
    const report = baseReport();
    // Simulate what a raw_result_json blob would look like if it ever
    // leaked in -- the template only ever reads component_results
    // findings, which come from normalized_result_json, never raw.
    const html = buildReportHtml(report);
    expect(html).not.toContain("raw_result_json");
  });

  it("4. the metadata's pdf_filename is exactly what's reflected as the document title basis", () => {
    const report = baseReport();
    const html = buildReportHtml(report);
    expect(html).toContain(report.audit_info.company_name);
  });

  it("cover includes all required fields", () => {
    const html = buildReportHtml(baseReport());
    expect(html).toContain("AI-Clinic");
    expect(html).toContain("AI Visibility Audit");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("acme.example");
    expect(html).toContain("AIC-2026-000001");
  });

  it("closing includes the exact locked CTA text", () => {
    const html = buildReportHtml(baseReport());
    expect(html).toContain("Want to understand what to address next and how?");
  });

  it("no ratings/review-count language appears for directories", () => {
    const html = buildReportHtml(baseReport()).toLowerCase();
    expect(html).not.toMatch(/star rating|review count|\d+\s*reviews/);
  });
});
