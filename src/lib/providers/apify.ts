import "server-only";

import { withRetry } from "../util/retry";
import { classifyUrlPlatform, type SocialPlatform } from "../social-profiles/platforms";

// COMP-003 primary discovery: Apify actor meU6XrAxXviSICIXQ
// (codescraper/website-social-links-scraper), run synchronously via
// run-sync-get-dataset-items. Input schema confirmed live against the
// actor's own build metadata (GET /v2/acts/{id}/builds/default): requires
// `startUrls` (array of plain URL/domain STRINGS, not {url} objects),
// `platforms` (array of its own enum values -- "twitter" not "x_twitter"),
// and `maxPagesPerDomain`. extractSocialCandidates still deep-scans the
// returned dataset for any string value that is itself a URL on one of the
// 8 platform domains rather than trusting specific output field names --
// the actor's OUTPUT shape (as opposed to its input schema) is still only
// confirmed by this scan succeeding at runtime, and staying tolerant here
// costs nothing.

const APIFY_BASE_URL = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PAGES_PER_DOMAIN = 5;

// Our 8 canonical platform keys -> the actor's own enum values. Only the
// X/Twitter name differs; the rest match 1:1.
const ACTOR_PLATFORM_NAMES: Record<SocialPlatform, string> = {
  linkedin: "linkedin",
  facebook: "facebook",
  instagram: "instagram",
  x_twitter: "twitter",
  youtube: "youtube",
  tiktok: "tiktok",
  threads: "threads",
  reddit: "reddit",
};

export class ApifyRequestError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "ApifyRequestError";
  }
}

function getApifyConfig(): { token: string; actorId: string } {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_SOCIAL_ACTOR_ID;
  if (!token || !actorId) {
    throw new Error("Missing APIFY_API_TOKEN / APIFY_SOCIAL_ACTOR_ID environment variables.");
  }
  return { token, actorId };
}

async function runActorSync(websiteUrl: string): Promise<unknown[]> {
  const { token, actorId } = getApifyConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${APIFY_BASE_URL}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [websiteUrl],
          platforms: Object.values(ACTOR_PLATFORM_NAMES),
          maxPagesPerDomain: MAX_PAGES_PER_DOMAIN,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const recoverable = response.status === 429 || response.status >= 500;
      const bodyText = await response.text().catch(() => "");
      throw new ApifyRequestError(
        `Apify HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
        recoverable,
        response.status
      );
    }

    const json = await response.json();
    return Array.isArray(json) ? json : [];
  } catch (error) {
    if (error instanceof ApifyRequestError) throw error;
    throw new ApifyRequestError(
      `Apify request failed: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface ApifyCandidate {
  platform: SocialPlatform;
  url: string;
  title: string | null;
}

const TITLE_FIELD_NAMES = ["title", "name", "companyName", "pageTitle", "profileName"];

function walkForCandidates(node: unknown, contextTitle: string | null, out: ApifyCandidate[]): void {
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node)) {
      const platform = classifyUrlPlatform(node);
      if (platform) out.push({ platform, url: node, title: contextTitle });
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkForCandidates(item, contextTitle, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const localTitle = TITLE_FIELD_NAMES.map((k) => obj[k]).find((v): v is string => typeof v === "string");
    const nextTitle = localTitle ?? contextTitle;
    for (const value of Object.values(obj)) walkForCandidates(value, nextTitle, out);
  }
}

export function extractSocialCandidates(datasetItems: unknown[]): ApifyCandidate[] {
  const candidates: ApifyCandidate[] = [];
  for (const item of datasetItems) walkForCandidates(item, null, candidates);
  return candidates;
}

export interface ApifySocialDiscoveryResult {
  ok: boolean;
  candidates: ApifyCandidate[];
  attempts: number;
  errorMessage: string | null;
}

/**
 * One actor run covers all 8 platforms for the audited website -- never
 * call this per-platform (cost control).
 */
export async function runSocialDiscoveryActor(websiteUrl: string): Promise<ApifySocialDiscoveryResult> {
  try {
    const result = await withRetry(() => runActorSync(websiteUrl), {
      isRecoverable: (error) => error instanceof ApifyRequestError && error.recoverable,
    });
    return { ok: true, candidates: extractSocialCandidates(result.value), attempts: result.attempts, errorMessage: null };
  } catch (error) {
    return {
      ok: false,
      candidates: [],
      attempts: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
