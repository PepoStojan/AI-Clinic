// Live smoke verification for COMP-004 Directories.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATAFORSEO_LOGIN,
// and DATAFORSEO_PASSWORD. Skipped automatically otherwise. Deliberately a
// SINGLE audit / SINGLE component run against a clearly identifiable
// company (cost control) -- exercises the DataForSEO primary search across
// all 10 platforms, and the Claude live-search fallback only for whichever
// platforms primary leaves unresolved. Asserts structural correctness, not
// exact discovery outcomes, since live provider output is non-deterministic.

import { afterAll, describe, expect, it } from "vitest";
import { DIRECTORY_PLATFORMS } from "../../src/lib/audit/checklist";
import { runDirectoriesComponent } from "../../src/lib/directories/run-component";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { listChecklistItemsByAuditId } from "../../src/lib/supabase/repositories/checklist-items";
import { listComponentResultsByAuditId } from "../../src/lib/supabase/repositories/component-results";

const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
);

const TERMINAL_CHECKLIST_STATUSES = new Set(["COMPLETED", "GAP_FOUND", "COULD_NOT_VERIFY", "FAILED"]);
const CANONICAL_STATUSES = new Set(["Found", "Not Found", "Unverified", "N/A — Could Not Verify"]);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("COMP-004 Directories (live smoke test)", () => {
  it("checks all 10 platforms once for a real audit and reaches a consistent terminal state", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Stripe",
      websiteUrl: "https://stripe.com",
      mainPrompts: ["What is Stripe?"],
    });
    createdAuditIds.push(audit.auditId);

    const result = await runDirectoriesComponent({
      auditId: audit.auditId,
      companyName: "Stripe",
      registeredDomain: "stripe.com",
    });

    expect(result.platforms).toHaveLength(10);
    expect(result.platforms.map((p) => p.platform)).toEqual([...DIRECTORY_PLATFORMS]);
    for (const platform of DIRECTORY_PLATFORMS) {
      const outcome = result.platforms.find((p) => p.platform === platform);
      expect(outcome).toBeDefined();
      expect(CANONICAL_STATUSES.has(outcome!.status)).toBe(true);
      // Provider failure must never surface as Not Found.
      if (outcome!.unavailableReason) {
        expect(outcome!.status).toBe("N/A — Could Not Verify");
      }
      // No ratings/review-count fields anywhere.
      expect(Object.keys(outcome!).some((k) => /rating|review.?count|score/i.test(k))).toBe(false);
    }

    expect(result.summary.totalDirectories).toBe(10);

    const checklist = (await listChecklistItemsByAuditId(audit.auditId)).filter(
      (row) => row.component_name === "directories"
    );
    expect(checklist).toHaveLength(10);
    for (const row of checklist) {
      expect(TERMINAL_CHECKLIST_STATUSES.has(row.status)).toBe(true);
    }
    for (const row of checklist) {
      const outcome = result.platforms.find((p) => p.platform === row.check_key);
      if (outcome?.status === "N/A — Could Not Verify") {
        expect(row.status).toBe("COULD_NOT_VERIFY");
      }
    }

    const componentResults = await listComponentResultsByAuditId(audit.auditId);
    const directoriesResult = componentResults.find((row) => row.component_name === "directories");
    expect(directoriesResult).toBeDefined();
    expect(directoriesResult!.status).toBe("COMPLETED");
    expect(componentResults.filter((row) => row.component_name === "directories")).toHaveLength(1);
  }, 180_000);
});
