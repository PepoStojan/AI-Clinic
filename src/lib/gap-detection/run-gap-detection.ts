import "server-only";

import { listComponentResultsByAuditId, type ComponentResultRow } from "../supabase/repositories/component-results";
import { replaceGroupedGapsForAudit, type GroupedGapInsert, type GroupedGapRow } from "../supabase/repositories/grouped-gaps";
import type { ComponentName } from "../supabase/database.types";
import {
  detectBrandRecognitionGaps,
  detectDirectoriesGaps,
  detectPromptVisibilityGaps,
  detectSocialProfilesGaps,
  detectTechnicalAccessibilityGaps,
  type BrandRecognitionNormalized,
  type DirectoriesNormalized,
  type PromptVisibilityNormalized,
  type SocialProfilesNormalized,
  type TechnicalAccessibilityNormalized,
} from "./detectors";
import type { DetectedGap } from "./types";

function findComponent(results: ComponentResultRow[], componentName: ComponentName): ComponentResultRow | undefined {
  return results.find((r) => r.component_name === componentName);
}

/**
 * Reads whatever component_results rows currently exist for this audit and
 * deterministically (re)computes grouped_gaps -- CORE-002's whole job. A
 * component that hasn't run yet simply contributes no gaps (its detector
 * is skipped); this is intentional, not an error, so gap detection can run
 * safely even on a partially-completed audit.
 */
export async function runGapDetection(auditId: string): Promise<GroupedGapRow[]> {
  const componentResults = await listComponentResultsByAuditId(auditId);
  const gaps: DetectedGap[] = [];

  const brand = findComponent(componentResults, "brand_recognition");
  if (brand) {
    gaps.push(...detectBrandRecognitionGaps(auditId, brand.normalized_result_json as unknown as BrandRecognitionNormalized));
  }

  const promptVisibility = findComponent(componentResults, "prompt_visibility");
  if (promptVisibility) {
    gaps.push(
      ...detectPromptVisibilityGaps(auditId, promptVisibility.normalized_result_json as unknown as PromptVisibilityNormalized)
    );
  }

  const social = findComponent(componentResults, "social_profiles");
  if (social) {
    gaps.push(...detectSocialProfilesGaps(auditId, social.normalized_result_json as unknown as SocialProfilesNormalized));
  }

  const directories = findComponent(componentResults, "directories");
  if (directories) {
    gaps.push(...detectDirectoriesGaps(auditId, directories.normalized_result_json as unknown as DirectoriesNormalized));
  }

  const technical = findComponent(componentResults, "technical_accessibility");
  if (technical) {
    gaps.push(
      ...detectTechnicalAccessibilityGaps(auditId, technical.normalized_result_json as unknown as TechnicalAccessibilityNormalized)
    );
  }

  const rows: GroupedGapInsert[] = gaps.map((gap) => ({
    audit_id: auditId,
    gap_key: gap.gapKey,
    component_name: gap.componentName,
    gap_type: gap.gapType,
    title: gap.title,
    affected_checks_json: gap.affectedChecks as GroupedGapInsert["affected_checks_json"],
    evidence_json: gap.evidence as GroupedGapInsert["evidence_json"],
    deterministic_reason: gap.deterministicReason,
    interpretation_json: null,
    validation_status: "PENDING",
  }));

  return replaceGroupedGapsForAudit(auditId, rows);
}
