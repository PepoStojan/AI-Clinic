// Live smoke verification for COMP-005 Technical Accessibility.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY only -- this
// component makes no AI/provider calls (deterministic fetch + parse only).
// Skipped automatically otherwise. Deliberately a SINGLE audit / SINGLE
// component run against one well-known, safe public site (stripe.com,
// consistent with the other components' live smoke tests in this repo) --
// no other pages are ever fetched, only /robots.txt and /llms.txt.

import { afterAll, describe, expect, it } from "vitest";
import { TECHNICAL_CRAWLERS, TECHNICAL_FILES } from "../../src/lib/audit/checklist";
import { runTechnicalAccessibilityComponent } from "../../src/lib/technical-accessibility/run-component";
import { createAuditWithChecklist } from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { listChecklistItemsByAuditId } from "../../src/lib/supabase/repositories/checklist-items";
import { listComponentResultsByAuditId } from "../../src/lib/supabase/repositories/component-results";

const hasCredentials = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

const TERMINAL_CHECKLIST_STATUSES = new Set(["COMPLETED", "GAP_FOUND", "COULD_NOT_VERIFY", "FAILED"]);
const CANONICAL_CRAWLER_STATUSES = new Set(["Allowed", "Blocked", "Allowed with restrictions", "Cannot Verify"]);
const CANONICAL_FILE_STATUSES = new Set(["Found", "Not Found", "Cannot Verify"]);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("COMP-005 Technical Accessibility (live smoke test)", () => {
  it("fetches robots.txt/llms.txt once and evaluates all 6 crawlers for a real audit", async () => {
    const audit = await createAuditWithChecklist({
      firstName: "Test",
      lastName: "Runner",
      email: "test-runner@example.com",
      companyName: "Stripe",
      websiteUrl: "https://stripe.com",
      mainPrompts: ["What is Stripe?"],
    });
    createdAuditIds.push(audit.auditId);

    const result = await runTechnicalAccessibilityComponent({ auditId: audit.auditId, websiteUrl: "https://stripe.com" });

    expect(result.crawlers).toHaveLength(6);
    expect(CANONICAL_FILE_STATUSES.has(result.robotsTxtStatus)).toBe(true);
    expect(CANONICAL_FILE_STATUSES.has(result.llmsTxtStatus)).toBe(true);
    for (const c of result.crawlers) {
      expect(CANONICAL_CRAWLER_STATUSES.has(c.status)).toBe(true);
      expect(c.status).not.toBe("Blocked"); // this run must never fabricate a block from a fetch issue
    }
    expect(result.summary.totalCrawlers).toBe(6);

    const checklist = (await listChecklistItemsByAuditId(audit.auditId)).filter(
      (row) => row.component_name === "technical_accessibility"
    );
    expect(checklist).toHaveLength(8); // 6 crawlers + robots_txt + llms_txt
    for (const row of checklist) {
      expect(TERMINAL_CHECKLIST_STATUSES.has(row.status)).toBe(true);
    }

    // llms.txt absence must never become a gap.
    const llmsRow = checklist.find((row) => row.check_key === "llms_txt");
    if (result.llmsTxtStatus === "Not Found") {
      expect(llmsRow?.status).toBe("COMPLETED");
    }

    const componentResults = await listComponentResultsByAuditId(audit.auditId);
    const technicalResult = componentResults.find((row) => row.component_name === "technical_accessibility");
    expect(technicalResult).toBeDefined();
    expect(technicalResult!.status).toBe("COMPLETED");
    expect(componentResults.filter((row) => row.component_name === "technical_accessibility")).toHaveLength(1);

    // Exactly the 6 locked crawlers, no more, no less.
    expect(result.crawlers.map((c) => c.crawler).sort()).toEqual([...TECHNICAL_CRAWLERS].sort());
    expect(TECHNICAL_FILES).toEqual(["robots_txt", "llms_txt"]);
  }, 60_000);
});
