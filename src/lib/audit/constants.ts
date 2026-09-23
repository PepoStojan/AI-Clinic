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
