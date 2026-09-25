import { describe, expect, it } from "vitest";
import { assembleCanonicalReport, buildExecutiveFactCounts } from "../assemble";
import { buildPdfFilename } from "../filename";

function componentRow(componentName: string, normalized: unknown, status = "COMPLETED") {
  return {
    id: `cr-${componentName}`,
    audit_id: "audit-1",
    component_name: componentName,
    status,
    raw_result_json: {},
    normalized_result_json: normalized,
    started_at: null,
    completed_at: null,
  } as never;
}

function gapRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "gap-1",
    audit_id: "audit-1",
    gap_key: "social_profiles:not_connected",
    component_name: "social_profiles",
    gap_type: "not_connected",
    title: "Facebook profile is not connected to your website",
    affected_checks_json: [{ platform: "facebook" }],
    evidence_json: [{ platform: "facebook", evidence: "" }],
    deterministic_reason: "1 platform(s)...",
    interpretation_json: { what_we_observed: "a", what_this_suggests: "b", what_to_consider: "c" },
    validation_status: "PASSED",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as never;
}

describe("buildExecutiveFactCounts -- prompt visibility percentage", () => {
  it("16. denominator excludes unavailable (No Result) checks", () => {
    const results = [
      componentRow("prompt_visibility", {
        summary: { evaluableChecks: 3, strongMentions: 1, mentioned: 1, citedOnly: 0, ambiguous: 0, notMentioned: 1, noResult: 2 },
      }),
    ];
    const counts = buildExecutiveFactCounts(results, []);
    expect(counts.prompt_visibility.valid_checks).toBe(3);
    expect(counts.prompt_visibility.unavailable_checks).toBe(2);
    expect(counts.prompt_visibility.positive_checks).toBe(2);
    expect(counts.prompt_visibility.visibility_percentage).toBe(67); // round(2/3*100)
  });

  it("17. zero valid checks -> null percentage, never fabricated 0%", () => {
    const results = [
      componentRow("prompt_visibility", {
        summary: { evaluableChecks: 0, strongMentions: 0, mentioned: 0, citedOnly: 0, ambiguous: 0, notMentioned: 0, noResult: 4 },
      }),
    ];
    const counts = buildExecutiveFactCounts(results, []);
    expect(counts.prompt_visibility.visibility_percentage).toBeNull();
  });

  it("Cited Only is never counted as positive", () => {
    const results = [
      componentRow("prompt_visibility", {
        summary: { evaluableChecks: 2, strongMentions: 0, mentioned: 0, citedOnly: 2, ambiguous: 0, notMentioned: 0, noResult: 0 },
      }),
    ];
    const counts = buildExecutiveFactCounts(results, []);
    expect(counts.prompt_visibility.positive_checks).toBe(0);
    expect(counts.prompt_visibility.visibility_percentage).toBe(0);
  });
});

describe("buildExecutiveFactCounts -- structural totals and overall counts", () => {
  it("13/14/15. social=8, directories=10, crawlers=6 always, regardless of input", () => {
    const counts = buildExecutiveFactCounts([], []);
    expect(counts.social_profiles.total_platforms).toBe(8);
    expect(counts.directories.total_directories).toBe(10);
    expect(counts.technical_accessibility.total_crawlers).toBe(6);
  });

  it("18. confirmed_gaps_count matches the number of grouped gap rows", () => {
    const counts = buildExecutiveFactCounts([], [gapRow({ gap_key: "a" }), gapRow({ gap_key: "b" })]);
    expect(counts.confirmed_gaps_count).toBe(2);
  });

  it("19. checks_unavailable_count sums unavailable counts across all 5 components", () => {
    const results = [
      componentRow("brand_recognition", { providers: [], summary: { accuracy_unavailable: 1, provider_could_not_verify: 1 } }),
      componentRow("prompt_visibility", { summary: { evaluableChecks: 0, strongMentions: 0, mentioned: 0, noResult: 2 } }),
      componentRow("social_profiles", { summary: { profilesCouldNotVerify: 1 } }),
      componentRow("directories", { summary: { listingsCouldNotVerify: 1 } }),
      componentRow("technical_accessibility", { summary: { cannotVerify: 1 } }),
    ];
    const counts = buildExecutiveFactCounts(results, []);
    expect(counts.checks_unavailable_count).toBe(1 + 1 + 2 + 1 + 1 + 1);
  });

  it("no overall score/severity/priority field exists anywhere on the counts object", () => {
    const counts = buildExecutiveFactCounts([], []);
    const flat = JSON.stringify(counts).toLowerCase();
    expect(flat).not.toMatch(/score|severity|priority/);
  });
});

describe("assembleCanonicalReport", () => {
  const baseAudit = {
    id: "audit-1",
    audit_code: "AIC-2026-000001",
    contact_name: "Jane Doe",
    contact_email: "jane@example.com",
    company_name: "Acme Corp",
    website_url: "https://acme.example",
    registered_domain: "acme.example",
    status: "COMPLETED",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-02T00:00:00Z",
  } as never;

  it("23. excludes raw huge payloads -- component findings come from normalized_result_json, never raw_result_json", () => {
    const results = [
      {
        ...(componentRow("brand_recognition", { providers: [], summary: {} }) as Record<string, unknown>),
        raw_result_json: { hugeBlob: "x".repeat(10_000) },
      } as never,
    ];
    const report = assembleCanonicalReport({ audit: baseAudit, targets: [], componentResults: results, groupedGaps: [], reportVersion: 1 });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("hugeBlob");
  });

  it("12. exactly the 5 required component_results keys exist", () => {
    const report = assembleCanonicalReport({ audit: baseAudit, targets: [], componentResults: [], groupedGaps: [], reportVersion: 1 });
    expect(Object.keys(report.component_results).sort()).toEqual(
      ["brand_recognition", "directories", "prompt_visibility", "social_profiles", "technical_accessibility"].sort()
    );
  });

  it("21. the assembled report object is JSON-serializable", () => {
    const report = assembleCanonicalReport({
      audit: baseAudit,
      targets: [],
      componentResults: [componentRow("brand_recognition", { providers: [], summary: {} })],
      groupedGaps: [gapRow()],
      reportVersion: 1,
    });
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it("grouped gap block and interpretation block are both derived, never inventing missing interpretation text", () => {
    const report = assembleCanonicalReport({
      audit: baseAudit,
      targets: [],
      componentResults: [],
      groupedGaps: [gapRow({ interpretation_json: null, validation_status: "PENDING" })],
      reportVersion: 1,
    });
    expect(report.interpretations[0].what_we_observed).toBeNull();
    expect(report.interpretations[0].validation_status).toBe("PENDING");
  });
});

describe("buildPdfFilename", () => {
  it("20. generates a safe deterministic filename from the company name", () => {
    expect(buildPdfFilename("Acme Corp")).toBe("Acme-Corp-AI-Visibility-Audit.pdf");
  });

  it("strips unsafe characters and collapses whitespace", () => {
    expect(buildPdfFilename("Acme & Co., Ltd.!!")).toBe("Acme-Co-Ltd-AI-Visibility-Audit.pdf");
  });

  it("supports an optional date suffix for collision avoidance", () => {
    expect(buildPdfFilename("Acme", "2026-09-25")).toBe("Acme-AI-Visibility-Audit-2026-09-25.pdf");
  });

  it("never throws and always produces a usable name, even for an empty/unsafe company name", () => {
    expect(() => buildPdfFilename("")).not.toThrow();
    expect(buildPdfFilename("!!!")).toBe("Client-AI-Visibility-Audit.pdf");
  });
});
