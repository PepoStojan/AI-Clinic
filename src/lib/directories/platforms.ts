// COMP-004: shared directory-domain table + URL helpers. Parallel to
// social-profiles/platforms.ts (COMP-003) -- deliberately not shared/
// extracted into a common module, matching this repo's existing
// per-component convention (no cross-component coupling), so this task
// touches nothing in the already-shipped COMP-003 code.

import { DIRECTORY_PLATFORMS } from "../audit/checklist";

export type DirectoryPlatform = (typeof DIRECTORY_PLATFORMS)[number];

export const PLATFORM_DOMAINS: Record<DirectoryPlatform, string[]> = {
  g2: ["g2.com"],
  capterra: ["capterra.com"],
  trustpilot: ["trustpilot.com"],
  clutch: ["clutch.co"],
  // Deliberately NOT the bare "google.com" -- live COMP-004 verification
  // found a site:google.com search surfaces any Google-hosted page
  // mentioning the brand (Cloud docs, Support, unrelated blogspot, ...),
  // none of which is an actual Business Profile listing. Only these
  // specific hosts are ever a real GBP listing/share link.
  google_business_profile: ["g.page", "business.google.com", "maps.google.com"],
  bestcompany: ["bestcompany.com"],
  getapp: ["getapp.com"],
  software_advice: ["softwareadvice.com"],
  gartner_peer_insights: ["gartner.com"],
  product_hunt: ["producthunt.com"],
};

// One canonical domain per platform for the DataForSEO site: query.
export const PLATFORM_SEARCH_DOMAIN: Record<DirectoryPlatform, string> = {
  g2: "g2.com",
  capterra: "capterra.com",
  trustpilot: "trustpilot.com",
  clutch: "clutch.co",
  google_business_profile: "google.com",
  bestcompany: "bestcompany.com",
  getapp: "getapp.com",
  software_advice: "softwareadvice.com",
  gartner_peer_insights: "gartner.com",
  product_hunt: "producthunt.com",
};

function hostOf(url: string): string {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

/** Which of the 10 directory platforms a URL belongs to, or null if none. */
export function classifyUrlPlatform(url: string): DirectoryPlatform | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const platform of DIRECTORY_PLATFORMS) {
    if (PLATFORM_DOMAINS[platform].some((d) => host === d || host.endsWith(`.${d}`))) {
      return platform;
    }
  }
  return null;
}

export function urlPath(url: string): string {
  try {
    return new URL(url.trim()).pathname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Tokens of each path segment, kept separate per segment -- directory
 * listing URLs commonly trail the identity slug with another segment
 * (e.g. g2.com/products/<slug>/reviews), so a last-segment-only check
 * misses the real identity slug. Segments stay separate (not flattened)
 * so callers can tell a clean identity segment ("acme", "acme-suite")
 * from a long, descriptive title-slug ("acme-gadget-xyz-review-2024")
 * that merely mentions the brand among several other words -- Product
 * Hunt in particular posts at /posts/<full-title-slug>, not a handle.
 */
export function pathSegmentTokens(url: string): string[][] {
  try {
    const segments = new URL(url.trim()).pathname.split("/").filter(Boolean);
    return segments.map((s) => s.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean));
  } catch {
    return [];
  }
}

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Directory sites also host editorial/comparison content (best-of lists,
// blog posts, category pages) that can mention a brand name without being
// its own listing -- e.g. g2.com/categories/..., capterra.com/blog/...
// Same false-positive class COMP-003's live verification found for social
// platforms; excluded up front here rather than rediscovering it live.
const CONTENT_PATH_SEGMENTS = new Set([
  "blog",
  "blogs",
  "article",
  "articles",
  "guide",
  "guides",
  "compare",
  "comparison",
  "alternatives",
  "best",
  "category",
  "categories",
  "resources",
  "learn",
  "glossary",
]);

export function isContentPathUrl(url: string): boolean {
  try {
    const segments = new URL(url.trim()).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
    return segments.some((s) => CONTENT_PATH_SEGMENTS.has(s));
  } catch {
    return false;
  }
}
