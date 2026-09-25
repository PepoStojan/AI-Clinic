import { describe, expect, it } from "vitest";
import { computeProgressSteps, isTerminalAuditStatus } from "../audit-progress";

describe("computeProgressSteps", () => {
  it("CREATED: preparing audit pending, everything else pending", () => {
    const steps = computeProgressSteps({ auditStatus: "CREATED", componentStatuses: {}, reportStatus: null });
    expect(steps[0]).toMatchObject({ label: "Preparing audit", state: "Pending" });
    expect(steps[1]).toMatchObject({ label: "Brand Recognition", state: "Pending" });
  });

  it("PROCESSING with a completed component shows Completed for that step, Running for the rest", () => {
    const steps = computeProgressSteps({
      auditStatus: "PROCESSING",
      componentStatuses: { brand_recognition: "COMPLETED" },
      reportStatus: null,
    });
    expect(steps.find((s) => s.label === "Brand Recognition")).toMatchObject({ state: "Completed" });
    expect(steps.find((s) => s.label === "Prompt Visibility")).toMatchObject({ state: "Running" });
  });

  it("moved past PROCESSING without a component ever completing shows Failed for that component", () => {
    const steps = computeProgressSteps({
      auditStatus: "VALIDATING",
      componentStatuses: { brand_recognition: "COMPLETED" }, // social_profiles etc missing
      reportStatus: null,
    });
    expect(steps.find((s) => s.label === "Social Profiles")).toMatchObject({ state: "Failed" });
  });

  it("9. zero fake percentages -- every step state is one of the 5 real states only", () => {
    const steps = computeProgressSteps({ auditStatus: "PROCESSING", componentStatuses: {}, reportStatus: null });
    const allowed = new Set(["Pending", "Running", "Completed", "N/A", "Failed"]);
    for (const step of steps) {
      expect(allowed.has(step.state)).toBe(true);
    }
  });

  it("9/10. GENERATED report -> Finalizing PDF Completed (this is what gates a real download link, never a fake one)", () => {
    const steps = computeProgressSteps({
      auditStatus: "COMPLETED",
      componentStatuses: {
        brand_recognition: "COMPLETED",
        prompt_visibility: "COMPLETED",
        social_profiles: "COMPLETED",
        directories: "COMPLETED",
        technical_accessibility: "COMPLETED",
      },
      reportStatus: "GENERATED",
    });
    expect(steps.find((s) => s.label === "Finalizing PDF")).toMatchObject({ state: "Completed" });
  });

  it("10. a DRAFT (blocked) report never claims PDF completion", () => {
    const steps = computeProgressSteps({ auditStatus: "BLOCKED", componentStatuses: {}, reportStatus: "DRAFT" });
    expect(steps.find((s) => s.label === "Finalizing PDF")).toMatchObject({ state: "N/A" });
  });

  it("10. no report row at all never claims PDF completion", () => {
    const steps = computeProgressSteps({ auditStatus: "PROCESSING", componentStatuses: {}, reportStatus: null });
    expect(steps.find((s) => s.label === "Finalizing PDF")).toMatchObject({ state: "Pending" });
  });

  it("FAILED audit shows N/A (not Failed) for steps never definitively reached", () => {
    const steps = computeProgressSteps({ auditStatus: "FAILED", componentStatuses: {}, reportStatus: null });
    expect(steps.find((s) => s.label === "Brand Recognition")).toMatchObject({ state: "N/A" });
    expect(steps.find((s) => s.label === "Validating Findings")).toMatchObject({ state: "N/A" });
  });
});

describe("isTerminalAuditStatus", () => {
  it("terminal states stop polling", () => {
    expect(isTerminalAuditStatus("COMPLETED")).toBe(true);
    expect(isTerminalAuditStatus("BLOCKED")).toBe(true);
    expect(isTerminalAuditStatus("PARTIAL")).toBe(true);
    expect(isTerminalAuditStatus("FAILED")).toBe(true);
  });
  it("in-progress states keep polling", () => {
    expect(isTerminalAuditStatus("CREATED")).toBe(false);
    expect(isTerminalAuditStatus("QUEUED")).toBe(false);
    expect(isTerminalAuditStatus("PROCESSING")).toBe(false);
    expect(isTerminalAuditStatus("VALIDATING")).toBe(false);
    expect(isTerminalAuditStatus("GENERATING_PDF")).toBe(false);
  });
});
