import "server-only";

import { parseLlmProviderResponse, postDataForSeoWithRetry } from "../providers/dataforseo";

// COMP-004: bounded Claude semantic judge, used ONLY when deterministic
// identity validation (identity-validation.ts) leaves a candidate
// "Unverified" after both DataForSEO primary and Claude-live-search
// fallback discovery -- per spec section 17, "Claude semantic verification
// only if deterministic evidence remains Unverified." Same single-call,
// structured-JSON, 500-char-budget design as brand-recognition/classifier.ts
// and prompt-visibility/classifier.ts -- not a new pattern.

export type SemanticVerdict = "Confirmed" | "Wrong" | "Ambiguous";
const ALLOWED_VERDICTS = new Set<SemanticVerdict>(["Confirmed", "Wrong", "Ambiguous"]);

export interface SemanticClassifierResult {
  verdict: SemanticVerdict;
  reason: string;
}

const SYSTEM_MESSAGE = (
  "You are a directory-listing identity judge. TEXT is a search result title/snippet " +
  "that mentions a brand name -- decide whether it is genuinely the SAME company as " +
  'REFERENCE. Return ONLY JSON: {"verdict":"","reason":""}. verdict must be exactly one ' +
  "of: Confirmed, Wrong, Ambiguous. Confirmed=clearly the same company. Wrong=clearly a " +
  "different company/unrelated. Ambiguous=cannot tell. Never invent facts."
).slice(0, 500);

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
}

export function parseSemanticJson(rawText: string): SemanticClassifierResult | null {
  if (!rawText) return null;
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(rawText));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const verdict = record.verdict;
  if (typeof verdict !== "string" || !ALLOWED_VERDICTS.has(verdict as SemanticVerdict)) return null;
  return { verdict: verdict as SemanticVerdict, reason: typeof record.reason === "string" ? record.reason : "" };
}

/**
 * Returns null (never a guessed verdict) when the judge call fails or
 * returns unparseable output -- callers must treat null as "still
 * Unverified," never as a resolved Confirmed/Wrong.
 */
export async function classifyListingMatch(
  brandName: string,
  registeredDomain: string,
  snippet: string
): Promise<SemanticClassifierResult | null> {
  const prefix = `REFERENCE:{"brand":"${brandName}","domain":"${registeredDomain}"}\nTEXT:`;
  const budget = Math.max(0, 500 - prefix.length);
  const userPrompt = `${prefix}${snippet.slice(0, budget)}`.slice(0, 500);

  try {
    const { json } = await postDataForSeoWithRetry("ai_optimization/claude/llm_responses/live", [
      {
        user_prompt: userPrompt,
        model_name: "claude-haiku-4-5",
        system_message: SYSTEM_MESSAGE,
        web_search: false,
        temperature: 0,
        max_output_tokens: 600,
      },
    ]);

    const parsed = parseLlmProviderResponse(json);
    if (!parsed.ok) return null;
    return parseSemanticJson(parsed.text);
  } catch {
    return null;
  }
}
