// COMP-004: practical identity validation for a discovered directory
// listing URL. Deliberately simple (per task instructions: "do not build a
// new complex entity-resolution framework") -- structurally parallel to
// social-profiles/identity-validation.ts (COMP-003), carrying forward the
// two correctness fixes that COMP-003's live verification surfaced:
//   1. "domain referenced in title" checks the FULL domain string, never
//      just the label -- a bare label collapses onto a plain brand mention
//      whenever the domain label equals the brand name (the common case).
//   2. content/editorial-page URLs (blog, best-of lists, category pages)
//      are excluded from slug-identity matching up front.
// Directories add one extra strong deterministic signal spec explicitly
// calls out ("matching official domain"): several directory platforms
// (Trustpilot, G2, Capterra) put the audited company's own registered
// domain directly in the listing's URL path -- when present, that's as
// strong as a domain citation.

import {
  classifyUrlPlatform,
  isContentPathUrl,
  normalizeToken,
  pathSegmentTokens,
  urlPath,
  type DirectoryPlatform,
} from "./platforms";

// A path segment counts as a clean identity slug only when it's short --
// "acme" (1 token) or "acme-suite" (2) -- not a long descriptive title
// slug like "acme-gadget-xyz-review-2024" that merely mentions the brand
// among several other words (Product Hunt's /posts/<full-title-slug> is
// the case this guards against).
const MAX_IDENTITY_SEGMENT_TOKENS = 2;

export type IdentityVerdict = "Confirmed" | "Unverified" | "Reject";

export interface IdentityValidationInput {
  platform: DirectoryPlatform;
  listingUrl: string;
  listingTitle?: string | null;
  brandName: string;
  registeredDomain: string;
}

export interface IdentityValidationResult {
  verdict: IdentityVerdict;
  matchedSignals: string[];
}

function fullDomain(registeredDomain: string): string {
  return registeredDomain.trim().toLowerCase().replace(/^www\./, "");
}

export function validateListingIdentity(input: IdentityValidationInput): IdentityValidationResult {
  const { platform, listingUrl, brandName, registeredDomain } = input;
  const title = input.listingTitle ?? "";

  if (classifyUrlPlatform(listingUrl) !== platform) {
    return { verdict: "Reject", matchedSignals: [] };
  }

  const matchedSignals: string[] = [];
  const domain = fullDomain(registeredDomain);
  const loweredTitle = title.toLowerCase();
  const loweredPath = urlPath(listingUrl);

  // Strongest signal: the registered domain appears directly in the
  // listing's own URL path (e.g. trustpilot.com/review/acme.com).
  const domainInPath = domain.length > 0 && loweredPath.includes(domain);
  if (domainInPath) matchedSignals.push("registered domain present in listing URL path");

  const domainInTitle = domain.length > 0 && loweredTitle.includes(domain);
  if (domainInTitle) matchedSignals.push("registered domain referenced in title/snippet");

  const isContentPage = isContentPathUrl(listingUrl);
  const normalizedBrand = normalizeToken(brandName);
  const segments = isContentPage ? [] : pathSegmentTokens(listingUrl).map((seg) => seg.map(normalizeToken));
  const slugMatchesBrand =
    normalizedBrand.length > 0 &&
    segments.some((seg) => seg.length > 0 && seg.length <= MAX_IDENTITY_SEGMENT_TOKENS && seg.includes(normalizedBrand));
  if (slugMatchesBrand) matchedSignals.push("listing URL has a short identity segment matching the brand name");

  if (domainInPath || domainInTitle || slugMatchesBrand) {
    return { verdict: "Confirmed", matchedSignals };
  }

  const brandWordInTitle = normalizedBrand.length > 0 && new RegExp(`\\b${brandName.trim()}\\b`, "i").test(title);
  if (brandWordInTitle) {
    return { verdict: "Unverified", matchedSignals: ["brand name mentioned in title/snippet only"] };
  }

  return { verdict: "Reject", matchedSignals: [] };
}

export function selectBestCandidate<T extends { verdict: IdentityVerdict }>(candidates: T[]): T | null {
  return candidates.find((c) => c.verdict === "Confirmed") ?? candidates.find((c) => c.verdict === "Unverified") ?? null;
}
