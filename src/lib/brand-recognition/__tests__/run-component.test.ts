import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSummary, checklistStatusFor, type BrandRecognitionProviderOutcome } from "../run-component";

function outcome(
  overrides: Partial<BrandRecognitionProviderOutcome>
): BrandRecognitionProviderOutcome {
  return {
    provider: "openai",
    recognitionStatus: "Accurate",
    evidence: "",
    source: "No source provided.",
    providerUnavailable: false,
    accuracyUnavailable: false,
    errorMessage: null,
    attempts: 1,
    ...overrides,
  };
}

describe("checklistStatusFor", () => {
  it("maps Accurate to COMPLETED", () => {
    expect(checklistStatusFor(outcome({ recognitionStatus: "Accurate" }))).toBe("COMPLETED");
  });

  it("maps Partially Accurate, Inaccurate, and Not Recognized to GAP_FOUND", () => {
    expect(checklistStatusFor(outcome({ recognitionStatus: "Partially Accurate" }))).toBe("GAP_FOUND");
    expect(checklistStatusFor(outcome({ recognitionStatus: "Inaccurate" }))).toBe("GAP_FOUND");
    expect(checklistStatusFor(outcome({ recognitionStatus: "Not Recognized" }))).toBe("GAP_FOUND");
  });

  it("maps No Result to COULD_NOT_VERIFY, never GAP_FOUND (No Result is not a gap)", () => {
    expect(
      checklistStatusFor(outcome({ recognitionStatus: "No Result", providerUnavailable: true }))
    ).toBe("COULD_NOT_VERIFY");
    expect(
      checklistStatusFor(outcome({ recognitionStatus: "No Result", accuracyUnavailable: true }))
    ).toBe("COULD_NOT_VERIFY");
  });
});

describe("buildSummary", () => {
  it("matches the Build Spec's approved narrative pattern exactly", () => {
    // Three systems recognized the brand; accuracy was confirmed for two.
    // One accuracy check and one provider result were unavailable.
    const summary = buildSummary([
      outcome({ provider: "openai", recognitionStatus: "Accurate" }),
      outcome({ provider: "gemini", recognitionStatus: "Accurate" }),
      outcome({ provider: "claude", recognitionStatus: "No Result", accuracyUnavailable: true }),
      outcome({ provider: "google", recognitionStatus: "No Result", providerUnavailable: true }),
    ]);

    expect(summary.recognized_by).toBe(3);
    expect(summary.accuracy_confirmed).toBe(2);
    expect(summary.accuracy_unavailable).toBe(1);
    expect(summary.provider_could_not_verify).toBe(1);
    expect(summary.narrative).toBe(
      "3 systems recognized the brand; accuracy was confirmed for 2. " +
        "1 accuracy check and 1 provider result were unavailable."
    );
  });

  it("never counts a provider with unavailable accuracy as accuracy_confirmed (D-052)", () => {
    const summary = buildSummary([
      outcome({ recognitionStatus: "No Result", accuracyUnavailable: true }),
    ]);
    expect(summary.accuracy_confirmed).toBe(0);
    expect(summary.narrative).not.toMatch(/confirmed for 1/);
  });

  it("excludes a genuinely Not Recognized provider from recognized_by", () => {
    const summary = buildSummary([outcome({ recognitionStatus: "Not Recognized" })]);
    expect(summary.recognized_by).toBe(0);
  });

  it("is deterministic for identical input", () => {
    const providers = [
      outcome({ provider: "openai", recognitionStatus: "Accurate" }),
      outcome({ provider: "gemini", recognitionStatus: "Partially Accurate" }),
    ];
    expect(buildSummary(providers)).toEqual(buildSummary(providers));
  });

  it("omits the unavailable sentence entirely when nothing is unavailable", () => {
    const summary = buildSummary([outcome({ recognitionStatus: "Accurate" })]);
    expect(summary.narrative).toBe("1 system recognized the brand; accuracy was confirmed for 1.");
  });
});

// -- Full orchestration, mocked (no network) --------------------------------

vi.mock("../../providers/dataforseo", () => ({
  callLlmProvider: vi.fn(),
  callGoogleAiMode: vi.fn(),
}));
vi.mock("../classifier", () => ({
  classifyBrandRecognitionAnswer: vi.fn(),
}));
vi.mock("../../supabase/repositories/checklist-items", () => ({
  updateChecklistItemByIdempotencyKey: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../supabase/repositories/component-results", () => ({
  upsertComponentResult: vi.fn().mockResolvedValue({}),
}));

import { callGoogleAiMode, callLlmProvider } from "../../providers/dataforseo";
import { classifyBrandRecognitionAnswer } from "../classifier";
import { updateChecklistItemByIdempotencyKey } from "../../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../../supabase/repositories/component-results";
import { runBrandRecognitionComponent } from "../run-component";

describe("runBrandRecognitionComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("one unavailable provider does not fail the whole component (partial results allowed)", async () => {
    vi.mocked(callLlmProvider).mockImplementation(async (providerKey) => {
      if (providerKey === "chat_gpt") {
        throw new Error("simulated OpenAI outage");
      }
      return {
        parsed: { ok: true, text: "Acme Corp is a software company.", citations: [], cost: 0.001, noResultReason: null },
        attempts: 1,
        raw: {},
      };
    });
    vi.mocked(callGoogleAiMode).mockResolvedValue({
      parsed: { ok: true, text: "Acme Corp builds tools.", citations: [], cost: 0, noResultReason: null },
      attempts: 1,
      raw: {},
    });
    vi.mocked(classifyBrandRecognitionAnswer).mockResolvedValue({
      status: "Accurate",
      evidence: "Matches.",
    });

    const result = await runBrandRecognitionComponent({
      auditId: "audit-1",
      companyName: "Acme Corp",
      registeredDomain: "acme.example.com",
      websiteUrl: "https://acme.example.com",
    });

    expect(result.providers).toHaveLength(4);
    const openai = result.providers.find((p) => p.provider === "openai");
    expect(openai?.recognitionStatus).toBe("No Result");
    expect(openai?.providerUnavailable).toBe(true);

    const others = result.providers.filter((p) => p.provider !== "openai");
    expect(others.every((p) => p.recognitionStatus === "Accurate")).toBe(true);

    // Component still writes one row, not an exception -- partial is allowed.
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
    // 4 providers x 2 checklist writes (RUNNING, then terminal) = 8 calls.
    expect(updateChecklistItemByIdempotencyKey).toHaveBeenCalledTimes(8);
  });
});
