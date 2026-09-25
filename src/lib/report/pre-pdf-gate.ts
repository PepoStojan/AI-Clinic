// REPORT-001: the pre-PDF hard gate. Deterministic only -- every check is
// a plain structural/data assertion, never an LLM judgment. PDF-001 (not
// built yet) must never render unless readyForPdf is true.

import { countExpectedChecklistItems, type ChecklistTargetInput } from "../audit/checklist";
import type { AuditTargetRow } from "../supabase/repositories/audit-targets";
import type { ChecklistItemRow } from "../supabase/repositories/checklist-items";
import { buildPdfFilename } from "./filename";
import type { CanonicalReport, PreFlightCheckResult, PreFlightResult } from "./types";

const REQUIRED_COMPONENT_KEYS = [
  "brand_recognition",
  "prompt_visibility",
  "social_profiles",
  "directories",
  "technical_accessibility",
] as const;

const UNAVAILABLE_EVIDENCE_MARKERS = ["n/a", "could not verify", "cannot verify", "no result"];

function containsUnavailableMarker(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return UNAVAILABLE_EVIDENCE_MARKERS.some((m) => text.includes(m));
}

function targetsToChecklistInputs(targets: AuditTargetRow[]): ChecklistTargetInput[] {
  return targets.map((t) => ({
    id: t.id,
    prompts: Array.isArray(t.prompts) ? (t.prompts as string[]) : [],
  }));
}

export function runPreFlightChecklist(input: {
  report: CanonicalReport;
  checklistItems: ChecklistItemRow[];
  targets: AuditTargetRow[];
}): PreFlightResult {
  const { report, checklistItems, targets } = input;
  const checks: PreFlightCheckResult[] = [];

  function check(name: string, passed: boolean, reason?: string) {
    checks.push({ check: name, passed, reason: passed ? null : reason ?? `${name} failed.` });
  }

  // 1. Audit identity present
  const audit = report.audit_info;
  check(
    "audit_identity_present",
    Boolean(audit.audit_id && audit.company_name && audit.website_url && audit.registered_domain),
    "Audit identity (id/company/website/domain) is incomplete."
  );

  // 2/13. All 5 required component keys exist (a value, not undefined)
  const missingKeys = REQUIRED_COMPONENT_KEYS.filter((k) => report.component_results[k] === undefined);
  check(
    "all_component_keys_present",
    missingKeys.length === 0,
    `Missing component result key(s): ${missingKeys.join(", ")}.`
  );

  // 2/3. All 5 components exist AND reached terminal (COMPLETED) status
  const notCompleted = REQUIRED_COMPONENT_KEYS.filter((k) => {
    const c = report.component_results[k];
    return !c || c.status !== "COMPLETED";
  });
  check(
    "all_components_completed",
    notCompleted.length === 0,
    `Component(s) not completed: ${notCompleted.join(", ")}.`
  );

  // 4. No required checklist item remains PENDING/RUNNING
  const nonTerminal = checklistItems.filter((c) => c.status === "PENDING" || c.status === "RUNNING");
  check(
    "no_pending_or_running_checklist_items",
    nonTerminal.length === 0,
    `${nonTerminal.length} checklist item(s) still PENDING/RUNNING: ${nonTerminal
      .slice(0, 5)
      .map((c) => c.idempotency_key)
      .join(", ")}${nonTerminal.length > 5 ? ", ..." : ""}.`
  );

  // 5. No silent skip -- exact expected checklist row count present
  const expectedCount = countExpectedChecklistItems(targetsToChecklistInputs(targets));
  check(
    "no_silent_checklist_skip",
    checklistItems.length === expectedCount,
    `Expected ${expectedCount} checklist items, found ${checklistItems.length}.`
  );

  // 6/7/8/9. Grouped gaps: only confirmed, no N/A leakage, affected checks + evidence present
  for (const gap of report.grouped_gaps) {
    if (gap.affected_checks.length === 0) {
      check(`gap_has_affected_checks:${gap.gap_key}`, false, `Grouped gap "${gap.gap_key}" has no affected checks.`);
    } else {
      check(`gap_has_affected_checks:${gap.gap_key}`, true);
    }
    if (gap.evidence.length === 0) {
      check(`gap_has_evidence:${gap.gap_key}`, false, `Grouped gap "${gap.gap_key}" has no evidence.`);
    } else {
      check(`gap_has_evidence:${gap.gap_key}`, true);
    }
    const leaksUnavailable = containsUnavailableMarker(gap.affected_checks) || containsUnavailableMarker(gap.evidence);
    check(
      `gap_no_na_leakage:${gap.gap_key}`,
      !leaksUnavailable,
      `Grouped gap "${gap.gap_key}" references unavailable evidence (N/A/Could Not Verify/No Result).`
    );
  }

  // 10/11/12. Every grouped gap has a valid interpretation status
  for (const interpretation of report.interpretations) {
    const status = interpretation.validation_status;
    const ok = status === "PASSED" || status === "FALLBACK_FACTS_ONLY";
    check(
      `gap_interpretation_valid:${interpretation.gap_id}`,
      ok,
      `Grouped gap "${interpretation.gap_id}" has interpretation validation_status "${status}" (must be PASSED or FALLBACK_FACTS_ONLY).`
    );
  }

  // 14/15/16/17. Exact structural totals
  check("social_total_is_8", report.executive_fact_counts.social_profiles.total_platforms === 8, "Social platform total is not 8.");
  check(
    "directories_total_is_10",
    report.executive_fact_counts.directories.total_directories === 10,
    "Directory total is not 10."
  );
  check(
    "crawlers_total_is_6",
    report.executive_fact_counts.technical_accessibility.total_crawlers === 6,
    "Crawler total is not 6."
  );

  // 18. Report object is serializable
  let serializable = true;
  try {
    JSON.stringify(report);
  } catch {
    serializable = false;
  }
  check("report_is_serializable", serializable, "Canonical report object failed to serialize to JSON.");

  // 19. No huge raw payload embedded (component_results.findings must be
  // the compact normalized_result_json, not a raw provider payload -- a
  // generous size cap catches anything that slipped through).
  const MAX_REPORT_BYTES = 500_000;
  const reportSize = serializable ? JSON.stringify(report).length : Infinity;
  check(
    "no_huge_raw_payload",
    reportSize <= MAX_REPORT_BYTES,
    `Canonical report is ${reportSize} bytes, exceeding the ${MAX_REPORT_BYTES}-byte sanity cap.`
  );

  // 20. PDF filename can be generated safely
  let filenameOk = true;
  try {
    const name = buildPdfFilename(audit.company_name);
    filenameOk = typeof name === "string" && name.endsWith(".pdf") && name.length > 4;
  } catch {
    filenameOk = false;
  }
  check("pdf_filename_generatable", filenameOk, "PDF filename could not be safely generated.");

  const blockingReasons = checks.filter((c) => !c.passed).map((c) => c.reason as string);

  return { readyForPdf: blockingReasons.length === 0, blockingReasons, checklist: checks };
}
