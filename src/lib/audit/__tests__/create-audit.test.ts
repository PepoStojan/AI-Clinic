import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/repositories/audits", () => ({
  createAudit: vi.fn(),
  deleteAudit: vi.fn(),
  getMaxAuditCodeSequenceForYear: vi.fn(),
}));
vi.mock("../../supabase/repositories/audit-targets", () => ({
  createAuditTarget: vi.fn(),
  listAuditTargetsByAuditId: vi.fn(),
}));
vi.mock("../../supabase/repositories/checklist-items", () => ({
  createChecklistItems: vi.fn(),
  listChecklistItemsByAuditId: vi.fn(),
}));

import {
  createAudit,
  deleteAudit,
  getMaxAuditCodeSequenceForYear,
} from "../../supabase/repositories/audits";
import { createAuditTarget } from "../../supabase/repositories/audit-targets";
import { createChecklistItems } from "../../supabase/repositories/checklist-items";
import { AuditCreationFailedError, createAuditWithChecklist } from "../create-audit";
import { AuditValidationError, type AuditCreationInput } from "../validation";

const validInput: AuditCreationInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  companyName: "Analytical Engines Inc",
  websiteUrl: "https://example.com",
  mainPrompts: ["What is Analytical Engines?"],
};

const mockAuditRow = {
  id: "audit-1",
  audit_code: "AIC-2026-000001",
  contact_name: "Ada Lovelace",
  contact_email: "ada@example.com",
  company_name: "Analytical Engines Inc",
  website_url: "https://example.com",
  registered_domain: "example.com",
  status: "CREATED" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  completed_at: null,
};

beforeEach(() => {
  vi.mocked(getMaxAuditCodeSequenceForYear).mockResolvedValue(0);
  vi.mocked(createAudit).mockResolvedValue(mockAuditRow);
  vi.mocked(deleteAudit).mockResolvedValue(undefined);
});

describe("createAuditWithChecklist", () => {
  it("does not call any repository function when validation fails", async () => {
    await expect(
      createAuditWithChecklist({ ...validInput, mainPrompts: [] })
    ).rejects.toBeInstanceOf(AuditValidationError);

    expect(createAudit).not.toHaveBeenCalled();
    expect(createAuditTarget).not.toHaveBeenCalled();
    expect(createChecklistItems).not.toHaveBeenCalled();
  });

  it("rolls back (deletes) the audit if target creation fails after the audit row exists", async () => {
    vi.mocked(createAuditTarget).mockRejectedValue(new Error("simulated failure"));

    await expect(createAuditWithChecklist(validInput)).rejects.toBeInstanceOf(
      AuditCreationFailedError
    );

    expect(createAudit).toHaveBeenCalledTimes(1);
    expect(deleteAudit).toHaveBeenCalledWith("audit-1");
  });

  it("rolls back (deletes) the audit if checklist creation fails", async () => {
    vi.mocked(createAuditTarget).mockResolvedValue({
      id: "target-1",
      audit_id: "audit-1",
      target_type: "homepage",
      url: "https://example.com",
      name: null,
      prompts: ["What is Analytical Engines?"],
      sort_order: 0,
      created_at: "2026-01-01T00:00:00Z",
    });
    vi.mocked(createChecklistItems).mockRejectedValue(new Error("simulated failure"));

    await expect(createAuditWithChecklist(validInput)).rejects.toBeInstanceOf(
      AuditCreationFailedError
    );

    expect(deleteAudit).toHaveBeenCalledWith("audit-1");
  });
});
