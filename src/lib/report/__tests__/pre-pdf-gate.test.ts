import { describe, expect, it } from "vitest";
import { assembleCanonicalReport } from "../assemble";
import { runPreFlightChecklist } from "../pre-pdf-gate";

const AUDIT = {
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

const TARGET = { id: "target-1", audit_id: "audit-1", target_type: "homepage", url: "https://acme.example", name: null, prompts: ["What is Acme?"], sort_order: 0, created_at: "" };

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

function allComponentsComplete() {
  return [
    componentRow("brand_recognition", { providers: [{ provider: "openai", recognitionStatus: "Accurate" }], summary: {} }),
    componentRow("prompt_visibility", { providers: [], summary: { evaluableChecks: 4, strongMentions: 4, noResult: 0 } }),
    componentRow("social_profiles", { platforms: [], summary: {} }),
    componentRow("directories", { platforms: [], summary: {} }),
    componentRow("technical_accessibility", { crawlers: [], summary: {} }),
  ];
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

function checklistRow(idempotencyKey: string, status: string) {
  return {
    id: `ci-${idempotencyKey}`,
    audit_id: "audit-1",
    target_id: null,
    component_name: "brand_recognition",
    check_key: "openai",
    idempotency_key: idempotencyKey,
    status,
    result_json: {},
    evidence_json: {},
    retry_count: 0,
    last_error: null,
    started_at: null,
    completed_at: null,
    created_at: "",
    updated_at: "",
  };
}

// Exactly 30 + 4*totalPrompts terminal checklist rows for TARGET (1 prompt) = 34.
function completeChecklist(): ReturnType<typeof checklistRow>[] {
  const rows: ReturnType<typeof checklistRow>[] = [];
  for (let i = 0; i < 34; i++) rows.push(checklistRow(`key-${i}`, "COMPLETED"));
  return rows;
}

function assembleAndGate(overrides: {
  componentResults?: unknown[];
  groupedGaps?: unknown[];
  checklistItems?: unknown[];
  targets?: unknown[];
}) {
  const componentResults = (overrides.componentResults ?? allComponentsComplete()) as never;
  const groupedGaps = (overrides.groupedGaps ?? []) as never;
  const checklistItems = (overrides.checklistItems ?? completeChecklist()) as never;
  const targets = (overrides.targets ?? [TARGET]) as never;

  const report = assembleCanonicalReport({ audit: AUDIT, targets, componentResults, groupedGaps, reportVersion: 1 });
  const gate = runPreFlightChecklist({ report, checklistItems, targets });
  return { report, gate };
}

describe("runPreFlightChecklist", () => {
  it("1. a complete audit -> ready_for_pdf true", () => {
    const { gate } = assembleAndGate({});
    expect(gate.readyForPdf).toBe(true);
    expect(gate.blockingReasons).toEqual([]);
  });

  it("2. a missing component -> false, with an exact reason", () => {
    const { gate } = assembleAndGate({ componentResults: allComponentsComplete().slice(1) });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => r.includes("brand_recognition"))).toBe(true);
  });

  it("3. a PENDING checklist row -> false", () => {
    const items = completeChecklist();
    items[0].status = "PENDING";
    const { gate } = assembleAndGate({ checklistItems: items });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => r.includes("PENDING"))).toBe(true);
  });

  it("4. a RUNNING checklist row -> false", () => {
    const items = completeChecklist();
    items[0].status = "RUNNING";
    const { gate } = assembleAndGate({ checklistItems: items });
    expect(gate.readyForPdf).toBe(false);
  });

  it("5. N/A gap leakage -> false", () => {
    const { gate } = assembleAndGate({
      groupedGaps: [gapRow({ evidence_json: [{ platform: "youtube", status: "N/A — Could Not Verify" }] })],
    });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => /unavailable evidence/i.test(r))).toBe(true);
  });

  it("live regression (2026-09-25, real Stripe run): a legitimate connected='N/A' on an Unverified social profile must never be mistaken for unavailable-evidence leakage", () => {
    // Real data from a live audit: social_profiles' own `connected: "N/A"`
    // is a CORRECT value for a platform whose profile itself is
    // Unverified (connection can't be evaluated). This must never block
    // the gate -- only the row's own status field matters, not every
    // field in the object.
    const { gate } = assembleAndGate({
      groupedGaps: [
        gapRow({
          gap_key: "social_profiles:not_found",
          affected_checks_json: [{ platform: "facebook", profileStatus: "Unverified", connected: "N/A" }],
          evidence_json: [{ platform: "facebook", profileStatus: "Unverified", evidence: "We found a possible profile but could not confidently confirm it belongs to the audited company." }],
        }),
      ],
    });
    expect(gate.readyForPdf).toBe(true);
    expect(gate.blockingReasons).toEqual([]);
  });

  it("6. a grouped gap missing evidence -> false", () => {
    const { gate } = assembleAndGate({ groupedGaps: [gapRow({ evidence_json: [] })] });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => /no evidence/i.test(r))).toBe(true);
  });

  it("7. a grouped gap missing affected checks -> false", () => {
    const { gate } = assembleAndGate({ groupedGaps: [gapRow({ affected_checks_json: [] })] });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => /no affected checks/i.test(r))).toBe(true);
  });

  it("8. interpretation PENDING -> false", () => {
    const { gate } = assembleAndGate({ groupedGaps: [gapRow({ validation_status: "PENDING" })] });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => r.includes("PENDING"))).toBe(true);
  });

  it("9. interpretation FAILED -> false", () => {
    const { gate } = assembleAndGate({ groupedGaps: [gapRow({ validation_status: "FAILED" })] });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => r.includes("FAILED"))).toBe(true);
  });

  it("10. FALLBACK_FACTS_ONLY is accepted", () => {
    const { gate } = assembleAndGate({ groupedGaps: [gapRow({ validation_status: "FALLBACK_FACTS_ONLY" })] });
    expect(gate.readyForPdf).toBe(true);
  });

  it("11. PASSED is accepted", () => {
    const { gate } = assembleAndGate({ groupedGaps: [gapRow({ validation_status: "PASSED" })] });
    expect(gate.readyForPdf).toBe(true);
  });

  it("13/15/16/17. exact 5 component keys and 8/10/6 structural totals", () => {
    const { report, gate } = assembleAndGate({});
    expect(Object.keys(report.component_results)).toHaveLength(5);
    expect(report.executive_fact_counts.social_profiles.total_platforms).toBe(8);
    expect(report.executive_fact_counts.directories.total_directories).toBe(10);
    expect(report.executive_fact_counts.technical_accessibility.total_crawlers).toBe(6);
    expect(gate.readyForPdf).toBe(true);
  });

  it("20. a safe PDF filename is always present when the gate passes", () => {
    const { report, gate } = assembleAndGate({});
    expect(gate.readyForPdf).toBe(true);
    expect(report.metadata.pdf_filename).toBe("Acme-Corp-AI-Visibility-Audit.pdf");
  });

  it("22. rerunning the same complete fixture does not change the gate outcome (stable, no duplicate logical result)", () => {
    const first = assembleAndGate({});
    const second = assembleAndGate({});
    expect(first.gate.readyForPdf).toBe(second.gate.readyForPdf);
    expect(first.gate.blockingReasons).toEqual(second.gate.blockingReasons);
  });

  it("24. a blocked report has exact, specific blocking_reasons -- never a generic message", () => {
    const { gate } = assembleAndGate({ componentResults: allComponentsComplete().slice(0, 4) });
    expect(gate.blockingReasons.length).toBeGreaterThan(0);
    for (const reason of gate.blockingReasons) {
      expect(reason.length).toBeGreaterThan(10);
      expect(reason).not.toBe("Failed.");
    }
  });

  it("silent checklist skip is caught: fewer checklist rows than the expected count -> false", () => {
    const { gate } = assembleAndGate({ checklistItems: completeChecklist().slice(0, 30) });
    expect(gate.readyForPdf).toBe(false);
    expect(gate.blockingReasons.some((r) => /expected 34/i.test(r))).toBe(true);
  });
});
