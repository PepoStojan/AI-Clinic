import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/repositories/audits", () => ({
  getAuditById: vi.fn(),
  softDeleteAudit: vi.fn(),
  updateAuditStatus: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/reports", () => ({
  getLatestReport: vi.fn(),
}));
vi.mock("@/lib/trigger/run-audit-client", () => ({
  triggerAuditPipeline: vi.fn(),
  triggerPdfRegeneration: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getAuditById, softDeleteAudit, updateAuditStatus } from "@/lib/supabase/repositories/audits";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { triggerAuditPipeline, triggerPdfRegeneration } from "@/lib/trigger/run-audit-client";
import { deleteAuditAction, regeneratePdfAction, retryAuditAction, retryQueueAction } from "../actions";

const TERMINAL_AUDIT = { id: "audit-1", status: "BLOCKED", deleted_at: null } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

// -- AUDIT-DELETE-001B: race safety -- deleted audit vs retry --------------

describe("retryQueueAction", () => {
  it("does NOT enqueue a Trigger.dev task when the audit doesn't exist (e.g. soft-deleted)", async () => {
    vi.mocked(getAuditById).mockResolvedValue(null);

    const result = await retryQueueAction("deleted-audit");

    expect(triggerAuditPipeline).not.toHaveBeenCalled();
    expect(updateAuditStatus).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Audit not found." });
  });

  it("enqueues normally for an existing (non-deleted) audit", async () => {
    vi.mocked(getAuditById).mockResolvedValue(TERMINAL_AUDIT);
    vi.mocked(triggerAuditPipeline).mockResolvedValue({} as never);

    const result = await retryQueueAction("audit-1");

    expect(triggerAuditPipeline).toHaveBeenCalledWith("audit-1");
    expect(updateAuditStatus).toHaveBeenCalledWith("audit-1", "QUEUED");
    expect(result).toEqual({ success: true });
  });
});

describe("retryAuditAction", () => {
  it("does NOT enqueue a Trigger.dev task when the audit doesn't exist (e.g. soft-deleted) -- the BLOCKED-delete race", async () => {
    // Simulates: audit was BLOCKED, got soft-deleted, then a retry request
    // arrives -- getAuditById (deleted_at-filtered) now returns null.
    vi.mocked(getAuditById).mockResolvedValue(null);

    const result = await retryAuditAction("audit-1");

    expect(triggerAuditPipeline).not.toHaveBeenCalled();
    expect(updateAuditStatus).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Audit not found." });
  });

  it("enqueues normally for an existing terminal audit", async () => {
    vi.mocked(getAuditById).mockResolvedValue(TERMINAL_AUDIT);
    vi.mocked(triggerAuditPipeline).mockResolvedValue({} as never);

    const result = await retryAuditAction("audit-1");

    expect(triggerAuditPipeline).toHaveBeenCalledWith("audit-1");
    expect(result).toEqual({ success: true });
  });
});

describe("regeneratePdfAction", () => {
  it("refuses when the audit doesn't exist (e.g. soft-deleted), never enqueues regeneration", async () => {
    vi.mocked(getAuditById).mockResolvedValue(null);

    const result = await regeneratePdfAction("deleted-audit");

    expect(getLatestReport).not.toHaveBeenCalled();
    expect(triggerPdfRegeneration).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Audit not found." });
  });

  it("refuses when the report isn't ready for PDF, for an existing audit", async () => {
    vi.mocked(getAuditById).mockResolvedValue(TERMINAL_AUDIT);
    vi.mocked(getLatestReport).mockResolvedValue({ ready_for_pdf: false } as never);

    const result = await regeneratePdfAction("audit-1");

    expect(triggerPdfRegeneration).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Report is not ready for PDF generation." });
  });

  it("enqueues regeneration for an existing audit with a ready report", async () => {
    vi.mocked(getAuditById).mockResolvedValue(TERMINAL_AUDIT);
    vi.mocked(getLatestReport).mockResolvedValue({ ready_for_pdf: true } as never);
    vi.mocked(triggerPdfRegeneration).mockResolvedValue({} as never);

    const result = await regeneratePdfAction("audit-1");

    expect(triggerPdfRegeneration).toHaveBeenCalledWith("audit-1");
    expect(result).toEqual({ success: true });
  });
});

// -- deleteAuditAction -------------------------------------------------------

describe("deleteAuditAction", () => {
  it("rejects an empty/invalid id without querying anything", async () => {
    const result = await deleteAuditAction("");
    expect(getAuditById).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Invalid audit id." });
  });

  it("refuses when the audit doesn't exist", async () => {
    vi.mocked(getAuditById).mockResolvedValue(null);
    const result = await deleteAuditAction("missing-audit");
    expect(softDeleteAudit).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Audit not found." });
  });

  it("refuses server-side for a non-terminal audit, regardless of what the UI believes", async () => {
    vi.mocked(getAuditById).mockResolvedValue({ id: "audit-1", status: "PROCESSING", deleted_at: null } as never);
    const result = await deleteAuditAction("audit-1");
    expect(softDeleteAudit).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "This audit is still in progress and can't be deleted yet." });
  });

  it.each(["COMPLETED", "BLOCKED", "PARTIAL", "FAILED"])("deletes a %s audit and revalidates both paths", async (status) => {
    vi.mocked(getAuditById).mockResolvedValue({ id: "audit-1", status, deleted_at: null } as never);
    vi.mocked(softDeleteAudit).mockResolvedValue({ id: "audit-1", status, deleted_at: "2026-09-30T00:00:00.000Z" } as never);

    const result = await deleteAuditAction("audit-1");

    expect(softDeleteAudit).toHaveBeenCalledWith("audit-1");
    expect(revalidatePath).toHaveBeenCalledWith("/audits");
    expect(revalidatePath).toHaveBeenCalledWith("/audits/audit-1");
    expect(result).toEqual({ success: true });
  });

  it.each(["CREATED", "QUEUED", "PROCESSING", "VALIDATING", "READY_FOR_PDF", "GENERATING_PDF"])(
    "refuses a %s audit",
    async (status) => {
      vi.mocked(getAuditById).mockResolvedValue({ id: "audit-1", status, deleted_at: null } as never);
      const result = await deleteAuditAction("audit-1");
      expect(softDeleteAudit).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    }
  );

  it("is safe/idempotent when softDeleteAudit's atomic UPDATE matches nothing (raced delete)", async () => {
    vi.mocked(getAuditById).mockResolvedValue(TERMINAL_AUDIT);
    vi.mocked(softDeleteAudit).mockResolvedValue(null); // WHERE clause caught a race

    const result = await deleteAuditAction("audit-1");

    expect(result).toEqual({ success: false, error: "This audit can no longer be deleted." });
  });

  it("surfaces a clean error if softDeleteAudit throws, never an unhandled rejection", async () => {
    vi.mocked(getAuditById).mockResolvedValue(TERMINAL_AUDIT);
    vi.mocked(softDeleteAudit).mockRejectedValue(new Error("connection reset"));

    const result = await deleteAuditAction("audit-1");

    expect(result).toEqual({ success: false, error: "Could not delete the audit. Please try again." });
  });
});
