import "server-only";

import { withRetry } from "../util/retry";
import { classifyUrlPlatform, type SocialPlatform } from "../social-profiles/platforms";

// COMP-003 primary discovery: Apify actor meU6XrAxXviSICIXQ, run
// synchronously via run-sync-get-dataset-items. The actor has been manually
// validated by the user but its exact output field names are undocumented
// in this repo and no live credentials were available in this environment
// to verify them (see COMP-003 completion report -- manual action needed).
// extractSocialCandidates therefore deep-scans the returned dataset for any
// string value that is itself a URL on one of the 8 platform domains,
// rather than trusting specific field names -- tolerant of whatever shape
// the actor actually returns, and avoids silently dropping platforms if a
// field is named differently than expected.

const APIFY_BASE_URL = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 60_000;

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
        body: JSON.stringify({ startUrls: [{ url: websiteUrl }] }),
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
