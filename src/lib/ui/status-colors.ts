// UI-001: shared status -> color mapping for the Audits List and Audit
// Detail screens. Red is reserved for true system-level failure only
// (Design Handoff section 3); N/A/Could Not Verify and in-progress
// states stay neutral, never implying a problem.

export const STATUS_COLORS = {
  good: "#1F9D6B",
  neutral: "#94A3B8",
  running: "#28A8DF",
  attention: "#C08A1E",
  danger: "#D9463B",
} as const;

export function auditStatusColor(status: string): string {
  switch (status) {
    case "COMPLETED":
      return STATUS_COLORS.good;
    case "FAILED":
      return STATUS_COLORS.danger;
    case "BLOCKED":
    case "PARTIAL":
      return STATUS_COLORS.attention;
    case "CREATED":
      return STATUS_COLORS.neutral;
    default:
      // QUEUED, PROCESSING, VALIDATING, READY_FOR_PDF, GENERATING_PDF
      return STATUS_COLORS.running;
  }
}

export function auditStatusLabel(status: string): string {
  switch (status) {
    case "CREATED":
      return "Created";
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "VALIDATING":
      return "Validating";
    case "READY_FOR_PDF":
      return "Ready for PDF";
    case "GENERATING_PDF":
      return "Generating PDF";
    case "COMPLETED":
      return "Completed";
    case "BLOCKED":
      return "Blocked";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}
