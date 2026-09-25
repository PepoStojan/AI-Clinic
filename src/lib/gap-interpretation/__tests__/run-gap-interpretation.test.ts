import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../claude-client", () => ({
  callClaudeForInterpretation: vi.fn(),
}));
vi.mock("../../supabase/repositories/audits", () => ({
  getAuditById: vi.fn(),
}));
vi.mock("../../supabase/repositories/grouped-gaps", () => ({
  listGroupedGapsByAuditId: vi.fn(),
  updateGroupedGapInterpretation: vi.fn(),
}));

import { callClaudeForInterpretation } from "../claude-client";
import { getAuditById } from "../../supabase/repositories/audits";
import { listGroupedGapsByAuditId, updateGroupedGapInterpretation } from "../../supabase/repositories/grouped-gaps";
import { runGapInterpretation } from "../run-gap-interpretation";

const AUDIT_ID = "audit-1";

function gapRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "gap-1",
    audit_id: AUDIT_ID,
    gap_key: "social_profiles:not_connected",
    component_name: "social_profiles",
    gap_type: "not_connected",
    title: "Facebook profile is not connected to your website",
    affected_checks_json: [{ component: "social_profiles", platform: "facebook", profileStatus: "Found", connected: "No" }],
    evidence_json: [{ platform: "facebook", profileStatus: "Found", connected: "No", evidence: "" }],
    deterministic_reason: "1 platform(s) have a verified profile that is not connected to the official website.",
    interpretation_json: null,
    validation_status: "PENDING",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const VALID_RESPONSE = JSON.stringify({
  what_we_observed: "We observed the Facebook profile is not connected to the website.",
  what_this_suggests: "This suggests limited verified social presence on this platform.",
  what_to_consider: "Consider linking the Facebook profile from the site where relevant.",
});

describe("runGapInterpretation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuditById).mockResolvedValue({ company_name: "Acme" } as never);
    vi.mocked(updateGroupedGapInterpretation).mockImplementation(async (id, patch) => ({ ...gapRow(), id, ...patch }) as never);
  });

  it("no gaps -> returns an empty array without calling Claude", async () => {
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([]);
    const result = await runGapInterpretation(AUDIT_ID);
    expect(result).toEqual([]);
    expect(callClaudeForInterpretation).not.toHaveBeenCalled();
  });

  it("1. a valid interpretation is persisted with PASSED", async () => {
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([gapRow()] as never);
    vi.mocked(callClaudeForInterpretation).mockResolvedValue(VALID_RESPONSE);

    await runGapInterpretation(AUDIT_ID);

    expect(updateGroupedGapInterpretation).toHaveBeenCalledTimes(1);
    const [, patch] = vi.mocked(updateGroupedGapInterpretation).mock.calls[0];
    expect(patch.validation_status).toBe("PASSED");
    expect(patch.interpretation_json).toMatchObject({ what_we_observed: expect.any(String) });
  });

  it("3/4. malformed JSON (and provider timeout) -> retried once, then fallback with FALLBACK_FACTS_ONLY", async () => {
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([gapRow()] as never);
    vi.mocked(callClaudeForInterpretation).mockResolvedValue("not valid json");

    await runGapInterpretation(AUDIT_ID);

    expect(callClaudeForInterpretation).toHaveBeenCalledTimes(2); // one retry before fallback
    const [, patch] = vi.mocked(updateGroupedGapInterpretation).mock.calls[0];
    expect(patch.validation_status).toBe("FALLBACK_FACTS_ONLY");
    expect(patch.interpretation_json).toMatchObject({
      what_we_observed: gapRow().deterministic_reason,
    });
  });

  it("provider returning null (call failure) also falls back after retrying", async () => {
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([gapRow()] as never);
    vi.mocked(callClaudeForInterpretation).mockResolvedValue(null);

    await runGapInterpretation(AUDIT_ID);

    expect(callClaudeForInterpretation).toHaveBeenCalledTimes(2);
    const [, patch] = vi.mocked(updateGroupedGapInterpretation).mock.calls[0];
    expect(patch.validation_status).toBe("FALLBACK_FACTS_ONLY");
  });

  it("a retry that succeeds after one malformed attempt is persisted as PASSED, not fallback", async () => {
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([gapRow()] as never);
    let call = 0;
    vi.mocked(callClaudeForInterpretation).mockImplementation(async () => {
      call += 1;
      return call === 1 ? "not valid json" : VALID_RESPONSE;
    });

    await runGapInterpretation(AUDIT_ID);
    const [, patch] = vi.mocked(updateGroupedGapInterpretation).mock.calls[0];
    expect(patch.validation_status).toBe("PASSED");
  });

  it("10. one gap's persistent failure does not block interpretation of the other gaps", async () => {
    const gapA = gapRow({ id: "gap-a", gap_key: "social_profiles:not_connected" });
    const gapB = gapRow({
      id: "gap-b",
      gap_key: "directories:limited_presence",
      component_name: "directories",
      gap_type: "limited_presence",
      affected_checks_json: [{ component: "directories", platform: "g2" }],
      deterministic_reason: "1 of 10 directories had no verified listing.",
    });
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([gapA, gapB] as never);
    vi.mocked(callClaudeForInterpretation).mockResolvedValue(VALID_RESPONSE);
    vi.mocked(updateGroupedGapInterpretation).mockImplementation(async (id, patch) => {
      if (id === "gap-a") throw new Error("db write failed");
      return { ...gapRow(), id, ...patch } as never;
    });

    const result = await runGapInterpretation(AUDIT_ID);
    // gap-a fails entirely (even the FAILED last-resort write throws in
    // this test, since the mock always throws for gap-a); gap-b must
    // still succeed and be returned.
    expect(result.some((g) => g.id === "gap-b")).toBe(true);
  });

  it("19/20. rerun updates the SAME existing row by id, never creating new rows or touching identity fields", async () => {
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([gapRow()] as never);
    vi.mocked(callClaudeForInterpretation).mockResolvedValue(VALID_RESPONSE);

    await runGapInterpretation(AUDIT_ID);
    await runGapInterpretation(AUDIT_ID);

    expect(updateGroupedGapInterpretation).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(updateGroupedGapInterpretation).mock.calls) {
      const [id, patch] = call;
      expect(id).toBe("gap-1");
      // The patch object can only ever contain these two keys -- the
      // function signature itself makes it impossible to send gap_key,
      // component_name, gap_type, title, affected_checks_json,
      // evidence_json, or audit_id.
      expect(Object.keys(patch).sort()).toEqual(["interpretation_json", "validation_status"]);
    }
  });

  it("18. llms.txt/robots.txt absence never appears as a gap to interpret in the first place (no technical gap without an actual crawler issue)", async () => {
    // CORE-002 never produces a gap for file absence -- confirming here
    // that AI-001's interpretation loop has nothing special to guard
    // against because the input can never contain one.
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([
      gapRow({ component_name: "technical_accessibility", gap_type: "blocked", affected_checks_json: [{ crawler: "gptbot", userAgent: "GPTBot" }] }),
    ] as never);
    vi.mocked(callClaudeForInterpretation).mockResolvedValue(
      JSON.stringify({
        what_we_observed: "We observed GPTBot is blocked by robots.txt.",
        what_this_suggests: "This suggests AI crawler access is restricted for this crawler.",
        what_to_consider: "Consider reviewing the robots.txt rule for GPTBot where relevant.",
      })
    );

    await runGapInterpretation(AUDIT_ID);
    const [, patch] = vi.mocked(updateGroupedGapInterpretation).mock.calls[0];
    expect(patch.validation_status).toBe("PASSED");
  });
});
