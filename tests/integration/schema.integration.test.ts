// Exercises the live Supabase schema created by
// supabase/migrations/20260923000001_init_core_schema.sql.
//
// Requires real credentials in the environment (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY). Skipped automatically otherwise -- this suite is
// not part of `npm test` and must be run explicitly with
// `npm run test:integration` after the migration has been applied.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";
import {
  createAudit,
  createAuditTarget,
  createComponentResult,
  createChecklistItem,
  createGroupedGap,
  createReport,
} from "../../src/lib/supabase/repositories";
import { buildIdempotencyKey } from "../../src/lib/audit/idempotency";

const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
);

describe.skipIf(!hasCredentials)("INFRA-001 schema validation", () => {
  const testRunId = randomUUID().slice(0, 8);
  const auditCode = `AIC-TEST-${testRunId}`;
  let auditId: string;

  beforeAll(async () => {
    const audit = await createAudit({
      audit_code: auditCode,
      contact_name: "Test Contact",
      contact_email: "test@example.com",
      company_name: "Test Co",
      website_url: "https://example.com",
      registered_domain: "example.com",
    });
    auditId = audit.id;
  });

  afterAll(async () => {
    if (!auditId) return;
    const supabase = getSupabaseServerClient();
    await supabase.from("audits").delete().eq("id", auditId);
  });

  it("creates a sample audit", () => {
    expect(auditId).toBeTruthy();
  });

  it("allows exactly one homepage target per audit", async () => {
    await createAuditTarget({
      audit_id: auditId,
      target_type: "homepage",
      url: "https://example.com",
      prompts: ["What is Test Co?"],
    });

    await expect(
      createAuditTarget({
        audit_id: auditId,
        target_type: "homepage",
        url: "https://example.com/other",
        prompts: [],
      })
    ).rejects.toThrow();
  });

  it("prevents duplicate component_results for the same component", async () => {
    await createComponentResult({
      audit_id: auditId,
      component_name: "brand_recognition",
    });

    await expect(
      createComponentResult({
        audit_id: auditId,
        component_name: "brand_recognition",
      })
    ).rejects.toThrow();
  });

  it("enforces idempotency on checklist_items", async () => {
    const idempotencyKey = buildIdempotencyKey({
      auditId,
      componentName: "brand_recognition",
      targetId: null,
      checkKey: "chatgpt_what_is",
    });

    await createChecklistItem({
      audit_id: auditId,
      component_name: "brand_recognition",
      check_key: "chatgpt_what_is",
      idempotency_key: idempotencyKey,
    });

    await expect(
      createChecklistItem({
        audit_id: auditId,
        component_name: "brand_recognition",
        check_key: "chatgpt_what_is",
        idempotency_key: idempotencyKey,
      })
    ).rejects.toThrow();
  });

  it("prevents duplicate grouped_gaps for the same gap_key", async () => {
    await createGroupedGap({
      audit_id: auditId,
      gap_key: "brand_recognition:partial",
      component_name: "brand_recognition",
      gap_type: "accuracy",
      title: "Test gap",
      evidence_json: { note: "test" },
      deterministic_reason: "test fixture",
    });

    await expect(
      createGroupedGap({
        audit_id: auditId,
        gap_key: "brand_recognition:partial",
        component_name: "brand_recognition",
        gap_type: "accuracy",
        title: "Test gap duplicate",
        evidence_json: { note: "test" },
        deterministic_reason: "test fixture",
      })
    ).rejects.toThrow();
  });

  it("supports multiple report versions for the same audit", async () => {
    const reportV1 = await createReport({
      audit_id: auditId,
      report_version: 1,
      canonical_report_json: { version: 1 },
      pre_pdf_checklist_json: {},
    });
    const reportV2 = await createReport({
      audit_id: auditId,
      report_version: 2,
      canonical_report_json: { version: 2 },
      pre_pdf_checklist_json: {},
    });

    expect(reportV1.report_version).toBe(1);
    expect(reportV2.report_version).toBe(2);
  });

  it("cascades deletes from audits to all dependent rows", async () => {
    const supabase = getSupabaseServerClient();
    await supabase.from("audits").delete().eq("id", auditId);

    const [targets, components, checklist, gaps, reports] = await Promise.all([
      supabase.from("audit_targets").select("id").eq("audit_id", auditId),
      supabase.from("component_results").select("id").eq("audit_id", auditId),
      supabase.from("checklist_items").select("id").eq("audit_id", auditId),
      supabase.from("grouped_gaps").select("id").eq("audit_id", auditId),
      supabase.from("reports").select("id").eq("audit_id", auditId),
    ]);

    expect(targets.data).toHaveLength(0);
    expect(components.data).toHaveLength(0);
    expect(checklist.data).toHaveLength(0);
    expect(gaps.data).toHaveLength(0);
    expect(reports.data).toHaveLength(0);

    // Already deleted above; prevent afterAll from deleting again.
    auditId = "";
  });
});
