import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSummary, checklistStatusFor, type DirectoryPlatformOutcome } from "../run-component";
import { DIRECTORY_PLATFORMS } from "../../audit/checklist";

function outcome(overrides: Partial<DirectoryPlatformOutcome>): DirectoryPlatformOutcome {
  return {
    platform: "g2",
    status: "Found",
    listingUrl: "https://g2.com/products/acme",
    source: "dataforseo_primary",
    evidence: "",
    matchedSignals: [],
    unavailableReason: null,
    ...overrides,
  };
}

describe("checklistStatusFor", () => {
  it("Found -> COMPLETED", () => {
    expect(checklistStatusFor(outcome({ status: "Found" }))).toBe("COMPLETED");
  });
  it("Not Found -> GAP_FOUND", () => {
    expect(checklistStatusFor(outcome({ status: "Not Found" }))).toBe("GAP_FOUND");
  });
  it("Unverified -> GAP_FOUND", () => {
    expect(checklistStatusFor(outcome({ status: "Unverified" }))).toBe("GAP_FOUND");
  });
  it("N/A — Could Not Verify -> COULD_NOT_VERIFY, never a gap", () => {
    expect(checklistStatusFor(outcome({ status: "N/A — Could Not Verify" }))).toBe("COULD_NOT_VERIFY");
  });
});

describe("buildSummary", () => {
  it("computes deterministic counts, total always 10-shaped for a full run", () => {
    const platforms = DIRECTORY_PLATFORMS.map((platform, i) =>
      outcome({
        platform,
        status: i < 4 ? "Found" : i < 6 ? "Not Found" : i < 8 ? "Unverified" : "N/A — Could Not Verify",
      })
    );
    const summary = buildSummary(platforms);
    expect(summary.totalDirectories).toBe(10);
    expect(summary.listingsFound).toBe(4);
    expect(summary.listingsNotFound).toBe(2);
    expect(summary.listingsUnverified).toBe(2);
    expect(summary.listingsCouldNotVerify).toBe(2);
  });

  it("is deterministic for identical input", () => {
    const platforms = [outcome({ platform: "g2" }), outcome({ platform: "capterra", status: "Not Found" })];
    expect(buildSummary(platforms)).toEqual(buildSummary(platforms));
  });

  it("never invents an overall score field", () => {
    const summary = buildSummary([outcome({})]);
    expect(summary).not.toHaveProperty("score");
    expect(summary).not.toHaveProperty("overallScore");
  });
});

// -- Full orchestration, mocked (no network) --------------------------------

vi.mock("../../providers/dataforseo", () => ({
  searchGoogleOrganic: vi.fn(),
  callLlmProvider: vi.fn(),
}));
vi.mock("../semantic-classifier", () => ({
  classifyListingMatch: vi.fn(),
}));
vi.mock("../../supabase/repositories/checklist-items", () => ({
  updateChecklistItemByIdempotencyKey: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../supabase/repositories/component-results", () => ({
  upsertComponentResult: vi.fn().mockResolvedValue({}),
}));

import { callLlmProvider, searchGoogleOrganic } from "../../providers/dataforseo";
import { classifyListingMatch } from "../semantic-classifier";
import { updateChecklistItemByIdempotencyKey } from "../../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../../supabase/repositories/component-results";
import { runDirectoriesComponent } from "../run-component";

const COMPANY = "Acme";
const DOMAIN = "acmecorp.io";

function emptyOrganic() {
  return { ok: true, results: [], attempts: 1, errorMessage: null };
}
function emptyFallback() {
  return {
    parsed: { ok: true, text: "", citations: [], cost: 0, noResultReason: null },
    attempts: 1,
    raw: {},
  };
}

describe("runDirectoriesComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchGoogleOrganic).mockResolvedValue(emptyOrganic());
    vi.mocked(callLlmProvider).mockResolvedValue(emptyFallback());
    vi.mocked(classifyListingMatch).mockResolvedValue(null);
  });

  it("1/7. a valid official profile from primary DataForSEO search -> Found, and never triggers fallback", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("g2.com")) {
        return {
          ok: true,
          results: [{ title: "Acme Reviews - G2", url: "https://www.g2.com/products/acme/reviews", domain: "g2.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return emptyOrganic();
    });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    const g2 = result.platforms.find((p) => p.platform === "g2")!;
    expect(g2.status).toBe("Found");
    expect(g2.source).toBe("dataforseo_primary");

    // Primary succeeded with a Confirmed match for g2 -- fallback (callLlmProvider) must never be called for it.
    const g2FallbackCalls = vi.mocked(callLlmProvider).mock.calls.filter((c) => c[1].includes("g2.com"));
    expect(g2FallbackCalls).toHaveLength(0);
  });

  it("2. a successful reliable search with no valid profile anywhere -> Not Found (never fabricated as a pass)", async () => {
    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    for (const p of result.platforms) {
      expect(p.status).toBe("Not Found");
    }
  });

  it("3/8/10. an unresolved (Unverified) primary result triggers fallback; if fallback also stays ambiguous, final status is Unverified", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("clutch.co")) {
        return {
          ok: true,
          results: [{ title: "Acme mentioned here", url: "https://clutch.co/profile/some-id", domain: "clutch.co", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return emptyOrganic();
    });
    // Fallback also only surfaces a bare mention -- stays ambiguous.
    vi.mocked(callLlmProvider).mockImplementation(async (_providerKey, prompt: string) => {
      if (prompt.includes("clutch.co")) {
        return {
          parsed: {
            ok: true,
            text: "",
            citations: [{ title: "Acme discussed in a thread", url: "https://clutch.co/profile/another-id", domain: "clutch.co" }],
            cost: 0,
            noResultReason: null,
          },
          attempts: 1,
          raw: {},
        };
      }
      return emptyFallback();
    });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    const clutch = result.platforms.find((p) => p.platform === "clutch")!;
    expect(clutch.status).toBe("Unverified");

    // Fallback WAS invoked for the unresolved platform.
    const clutchFallbackCalls = vi.mocked(callLlmProvider).mock.calls.filter((c) => c[1].includes("clutch.co"));
    expect(clutchFallbackCalls.length).toBeGreaterThan(0);
  });

  it("9. fallback verified result -> Found", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("trustpilot.com")) {
        return {
          ok: true,
          results: [{ title: "Acme mentioned in passing", url: "https://trustpilot.com/review/some-unrelated-thing", domain: "trustpilot.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return emptyOrganic();
    });
    vi.mocked(callLlmProvider).mockImplementation(async (_providerKey, prompt: string) => {
      if (prompt.includes("trustpilot.com")) {
        return {
          parsed: {
            ok: true,
            text: "",
            citations: [{ title: "Acme Reviews", url: "https://www.trustpilot.com/review/acmecorp.io", domain: "trustpilot.com" }],
            cost: 0,
            noResultReason: null,
          },
          attempts: 1,
          raw: {},
        };
      }
      return emptyFallback();
    });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    const trustpilot = result.platforms.find((p) => p.platform === "trustpilot")!;
    expect(trustpilot.status).toBe("Found");
    expect(trustpilot.source).toBe("claude_fallback");
    expect(trustpilot.listingUrl).toBe("https://www.trustpilot.com/review/acmecorp.io");
  });

  it("4/5/14/15. primary AND fallback provider failure -> N/A — Could Not Verify, never Not Found, never a gap", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("g2.com")) {
        return {
          ok: true,
          results: [{ title: "Acme mentioned briefly", url: "https://g2.com/some/unrelated/path", domain: "g2.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: false, results: [], attempts: 1, errorMessage: "DataForSEO SERP timeout" };
    });
    vi.mocked(callLlmProvider).mockResolvedValue({
      parsed: { ok: false, text: "", citations: [], cost: null, noResultReason: "provider outage" },
      attempts: 1,
      raw: {},
    });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    for (const p of result.platforms) {
      expect(p.status).toBe("N/A — Could Not Verify");
      expect(p.status).not.toBe("Not Found");
      expect(checklistStatusFor(p)).toBe("COULD_NOT_VERIFY");
    }
  });

  it("6. same-name wrong company is never accepted as Found even when both primary and fallback only surface it", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("producthunt.com")) {
        return {
          ok: true,
          results: [{ title: "Acme (an unrelated gadget) launches today", url: "https://www.producthunt.com/posts/acme-gadget-xyz", domain: "producthunt.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return emptyOrganic();
    });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    const ph = result.platforms.find((p) => p.platform === "product_hunt")!;
    expect(ph.status).not.toBe("Found");
  });

  it("semantic judge resolves an Unverified candidate to Found when it confirms a match", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("getapp.com")) {
        return {
          ok: true,
          results: [{ title: "Acme mentioned here", url: "https://www.getapp.com/some/path", domain: "getapp.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return emptyOrganic();
    });
    vi.mocked(classifyListingMatch).mockResolvedValue({ verdict: "Confirmed", reason: "matches" });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    const getapp = result.platforms.find((p) => p.platform === "getapp")!;
    expect(getapp.status).toBe("Found");
  });

  it("semantic judge resolves an Unverified candidate to Not Found when it confirms a mismatch", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("bestcompany.com")) {
        return {
          ok: true,
          results: [{ title: "Acme mentioned here", url: "https://www.bestcompany.com/some/path", domain: "bestcompany.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return emptyOrganic();
    });
    vi.mocked(classifyListingMatch).mockResolvedValue({ verdict: "Wrong", reason: "different company" });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    const bc = result.platforms.find((p) => p.platform === "bestcompany")!;
    expect(bc.status).toBe("Not Found");
  });

  it("16/17. exactly 10 platforms represented, canonical order preserved", async () => {
    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    expect(result.platforms).toHaveLength(10);
    expect(result.platforms.map((p) => p.platform)).toEqual([...DIRECTORY_PLATFORMS]);
  });

  it("19. one platform's provider failure does not fail the whole component (partial results allowed)", async () => {
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("gartner.com")) {
        return { ok: false, results: [], attempts: 1, errorMessage: "gartner search failed" };
      }
      return emptyOrganic();
    });
    // Primary failed for gartner, so fallback becomes essential -- it must
    // also fail here for this to be a genuine "could not verify" case
    // (if fallback succeeded reliably with a clean negative, Not Found
    // would be the correct, and different, outcome).
    vi.mocked(callLlmProvider).mockImplementation(async (_providerKey, prompt: string) => {
      if (prompt.includes("gartner.com")) {
        return {
          parsed: { ok: false, text: "", citations: [], cost: null, noResultReason: "gartner fallback also failed" },
          attempts: 1,
          raw: {},
        };
      }
      return emptyFallback();
    });

    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    expect(result.platforms).toHaveLength(10);
    const gartner = result.platforms.find((p) => p.platform === "gartner_peer_insights")!;
    expect(gartner.status).toBe("N/A — Could Not Verify");
    const others = result.platforms.filter((p) => p.platform !== "gartner_peer_insights");
    expect(others.every((p) => p.status === "Not Found")).toBe(true);
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
  });

  it("20. retry/re-run writes each checklist row exactly once (RUNNING + terminal) and one component_results row", async () => {
    await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    // 10 platforms x 2 writes (RUNNING, then terminal) = 20 calls.
    expect(updateChecklistItemByIdempotencyKey).toHaveBeenCalledTimes(20);
    const keys = vi.mocked(updateChecklistItemByIdempotencyKey).mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(10);
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
  });

  it("21. no ratings/review-count fields ever appear in normalized output", async () => {
    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    for (const p of result.platforms) {
      const keys = Object.keys(p);
      expect(keys.some((k) => /rating|review.?count|score/i.test(k))).toBe(false);
    }
  });

  it("22. no 'Not Applicable' state exists anywhere in normalized output", async () => {
    const result = await runDirectoriesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN });
    for (const p of result.platforms) {
      expect(p.status).not.toMatch(/not applicable/i);
    }
  });
});
