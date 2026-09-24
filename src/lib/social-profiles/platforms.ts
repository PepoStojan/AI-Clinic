// COMP-003: shared platform-domain table + URL helpers. One canonical place
// for "what domain(s) belong to which of the exactly-8 platforms" so the
// Apify parser, the DataForSEO fallback, and the website link-check all
// agree on the same classification -- no per-caller drift.

import { SOCIAL_PLATFORMS } from "../audit/checklist";

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_DOMAINS: Record<SocialPlatform, string[]> = {
  linkedin: ["linkedin.com"],
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  x_twitter: ["twitter.com", "x.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  threads: ["threads.net", "threads.com"],
  reddit: ["reddit.com"],
};

// Used to build the DataForSEO fallback's site: query -- one canonical
// domain per platform.
export const PLATFORM_SEARCH_DOMAIN: Record<SocialPlatform, string> = {
  linkedin: "linkedin.com",
  facebook: "facebook.com",
  instagram: "instagram.com",
  x_twitter: "x.com",
  youtube: "youtube.com",
  tiktok: "tiktok.com",
  threads: "threads.net",
  reddit: "reddit.com",
};

export function normalizeUrlForComparison(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (host === "fb.com") host = "facebook.com";
    if (host === "x.com") host = "twitter.com"; // canonicalize the rebrand
    const path = parsed.pathname.replace(/\/$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function hostOf(url: string): string {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

/** Which of the 8 platforms a URL belongs to, or null if it matches none. */
export function classifyUrlPlatform(url: string): SocialPlatform | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const platform of SOCIAL_PLATFORMS) {
    if (PLATFORM_DOMAINS[platform].some((d) => host === d || host.endsWith(`.${d}`))) {
      return platform;
    }
  }
  return null;
}

/** Last meaningful path segment of a profile URL, used as the identity slug. */
export function profileSlug(url: string): string {
  try {
    const path = new URL(url.trim()).pathname;
    const segments = path.split("/").filter(Boolean);
    return (segments[segments.length - 1] ?? "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
