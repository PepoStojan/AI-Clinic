import "server-only";

import { parseLlmProviderResponse, postDataForSeoWithRetry } from "../providers/dataforseo";
import type { EntityProfile, SemanticCompareResult } from "./entity-validation";

// COMP-002 semantic judge: same bounded single-call design as
// brand-recognition/classifier.ts, ported from dataforseo-test's
// build_semantic_messages/claude_semantic_compare (VAL-002/VAL-003C). The
// DataForSEO Claude LLM Responses endpoint caps system_message AND
// user_prompt at 500 characters each -- a real platform limit, not a
// design choice -- so both are built to fit that budget.

const SYSTEM_MESSAGE = (
  "You are an entity-matching judge. RESPONSE already contains the brand " +
  "name -- your job is only to judge whether it's the SAME company/product " +
  "as REFERENCE_PROFILE. Return ONLY valid JSON: " +
  '{"entity_status":"","matched_signals":[],"conflicting_signals":[],"confidence":0,"reason":""}. ' +
  "entity_status must be one of: Probable Entity Match, Ambiguous Entity, " +
  "Wrong Entity. Judge only from the given text. Never invent facts."
).slice(0, 500);

function compactProfile(profile: EntityProfile) {
  return {
    brand: profile.brandName,
    domain: profile.registeredDomain,
    product: profile.productName ?? undefined,
  };
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/, "")
    .replace(/```$/, "")
    .trim();
}

export function parseSemanticJson(rawText: string): SemanticCompareResult | null {
  if (!rawText) return null;
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(rawText));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;
  return {
    entity_status: typeof record.entity_status === "string" ? record.entity_status : null,
    matched_signals: Array.isArray(record.matched_signals) ? (record.matched_signals as string[]) : [],
    conflicting_signals: Array.isArray(record.conflicting_signals)
      ? (record.conflicting_signals as string[])
      : [],
    confidence: typeof record.confidence === "number" ? record.confidence : null,
    reason: typeof record.reason === "string" ? record.reason : "",
  };
}

/**
 * Returns null (never a guessed status) when the judge call fails or
 * returns unparseable output -- callers (evaluateEntity) must treat null
 * as "semantic comparison unavailable" and default to Ambiguous Entity,
 * never a confirmed status of any kind.
 */
export async function classifyEntityMatch(
  profile: EntityProfile,
  snippet: string
): Promise<SemanticCompareResult | null> {
  const profileJson = JSON.stringify(compactProfile(profile));
  const prefix = `REFERENCE_PROFILE:${profileJson}\nRESPONSE:`;
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
