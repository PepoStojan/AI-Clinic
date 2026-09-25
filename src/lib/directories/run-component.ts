import "server-only";

import { buildIdempotencyKey } from "../audit/idempotency";
import { DIRECTORY_PLATFORMS } from "../audit/checklist";
import type { Database } from "../supabase/database.types";
import { callLlmProvider, searchGoogleOrganic, type Citation } from "../providers/dataforseo";
import {
  updateChecklistItemByIdempotencyKey,
  type ChecklistItemRow,
} from "../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../supabase/repositories/component-results";
import { validateListingIdentity, selectBestCandidate, type IdentityValidationResult } from "./identity-validation";
import { PLATFORM_SEARCH_DOMAIN, type DirectoryPlatform } from "./platforms";
import { classifyListingMatch } from "./semantic-classifier";

export type ListingStatus = "Found" | "Not Found" | "Unverified" | "N/A — Could Not Verify";
export type ListingSource = "dataforseo_primary" | "claude_fallback" | "none";

export interface DirectoryPlatformOutcome {
  platform: DirectoryPlatform;
  status: ListingStatus;
  listingUrl: string | null;
  source: ListingSource;
  evidence: string;
  matchedSignals: string[];
  unavailableReason: string | null;
}

export interface DirectoriesSummary {
  totalDirectories: number; // always 10
  listingsFound: number;
  listingsNotFound: number;
  listingsUnverified: number;
  listingsCouldNotVerify: number;
}

export interface DirectoriesResult {
  auditId: string;
  platforms: DirectoryPlatformOutcome[];
  summary: DirectoriesSummary;
}

interface Candidate extends IdentityValidationResult {
  url: string;
  title: string | null;
}

function validatePrimaryCandidates(
  results: { url: string; title: string | null; domain: string }[],
  platform: DirectoryPlatform,
  brandName: string,
  registeredDomain: string
): Candidate[] {
  return results
    .filter((r) => r.domain.includes(PLATFORM_SEARCH_DOMAIN[platform].split(".")[0]))
    .map((r) => ({
      url: r.url,
      title: r.title,
      ...validateListingIdentity({ platform, listingUrl: r.url, listingTitle: r.title, brandName, registeredDomain }),
    }));
}

function validateCitationCandidates(
  citations: Citation[],
  platform: DirectoryPlatform,
  brandName: string,
  registeredDomain: string
): Candidate[] {
  return citations.map((c) => ({
    url: c.url,
    title: c.title,
    ...validateListingIdentity({ platform, listingUrl: c.url, listingTitle: c.title, brandName, registeredDomain }),
  }));
}

export function checklistStatusFor(outcome: DirectoryPlatformOutcome): ChecklistItemRow["status"] {
  if (outcome.status === "N/A — Could Not Verify") return "COULD_NOT_VERIFY";
  if (outcome.status === "Found") return "COMPLETED";
  return "GAP_FOUND"; // Not Found and Unverified are both gaps
}

export function buildSummary(platforms: DirectoryPlatformOutcome[]): DirectoriesSummary {
  return {
    totalDirectories: platforms.length,
    listingsFound: platforms.filter((p) => p.status === "Found").length,
    listingsNotFound: platforms.filter((p) => p.status === "Not Found").length,
    listingsUnverified: platforms.filter((p) => p.status === "Unverified").length,
    listingsCouldNotVerify: platforms.filter((p) => p.status === "N/A — Could Not Verify").length,
  };
}

/**
 * Claude Live Web Search fallback (spec section 17). Reuses the existing
 * DataForSEO Claude gateway (web_search: true is always on -- see
 * providers/dataforseo.ts), and trusts ONLY the returned, search-grounded
 * citations as candidate evidence -- Claude's own prose claim of a URL is
 * never used, so the fallback cannot invent a profile.
 */
async function runClaudeLiveSearchFallback(
  platform: DirectoryPlatform,
  companyName: string
): Promise<{ ok: boolean; citations: Citation[]; errorMessage: string | null }> {
  const domain = PLATFORM_SEARCH_DOMAIN[platform];
  const prompt =
    `Search the web to find the official ${domain} listing/profile page for the company "${companyName}". ` +
    `Only report a result if you find a real page on ${domain} that is genuinely about this company.`;
  try {
    const { parsed } = await callLlmProvider("claude", prompt);
    if (!parsed.ok) {
      return { ok: false, citations: [], errorMessage: parsed.noResultReason };
    }
    return { ok: true, citations: parsed.citations, errorMessage: null };
  } catch (error) {
    return { ok: false, citations: [], errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

async function resolvePlatform(
  platform: DirectoryPlatform,
  input: { companyName: string; registeredDomain: string }
): Promise<DirectoryPlatformOutcome> {
  const query = `site:${PLATFORM_SEARCH_DOMAIN[platform]} "${input.companyName}"`;
  const primary = await searchGoogleOrganic(query);
  const primaryCandidates = primary.ok
    ? validatePrimaryCandidates(primary.results, platform, input.companyName, input.registeredDomain)
    : [];
  const primaryBest = selectBestCandidate(primaryCandidates);

  if (primaryBest?.verdict === "Confirmed") {
    return {
      platform,
      status: "Found",
      listingUrl: primaryBest.url,
      source: "dataforseo_primary",
      evidence: "Verified official listing found via search.",
      matchedSignals: primaryBest.matchedSignals,
      unavailableReason: null,
    };
  }

  // Fallback is only for unresolved cases: primary itself failing, or
  // primary producing a genuinely ambiguous (Unverified) candidate. A
  // clean negative (primary succeeded, nothing confirmable at all) does
  // NOT trigger fallback -- "do not use fallback unnecessarily."
  const primaryNeedsFallback = !primary.ok || primaryBest?.verdict === "Unverified";

  let fallbackCandidates: Candidate[] = [];
  let fallbackRanReliably = false;
  let fallbackErrorMessage: string | null = null;

  if (primaryNeedsFallback) {
    const fallback = await runClaudeLiveSearchFallback(platform, input.companyName);
    fallbackRanReliably = fallback.ok;
    fallbackErrorMessage = fallback.errorMessage;
    if (fallback.ok) {
      fallbackCandidates = validateCitationCandidates(fallback.citations, platform, input.companyName, input.registeredDomain);
    }
  }
  const fallbackBest = selectBestCandidate(fallbackCandidates);

  if (fallbackBest?.verdict === "Confirmed") {
    return {
      platform,
      status: "Found",
      listingUrl: fallbackBest.url,
      source: "claude_fallback",
      evidence: "Verified official listing found via live web search.",
      matchedSignals: fallbackBest.matchedSignals,
      unavailableReason: null,
    };
  }

  // Reliability gate BEFORE attempting semantic resolution: if fallback was
  // needed (primary itself failed, or was ambiguous) but did not itself
  // complete reliably, the pipeline could not properly investigate this
  // platform at all -- that is a provider failure (-> N/A), not a case to
  // hand to the semantic judge just because primary happened to leave some
  // Unverified candidate lying around before the fallback attempt failed.
  if (primaryNeedsFallback && !fallbackRanReliably) {
    return {
      platform,
      status: "N/A — Could Not Verify",
      listingUrl: null,
      source: "none",
      evidence: "We could not reliably check this platform (discovery provider failure).",
      matchedSignals: [],
      unavailableReason: fallbackErrorMessage ?? "Discovery provider failure.",
    };
  }

  // Deterministic evidence remains Unverified -- try ONE bounded semantic
  // judge call on the strongest ambiguous candidate (spec: "Claude semantic
  // verification only if deterministic evidence remains Unverified").
  const bestUnverified =
    fallbackBest?.verdict === "Unverified" ? fallbackBest : primaryBest?.verdict === "Unverified" ? primaryBest : null;

  if (bestUnverified) {
    const judged = await classifyListingMatch(input.companyName, input.registeredDomain, bestUnverified.title ?? "");
    if (judged?.verdict === "Confirmed") {
      return {
        platform,
        status: "Found",
        listingUrl: bestUnverified.url,
        source: bestUnverified === fallbackBest ? "claude_fallback" : "dataforseo_primary",
        evidence: "Verified official listing (resolved by semantic identity check).",
        matchedSignals: [...bestUnverified.matchedSignals, "semantic identity check: match"],
        unavailableReason: null,
      };
    }
    if (judged?.verdict === "Wrong") {
      return {
        platform,
        status: "Not Found",
        listingUrl: null,
        source: "none",
        evidence: "We could not detect a verified profile on this platform.",
        matchedSignals: [],
        unavailableReason: null,
      };
    }
    // Ambiguous verdict, or the judge call itself failed/was unparseable --
    // never guess; stays Unverified.
    return {
      platform,
      status: "Unverified",
      listingUrl: null,
      source: "none",
      evidence: "We found a possible listing but could not confidently confirm it belongs to the audited company.",
      matchedSignals: bestUnverified.matchedSignals,
      unavailableReason: null,
    };
  }

  // No Unverified evidence anywhere, and every path that actually ran
  // (primary, plus fallback if it was needed) completed reliably -- a
  // clean, fully-investigated negative.
  return {
    platform,
    status: "Not Found",
    listingUrl: null,
    source: "none",
    evidence: "We could not detect a verified profile on this platform.",
    matchedSignals: [],
    unavailableReason: null,
  };
}

export async function runDirectoriesComponent(input: {
  auditId: string;
  companyName: string;
  registeredDomain: string;
}): Promise<DirectoriesResult> {
  await Promise.all(
    DIRECTORY_PLATFORMS.map((platform) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({ auditId: input.auditId, componentName: "directories", targetId: null, checkKey: platform }),
        { status: "RUNNING", started_at: new Date().toISOString() }
      )
    )
  );

  const outcomes = await Promise.all(DIRECTORY_PLATFORMS.map((platform) => resolvePlatform(platform, input)));

  await Promise.all(
    outcomes.map((outcome) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({ auditId: input.auditId, componentName: "directories", targetId: null, checkKey: outcome.platform }),
        {
          status: checklistStatusFor(outcome),
          result_json: { status: outcome.status, evidence: outcome.evidence },
          evidence_json: { listingUrl: outcome.listingUrl, source: outcome.source, matchedSignals: outcome.matchedSignals },
          last_error: outcome.unavailableReason,
          completed_at: new Date().toISOString(),
        }
      )
    )
  );

  const summary = buildSummary(outcomes);

  await upsertComponentResult({
    audit_id: input.auditId,
    component_name: "directories",
    status: "COMPLETED",
    raw_result_json: {
      platformSources: Object.fromEntries(outcomes.map((o) => [o.platform, o.source])),
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
