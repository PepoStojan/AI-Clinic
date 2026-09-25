import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/repositories/audits", () => ({ getAuditById: vi.fn() }));
vi.mock("../../supabase/repositories/audit-targets", () => ({ listAuditTargetsByAuditId: vi.fn() }));
vi.mock("../../supabase/repositories/component-results", () => ({ listComponentResultsByAuditId: vi.fn() }));
vi.mock("../../supabase/repositories/checklist-items", () => ({ listChecklistItemsByAuditId: vi.fn() }));
vi.mock("../../supabase/repositories/grouped-gaps", () => ({ listGroupedGapsByAuditId: vi.fn() }));
vi.mock("../../supabase/repositories/reports", () => ({
  getLatestReport: vi.fn(),
  upsertReportForAudit: vi.fn(),
}));

import { getAuditById } from "../../supabase/repositories/audits";
import { listAuditTargetsByAuditId } from "../../supabase/repositories/audit-targets";
import { listComponentResultsByAuditId } from "../../supabase/repositories/component-results";
import { listChecklistItemsByAuditId } from "../../supabase/repositories/checklist-items";
import { listGroupedGapsByAuditId } from "../../supabase/repositories/grouped-gaps";
import { getLatestReport, upsertReportForAudit } from "../../supabase/repositories/reports";
import { runReportAssembly } from "../run-report-assembly";

const AUDIT = {
  id: "audit-1",
  audit_code: "AIC-2026-000001",
  contact_name: "Jane Doe",
  contact_email: "jane@example.com",
  company_name: "Acme Corp",
  website_url: "https://acme.example",
  registered_domain: "acme.example",
  status: "COMPLETED",
  created_at: "",
  updated_at: "",
  completed_at: null,
};

describe("runReportAssembly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuditById).mockResolvedValue(AUDIT as never);
    vi.mocked(listAuditTargetsByAuditId).mockResolvedValue([]);
    vi.mocked(listComponentResultsByAuditId).mockResolvedValue([]);
    vi.mocked(listChecklistItemsByAuditId).mockResolvedValue([]);
    vi.mocked(listGroupedGapsByAuditId).mockResolvedValue([]);
    vi.mocked(upsertReportForAudit).mockImplementation(async (auditId, data) => ({
      id: "report-1",
      audit_id: auditId,
      report_version: 1,
      pdf_storage_path: null,
      generated_at: null,
      created_at: "",
      ...data,
    }) as never);
  });

  it("throws a clear error when the audit does not exist, rather than assembling a report for nothing", async () => {
    vi.mocked(getAuditById).mockResolvedValue(null);
    await expect(runReportAssembly("missing-audit")).rejects.toThrow(/no audit found/);
  });

  it("reuses report_version 1 when no prior report exists", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(null);
    await runReportAssembly("audit-1");
    const [, data] = vi.mocked(upsertReportForAudit).mock.calls[0];
    const canonical = data.canonical_report_json as { metadata: { report_version: number } };
    expect(canonical.metadata.report_version).toBe(1);
  });

  it("22. rerun reuses the existing report_version and calls the upsert (never a plain insert that could duplicate)", async () => {
    vi.mocked(getLatestReport).mockResolvedValue({ id: "report-1", report_version: 1 } as never);
    await runReportAssembly("audit-1");
    await runReportAssembly("audit-1");

    expect(upsertReportForAudit).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(upsertReportForAudit).mock.calls) {
      const canonical = call[1].canonical_report_json as { metadata: { report_version: number } };
      expect(canonical.metadata.report_version).toBe(1);
    }
  });

  it("passes ready_for_pdf and blocking_reasons derived from the gate, not hand-authored", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(null);
    // No components at all -> the gate must fail with specific reasons.
    await runReportAssembly("audit-1");
    const [, data] = vi.mocked(upsertReportForAudit).mock.calls[0];
    expect(data.ready_for_pdf).toBe(false);
    expect((data.blocking_reasons as string[]).length).toBeGreaterThan(0);
    expect(data.status).toBe("DRAFT");
  });
});
