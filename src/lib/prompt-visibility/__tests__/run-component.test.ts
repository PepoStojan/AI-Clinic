import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSummary,
  checklistStatusFor,
  type PromptVisibilityProviderOutcome,
} from "../run-component";

function outcome(overrides: Partial<PromptVisibilityProviderOutcome>): PromptVisibilityProviderOutcome {
  return {
    targetId: "target-1",
    promptIndex: 0,
    prompt: "What is Acme?",
    provider: "chatgpt",
    mentionClass: "Strong Mention",
    entityStatus: "Confirmed Entity Match",
    evidence: "",
    citations: [],
    providerUnavailable: false,
    errorMessage: null,
    attempts: 1,
    ...overrides,
  };
}

describe("checklistStatusFor", () => {
  it("maps Strong Mention, Mentioned, and Cited Only to COMPLETED", () => {
    expect(checklistStatusFor("Strong Mention")).toBe("COMPLETED");
    expect(checklistStatusFor("Mentioned")).toBe("COMPLETED");
    expect(checklistStatusFor("Cited Only")).toBe("COMPLETED");
  });

  it("maps Ambiguous and Not Mentioned to GAP_FOUND", () => {
    expect(checklistStatusFor("Ambiguous")).toBe("GAP_FOUND");
    expect(checklistStatusFor("Not Mentioned")).toBe("GAP_FOUND");
  });

  it("maps No Result to COULD_NOT_VERIFY, never GAP_FOUND (No Result is not a gap)", () => {
    expect(checklistStatusFor("No Result")).toBe("COULD_NOT_VERIFY");
  });
});

describe("buildSummary", () => {
  it("excludes No Result from the evaluable denominator", () => {
    const summary = buildSummary([
      outcome({ mentionClass: "Strong Mention" }),
      outcome({ mentionClass: "Mentioned" }),
      outcome({ mentionClass: "Not Mentioned" }),
      outcome({ mentionClass: "No Result" }),
    ]);
    expect(summary.totalChecks).toBe(4);
    expect(summary.evaluableChecks).toBe(3); // 4 - 1 No Result
    expect(summary.noResult).toBe(1);
  });

  it("counts each mention class independently", () => {
    const summary = buildSummary([
      outcome({ mentionClass: "Strong Mention" }),
      outcome({ mentionClass: "Mentioned" }),
      outcome({ mentionClass: "Cited Only" }),
      outcome({ mentionClass: "Ambiguous" }),
      outcome({ mentionClass: "Not Mentioned" }),
    ]);
    expect(summary.strongMentions).toBe(1);
    expect(summary.mentioned).toBe(1);
    expect(summary.citedOnly).toBe(1);
    expect(summary.ambiguous).toBe(1);
    expect(summary.notMentioned).toBe(1);
    expect(summary.noResult).toBe(0);
    expect(summary.evaluableChecks).toBe(5);
  });
});

// -- Full orchestration, mocked (no network) --------------------------------

vi.mock("../../providers/dataforseo", () => ({
  callLlmProvider: vi.fn(),
  callGoogleAiMode: vi.fn(),
}));
vi.mock("../classifier", () => ({
  classifyEntityMatch: vi.fn(),
}));
vi.mock("../../supabase/repositories/checklist-items", () => ({
  updateChecklistItemByIdempotencyKey: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../supabase/repositories/component-results", () => ({
  upsertComponentResult: vi.fn().mockResolvedValue({}),
}));

import { callGoogleAiMode, callLlmProvider } from "../../providers/dataforseo";
import { classifyEntityMatch } from "../classifier";
import { updateChecklistItemByIdempotencyKey } from "../../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../../supabase/repositories/component-results";
import { runPromptVisibilityComponent } from "../run-component";

describe("runPromptVisibilityComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("one target x one prompt x 4 providers: domain citation -> Strong Mention, and no result is excluded from the denominator", async () => {
    vi.mocked(callLlmProvider).mockImplementation(async (providerKey) => {
      if (providerKey === "chat_gpt") {
        throw new Error("simulated ChatGPT outage");
      }
      if (providerKey === "gemini") {
        return {
          parsed: {
            ok: true,
            text: "Acme is a widget company.",
            citations: [{ title: "Acme site", url: "https://acme.example/about", domain: "acme.example" }],
            cost: 0.001,
            noResultReason: null,
          },
          attempts: 1,
          raw: {},
        };
      }
      // claude
      return {
        parsed: { ok: true, text: "I have no information about this.", citations: [], cost: 0.001, noResultReason: null },
        attempts: 1,
        raw: {},
      };
    });
    vi.mocked(callGoogleAiMode).mockResolvedValue({
      parsed: { ok: false, text: "", citations: [], cost: null, noResultReason: "No AI Overview generated" },
      attempts: 1,
      raw: {},
    });
    vi.mocked(classifyEntityMatch).mockResolvedValue({
      entity_status: "Wrong Entity",
      confidence: 80,
      reason: "unrelated company",
    });

    const result = await runPromptVisibilityComponent({
      auditId: "audit-1",
      companyName: "Acme",
      registeredDomain: "acme.example",
      targets: [{ id: "target-1", prompts: ["What is Acme?"] }],
    });

    expect(result.providers).toHaveLength(4);

    const gemini = result.providers.find((p) => p.provider === "gemini");
    expect(gemini?.mentionClass).toBe("Strong Mention");
    expect(gemini?.entityStatus).toBe("Confirmed Entity Match");

    const chatgpt = result.providers.find((p) => p.provider === "chatgpt");
    expect(chatgpt?.mentionClass).toBe("No Result");
    expect(chatgpt?.providerUnavailable).toBe(true);

    const googleAi = result.providers.find((p) => p.provider === "google_ai");
    expect(googleAi?.mentionClass).toBe("No Result");

    const claude = result.providers.find((p) => p.provider === "claude");
    expect(claude?.mentionClass).toBe("Not Mentioned"); // No brand mention, no domain citation

    // No Result excluded from the denominator: 4 total, 2 No Result -> 2 evaluable.
    expect(result.summary.totalChecks).toBe(4);
    expect(result.summary.noResult).toBe(2);
    expect(result.summary.evaluableChecks).toBe(2);

    // Component still writes one row, not an exception -- partial is allowed.
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
    // 4 provider checks x 2 checklist writes (RUNNING, then terminal) = 8 calls.
    expect(updateChecklistItemByIdempotencyKey).toHaveBeenCalledTimes(8);
  });

  it("audited domain cited but brand not literally mentioned -> Cited Only, never Strong Mention", async () => {
    vi.mocked(callLlmProvider).mockResolvedValue({
      parsed: {
        ok: true,
        text: "Widgets are best sourced from a specialist manufacturer.",
        citations: [{ title: "Manufacturer site", url: "https://acme.example/products", domain: "acme.example" }],
        cost: 0.001,
        noResultReason: null,
      },
      attempts: 1,
      raw: {},
    });
    vi.mocked(callGoogleAiMode).mockResolvedValue({
      parsed: {
        ok: true,
        text: "Widgets are best sourced from a specialist manufacturer.",
        citations: [{ title: "Manufacturer site", url: "https://acme.example/products", domain: "acme.example" }],
        cost: 0,
        noResultReason: null,
      },
      attempts: 1,
      raw: {},
    });

    const result = await runPromptVisibilityComponent({
      auditId: "audit-1",
      companyName: "Acme",
      registeredDomain: "acme.example",
      targets: [{ id: "target-1", prompts: ["Best widget manufacturers"] }],
    });

    expect(result.providers.every((p) => p.mentionClass === "Cited Only")).toBe(true);
    expect(result.providers.every((p) => p.entityStatus === "Confirmed Entity Match")).toBe(true);
    expect(classifyEntityMatch).not.toHaveBeenCalled();
  });

  it("no duplicate checklist writes across a retried call for the same idempotency key", async () => {
    vi.mocked(callLlmProvider).mockResolvedValue({
      parsed: { ok: true, text: "Acme provides widgets.", citations: [], cost: 0.001, noResultReason: null },
      attempts: 2, // simulated one internal retry inside the provider adapter
      raw: {},
    });
    vi.mocked(callGoogleAiMode).mockResolvedValue({
      parsed: { ok: true, text: "Acme provides widgets.", citations: [], cost: 0, noResultReason: null },
      attempts: 1,
      raw: {},
    });
    vi.mocked(classifyEntityMatch).mockResolvedValue({ entity_status: "Probable Entity Match", confidence: 70, reason: "match" });

    await runPromptVisibilityComponent({
      auditId: "audit-1",
      companyName: "Acme",
      registeredDomain: "acme.example",
      targets: [{ id: "target-1", prompts: ["What is Acme?"] }],
    });

    // Exactly one RUNNING + one terminal write per provider check, no extras from retry.
    expect(updateChecklistItemByIdempotencyKey).toHaveBeenCalledTimes(8);
    const idempotencyKeys = vi.mocked(updateChecklistItemByIdempotencyKey).mock.calls.map((c) => c[0]);
    const uniqueKeys = new Set(idempotencyKeys);
    expect(uniqueKeys.size).toBe(4); // one key per provider check, written twice each
  });
});
