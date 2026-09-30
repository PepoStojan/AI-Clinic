import "server-only";

import { SOCIAL_PLATFORMS } from "../audit/checklist";
import { classifyUrlPlatform, normalizeUrlForComparison, youtubeUrlsShareSlugIdentity, type SocialPlatform } from "./platforms";

// COMP-003 website -> profile connection signal. One homepage fetch, one
// pass of minimal HTML inspection (anchor hrefs) -- deliberately not a
// crawler. Used to (a) independently corroborate a DataForSEO-fallback
// profile as Connected=Yes, and (b) fall back to N/A connection when the
// fetch itself fails, per the locked rule "website fetch fails -> connection
// verification may become N/A but profile discovery should still continue."
//
// SOCIAL-CONNECTION-005: a second, independent first-party signal --
// JSON-LD Organization/Corporation/LocalBusiness `sameAs` -- parsed from
// the SAME already-fetched HTML (no new request). A schema entity is only
// trusted when it can itself be tied back to the audited domain (its own
// `url`, or failing that `@id`); an Organization block with no traceable
// connection to the audited site is ignored, even if present on the page.

const FETCH_TIMEOUT_MS = 15_000;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;
const JSON_LD_SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const TRUSTED_ORG_TYPES = new Set(["Organization", "Corporation", "LocalBusiness"]);

export type ConnectionSource = "html" | "schema" | "html+schema" | null;

export interface WebsiteSocialLinksResult {
  ok: boolean;
  linksByPlatform: Record<SocialPlatform, string[]>;
  schemaLinksByPlatform: Record<SocialPlatform, string[]>;
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

// -- JSON-LD schema `sameAs` extraction -------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asEntityArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return [value];
  return [];
}

/** Every top-level entity in a parsed JSON-LD block, plus every entity
 * nested one level under `@graph` (a very common JSON-LD wrapping pattern). */
function flattenJsonLdBlock(block: unknown): Record<string, unknown>[] {
  const entities: Record<string, unknown>[] = [];
  for (const top of asEntityArray(block)) {
    entities.push(top);
    if (Array.isArray(top["@graph"])) {
      for (const g of top["@graph"] as unknown[]) {
        if (isRecord(g)) entities.push(g);
      }
    }
  }
  return entities;
}

/** Parses every `<script type="application/ld+json">` block in the HTML.
 * A malformed block is silently skipped -- this must never throw or fail
 * the caller. */
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  let match: RegExpExecArray | null;
  JSON_LD_SCRIPT_RE.lastIndex = 0;
  while ((match = JSON_LD_SCRIPT_RE.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // Malformed JSON-LD -- never fails Social Profiles, just skipped.
    }
  }
  return blocks;
}

function typeList(entity: Record<string, unknown>): string[] {
  const t = entity["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function isTrustedOrgEntity(entity: Record<string, unknown>): boolean {
  return typeList(entity).some((t) => TRUSTED_ORG_TYPES.has(t));
}

function hostWithoutWww(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Schema trust safeguard: an Organization/Corporation/LocalBusiness entity
 * is only treated as first-party for the audited site when its own `url`
 * resolves to the audited registered domain, or -- if `url` is absent --
 * its `@id` string is clearly tied to that domain. Precision-first: an
 * entity that cannot be traced back to the audited domain is ignored, even
 * if it's a valid Organization schema for some other business.
 */
function entityMatchesDomain(entity: Record<string, unknown>, registeredDomain: string): boolean {
  const domain = registeredDomain.trim().toLowerCase().replace(/^www\./, "");
  if (!domain) return false;

  const url = entity["url"];
  if (typeof url === "string") {
    const host = hostWithoutWww(url);
    if (host === domain) return true;
  }

  const id = entity["@id"];
  if (typeof id === "string" && id.toLowerCase().includes(domain)) return true;

  return false;
}

function sameAsList(entity: Record<string, unknown>): string[] {
  const sameAs = entity["sameAs"];
  if (typeof sameAs === "string") return [sameAs];
  if (Array.isArray(sameAs)) return sameAs.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Validated first-party `sameAs` links, grouped by platform. Only entities
 * that are both a trusted Organization-type AND traceable to the audited
 * domain contribute -- everything else on the page is ignored, no matter
 * how plausible it looks.
 */
export function extractSchemaSocialLinks(html: string, registeredDomain: string): Record<SocialPlatform, string[]> {
  const map = emptyLinksByPlatform();
  for (const block of extractJsonLdBlocks(html)) {
    for (const entity of flattenJsonLdBlock(block)) {
      if (!isTrustedOrgEntity(entity)) continue;
      if (!entityMatchesDomain(entity, registeredDomain)) continue;
      for (const url of sameAsList(entity)) {
        const platform = classifyUrlPlatform(url);
        if (platform && !map[platform].includes(url)) {
          map[platform].push(url);
        }
      }
    }
  }
  return map;
}

// -- Fetch + combined result -------------------------------------------------

export async function fetchWebsiteSocialLinks(
  websiteUrl: string,
  registeredDomain: string
): Promise<WebsiteSocialLinksResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "AI-Clinic-Audit/1.0 (+social profile connection check)" },
    });
    if (!response.ok) {
      return {
        ok: false,
        linksByPlatform: emptyLinksByPlatform(),
        schemaLinksByPlatform: emptyLinksByPlatform(),
        errorMessage: `Website fetch HTTP ${response.status}`,
      };
    }
    const html = await response.text();
    return {
      ok: true,
      linksByPlatform: extractSocialHrefs(html),
      schemaLinksByPlatform: extractSchemaSocialLinks(html, registeredDomain),
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      linksByPlatform: emptyLinksByPlatform(),
      schemaLinksByPlatform: emptyLinksByPlatform(),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Determines how (if at all) a discovered candidate profile URL is
 * confirmed by the audited website itself. A schema match only counts when
 * the schema URL is safely equivalent to the candidate after
 * platform-aware normalization (normalizeUrlForComparison) -- e.g. a
 * YouTube /channel/... URL never force-matches a /@handle URL, and two
 * different handles on the same platform never match each other. Prefers a
 * false negative over a false positive.
 *
 * SOCIAL-CONNECTION-010: for youtube specifically, a candidate/href pair
 * that isn't equal after normalizeUrlForComparison gets one more narrow
 * check -- youtubeUrlsShareSlugIdentity -- which only matches /c/<slug>
 * against /@<slug> (case-insensitive, exact slug). /channel/<id> URLs are
 * excluded there too, so this never widens the /channel/ vs /@ or /c/
 * false-positive guard above.
 */
function urlsMatchForPlatform(platform: SocialPlatform, urlA: string, urlB: string): boolean {
  if (normalizeUrlForComparison(urlA) === normalizeUrlForComparison(urlB)) return true;
  if (platform === "youtube") return youtubeUrlsShareSlugIdentity(urlA, urlB);
  return false;
}

export function resolveConnectionSource(
  result: Pick<WebsiteSocialLinksResult, "linksByPlatform" | "schemaLinksByPlatform">,
  platform: SocialPlatform,
  profileUrl: string
): ConnectionSource {
  const htmlMatch = result.linksByPlatform[platform].some((href) => urlsMatchForPlatform(platform, href, profileUrl));
  const schemaMatch = result.schemaLinksByPlatform[platform].some((href) => urlsMatchForPlatform(platform, href, profileUrl));

  if (htmlMatch && schemaMatch) return "html+schema";
  if (htmlMatch) return "html";
  if (schemaMatch) return "schema";
  return null;
}
