import "server-only";

import { buildIdempotencyKey } from "../audit/idempotency";
import { SOCIAL_PLATFORMS } from "../audit/checklist";
import type { Database } from "../supabase/database.types";
import { runSocialDiscoveryActor, type ApifyCandidate } from "../providers/apify";
import { searchGoogleOrganic } from "../providers/dataforseo";
import {
  updateChecklistItemByIdempotencyKey,
  type ChecklistItemRow,
} from "../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../supabase/repositories/component-results";
import { validateProfileIdentity, selectBestCandidate, type IdentityValidationResult } from "./identity-validation";
import { PLATFORM_SEARCH_DOMAIN, type SocialPlatform } from "./platforms";
import { fetchWebsiteSocialLinks, websiteLinksToProfile } from "./website-links";

export type ProfileStatus = "Found" | "Not Found" | "Unverified" | "N/A — Could Not Verify";
export type ConnectedStatus = "Yes" | "No" | "N/A";
export type ProfileSource = "apify" | "dataforseo_fallback" | "none";

export interface SocialPlatformOutcome {
  platform: SocialPlatform;
  profileStatus: ProfileStatus;
  profileUrl: string | null;
  connected: ConnectedStatus;
  source: ProfileSource;
  evidence: string;
  matchedSignals: string[];
  unavailableReason: string | null;
}

export interface SocialProfilesSummary {
  totalPlatforms: number; // always 8
  profilesFound: number;
  profilesConnected: number;
  profilesNotFound: number;
  profilesUnverified: number;
  profilesCouldNotVerify: number;
}

export interface SocialProfilesResult {
  auditId: string;
  platforms: SocialPlatformOutcome[];
  summary: SocialProfilesSummary;
}

type CandidateWithVerdict = ApifyCandidate & IdentityValidationResult;

function validateCandidates(
  candidates: ApifyCandidate[],
  platform: SocialPlatform,
  brandName: string,
  registeredDomain: string
): CandidateWithVerdict[] {
  return candidates
    .filter((c) => c.platform === platform)
    .map((c) => ({ ...c, ...validateProfileIdentity({ platform, profileUrl: c.url, profileTitle: c.title, brandName, registeredDomain }) }));
}

export function checklistStatusFor(outcome: SocialPlatformOutcome): ChecklistItemRow["status"] {
  if (outcome.profileStatus === "N/A — Could Not Verify") return "COULD_NOT_VERIFY";
  if (outcome.profileStatus === "Found" && outcome.connected === "Yes") return "COMPLETED";
  // Found + Connected No, Not Found, and Unverified are all gaps per the
  // locked logic -- Unverified is "an unresolved social-presence issue,"
  // never a confirmed absence, but still not a clean pass.
  return "GAP_FOUND";
}

export function buildSummary(platforms: SocialPlatformOutcome[]): SocialProfilesSummary {
  return {
    totalPlatforms: platforms.length,
    profilesFound: platforms.filter((p) => p.profileStatus === "Found").length,
    profilesConnected: platforms.filter((p) => p.profileStatus === "Found" && p.connected === "Yes").length,
    profilesNotFound: platforms.filter((p) => p.profileStatus === "Not Found").length,
    profilesUnverified: platforms.filter((p) => p.profileStatus === "Unverified").length,
    profilesCouldNotVerify: platforms.filter((p) => p.profileStatus === "N/A — Could Not Verify").length,
  };
}

async function resolvePlatform(
  platform: SocialPlatform,
  apify: { ok: boolean; candidates: ApifyCandidate[] },
  input: { companyName: string; registeredDomain: string },
  websiteLinks: { ok: boolean; linksByPlatform: Record<SocialPlatform, string[]> }
): Promise<SocialPlatformOutcome> {
  const apifyCandidates = apify.ok
    ? validateCandidates(apify.candidates, platform, input.companyName, input.registeredDomain)
    : [];
  const apifyBest = selectBestCandidate(apifyCandidates);

  if (apifyBest?.verdict === "Confirmed") {
    return {
      platform,
      profileStatus: "Found",
      profileUrl: apifyBest.url,
      connected: "Yes", // Apify extracts from the audited website itself -- website-link is inherent to discovery.
      source: "apify",
      evidence: `Profile discovered via Apify, linked from the audited website.`,
      matchedSignals: apifyBest.matchedSignals,
      unavailableReason: null,
    };
  }

  // Apify did not return a confirmed profile for this platform -- not
  // enough to call Not Found. Fall back to a DataForSEO SERP search.
  const query = `site:${PLATFORM_SEARCH_DOMAIN[platform]} "${input.companyName}"`;
  const fallback = await searchGoogleOrganic(query);

  const fallbackCandidates = fallback.ok
    ? fallback.results
        .filter((r) => r.domain.includes(PLATFORM_SEARCH_DOMAIN[platform].split(".")[0]))
        .map((r) => ({
          platform,
          url: r.url,
          title: r.title,
          ...validateProfileIdentity({ platform, profileUrl: r.url, profileTitle: r.title, brandName: input.companyName, registeredDomain: input.registeredDomain }),
        }))
    : [];
  const fallbackBest = selectBestCandidate(fallbackCandidates);

  if (fallbackBest?.verdict === "Confirmed") {
    const connected = !websiteLinks.ok
      ? "N/A"
      : websiteLinksToProfile(websiteLinks.linksByPlatform, platform, fallbackBest.url)
        ? "Yes"
        : "No";
    return {
      platform,
      profileStatus: "Found",
      profileUrl: fallbackBest.url,
      connected,
      source: "dataforseo_fallback",
      evidence:
        connected === "Yes"
          ? "Verified official profile found via search; also linked from the audited website."
          : connected === "No"
            ? "Verified official profile found via search; not detected as linked from the audited website."
            : "Verified official profile found via search; website link could not be checked.",
      matchedSignals: fallbackBest.matchedSignals,
      unavailableReason: null,
    };
  }

  const apifyReliable = apify.ok;
  const fallbackReliable = fallback.ok;
  const anyUnverified = apifyBest?.verdict === "Unverified" || fallbackBest?.verdict === "Unverified";

  if (!apifyReliable && !fallbackReliable) {
    return {
      platform,
      profileStatus: "N/A — Could Not Verify",
      profileUrl: null,
      connected: "N/A",
      source: "none",
      evidence: "We could not reliably check this platform (discovery provider failure).",
      matchedSignals: [],
      unavailableReason: fallback.errorMessage ?? "Discovery provider failure.",
    };
  }

  if (anyUnverified) {
    return {
      platform,
      profileStatus: "Unverified",
      profileUrl: null,
      connected: "N/A",
      source: "none",
      evidence: "We found a possible profile but could not confidently confirm it belongs to the audited company.",
      matchedSignals: [...(apifyBest?.matchedSignals ?? []), ...(fallbackBest?.matchedSignals ?? [])],
      unavailableReason: null,
    };
  }

  // Both attempted discovery paths that actually ran completed reliably
  // with no confirmed or unverified evidence at all.
  if (!fallbackReliable) {
    return {
      platform,
      profileStatus: "N/A — Could Not Verify",
      profileUrl: null,
      connected: "N/A",
      source: "none",
      evidence: "We could not reliably check this platform (fallback search failure).",
      matchedSignals: [],
      unavailableReason: fallback.errorMessage,
    };
  }

  return {
    platform,
    profileStatus: "Not Found",
    profileUrl: null,
    connected: "N/A",
    source: "none",
    evidence: "We could not detect a verified profile.",
    matchedSignals: [],
    unavailableReason: null,
  };
}

export async function runSocialProfilesComponent(input: {
  auditId: string;
  companyName: string;
  registeredDomain: string;
  websiteUrl: string;
}): Promise<SocialProfilesResult> {
  await Promise.all(
    SOCIAL_PLATFORMS.map((platform) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({ auditId: input.auditId, componentName: "social_profiles", targetId: null, checkKey: platform }),
        { status: "RUNNING", started_at: new Date().toISOString() }
      )
    )
  );

  // One Apify actor run covers all 8 platforms -- cost control.
  const [apify, websiteLinks] = await Promise.all([
    runSocialDiscoveryActor(input.websiteUrl),
    fetchWebsiteSocialLinks(input.websiteUrl),
  ]);

  const outcomes = await Promise.all(
    SOCIAL_PLATFORMS.map((platform) => resolvePlatform(platform, apify, input, websiteLinks))
  );

  await Promise.all(
    outcomes.map((outcome) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({ auditId: input.auditId, componentName: "social_profiles", targetId: null, checkKey: outcome.platform }),
        {
          status: checklistStatusFor(outcome),
          result_json: { profileStatus: outcome.profileStatus, connected: outcome.connected, evidence: outcome.evidence },
          evidence_json: { profileUrl: outcome.profileUrl, source: outcome.source, matchedSignals: outcome.matchedSignals },
          last_error: outcome.unavailableReason,
          completed_at: new Date().toISOString(),
        }
      )
    )
  );

  const summary = buildSummary(outcomes);

  await upsertComponentResult({
    audit_id: input.auditId,
    component_name: "social_profiles",
    status: "COMPLETED",
    raw_result_json: {
      apify: { ok: apify.ok, candidateCount: apify.candidates.length, errorMessage: apify.errorMessage },
      websiteLinks: { ok: websiteLinks.ok, errorMessage: websiteLinks.errorMessage },
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["raw_result_json"],
    normalized_result_json: {
      platforms: outcomes,
      summary,
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["normalized_result_json"],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  return { auditId: input.auditId, platforms: outcomes, summary };
}
