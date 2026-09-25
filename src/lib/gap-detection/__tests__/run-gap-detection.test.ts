import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/repositories/component-results", () => ({
  listComponentResultsByAuditId: vi.fn(),
}));
vi.mock("../../supabase/repositories/grouped-gaps", () => ({
  replaceGroupedGapsForAudit: vi.fn(),
}));

import { listComponentResultsByAuditId } from "../../supabase/repositories/component-results";
import { replaceGroupedGapsForAudit } from "../../supabase/repositories/grouped-gaps";
import { runGapDetection } from "../run-gap-detection";

const AUDIT_ID = "audit-1";

function componentRow(componentName: string, normalized: unknown) {
  return {
    id: "cr-1",
    audit_id: AUDIT_ID,
    component_name: componentName,
    status: "COMPLETED",
    raw_result_json: {},
    normalized_result_json: normalized,
    started_at: null,
    completed_at: null,
  };
}

describe("runGapDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replaceGroupedGapsForAudit).mockImplementation(async (_auditId, rows) => rows as never);
  });

  it("27/28. every produced gap has affected checks and supporting evidence", async () => {
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([
      componentRow("brand_recognition", {
        providers: [{ provider: "openai", recognitionStatus: "Inaccurate", evidence: "wrong facts" }],
      }),
    ] as never);

    await runGapDetection(AUDIT_ID);

    const rows = vi.mocked(replaceGroupedGapsForAudit).mock.calls[0][1];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row.affected_checks_json as unknown[]).length).toBeGreaterThan(0);
      expect((row.evidence_json as unknown[]).length).toBeGreaterThan(0);
      expect(row.validation_status).toBe("PENDING");
      expect(row.interpretation_json).toBeNull();
    }
  });

  it("29. N/A / unavailable evidence never enters grouped_gaps", async () => {
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([
      componentRow("social_profiles", {
        platforms: [
          { platform: "linkedin", profileStatus: "Found", connected: "Yes", evidence: "" },
          { platform: "youtube", profileStatus: "N/A — Could Not Verify", connected: "N/A", evidence: "" },
        ],
      }),
    ] as never);

    await runGapDetection(AUDIT_ID);
    const rows = vi.mocked(replaceGroupedGapsForAudit).mock.calls[0][1];
    expect(rows).toHaveLength(0);
  });

  it("30. one clean component produces zero gaps (no phantom gaps)", async () => {
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([
      componentRow("technical_accessibility", {
        crawlers: [
          { crawler: "googlebot", userAgent: "Googlebot", status: "Allowed", reason: "" },
          { crawler: "bingbot", userAgent: "Bingbot", status: "Cannot Verify", reason: "" },
        ],
      }),
    ] as never);

    await runGapDetection(AUDIT_ID);
    const rows = vi.mocked(replaceGroupedGapsForAudit).mock.calls[0][1];
    expect(rows).toHaveLength(0);
  });

  it("a component that hasn't run yet contributes no gaps (not an error)", async () => {
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([] as never);
    const result = await runGapDetection(AUDIT_ID);
    expect(result).toEqual([]);
    expect(vi.mocked(replaceGroupedGapsForAudit).mock.calls[0][1]).toHaveLength(0);
  });

  it("25/26. rerun calls the replace (delete + rebuild) strategy every time -- never a plain insert that could duplicate or leave stale rows", async () => {
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([
      componentRow("directories", { platforms: [{ platform: "g2", status: "Not Found", evidence: "" }] }),
    ] as never);

    await runGapDetection(AUDIT_ID);
    await runGapDetection(AUDIT_ID);

    expect(replaceGroupedGapsForAudit).toHaveBeenCalledTimes(2);
    // Each call passes the audit id and a freshly-computed row set --
    // replaceGroupedGapsForAudit itself (tested separately at the
    // repository level) is what guarantees delete-then-insert, so a
    // second call with an identical row set is what "no duplication, no
    // stale survivors" reduces to at this layer.
    const [firstCallRows] = vi.mocked(replaceGroupedGapsForAudit).mock.calls[0].slice(1);
    const [secondCallRows] = vi.mocked(replaceGroupedGapsForAudit).mock.calls[1].slice(1);
    expect(firstCallRows).toEqual(secondCallRows);
  });

  it("gathers gaps across multiple components in one run", async () => {
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([
      componentRow("brand_recognition", { providers: [{ provider: "openai", recognitionStatus: "Inaccurate", evidence: "" }] }),
      componentRow("directories", { platforms: [{ platform: "g2", status: "Not Found", evidence: "" }] }),
    ] as never);

    await runGapDetection(AUDIT_ID);
    const rows = vi.mocked(replaceGroupedGapsForAudit).mock.calls[0][1];
    expect(rows.map((r) => r.component_name).sort()).toEqual(["brand_recognition", "directories"]);
  });
});
