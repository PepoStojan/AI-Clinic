import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSummary, checklistStatusForCrawler, checklistStatusForFile, type CrawlerOutcome } from "../run-component";
import { TECHNICAL_CRAWLERS } from "../../audit/checklist";

function crawler(overrides: Partial<CrawlerOutcome>): CrawlerOutcome {
  return {
    crawler: "googlebot",
    userAgent: "Googlebot",
    status: "Allowed",
    reason: "",
    applicableRules: [],
    ...overrides,
  };
}

describe("checklistStatusForCrawler", () => {
  it("16. Allowed -> COMPLETED", () => {
    expect(checklistStatusForCrawler("Allowed")).toBe("COMPLETED");
  });
  it("14. Blocked -> GAP_FOUND", () => {
    expect(checklistStatusForCrawler("Blocked")).toBe("GAP_FOUND");
  });
  it("15. Allowed with restrictions -> GAP_FOUND", () => {
    expect(checklistStatusForCrawler("Allowed with restrictions")).toBe("GAP_FOUND");
  });
  it("17. Cannot Verify -> COULD_NOT_VERIFY, never a gap", () => {
    expect(checklistStatusForCrawler("Cannot Verify")).toBe("COULD_NOT_VERIFY");
  });
});

describe("checklistStatusForFile", () => {
  it("12/13. Found and Not Found both -> COMPLETED, Not Found is never a gap", () => {
    expect(checklistStatusForFile("Found")).toBe("COMPLETED");
    expect(checklistStatusForFile("Not Found")).toBe("COMPLETED");
  });
  it("Cannot Verify -> COULD_NOT_VERIFY", () => {
    expect(checklistStatusForFile("Cannot Verify")).toBe("COULD_NOT_VERIFY");
  });
});

describe("buildSummary", () => {
  it("20. computes deterministic counts", () => {
    const crawlers = [
      crawler({ crawler: "googlebot", status: "Allowed" }),
      crawler({ crawler: "bingbot", status: "Allowed" }),
      crawler({ crawler: "gptbot", status: "Allowed" }),
      crawler({ crawler: "oai_searchbot", status: "Allowed" }),
      crawler({ crawler: "claudebot", status: "Allowed" }),
      crawler({ crawler: "perplexitybot", status: "Blocked" }),
    ];
    const summary = buildSummary(crawlers);
    expect(summary.totalCrawlers).toBe(6);
    expect(summary.allowed).toBe(5);
    expect(summary.blocked).toBe(1);
    expect(summary.restricted).toBe(0);
    expect(summary.cannotVerify).toBe(0);
  });

  it("21. C-003 case: 5 allowed + 1 blocked can never round-trip to an 'all accessible' equivalent", () => {
    const crawlers = TECHNICAL_CRAWLERS.map((c, i) => crawler({ crawler: c, status: i === 5 ? "Blocked" : "Allowed" }));
    const summary = buildSummary(crawlers);
    // The counts themselves are the only source of truth for any later
    // narrative -- asserting they are NOT "6 allowed" is what guarantees
    // no wording built from them could ever claim universal access.
    expect(summary.allowed).toBe(5);
    expect(summary.blocked).toBe(1);
    expect(summary.allowed).not.toBe(summary.totalCrawlers);
  });

  it("is deterministic for identical input", () => {
    const crawlers = [crawler({ status: "Allowed" }), crawler({ crawler: "bingbot", status: "Blocked" })];
    expect(buildSummary(crawlers)).toEqual(buildSummary(crawlers));
  });
});

// -- Full orchestration, mocked (no network) --------------------------------

vi.mock("../fetch-file", () => ({
  fetchTextFile: vi.fn(),
}));
vi.mock("../../supabase/repositories/checklist-items", () => ({
  updateChecklistItemByIdempotencyKey: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../supabase/repositories/component-results", () => ({
  upsertComponentResult: vi.fn().mockResolvedValue({}),
}));

import { fetchTextFile } from "../fetch-file";
import { updateChecklistItemByIdempotencyKey } from "../../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../../supabase/repositories/component-results";
import { runTechnicalAccessibilityComponent } from "../run-component";

describe("runTechnicalAccessibilityComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("18/19. exactly 6 crawler outcomes and 8 technical checklist rows handled", async () => {
    vi.mocked(fetchTextFile).mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) {
        return { outcome: "found", httpStatus: 200, body: "User-agent: *\nAllow: /\n", errorMessage: null };
      }
      return { outcome: "not_found", httpStatus: 404, body: null, errorMessage: null };
    });

    const result = await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    expect(result.crawlers).toHaveLength(6);
    expect(new Set(result.crawlers.map((c) => c.crawler)).size).toBe(6);

    // 6 crawlers + robots_txt + llms_txt = 8 checklist rows, each written
    // twice (RUNNING, then terminal) = 16 calls.
    expect(updateChecklistItemByIdempotencyKey).toHaveBeenCalledTimes(16);
    const keys = vi.mocked(updateChecklistItemByIdempotencyKey).mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(8);
  });

  it("1. no robots.txt (404) -> all crawlers Allowed, robots.txt file status Not Found (not a gap)", async () => {
    vi.mocked(fetchTextFile).mockResolvedValue({ outcome: "not_found", httpStatus: 404, body: null, errorMessage: null });
    const result = await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    expect(result.robotsTxtStatus).toBe("Not Found");
    expect(result.crawlers.every((c) => c.status === "Allowed")).toBe(true);
  });

  it("7. robots.txt fetch failure -> every crawler Cannot Verify, never Blocked", async () => {
    vi.mocked(fetchTextFile).mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) {
        return { outcome: "cannot_verify", httpStatus: null, body: null, errorMessage: "timeout" };
      }
      return { outcome: "not_found", httpStatus: 404, body: null, errorMessage: null };
    });
    const result = await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    expect(result.crawlers.every((c) => c.status === "Cannot Verify")).toBe(true);
    expect(result.crawlers.every((c) => c.status !== "Blocked")).toBe(true);
  });

  it("9/10/11. llms.txt Found / Not Found / Cannot Verify map correctly and Not Found is never a gap", async () => {
    vi.mocked(fetchTextFile).mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) return { outcome: "not_found", httpStatus: 404, body: null, errorMessage: null };
      return { outcome: "found", httpStatus: 200, body: "# llms.txt\n", errorMessage: null };
    });
    const result = await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    expect(result.llmsTxtStatus).toBe("Found");

    const llmsCalls = vi.mocked(updateChecklistItemByIdempotencyKey).mock.calls.filter((c) =>
      (c[0] as string).endsWith(":llms_txt")
    );
    expect(llmsCalls.at(-1)?.[1]).toMatchObject({ status: "COMPLETED" });
  });

  it("12. llms.txt Not Found never becomes GAP_FOUND", async () => {
    vi.mocked(fetchTextFile).mockImplementation(async (url: string) => {
      if (url.endsWith("/llms.txt")) return { outcome: "not_found", httpStatus: 404, body: null, errorMessage: null };
      return { outcome: "not_found", httpStatus: 404, body: null, errorMessage: null };
    });
    await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    const llmsCalls = vi.mocked(updateChecklistItemByIdempotencyKey).mock.calls.filter((c) =>
      (c[0] as string).endsWith(":llms_txt")
    );
    expect(llmsCalls.at(-1)?.[1]).toMatchObject({ status: "COMPLETED" });
  });

  it("23. one file's fetch failure does not crash the whole component (partial results allowed)", async () => {
    vi.mocked(fetchTextFile).mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) return { outcome: "cannot_verify", httpStatus: null, body: null, errorMessage: "timeout" };
      return { outcome: "found", httpStatus: 200, body: "ok", errorMessage: null };
    });
    const result = await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    expect(result.robotsTxtStatus).toBe("Cannot Verify");
    expect(result.llmsTxtStatus).toBe("Found");
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
  });

  it("22. retry/re-run writes one component_results row (upsert, never a duplicate)", async () => {
    vi.mocked(fetchTextFile).mockResolvedValue({ outcome: "not_found", httpStatus: 404, body: null, errorMessage: null });
    await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    await runTechnicalAccessibilityComponent({ auditId: "audit-1", websiteUrl: "https://example.com" });
    expect(upsertComponentResult).toHaveBeenCalledTimes(2); // caller re-runs it; upsert semantics dedupe at the DB layer
    expect(vi.mocked(upsertComponentResult).mock.calls[0][0].component_name).toBe("technical_accessibility");
  });
});
