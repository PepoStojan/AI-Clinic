import "server-only";

import { withRetry } from "../util/retry";

// Single adapter for DataForSEO's ai_optimization (ChatGPT/Gemini/Claude
// LLM Responses) and serp/google/ai_mode products. Per the locked MVP
// decision for COMP-001, all 4 Brand Recognition providers go through this
// one gateway -- no direct OpenAI/Google/Anthropic SDKs. Endpoint shapes,
// retry/backoff behavior, and response parsing are ported from the
// validated dataforseo-test/ script (VAL-001 through VAL-003C).

const BASE_URL = "https://api.dataforseo.com/v3";
const REQUEST_TIMEOUT_MS = 130_000; // Live LLM/SERP endpoints can take up to ~120s

export class DataForSeoRequestError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "DataForSeoRequestError";
  }
}

function getAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("Missing DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD environment variables.");
  }
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function postDataForSeo(path: string, payload: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/${path}`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const recoverable = response.status === 429 || response.status >= 500;
      const bodyText = await response.text().catch(() => "");
      throw new DataForSeoRequestError(
        `DataForSEO HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
        recoverable,
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DataForSeoRequestError) {
      throw error;
    }
    // Network error, abort/timeout, or JSON parse failure -- recoverable.
    throw new DataForSeoRequestError(
      `DataForSEO request failed: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function postDataForSeoWithRetry(
  path: string,
  payload: unknown[]
): Promise<{ json: unknown; attempts: number }> {
  const result = await withRetry(() => postDataForSeo(path, payload), {
    isRecoverable: (error) => error instanceof DataForSeoRequestError && error.recoverable,
  });
  return { json: result.value, attempts: result.attempts };
}

export interface Citation {
  title: string | null;
  url: string;
  domain: string;
}

export interface ParsedProviderResponse {
  ok: boolean;
  text: string;
  citations: Citation[];
  cost: number | null;
  noResultReason: string | null;
}

function urlDomain(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

export function parseLlmProviderResponse(json: unknown): ParsedProviderResponse {
  const body = (json ?? {}) as JsonRecord;
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length === 0) {
    return { ok: false, text: "", citations: [], cost: null, noResultReason: "No tasks in response" };
  }

  const task = tasks[0] as JsonRecord;
  const cost = typeof task.cost === "number" ? task.cost : typeof body.cost === "number" ? body.cost : null;

  if (task.status_code !== 20000) {
    return {
      ok: false,
      text: "",
      citations: [],
      cost,
      noResultReason: `task status ${task.status_code}: ${task.status_message ?? ""}`,
    };
  }

  const results = Array.isArray(task.result) ? task.result : [];
  if (results.length === 0) {
    return { ok: false, text: "", citations: [], cost, noResultReason: "Empty result array" };
  }

  const textParts: string[] = [];
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();

  for (const item of (results[0]?.items ?? []) as JsonRecord[]) {
    if (item.type !== "message") continue;
    for (const section of (item.sections ?? []) as JsonRecord[]) {
      if (section.type === "text" && typeof section.text === "string") {
        textParts.push(section.text);
      }
      for (const annotation of (section.annotations ?? []) as JsonRecord[]) {
        const url = annotation.direct_url || annotation.url;
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ title: annotation.title ?? null, url, domain: urlDomain(url) });
        }
      }
    }
  }

  const text = textParts.filter(Boolean).join("\n");
  if (!text && citations.length === 0) {
    return {
      ok: false,
      text: "",
      citations: [],
      cost,
      noResultReason: "Provider returned no text and no citations (possible refusal)",
    };
  }

  return { ok: true, text, citations, cost, noResultReason: null };
}

export function parseGoogleAiModeResponse(json: unknown): ParsedProviderResponse {
  const body = (json ?? {}) as JsonRecord;
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length === 0) {
    return { ok: false, text: "", citations: [], cost: null, noResultReason: "No tasks in response" };
  }

  const task = tasks[0] as JsonRecord;
  const cost = typeof task.cost === "number" ? task.cost : typeof body.cost === "number" ? body.cost : null;

  if (task.status_code !== 20000) {
    return {
      ok: false,
      text: "",
      citations: [],
      cost,
      noResultReason: `task status ${task.status_code}: ${task.status_message ?? ""}`,
    };
  }

  const results = Array.isArray(task.result) ? task.result : [];
  if (!results[0]) {
    return { ok: false, text: "", citations: [], cost, noResultReason: "No AI Mode result returned" };
  }

  const items = (results[0].items ?? []) as JsonRecord[];
  const aiOverviewItem = items.find((item) => item.type === "ai_overview");
  if (!aiOverviewItem) {
    return {
      ok: false,
      text: "",
      citations: [],
      cost,
      noResultReason: "No AI Overview/AI Mode content triggered for this prompt",
    };
  }

  let text: string = aiOverviewItem.markdown ?? "";
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();

  const addRef = (ref: JsonRecord | undefined) => {
    const url = ref?.url;
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      citations.push({ title: ref.title ?? ref.source ?? null, url, domain: ref.domain ?? urlDomain(url) });
    }
  };

  for (const ref of (aiOverviewItem.references ?? []) as JsonRecord[]) addRef(ref);
  for (const nested of (aiOverviewItem.items ?? []) as JsonRecord[]) {
    for (const ref of (nested.references ?? []) as JsonRecord[]) addRef(ref);
    for (const link of (nested.links ?? []) as JsonRecord[]) addRef(link);
    if (!text && nested.text) text += nested.text;
  }

  if (!text && citations.length === 0) {
    return {
      ok: false,
      text: "",
      citations: [],
      cost,
      noResultReason: "AI Overview item present but empty",
    };
  }

  return { ok: true, text, citations, cost, noResultReason: null };
}

export type LlmProviderKey = "chat_gpt" | "gemini" | "claude";

// Kept identical to the validated dataforseo-test/config.py model choices.
const MODEL_NAMES: Record<LlmProviderKey, string> = {
  chat_gpt: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  claude: "claude-haiku-4-5",
};

export interface ProviderCallResult {
  parsed: ParsedProviderResponse;
  attempts: number;
  raw: unknown;
}

export async function callLlmProvider(
  providerKey: LlmProviderKey,
  prompt: string
): Promise<ProviderCallResult> {
  const { json, attempts } = await postDataForSeoWithRetry(
    `ai_optimization/${providerKey}/llm_responses/live`,
    [
      {
        user_prompt: prompt,
        model_name: MODEL_NAMES[providerKey],
        web_search: true,
        max_output_tokens: 1500,
      },
    ]
  );
  return { parsed: parseLlmProviderResponse(json), attempts, raw: json };
}

const AI_MODE_LOCATION_CODE = 2840; // United States (see dataforseo-test/VALIDATION_NOTES.md)
const AI_MODE_LANGUAGE_CODE = "en";

export async function callGoogleAiMode(prompt: string): Promise<ProviderCallResult> {
  const { json, attempts } = await postDataForSeoWithRetry("serp/google/ai_mode/live/advanced", [
    {
      keyword: prompt.slice(0, 700),
      location_code: AI_MODE_LOCATION_CODE,
      language_code: AI_MODE_LANGUAGE_CODE,
    },
  ]);
  return { parsed: parseGoogleAiModeResponse(json), attempts, raw: json };
}

// COMP-003 DataForSEO fallback: plain Google organic SERP, used only when
// Apify misses a platform. One thin endpoint wrapper on the existing
// gateway -- not a new search-engine abstraction.

export interface OrganicResult {
  title: string | null;
  url: string;
  domain: string;
  snippet: string | null;
}

export interface OrganicSearchResult {
  ok: boolean;
  results: OrganicResult[];
  attempts: number;
  errorMessage: string | null;
}

export function parseGoogleOrganicResponse(json: unknown): { ok: boolean; results: OrganicResult[]; noResultReason: string | null } {
  const body = (json ?? {}) as JsonRecord;
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length === 0) {
    return { ok: false, results: [], noResultReason: "No tasks in response" };
  }

  const task = tasks[0] as JsonRecord;
  if (task.status_code !== 20000) {
    return { ok: false, results: [], noResultReason: `task status ${task.status_code}: ${task.status_message ?? ""}` };
  }

  const results = Array.isArray(task.result) ? task.result : [];
  const items = (results[0]?.items ?? []) as JsonRecord[];

  const organic: OrganicResult[] = items
    .filter((item) => item.type === "organic" && typeof item.url === "string")
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : null,
      url: item.url as string,
      domain: typeof item.domain === "string" ? item.domain : urlDomain(item.url as string),
      snippet: typeof item.description === "string" ? item.description : null,
    }));

  return { ok: true, results: organic, noResultReason: null };
}

export async function searchGoogleOrganic(query: string): Promise<OrganicSearchResult> {
  try {
    const { json, attempts } = await postDataForSeoWithRetry("serp/google/organic/live/advanced", [
      {
        keyword: query.slice(0, 700),
        location_code: AI_MODE_LOCATION_CODE,
        language_code: AI_MODE_LANGUAGE_CODE,
        depth: 10,
      },
    ]);
    const parsed = parseGoogleOrganicResponse(json);
    return { ok: parsed.ok, results: parsed.results, attempts, errorMessage: parsed.noResultReason };
  } catch (error) {
    return {
      ok: false,
      results: [],
      attempts: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
