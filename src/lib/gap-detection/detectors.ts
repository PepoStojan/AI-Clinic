// CORE-002: deterministic gap detection + grouping, one pure function per
// component. No AI/LLM involvement anywhere in this file (Build Spec
// section 19: "Claude must NOT decide whether a gap exists"). Each
// function reads a component's own `normalized_result_json` shape
// (exactly as written by that component's run-component.ts) and returns
// zero or more DetectedGap objects -- never a clean/pass or N/A/Could-Not-
// Verify row, per the locked "NO SOURCE FINDING -> NO GAP" rule.

import { buildIdempotencyKey } from "../audit/idempotency";
import type { DetectedGap } from "./types";

// -- Display-name maps (gap-detection only -- no other component needed
// pretty names, so these are deliberately local rather than a shared
// export from checklist.ts) --------------------------------------------

const SOCIAL_DISPLAY_NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  x_twitter: "X/Twitter",
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads",
  reddit: "Reddit",
};

const DIRECTORY_DISPLAY_NAMES: Record<string, string> = {
  g2: "G2",
  capterra: "Capterra",
  trustpilot: "Trustpilot",
  clutch: "Clutch",
  google_business_profile: "Google Business Profile",
  bestcompany: "BestCompany",
  getapp: "GetApp",
  software_advice: "Software Advice",
  gartner_peer_insights: "Gartner Peer Insights",
  product_hunt: "Product Hunt",
};

// --------------------------------------------------------------------------
// Brand Recognition
// --------------------------------------------------------------------------

export interface BrandRecognitionNormalized {
  providers: { provider: string; recognitionStatus: string; evidence: string }[];
}

const BRAND_GAP_STATUSES = new Set(["Partially Accurate", "Inaccurate", "Not Recognized"]);

export function detectBrandRecognitionGaps(auditId: string, normalized: BrandRecognitionNormalized): DetectedGap[] {
  const affected = normalized.providers.filter((p) => BRAND_GAP_STATUSES.has(p.recognitionStatus));
  if (affected.length === 0) return [];

  const title =
    affected.length === 1
      ? `Brand description is inaccurate on ${affected[0].provider}`
      : "Brand descriptions are inconsistent across AI systems";

  return [
    {
      gapKey: "brand_recognition:inaccurate_descriptions",
      componentName: "brand_recognition",
      gapType: "inaccurate_descriptions",
      title,
      affectedChecks: affected.map((p) => ({
        component: "brand_recognition",
        provider: p.provider,
        status: p.recognitionStatus,
        checklistIdempotencyKey: buildIdempotencyKey({
          auditId,
          componentName: "brand_recognition",
          targetId: null,
          checkKey: p.provider,
        }),
      })),
      evidence: affected.map((p) => ({ provider: p.provider, status: p.recognitionStatus, evidence: p.evidence })),
      deterministicReason: `${affected.length} of ${normalized.providers.length} AI system(s) returned a Partially Accurate, Inaccurate, or Not Recognized brand description.`,
    },
  ];
}

// --------------------------------------------------------------------------
// Prompt Visibility
// --------------------------------------------------------------------------

export interface PromptVisibilityNormalized {
  providers: {
    targetId: string;
    promptIndex: number;
    prompt: string;
    provider: string;
    mentionClass: string;
    entityStatus: string | null;
    evidence: string;
  }[];
}

function promptVisibilityCheckKey(row: PromptVisibilityNormalized["providers"][number]): string {
  return `prompt-${row.promptIndex}:${row.provider}`;
}

function promptVisibilityAffectedCheck(auditId: string, row: PromptVisibilityNormalized["providers"][number]) {
  return {
    component: "prompt_visibility",
    targetId: row.targetId,
    promptIndex: row.promptIndex,
    prompt: row.prompt,
    provider: row.provider,
    mentionClass: row.mentionClass,
    entityStatus: row.entityStatus,
    checklistIdempotencyKey: buildIdempotencyKey({
      auditId,
      componentName: "prompt_visibility",
      targetId: row.targetId,
      checkKey: promptVisibilityCheckKey(row),
    }),
  };
}

/**
 * Grouped by logical gap type, per task instructions: "group repeated
 * visibility issues only when they share the same logical gap type. Do
 * not collapse everything into one giant generic gap." Ambiguous and Not
 * Mentioned are two distinct logical issues -- never merged into one gap.
 */
export function detectPromptVisibilityGaps(auditId: string, normalized: PromptVisibilityNormalized): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  const notMentioned = normalized.providers.filter((p) => p.mentionClass === "Not Mentioned");
  if (notMentioned.length > 0) {
    gaps.push({
      gapKey: "prompt_visibility:not_mentioned",
      componentName: "prompt_visibility",
      gapType: "not_mentioned",
      title: "Brand is missing from selected buyer prompts",
      affectedChecks: notMentioned.map((r) => promptVisibilityAffectedCheck(auditId, r)),
      evidence: notMentioned.map((r) => ({
        target: r.targetId,
        prompt: r.prompt,
        provider: r.provider,
        mentionClass: r.mentionClass,
        evidence: r.evidence,
      })),
      deterministicReason: `${notMentioned.length} prompt/provider check(s) resulted in Not Mentioned.`,
    });
  }

  const ambiguous = normalized.providers.filter((p) => p.mentionClass === "Ambiguous");
  if (ambiguous.length > 0) {
    gaps.push({
      gapKey: "prompt_visibility:ambiguous",
      componentName: "prompt_visibility",
      gapType: "ambiguous",
      title: "Brand mentions are ambiguous in some buyer prompts",
      affectedChecks: ambiguous.map((r) => promptVisibilityAffectedCheck(auditId, r)),
      evidence: ambiguous.map((r) => ({
        target: r.targetId,
        prompt: r.prompt,
        provider: r.provider,
        mentionClass: r.mentionClass,
        evidence: r.evidence,
      })),
      deterministicReason: `${ambiguous.length} prompt/provider check(s) resulted in Ambiguous.`,
    });
  }

  return gaps;
}

// --------------------------------------------------------------------------
// Social Profiles
// --------------------------------------------------------------------------

export interface SocialProfilesNormalized {
  platforms: { platform: string; profileStatus: string; connected: string; evidence: string }[];
}

function socialAffectedCheck(auditId: string, row: SocialProfilesNormalized["platforms"][number]) {
  return {
    component: "social_profiles",
    platform: row.platform,
    profileStatus: row.profileStatus,
    connected: row.connected,
    checklistIdempotencyKey: buildIdempotencyKey({
      auditId,
      componentName: "social_profiles",
      targetId: null,
      checkKey: row.platform,
    }),
  };
}

/** Two distinct logical issues -- "not connected" (a profile was verified
 * but isn't linked to/from the website) is a different gap from "no
 * verified profile could be found at all" (Not Found / Unverified). The
 * C-004 lock (a clean LinkedIn must never appear in a Facebook-only
 * "unconnected" gap) falls out naturally from filtering on the exact
 * per-platform status/connected fields. */
export function detectSocialProfilesGaps(auditId: string, normalized: SocialProfilesNormalized): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  const notConnected = normalized.platforms.filter((p) => p.profileStatus === "Found" && p.connected === "No");
  if (notConnected.length > 0) {
    const title =
      notConnected.length === 1
        ? `${SOCIAL_DISPLAY_NAMES[notConnected[0].platform] ?? notConnected[0].platform} profile is not connected to your website`
        : "Social profiles are not fully connected";
    gaps.push({
      gapKey: "social_profiles:not_connected",
      componentName: "social_profiles",
      gapType: "not_connected",
      title,
      affectedChecks: notConnected.map((r) => socialAffectedCheck(auditId, r)),
      evidence: notConnected.map((r) => ({ platform: r.platform, profileStatus: r.profileStatus, connected: r.connected, evidence: r.evidence })),
      deterministicReason: `${notConnected.length} platform(s) have a verified profile that is not connected to the official website.`,
    });
  }

  const notFoundOrUnverified = normalized.platforms.filter(
    (p) => p.profileStatus === "Not Found" || p.profileStatus === "Unverified"
  );
  if (notFoundOrUnverified.length > 0) {
    const title =
      notFoundOrUnverified.length === 1
        ? `${SOCIAL_DISPLAY_NAMES[notFoundOrUnverified[0].platform] ?? notFoundOrUnverified[0].platform} profile could not be detected`
        : "We could not detect verified profiles on several social platforms";
    gaps.push({
      gapKey: "social_profiles:not_found",
      componentName: "social_profiles",
      gapType: "not_found",
      title,
      affectedChecks: notFoundOrUnverified.map((r) => socialAffectedCheck(auditId, r)),
      evidence: notFoundOrUnverified.map((r) => ({ platform: r.platform, profileStatus: r.profileStatus, evidence: r.evidence })),
      deterministicReason: `${notFoundOrUnverified.length} platform(s) had no confirmed profile (Not Found or Unverified).`,
    });
  }

  return gaps;
}

// --------------------------------------------------------------------------
// Directories
// --------------------------------------------------------------------------

export interface DirectoriesNormalized {
  platforms: { platform: string; status: string; evidence: string }[];
}

export function detectDirectoriesGaps(auditId: string, normalized: DirectoriesNormalized): DetectedGap[] {
  const affected = normalized.platforms.filter((p) => p.status === "Not Found" || p.status === "Unverified");
  if (affected.length === 0) return [];

  return [
    {
      gapKey: "directories:limited_presence",
      componentName: "directories",
      gapType: "limited_presence",
      title: "Limited third-party directory presence",
      affectedChecks: affected.map((p) => ({
        component: "directories",
        platform: p.platform,
        status: p.status,
        checklistIdempotencyKey: buildIdempotencyKey({
          auditId,
          componentName: "directories",
          targetId: null,
          checkKey: p.platform,
        }),
      })),
      evidence: affected.map((p) => ({
        platform: DIRECTORY_DISPLAY_NAMES[p.platform] ?? p.platform,
        status: p.status,
        evidence: p.evidence,
      })),
      deterministicReason: `${affected.length} of ${normalized.platforms.length} directories had no verified listing (Not Found or Unverified).`,
    },
  ];
}

// --------------------------------------------------------------------------
// Technical Accessibility
// --------------------------------------------------------------------------

export interface TechnicalAccessibilityNormalized {
  crawlers: { crawler: string; userAgent: string; status: string; reason: string }[];
}

function technicalAffectedCheck(auditId: string, row: TechnicalAccessibilityNormalized["crawlers"][number]) {
  return {
    component: "technical_accessibility",
    crawler: row.crawler,
    userAgent: row.userAgent,
    status: row.status,
    checklistIdempotencyKey: buildIdempotencyKey({
      auditId,
      componentName: "technical_accessibility",
      targetId: null,
      checkKey: `crawler_${row.crawler}`,
    }),
  };
}

/** Blocked and Allowed-with-restrictions are two distinct logical issues
 * (full block vs partial restriction) -- never merged into one gap,
 * matching the spec's own separate title examples ("GPTBot is blocked" vs
 * "AI crawler access is restricted"). llms.txt/robots.txt absence never
 * produces a gap here -- this function only ever looks at crawler status. */
export function detectTechnicalAccessibilityGaps(auditId: string, normalized: TechnicalAccessibilityNormalized): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  const blocked = normalized.crawlers.filter((c) => c.status === "Blocked");
  if (blocked.length > 0) {
    const title = blocked.length === 1 ? `${blocked[0].userAgent} is blocked` : "Some AI crawlers are blocked";
    gaps.push({
      gapKey: "technical_accessibility:blocked",
      componentName: "technical_accessibility",
      gapType: "blocked",
      title,
      affectedChecks: blocked.map((r) => technicalAffectedCheck(auditId, r)),
      evidence: blocked.map((r) => ({ crawler: r.userAgent, status: r.status, reason: r.reason })),
      deterministicReason: `${blocked.length} crawler(s) are fully blocked by robots.txt.`,
    });
  }

  const restricted = normalized.crawlers.filter((c) => c.status === "Allowed with restrictions");
  if (restricted.length > 0) {
    const title =
      restricted.length === 1 ? `${restricted[0].userAgent}'s access is restricted` : "AI crawler access is restricted";
    gaps.push({
      gapKey: "technical_accessibility:restricted",
      componentName: "technical_accessibility",
      gapType: "restricted",
      title,
      affectedChecks: restricted.map((r) => technicalAffectedCheck(auditId, r)),
      evidence: restricted.map((r) => ({ crawler: r.userAgent, status: r.status, reason: r.reason })),
      deterministicReason: `${restricted.length} crawler(s) have path-level restrictions in robots.txt.`,
    });
  }

  return gaps;
}
