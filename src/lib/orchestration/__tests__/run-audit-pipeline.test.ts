import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/repositories/audits", () => ({
  getAuditById: vi.fn(),
  updateAuditStatus: vi.fn(),
}));
vi.mock("../../supabase/repositories/audit-targets", () => ({
  listAuditTargetsByAuditId: vi.fn(),
}));
vi.mock("../../brand-recognition/run-component", () => ({ runBrandRecognitionComponent: vi.fn() }));
vi.mock("../../prompt-visibility/run-component", () => ({ runPromptVisibilityComponent: vi.fn() }));
vi.mock("../../social-profiles/run-component", () => ({ runSocialProfilesComponent: vi.fn() }));
vi.mock("../../directories/run-component", () => ({ runDirectoriesComponent: vi.fn() }));
vi.mock("../../technical-accessibility/run-component", () => ({ runTechnicalAccessibilityComponent: vi.fn() }));
vi.mock("../../gap-detection/run-gap-detection", () => ({ runGapDetection: vi.fn() }));
vi.mock("../../gap-interpretation/run-gap-interpretation", () => ({ runGapInterpretation: vi.fn() }));
vi.mock("../../report/run-report-assembly", () => ({ runReportAssembly: vi.fn() }));
vi.mock("../../pdf/run-pdf-generation", () => ({ runPdfGeneration: vi.fn() }));

import { getAuditById, updateAuditStatus } from "../../supabase/repositories/audits";
import { listAuditTargetsByAuditId } from "../../supabase/repositories/audit-targets";
import { runBrandRecognitionComponent } from "../../brand-recognition/run-component";
import { runPromptVisibilityComponent } from "../../prompt-visibility/run-component";
import { runSocialProfilesComponent } from "../../social-profiles/run-component";
import { runDirectoriesComponent } from "../../directories/run-component";
import { runTechnicalAccessibilityComponent } from "../../technical-accessibility/run-component";
import { runGapDetection } from "../../gap-detection/run-gap-detection";
import { runGapInterpretation } from "../../gap-interpretation/run-gap-interpretation";
import { runReportAssembly } from "../../report/run-report-assembly";
import { runPdfGeneration } from "../../pdf/run-pdf-generation";
import { runAuditPipeline } from "../run-audit-pipeline";

const AUDIT = {
  id: "audit-1",
  company_name: "Acme",
  registered_domain: "acme.example",
  website_url: "https://acme.example",
};
const HOMEPAGE_TARGET = { id: "target-1", target_type: "homepage", name: null, prompts: ["What is Acme?"] };

describe("runAuditPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuditById).mockResolvedValue(AUDIT as never);
    vi.mocked(listAuditTargetsByAuditId).mockResolvedValue([HOMEPAGE_TARGET] as never);
    vi.mocked(runBrandRecognitionComponent).mockResolvedValue({} as never);
    vi.mocked(runPromptVisibilityComponent).mockResolvedValue({} as never);
    vi.mocked(runSocialProfilesComponent).mockResolvedValue({} as never);
    vi.mocked(runDirectoriesComponent).mockResolvedValue({} as never);
    vi.mocked(runTechnicalAccessibilityComponent).mockResolvedValue({} as never);
    vi.mocked(runGapDetection).mockResolvedValue([] as never);
    vi.mocked(runGapInterpretation).mockResolvedValue([] as never);
    vi.mocked(updateAuditStatus).mockResolvedValue({} as never);
  });

  it("11. calls all 5 existing component runners", async () => {
    vi.mocked(runReportAssembly).mockResolvedValue({ ready_for_pdf: true } as never);
    vi.mocked(runPdfGeneration).mockResolvedValue({} as never);

    await runAuditPipeline("audit-1");

    expect(runBrandRecognitionComponent).toHaveBeenCalledTimes(1);
    expect(runPromptVisibilityComponent).toHaveBeenCalledTimes(1);
    expect(runSocialProfilesComponent).toHaveBeenCalledTimes(1);
    expect(runDirectoriesComponent).toHaveBeenCalledTimes(1);
    expect(runTechnicalAccessibilityComponent).toHaveBeenCalledTimes(1);
  });

  it("12. then runs gap detection, interpretation, report assembly, and PDF generation in order", async () => {
    vi.mocked(runReportAssembly).mockResolvedValue({ ready_for_pdf: true } as never);
    vi.mocked(runPdfGeneration).mockResolvedValue({} as never);

    await runAuditPipeline("audit-1");

    expect(runGapDetection).toHaveBeenCalledWith("audit-1");
    expect(runGapInterpretation).toHaveBeenCalledWith("audit-1");
    expect(runReportAssembly).toHaveBeenCalledWith("audit-1");
    expect(runPdfGeneration).toHaveBeenCalledWith("audit-1");
  });

  it("13. a fully successful pipeline ends COMPLETED with completed_at set", async () => {
    vi.mocked(runReportAssembly).mockResolvedValue({ ready_for_pdf: true } as never);
    vi.mocked(runPdfGeneration).mockResolvedValue({} as never);

    await runAuditPipeline("audit-1");

    const statusCalls = vi.mocked(updateAuditStatus).mock.calls.map((c) => c[1]);
    expect(statusCalls).toEqual(["PROCESSING", "VALIDATING", "GENERATING_PDF", "COMPLETED"]);
    const completedCall = vi.mocked(updateAuditStatus).mock.calls.find((c) => c[1] === "COMPLETED");
    expect(completedCall?.[2]).toMatchObject({ completed_at: expect.any(String) });
  });

  it("a blocked report (ready_for_pdf=false, no component crash) ends BLOCKED, never generates a PDF", async () => {
    vi.mocked(runReportAssembly).mockResolvedValue({ ready_for_pdf: false, blocking_reasons: ["x"] } as never);

    await runAuditPipeline("audit-1");

    expect(runPdfGeneration).not.toHaveBeenCalled();
    const statusCalls = vi.mocked(updateAuditStatus).mock.calls.map((c) => c[1]);
    expect(statusCalls).toEqual(["PROCESSING", "VALIDATING", "BLOCKED"]);
  });

  it("a component crash (unexpected exception) that still results in a blocked report ends PARTIAL, not BLOCKED", async () => {
    vi.mocked(runBrandRecognitionComponent).mockRejectedValue(new Error("unexpected crash"));
    vi.mocked(runReportAssembly).mockResolvedValue({ ready_for_pdf: false, blocking_reasons: ["x"] } as never);

    await runAuditPipeline("audit-1");

    const statusCalls = vi.mocked(updateAuditStatus).mock.calls.map((c) => c[1]);
    expect(statusCalls).toEqual(["PROCESSING", "VALIDATING", "PARTIAL"]);
    // The other 4 components still ran despite the crash.
    expect(runPromptVisibilityComponent).toHaveBeenCalledTimes(1);
    expect(runTechnicalAccessibilityComponent).toHaveBeenCalledTimes(1);
  });

  it("14. an unrecoverable system failure (audit not found) ends FAILED", async () => {
    vi.mocked(getAuditById).mockResolvedValue(null);

    await expect(runAuditPipeline("missing-audit")).rejects.toThrow(/no audit found/);

    const statusCalls = vi.mocked(updateAuditStatus).mock.calls.map((c) => c[1]);
    expect(statusCalls).toEqual(["PROCESSING", "FAILED"]);
  });

  it("an unrecoverable failure inside gap detection also ends FAILED, error propagates", async () => {
    vi.mocked(runGapDetection).mockRejectedValue(new Error("db unavailable"));

    await expect(runAuditPipeline("audit-1")).rejects.toThrow("db unavailable");

    const statusCalls = vi.mocked(updateAuditStatus).mock.calls.map((c) => c[1]);
    expect(statusCalls).toEqual(["PROCESSING", "VALIDATING", "FAILED"]);
  });
});
