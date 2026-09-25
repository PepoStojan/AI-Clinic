// UI-001: derives the 9 Audit Detail progress steps from real persisted
// state only (audits.status, component_results, reports.status) --
// never a fake percentage. Pure function, no I/O, so it's directly
// testable without a database. Backend components may run in parallel;
// this only decides what to SHOW per step, not how they actually execute.

export type StepState = "Pending" | "Running" | "Completed" | "N/A" | "Failed";

export interface ProgressStep {
  label: string;
  state: StepState;
}

export interface ProgressInput {
  auditStatus: string;
  componentStatuses: {
    brand_recognition?: string;
    prompt_visibility?: string;
    social_profiles?: string;
    directories?: string;
    technical_accessibility?: string;
  };
  reportStatus?: string | null;
}

const PROCESSING_OR_LATER = new Set([
  "PROCESSING",
  "VALIDATING",
  "READY_FOR_PDF",
  "GENERATING_PDF",
  "COMPLETED",
  "BLOCKED",
  "PARTIAL",
]);
const PAST_VALIDATING = new Set(["READY_FOR_PDF", "GENERATING_PDF", "COMPLETED", "BLOCKED", "PARTIAL"]);

function componentStepState(componentStatus: string | undefined, auditStatus: string): StepState {
  if (componentStatus === "COMPLETED") return "Completed";
  if (auditStatus === "FAILED") return "N/A"; // pipeline aborted; unknown whether this one ran
  if (auditStatus === "PROCESSING") return "Running";
  if (PROCESSING_OR_LATER.has(auditStatus)) return "Failed"; // moved on without this component completing
  return "Pending"; // CREATED / QUEUED
}

export function computeProgressSteps(input: ProgressInput): ProgressStep[] {
  const { auditStatus, componentStatuses, reportStatus } = input;

  const preparingAudit: StepState =
    auditStatus === "CREATED" ? "Pending" : auditStatus === "QUEUED" ? "Running" : "Completed";

  const validatingFindings: StepState =
    auditStatus === "VALIDATING"
      ? "Running"
      : PAST_VALIDATING.has(auditStatus)
        ? "Completed"
        : auditStatus === "FAILED"
          ? "N/A"
          : "Pending";

  const generatingReport: StepState = reportStatus
    ? "Completed"
    : auditStatus === "VALIDATING"
      ? "Running"
      : PAST_VALIDATING.has(auditStatus)
        ? "Completed" // report exists by the time we're past VALIDATING in the real pipeline
        : auditStatus === "FAILED"
          ? "N/A"
          : "Pending";

  const finalizingPdf: StepState =
    reportStatus === "GENERATED"
      ? "Completed"
      : reportStatus === "GENERATING"
        ? "Running"
        : reportStatus === "FAILED"
          ? "Failed"
          : reportStatus === "DRAFT"
            ? "N/A" // report assembled but pre-PDF gate blocked -- no PDF will be generated
            : auditStatus === "FAILED"
              ? "N/A"
              : "Pending";

  return [
    { label: "Preparing audit", state: preparingAudit },
    { label: "Brand Recognition", state: componentStepState(componentStatuses.brand_recognition, auditStatus) },
    { label: "Prompt Visibility", state: componentStepState(componentStatuses.prompt_visibility, auditStatus) },
    { label: "Social Profiles", state: componentStepState(componentStatuses.social_profiles, auditStatus) },
    { label: "Third-Party Listings", state: componentStepState(componentStatuses.directories, auditStatus) },
    { label: "Technical Accessibility", state: componentStepState(componentStatuses.technical_accessibility, auditStatus) },
    { label: "Validating Findings", state: validatingFindings },
    { label: "Generating Report", state: generatingReport },
    { label: "Finalizing PDF", state: finalizingPdf },
  ];
}

/** True once the audit has reached a terminal state -- client polling stops here. */
export function isTerminalAuditStatus(status: string): boolean {
  return status === "COMPLETED" || status === "BLOCKED" || status === "PARTIAL" || status === "FAILED";
}
