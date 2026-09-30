// Canonical vocabulary locked by AI-Clinic-Master-Planning-Final-QA.md (sections 6, 24, 26)
// and AI-Clinic-Claude-Code-Build-Spec.md (sections 6, 7, 10). Do not add values here
// without updating both planning documents first.

export const AUDIT_STATUSES = [
  "CREATED",
  "QUEUED",
  "PROCESSING",
  "VALIDATING",
  "READY_FOR_PDF",
  "GENERATING_PDF",
  "COMPLETED",
  "BLOCKED",
  "PARTIAL",
  "FAILED",
] as const;

export const CHECK_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "GAP_FOUND",
  "COULD_NOT_VERIFY",
  "FAILED",
] as const;

export const TARGET_TYPES = ["homepage", "additional"] as const;

export const COMPONENT_NAMES = [
  "brand_recognition",
  "prompt_visibility",
  "social_profiles",
  "directories",
  "technical_accessibility",
] as const;

export const GROUPED_GAP_VALIDATION_STATUSES = [
  "PENDING",
  "PASSED",
  "FALLBACK_FACTS_ONLY",
  "FAILED",
] as const;

export const REPORT_STATUSES = ["DRAFT", "READY", "GENERATING", "GENERATED", "FAILED"] as const;

// AUDIT-DELETE-001: the audit statuses eligible for soft delete -- moved
// here (not src/lib/ui/audit-progress.ts) so repository/server code can
// depend on this business rule without importing from the UI layer.
// src/lib/ui/audit-progress.ts re-exports isTerminalAuditStatus from here
// so existing UI call sites are unaffected.
export const TERMINAL_AUDIT_STATUSES = ["COMPLETED", "BLOCKED", "PARTIAL", "FAILED"] as const;

export function isTerminalAuditStatus(status: string): boolean {
  return (TERMINAL_AUDIT_STATUSES as readonly string[]).includes(status);
}
