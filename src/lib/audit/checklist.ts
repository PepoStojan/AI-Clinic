import { buildIdempotencyKey } from "./idempotency";
import type { ComponentName } from "../supabase/database.types";
import type { ChecklistItemInsert } from "../supabase/repositories/checklist-items";

// Canonical, ordered vocabularies locked by the Build Spec (sections 14-18).
// component_results/checklist_items reuse the same component_name values
// already locked in src/lib/audit/constants.ts.

export const BRAND_RECOGNITION_PROVIDERS = ["openai", "gemini", "claude", "google"] as const; // exactly 4

export const PROMPT_VISIBILITY_PROVIDERS = ["chatgpt", "gemini", "claude", "google_ai"] as const; // exactly 4

export const SOCIAL_PLATFORMS = [
  "linkedin",
  "facebook",
  "instagram",
  "x_twitter",
  "youtube",
  "tiktok",
  "threads",
  "reddit",
] as const; // exactly 8, canonical order

export const DIRECTORY_PLATFORMS = [
  "g2",
  "capterra",
  "trustpilot",
  "clutch",
  "google_business_profile",
  "bestcompany",
  "getapp",
  "software_advice",
  "gartner_peer_insights",
  "product_hunt",
] as const; // exactly 10, canonical order

export const TECHNICAL_CRAWLERS = [
  "googlebot",
  "bingbot",
  "gptbot",
  "oai_searchbot",
  "claudebot",
  "perplexitybot",
] as const; // exactly 6

export const TECHNICAL_FILES = ["robots_txt", "llms_txt"] as const;

export interface ChecklistTargetInput {
  id: string;
  prompts: string[];
}

interface BuildRow {
  componentName: ComponentName;
  targetId: string | null;
  checkKey: string;
}

function toInsert(auditId: string, row: BuildRow): ChecklistItemInsert {
  return {
    audit_id: auditId,
    target_id: row.targetId,
    component_name: row.componentName,
    check_key: row.checkKey,
    idempotency_key: buildIdempotencyKey({
      auditId,
      componentName: row.componentName,
      targetId: row.targetId,
      checkKey: row.checkKey,
    }),
  };
}

/**
 * Builds every deterministic checklist row for an audit. Brand Recognition,
 * Social Profiles, Directories and Technical Accessibility are company/
 * domain-level (target_id = null); Prompt Visibility is expanded per
 * target x prompt x provider (Master Plan section 3).
 */
export function buildChecklistItems(
  auditId: string,
  targets: ChecklistTargetInput[]
): ChecklistItemInsert[] {
  const rows: BuildRow[] = [];

  for (const provider of BRAND_RECOGNITION_PROVIDERS) {
    rows.push({ componentName: "brand_recognition", targetId: null, checkKey: provider });
  }

  for (const target of targets) {
    target.prompts.forEach((_prompt, promptIndex) => {
      for (const provider of PROMPT_VISIBILITY_PROVIDERS) {
        rows.push({
          componentName: "prompt_visibility",
          targetId: target.id,
          checkKey: `prompt-${promptIndex}:${provider}`,
        });
      }
    });
  }

  for (const platform of SOCIAL_PLATFORMS) {
    rows.push({ componentName: "social_profiles", targetId: null, checkKey: platform });
  }

  for (const platform of DIRECTORY_PLATFORMS) {
    rows.push({ componentName: "directories", targetId: null, checkKey: platform });
  }

  for (const crawler of TECHNICAL_CRAWLERS) {
    rows.push({
      componentName: "technical_accessibility",
      targetId: null,
      checkKey: `crawler_${crawler}`,
    });
  }
  for (const file of TECHNICAL_FILES) {
    rows.push({ componentName: "technical_accessibility", targetId: null, checkKey: file });
  }

  return rows.map((row) => toInsert(auditId, row));
}

/**
 * Deterministic expected count, without executing anything:
 * 4 (brand) + totalPrompts * 4 (prompt visibility) + 8 (social)
 * + 10 (directories) + 6 crawlers + 2 files (technical) = 30 + 4 * totalPrompts
 */
export function countExpectedChecklistItems(targets: ChecklistTargetInput[]): number {
  const totalPrompts = targets.reduce((sum, target) => sum + target.prompts.length, 0);
  return (
    BRAND_RECOGNITION_PROVIDERS.length +
    totalPrompts * PROMPT_VISIBILITY_PROVIDERS.length +
    SOCIAL_PLATFORMS.length +
    DIRECTORY_PLATFORMS.length +
    TECHNICAL_CRAWLERS.length +
    TECHNICAL_FILES.length
  );
}
