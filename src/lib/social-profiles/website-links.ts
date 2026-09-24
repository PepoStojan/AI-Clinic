import "server-only";

import { SOCIAL_PLATFORMS } from "../audit/checklist";
import { classifyUrlPlatform, normalizeUrlForComparison, type SocialPlatform } from "./platforms";

// COMP-003 website -> profile connection signal. One homepage fetch, one
// pass of minimal HTML inspection (anchor hrefs) -- deliberately not a
// crawler. Used to (a) independently corroborate a DataForSEO-fallback
// profile as Connected=Yes, and (b) fall back to N/A connection when the
// fetch itself fails, per the locked rule "website fetch fails -> connection
// verification may become N/A but profile discovery should still continue."

const FETCH_TIMEOUT_MS = 15_000;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;

export interface WebsiteSocialLinksResult {
  ok: boolean;
  linksByPlatform: Record<SocialPlatform, string[]>;
  errorMessage: string | null;
}

function emptyLinksByPlatform(): Record<SocialPlatform, string[]> {
  const map = {} as Record<SocialPlatform, string[]>;
  for (const platform of SOCIAL_PLATFORMS) map[platform] = [];
  return map;
}

export function extractSocialHrefs(html: string): Record<SocialPlatform, string[]> {
  const map = emptyLinksByPlatform();
  let match: RegExpExecArray | null;
  HREF_RE.lastIndex = 0;
  while ((match = HREF_RE.exec(html)) !== null) {
    const href = match[1];
    const platform = classifyUrlPlatform(href);
    if (platform && !map[platform].includes(href)) {
      map[platform].push(href);
    }
  }
  return map;
}

export async function fetchWebsiteSocialLinks(websiteUrl: string): Promise<WebsiteSocialLinksResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "AI-Clinic-Audit/1.0 (+social profile connection check)" },
    });
    if (!response.ok) {
      return { ok: false, linksByPlatform: emptyLinksByPlatform(), errorMessage: `Website fetch HTTP ${response.status}` };
    }
    const html = await response.text();
    return { ok: true, linksByPlatform: extractSocialHrefs(html), errorMessage: null };
  } catch (error) {
    return {
      ok: false,
      linksByPlatform: emptyLinksByPlatform(),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function websiteLinksToProfile(
  linksByPlatform: Record<SocialPlatform, string[]>,
  platform: SocialPlatform,
  profileUrl: string
): boolean {
  const target = normalizeUrlForComparison(profileUrl);
  return linksByPlatform[platform].some((href) => normalizeUrlForComparison(href) === target);
}
