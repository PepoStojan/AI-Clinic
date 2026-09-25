import "server-only";

import { withRetry } from "../util/retry";

// COMP-005: minimal, deterministic fetch for exactly two well-known paths
// (/robots.txt, /llms.txt) on the audited domain. No crawling, no other
// pages. Timeout + a response-size cap are the only safety measures --
// deliberately not a general SSRF framework, per task scope.

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_LENGTH = 200_000; // generous for a text file; just a safety cap

export type FileFetchOutcome = "found" | "not_found" | "cannot_verify";

export interface FileFetchResult {
  outcome: FileFetchOutcome;
  httpStatus: number | null;
  body: string | null;
  errorMessage: string | null;
}

class RecoverableFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoverableFetchError";
  }
}

async function fetchOnce(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AI-Clinic-Audit/1.0 (+technical accessibility check)" },
    });
    // 429/5xx are transient-ish -- worth one retry. Anything else (2xx,
    // 404, 403, other 4xx) is a defined, final outcome handled by the
    // caller, not retried.
    if (response.status === 429 || response.status >= 500) {
      throw new RecoverableFetchError(`HTTP ${response.status}`);
    }
    return response;
  } catch (error) {
    if (error instanceof RecoverableFetchError) throw error;
    // Network error, DNS failure, or abort/timeout -- recoverable.
    throw new RecoverableFetchError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextFile(url: string): Promise<FileFetchResult> {
  let response: Response;
  try {
    const result = await withRetry(() => fetchOnce(url), {
      isRecoverable: (error) => error instanceof RecoverableFetchError,
    });
    response = result.value;
  } catch (error) {
    return {
      outcome: "cannot_verify",
      httpStatus: null,
      body: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  if (response.status === 404) {
    return { outcome: "not_found", httpStatus: 404, body: null, errorMessage: null };
  }

  if (!response.ok) {
    return {
      outcome: "cannot_verify",
      httpStatus: response.status,
      body: null,
      errorMessage: `HTTP ${response.status}`,
    };
  }

  try {
    const text = await response.text();
    return { outcome: "found", httpStatus: response.status, body: text.slice(0, MAX_BODY_LENGTH), errorMessage: null };
  } catch (error) {
    // Malformed/unreadable body -- a 200 we couldn't actually read.
    return {
      outcome: "cannot_verify",
      httpStatus: response.status,
      body: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
