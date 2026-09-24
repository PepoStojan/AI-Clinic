// COMP-003: practical identity validation for a discovered social-profile
// URL. Deliberately simple (per task instructions: "keep validation
// practical," "do not create another complex entity-resolution system") --
// not the multi-occurrence windowed scoring built for COMP-002's free-text
// LLM answers. A social-profile candidate is a URL + a short title/snippet,
// not a paragraph, so a slug/keyword check is the right level of effort.

import { classifyUrlPlatform, isContentPathUrl, normalizeToken, profileSlug, type SocialPlatform } from "./platforms";

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
  // A content/post-page URL (an article, video, or post that merely
  // mentions the brand as one word in a long slug) is never treated as a
  // profile-identity match -- see isContentPathUrl. Only an actual
  // profile-shaped URL's slug counts as an identity signal.
  const isContentPage = isContentPathUrl(profileUrl);
  const rawSlug = isContentPage ? "" : profileSlug(profileUrl);
  const slug = normalizeToken(rawSlug);
  // Token-based, not a raw substring check -- "megaacmecorpxyz" must not
  // count as a brand match just because "acme" appears inside it.
  const slugTokens = rawSlug.split(/[^a-z0-9]+/i).filter(Boolean).map(normalizeToken);
  const loweredTitle = title.toLowerCase();
  const domain = domainLabel(registeredDomain);

  const slugMatchesBrand =
    normalizedBrand.length > 0 && slug.length > 0 && (slug === normalizedBrand || slugTokens.includes(normalizedBrand));
  if (slugMatchesBrand) matchedSignals.push("profile URL slug matches brand name");

  // Full domain text (e.g. "stripe.com"), not just the label ("stripe") --
  // live COMP-003 verification against a real DataForSEO fallback result
  // (an unrelated TikTok video whose caption happened to say "Stripe")
  // showed that checking the bare label collapses this signal onto a plain
  // brand-name mention whenever the domain label equals the brand name,
  // which is the common case (most companies' domain matches their brand).
  // The full domain string is a much more specific signal a random mention
  // is unlikely to contain.
  const fullDomain = registeredDomain.trim().toLowerCase().replace(/^www\./, "");
  const domainInTitle = fullDomain.length > 0 && loweredTitle.includes(fullDomain);
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
