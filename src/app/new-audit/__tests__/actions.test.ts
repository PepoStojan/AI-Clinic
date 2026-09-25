import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/create-audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/create-audit")>("@/lib/audit/create-audit");
  return { ...actual, createAuditWithChecklist: vi.fn() };
});
vi.mock("@/lib/supabase/repositories/audits", () => ({
  updateAuditStatus: vi.fn(),
}));
vi.mock("@/lib/trigger/run-audit-client", () => ({
  triggerAuditPipeline: vi.fn(),
}));

import { createAuditWithChecklist } from "@/lib/audit/create-audit";
import { updateAuditStatus } from "@/lib/supabase/repositories/audits";
import { triggerAuditPipeline } from "@/lib/trigger/run-audit-client";
import { createAuditAction, type NewAuditActionInput } from "../actions";

const VALID_INPUT: NewAuditActionInput = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  companyName: "Acme",
  websiteUrl: "https://acme.example",
  mainPrompts: ["What is Acme?"],
};

describe("createAuditAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("4. a valid submission creates the audit via createAuditWithChecklist", async () => {
    vi.mocked(createAuditWithChecklist).mockResolvedValue({
      auditId: "audit-1",
      auditCode: "AIC-2026-000001",
      status: "CREATED",
      homepageTarget: {} as never,
      additionalTargets: [],
      totalChecklistItemCount: 34,
      droppedDuplicateTargetUrls: [],
    });
    vi.mocked(triggerAuditPipeline).mockResolvedValue({} as never);

    const result = await createAuditAction(VALID_INPUT);

    expect(createAuditWithChecklist).toHaveBeenCalledWith(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("5. a successful Trigger.dev submission transitions the audit to QUEUED", async () => {
    vi.mocked(createAuditWithChecklist).mockResolvedValue({
      auditId: "audit-1",
      auditCode: "AIC-2026-000001",
      status: "CREATED",
      homepageTarget: {} as never,
      additionalTargets: [],
      totalChecklistItemCount: 34,
      droppedDuplicateTargetUrls: [],
    });
    vi.mocked(triggerAuditPipeline).mockResolvedValue({} as never);

    const result = await createAuditAction(VALID_INPUT);

    expect(triggerAuditPipeline).toHaveBeenCalledWith("audit-1");
    expect(updateAuditStatus).toHaveBeenCalledWith("audit-1", "QUEUED");
    expect(result).toMatchObject({ success: true, queued: true });
  });

  it("6. a failed queue submission never falsely becomes QUEUED", async () => {
    vi.mocked(createAuditWithChecklist).mockResolvedValue({
      auditId: "audit-1",
      auditCode: "AIC-2026-000001",
      status: "CREATED",
      homepageTarget: {} as never,
      additionalTargets: [],
      totalChecklistItemCount: 34,
      droppedDuplicateTargetUrls: [],
    });
    vi.mocked(triggerAuditPipeline).mockRejectedValue(new Error("Trigger.dev unavailable"));

    const result = await createAuditAction(VALID_INPUT);

    expect(updateAuditStatus).not.toHaveBeenCalledWith("audit-1", "QUEUED");
    expect(result).toMatchObject({ success: true, queued: false, auditId: "audit-1" });
  });

  it("a validation failure never calls createAuditWithChecklist's downstream trigger step", async () => {
    vi.mocked(createAuditWithChecklist).mockRejectedValue(new (await import("@/lib/audit/create-audit")).AuditValidationError(["Company / brand name is required."]));

    const result = await createAuditAction({ ...VALID_INPUT, companyName: "" });

    expect(result.success).toBe(false);
    expect(triggerAuditPipeline).not.toHaveBeenCalled();
  });
});
