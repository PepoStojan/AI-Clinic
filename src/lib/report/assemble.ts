// REPORT-001: pure canonical-report assembly. Takes already-fetched rows
// (no DB calls here -- keeps this trivially unit-testable) and builds the
// single object the PDF renderer will later consume. Reads each
// component's own `normalized_result_json` exactly as written by that
// component's run-component.ts -- never reclassifies, never recomputes a
// status, only extracts and re-shapes already-decided facts.

import type { AuditRow } from "../supabase/repositories/audits";
import type { AuditTargetRow } from "../supabase/repositories/audit-targets";
import type { ComponentResultRow } from "../supabase/repositories/component-results";
import type { GroupedGapRow } from "../supabase/repositories/grouped-gaps";
import { buildPdfFilename } from "./filename";
import type {
  BrandRecognitionCounts,
  CanonicalReport,
  ComponentResultsBlock,
  DirectoriesCounts,
  ExecutiveFactCountsBlock,
  GroupedGapBlock,
  InterpretationBlock,
  PromptVisibilityCounts,
  ReportTarget,
  SocialCounts,
  TechnicalCounts,
} from "./types";

const CTA_TEXT = "Want to understand what to address next and how?";

function findComponent(results: ComponentResultRow[], name: string): ComponentResultRow | undefined {
  return results.find((r) => r.component_name === name);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function brandCounts(results: ComponentResultRow[]): BrandRecognitionCounts {
  const row = findComponent(results, "brand_recognition");
  const normalized = asRecord(row?.normalized_result_json);
  const providers = Array.isArray(normalized.providers) ? normalized.providers : [];
  const summary = asRecord(normalized.summary);
  return {
    recognized_by: num(summary.recognized_by),
    total_providers: providers.length,
    accuracy_confirmed: num(summary.accuracy_confirmed),
    accuracy_unavailable: num(summary.accuracy_unavailable),
    provider_could_not_verify: num(summary.provider_could_not_verify),
  };
}

function promptVisibilityCounts(results: ComponentResultRow[]): PromptVisibilityCounts {
  const row = findComponent(results, "prompt_visibility");
  const normalized = asRecord(row?.normalized_result_json);
  const summary = asRecord(normalized.summary);
  const validChecks = num(summary.evaluableChecks);
  const positiveChecks = num(summary.strongMentions) + num(summary.mentioned);
  return {
    valid_checks: validChecks,
    positive_checks: positiveChecks,
    // No Result excluded from the denominator; never fabricate 0% when
    // there is nothing valid to measure.
    visibility_percentage: validChecks === 0 ? null : Math.round((positiveChecks / validChecks) * 100),
    unavailable_checks: num(summary.noResult),
  };
}

function socialCounts(results: ComponentResultRow[]): SocialCounts {
  const row = findComponent(results, "social_profiles");
  const normalized = asRecord(row?.normalized_result_json);
  const summary = asRecord(normalized.summary);
  return {
    profiles_found: num(summary.profilesFound),
    profiles_connected: num(summary.profilesConnected),
    profiles_not_found: num(summary.profilesNotFound),
    profiles_unverified: num(summary.profilesUnverified),
    profiles_could_not_verify: num(summary.profilesCouldNotVerify),
    total_platforms: 8,
  };
}

function directoriesCounts(results: ComponentResultRow[]): DirectoriesCounts {
  const row = findComponent(results, "directories");
  const normalized = asRecord(row?.normalized_result_json);
  const summary = asRecord(normalized.summary);
  return {
    listings_found: num(summary.listingsFound),
    listings_not_found: num(summary.listingsNotFound),
    listings_unverified: num(summary.listingsUnverified),
    listings_could_not_verify: num(summary.listingsCouldNotVerify),
    total_directories: 10,
  };
}

function technicalCounts(results: ComponentResultRow[]): TechnicalCounts {
  const row = findComponent(results, "technical_accessibility");
  const normalized = asRecord(row?.normalized_result_json);
  const summary = asRecord(normalized.summary);
  return {
    allowed: num(summary.allowed),
    restricted: num(summary.restricted),
    blocked: num(summary.blocked),
    cannot_verify: num(summary.cannotVerify),
    total_crawlers: 6,
  };
}

export function buildExecutiveFactCounts(results: ComponentResultRow[], groupedGaps: GroupedGapRow[]): ExecutiveFactCountsBlock {
  const brand = brandCounts(results);
  const prompt = promptVisibilityCounts(results);
  const social = socialCounts(results);
  const directories = directoriesCounts(results);
  const technical = technicalCounts(results);

  const checksUnavailableCount =
    brand.accuracy_unavailable +
    brand.provider_could_not_verify +
    prompt.unavailable_checks +
    social.profiles_could_not_verify +
    directories.listings_could_not_verify +
    technical.cannot_verify;

  return {
    brand_recognition: brand,
    prompt_visibility: prompt,
    social_profiles: social,
    directories,
    technical_accessibility: technical,
    confirmed_gaps_count: groupedGaps.length,
    checks_unavailable_count: checksUnavailableCount,
  };
}

export function buildComponentResultsBlock(results: ComponentResultRow[]): ComponentResultsBlock {
  const componentNames = [
    "brand_recognition",
    "prompt_visibility",
    "social_profiles",
    "directories",
    "technical_accessibility",
  ] as const;

  const block = {} as ComponentResultsBlock;
  for (const name of componentNames) {
    const row = findComponent(results, name);
    block[name] = row ? { status: row.status, findings: row.normalized_result_json } : null;
  }
  return block;
}

export function buildGroupedGapsBlock(groupedGaps: GroupedGapRow[]): GroupedGapBlock[] {
  return groupedGaps.map((gap) => {
    const affectedChecks = Array.isArray(gap.affected_checks_json) ? gap.affected_checks_json : [];
    const evidence = Array.isArray(gap.evidence_json) ? gap.evidence_json : [];
    return {
      gap_id: gap.id,
      gap_key: gap.gap_key,
      component_name: gap.component_name,
      gap_type: gap.gap_type,
      title: gap.title,
      affected_checks: affectedChecks,
      evidence,
      affected_count: affectedChecks.length,
      deterministic_reason: gap.deterministic_reason,
      status: "confirmed_gap",
    };
  });
}

export function buildInterpretationsBlock(groupedGaps: GroupedGapRow[]): InterpretationBlock[] {
  return groupedGaps.map((gap) => {
    const interpretation = asRecord(gap.interpretation_json);
    return {
      gap_id: gap.id,
      what_we_observed: typeof interpretation.what_we_observed === "string" ? interpretation.what_we_observed : null,
      what_this_suggests: typeof interpretation.what_this_suggests === "string" ? interpretation.what_this_suggests : null,
      what_to_consider: typeof interpretation.what_to_consider === "string" ? interpretation.what_to_consider : null,
      validation_status: gap.validation_status,
    };
  });
}

function buildTargets(targets: AuditTargetRow[]): ReportTarget[] {
  return targets.map((t) => ({ id: t.id, type: t.target_type, url: t.url, name: t.name }));
}

export function assembleCanonicalReport(input: {
  audit: AuditRow;
  targets: AuditTargetRow[];
  componentResults: ComponentResultRow[];
  groupedGaps: GroupedGapRow[];
  reportVersion: number;
}): CanonicalReport {
  const { audit, targets, componentResults, groupedGaps, reportVersion } = input;

  const componentResultsBlock = buildComponentResultsBlock(componentResults);
  const componentsCompleted = Object.values(componentResultsBlock).filter((c) => c?.status === "COMPLETED").length;
  const executiveFactCounts = buildExecutiveFactCounts(componentResults, groupedGaps);
  const pdfFilename = buildPdfFilename(audit.company_name);

  return {
    audit_info: {
      audit_id: audit.id,
      audit_code: audit.audit_code,
      company_name: audit.company_name,
      website_url: audit.website_url,
      registered_domain: audit.registered_domain,
      contact_name: audit.contact_name,
      contact_email: audit.contact_email,
      created_at: audit.created_at,
      completed_at: audit.completed_at,
      audited_targets: buildTargets(targets),
    },
    executive_fact_counts: executiveFactCounts,
    component_results: componentResultsBlock,
    grouped_gaps: buildGroupedGapsBlock(groupedGaps),
    interpretations: buildInterpretationsBlock(groupedGaps),
    closing: { cta_text: CTA_TEXT },
    metadata: {
      report_version: reportVersion,
      assembled_at: new Date().toISOString(),
      audit_status: audit.status,
      components_completed: componentsCompleted,
      components_total: 5,
      checks_unavailable: executiveFactCounts.checks_unavailable_count,
      confirmed_gaps: executiveFactCounts.confirmed_gaps_count,
      pdf_filename: pdfFilename,
      // Filled in by the caller after running the pre-PDF gate -- this
      // function only assembles facts, it never decides readiness itself.
      ready_for_pdf: false,
      blocking_reasons: [],
    },
  };
}
