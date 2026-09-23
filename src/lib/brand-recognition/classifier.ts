import "server-only";

import { parseLlmProviderResponse, postDataForSeoWithRetry } from "../providers/dataforseo";
import type { ReferenceProfile } from "./reference-profile";

// Single, tightly-scoped structured-JSON judge call -- not a multi-agent
// pipeline. Routed through the same DataForSEO Claude LLM Responses
// endpoint used for the raw provider calls, which caps BOTH system_message
// and user_prompt at 500 characters each (a real, documented platform
// limit -- see dataforseo-test/ENTITY_VALIDATION_NOTES.md "Known
// limitations"). That hard budget is why the answer text is front-truncated
// rather than run through any fancier windowing.

export const BRAND_RECOGNITION_STATUSES = [
  "Accurate",
  "Partially Accurate",
  "Inaccurate",
  "Not Recognized",
] as const;

export type BrandRecognitionClassifierStatus = (typeof BRAND_RECOGNITION_STATUSES)[number];

export interface ClassifierResult {
  status: BrandRecognitionClassifierStatus;
  evidence: string;
}

const CLASSIFIER_SYSTEM_MESSAGE = (
  "You are a brand-recognition judge. Compare ANSWER to REFERENCE (the real company). " +
  'Return ONLY JSON: {"status":"","evidence":""}. status must be exactly one of: ' +
  "Accurate, Partially Accurate, Inaccurate, Not Recognized. Accurate=correct company, " +
  "description matches. Partially Accurate=right company, incomplete or mixed. " +
  "Inaccurate=wrong facts about the company. Not Recognized=does not identify the company. " +
  "Never invent facts."
).slice(0, 500);

function compactProfile(profile: ReferenceProfile) {
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

export function parseClassifierJson(rawText: string): ClassifierResult | null {
  if (!rawText) return null;
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(rawText));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  const status = (data as Record<string, unknown>).status;
  const evidence = (data as Record<string, unknown>).evidence;
  if (
    typeof status !== "string" ||
    !(BRAND_RECOGNITION_STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }
  return {
    status: status as BrandRecognitionClassifierStatus,
    evidence: typeof evidence === "string" ? evidence : "",
  };
}

/**
 * Returns null (never a guessed status) when the judge call fails or
 * returns unparseable output -- callers must treat null as "accuracy
 * unavailable," matching "insufficient evidence never auto-becomes
 * Accurate" (Build Spec section 14).
 */
export async function classifyBrandRecognitionAnswer(
  profile: ReferenceProfile,
  answerText: string
): Promise<ClassifierResult | null> {
  const profileJson = JSON.stringify(compactProfile(profile));
  const prefix = `REFERENCE:${profileJson}\nANSWER:`;
  const budget = Math.max(0, 500 - prefix.length);
  const snippet = answerText.slice(0, budget);
  const userPrompt = `${prefix}${snippet}`.slice(0, 500);

  try {
    const { json } = await postDataForSeoWithRetry("ai_optimization/claude/llm_responses/live", [
      {
        user_prompt: userPrompt,
        model_name: "claude-haiku-4-5",
        system_message: CLASSIFIER_SYSTEM_MESSAGE,
        web_search: false,
        temperature: 0,
        max_output_tokens: 600,
      },
    ]);

    const parsed = parseLlmProviderResponse(json);
    if (!parsed.ok) return null;
    return parseClassifierJson(parsed.text);
  } catch {
    return null;
  }
}
