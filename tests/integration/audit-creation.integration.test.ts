// Exercises the live CORE-001 audit-creation + checklist engine against the
// real Supabase schema. Requires NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SECRET_KEY -- skipped automatically otherwise.

import { afterAll, describe, expect, it } from "vitest";
import { countExpectedChecklistItems } from "../../src/lib/audit/checklist";
import {
  createAuditWithChecklist,
  regenerateChecklistForAudit,
} from "../../src/lib/audit/create-audit";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import { listAuditTargetsByAuditId } from "../../src/lib/supabase/repositories/audit-targets";
import { listChecklistItemsByAuditId } from "../../src/lib/supabase/repositories/checklist-items";
import type { AuditCreationInput } from "../../src/lib/audit/validation";

const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
);

const createdAuditIds: string[] = [];

afterAll(async () => {
  if (createdAuditIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("audits").delete().in("id", createdAuditIds);
});

describe.skipIf(!hasCredentials)("CORE-001 audit creation + checklist engine", () => {
  it("creates a brand-level audit with the expected checklist count", async () => {
    const input: AuditCreationInput = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      companyName: "Analytical Engines Inc",
      websiteUrl: "https://example.com",
      mainPrompts: ["What is Analytical Engines?"],
    };

    const result = await createAuditWithChecklist(input);
    createdAuditIds.push(result.auditId);

    expect(result.auditCode).toMatch(/^AIC-\d{4}-\d{6}$/);
    expect(result.status).toBe("CREATED");
    expect(result.homepageTarget.target_type).toBe("homepage");
    expect(result.homepageTarget.sort_order).toBe(0);
    expect(result.additionalTargets).toEqual([]);

    // 1 homepage target with 1 prompt: 30 + 4 * 1 = 34
    expect(result.totalChecklistItemCount).toBe(34);
    expect(result.totalChecklistItemCount).toBe(
      countExpectedChecklistItems([{ id: result.homepageTarget.id, prompts: ["x"] }])
    );

    const targets = await listAuditTargetsByAuditId(result.auditId);
    expect(targets).toHaveLength(1);
  });

  it("creates an audit with additional targets and expands prompt visibility per target", async () => {
    const input: AuditCreationInput = {
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
      companyName: "Compiler Co",
      websiteUrl: "https://compiler.example.com",
      mainPrompts: ["What is Compiler Co?", "What does Compiler Co offer?"],
      additionalTargets: [
        {
          name: "Pricing",
          url: "https://compiler.example.com/pricing",
          prompts: ["Is Compiler Co affordable?"],
        },
      ],
    };

    const result = await createAuditWithChecklist(input);
    createdAuditIds.push(result.auditId);

    expect(result.additionalTargets).toHaveLength(1);
    expect(result.additionalTargets[0].sort_order).toBe(1);

    // homepage: 2 prompts, additional: 1 prompt -> 30 + 4 * 3 = 42
    expect(result.totalChecklistItemCount).toBe(42);

    const checklist = await listChecklistItemsByAuditId(result.auditId);
    const promptVisibility = checklist.filter((row) => row.component_name === "prompt_visibility");
    expect(promptVisibility).toHaveLength(12);
    expect(
      promptVisibility.filter((row) => row.target_id === result.homepageTarget.id)
    ).toHaveLength(8);
    expect(
      promptVisibility.filter((row) => row.target_id === result.additionalTargets[0].id)
    ).toHaveLength(4);
  });

  it("deduplicates an additional target URL matching the homepage instead of creating a duplicate row", async () => {
    const input: AuditCreationInput = {
      firstName: "Alan",
      lastName: "Turing",
      email: "alan@example.com",
      companyName: "Enigma Co",
      websiteUrl: "https://enigma.example.com",
      mainPrompts: ["What is Enigma Co?"],
      additionalTargets: [{ url: "https://enigma.example.com/", prompts: [] }],
    };

    const result = await createAuditWithChecklist(input);
    createdAuditIds.push(result.auditId);

    expect(result.additionalTargets).toEqual([]);
    expect(result.droppedDuplicateTargetUrls).toEqual(["https://enigma.example.com/"]);

    const targets = await listAuditTargetsByAuditId(result.auditId);
    expect(targets).toHaveLength(1);
  });

  it("does not duplicate checklist rows when checklist generation is re-run for the same audit", async () => {
    const input: AuditCreationInput = {
      firstName: "Margaret",
      lastName: "Hamilton",
      email: "margaret@example.com",
      companyName: "Apollo Guidance",
      websiteUrl: "https://apollo.example.com",
      mainPrompts: ["What is Apollo Guidance?"],
    };

    const result = await createAuditWithChecklist(input);
    createdAuditIds.push(result.auditId);

    const countAfterFirstGeneration = await regenerateChecklistForAudit(result.auditId);
    const countAfterSecondGeneration = await regenerateChecklistForAudit(result.auditId);

    expect(countAfterFirstGeneration).toBe(result.totalChecklistItemCount);
    expect(countAfterSecondGeneration).toBe(countAfterFirstGeneration);
  });

  it("rejects invalid input without creating any audit row", async () => {
    const supabase = getSupabaseServerClient();
    const { count: before } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true });

    await expect(
      createAuditWithChecklist({
        firstName: "",
        lastName: "",
        email: "not-an-email",
        companyName: "",
        websiteUrl: "not-a-url",
        mainPrompts: [],
      })
    ).rejects.toThrow();

    const { count: after } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true });

    expect(after).toBe(before);
  });
});
