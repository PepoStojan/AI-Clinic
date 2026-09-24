// COMP-003: practical identity validation for a discovered social-profile
// URL. Deliberately simple (per task instructions: "keep validation
// practical," "do not create another complex entity-resolution system") --
// not the multi-occurrence windowed scoring built for COMP-002's free-text
// LLM answers. A social-profile candidate is a URL + a short title/snippet,
// not a paragraph, so a slug/keyword check is the right level of effort.

import { classifyUrlPlatform, normalizeToken, profileSlug, type SocialPlatform } from "./platforms";

export type IdentityVerdict = "Confirmed" | "Unverified" | "Reject";

export interface IdentityValidationInput {
  platform: SocialPlatform;
  profileUrl: string;
  profileTitle?: string | null;
  brandName: string;
  registeredDomain: string;
}

export interface IdentityValidationResult {
  verdict: IdentityVerdict;
  matchedSignals: string[];
}

function domainLabel(registeredDomain: string): string {
  return registeredDomain.trim().toLowerCase().replace(/^www\./, "").split(".")[0] ?? "";
}

/**
 * Same/similar-name alone is never enough. A candidate is only "Confirmed"
 * when it carries a real corroborating signal beyond a name collision:
 * the profile URL's own slug identifies the brand, or the search
 * title/snippet independently names the registered domain. A bare
 * whole-word brand mention in the title with no slug/domain corroboration
 * is "Unverified," not "Confirmed" -- that's the case a same-name but
 * unrelated company would also produce.
 */
export function validateProfileIdentity(input: IdentityValidationInput): IdentityValidationResult {
  const { platform, profileUrl, brandName, registeredDomain } = input;
  const title = input.profileTitle ?? "";

  if (classifyUrlPlatform(profileUrl) !== platform) {
    return { verdict: "Reject", matchedSignals: [] };
  }

  const matchedSignals: string[] = [];
  const normalizedBrand = normalizeToken(brandName);
  const rawSlug = profileSlug(profileUrl);
  const slug = normalizeToken(rawSlug);
  // Token-based, not a raw substring check -- "megaacmecorpxyz" must not
  // count as a brand match just because "acme" appears inside it.
  const slugTokens = rawSlug.split(/[^a-z0-9]+/i).filter(Boolean).map(normalizeToken);
  const loweredTitle = title.toLowerCase();
  const domain = domainLabel(registeredDomain);

  const slugMatchesBrand =
    normalizedBrand.length > 0 && slug.length > 0 && (slug === normalizedBrand || slugTokens.includes(normalizedBrand));
  if (slugMatchesBrand) matchedSignals.push("profile URL slug matches brand name");

  const domainInTitle = domain.length > 0 && loweredTitle.includes(domain);
  if (domainInTitle) matchedSignals.push("registered domain referenced in title/snippet");

  const slugMatchesDomainLabel = domain.length > 0 && slug.length > 0 && (slug === domain || slugTokens.includes(domain));
  if (slugMatchesDomainLabel && !slugMatchesBrand) matchedSignals.push("profile URL slug matches domain label");

  if (slugMatchesBrand || domainInTitle || slugMatchesDomainLabel) {
    return { verdict: "Confirmed", matchedSignals };
  }

  const brandWordInTitle = normalizedBrand.length > 0 && new RegExp(`\\b${brandName.trim()}\\b`, "i").test(title);
  if (brandWordInTitle) {
    return { verdict: "Unverified", matchedSignals: ["brand name mentioned in title/snippet only"] };
  }

  return { verdict: "Reject", matchedSignals: [] };
}

/** Picks the strongest candidate for a platform: first Confirmed, else first Unverified, else null. */
export function selectBestCandidate<T extends { verdict: IdentityVerdict }>(candidates: T[]): T | null {
  return candidates.find((c) => c.verdict === "Confirmed") ?? candidates.find((c) => c.verdict === "Unverified") ?? null;
}
