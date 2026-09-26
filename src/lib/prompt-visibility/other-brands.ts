import "server-only";

import { parseLlmProviderResponse, postDataForSeoWithRetry } from "../providers/dataforseo";
import { hasWholeWordMatch } from "./entity-validation";

// PROMPT-COMPETITORS-002: a second, fully independent derived-display layer.
// Runs ONLY after run-component.ts has already finalized mentionClass via
// the frozen VAL-003C-derived evaluateEntity()/classifyEntityMatch() path
// (entity-validation.ts / classifier.ts) -- this file never calls into or
// influences that decision. Same bounded DataForSEO Claude gateway pattern
// as classifier.ts (500-char system_message/user_prompt platform cap), but
// its own call, own contract, own failure handling. The model's returned
// brand list is never trusted alone -- every candidate must be verified to
// literally appear in the exact RESPONSE text that was sent, or it is
// dropped (see groundBrands below).

const SYSTEM_MESSAGE = (
  'You extract commercial brand/company names mentioned in an AI response. Return ONLY valid JSON: {"brands":[]}. ' +
  "List up to 5 clearly named commercial brands/companies actually present in RESPONSE, excluding the brand named " +
  "in EXCLUDE. Exclude duplicates, generic nouns, categories, locations, and anything uncertain. If none " +
  'confident, return {"brands":[]}. Never invent.'
).slice(0, 500);

const MAX_PROMPT_CHARS = 500;
// A pathologically long brandName must never be allowed to eat the whole
// 500-char user-prompt budget and leave no room for RESPONSE text --
// truncating EXCLUDE itself is safe: it only narrows the model's exclusion
// hint, and groundBrands() below independently re-excludes the real full
// brand name regardless of what was sent to the model.
const MAX_EXCLUDE_CHARS = 80;
// Keep a floor of response text in the prompt even if EXCLUDE consumes its
// full cap.
const MIN_RESPONSE_CHARS = 300;

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/, "")
    .replace(/```$/, "")
    .trim();
}

function parseBrandsJson(rawText: string): string[] | null {
  if (!rawText) return null;
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(rawText));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const brands = (data as Record<string, unknown>).brands;
  if (!Array.isArray(brands)) return null;
  if (!brands.every((b) => typeof b === "string")) return null;
  return brands as string[];
}

/**
 * Deterministic source-grounding pass: the model is never trusted as the
 * sole proof a brand was mentioned. Every candidate must literally appear
 * (case-insensitive, whole-word/phrase) in the exact response text that was
 * sent to the model, or it is dropped. Also re-applies target-brand
 * exclusion and dedupe independently of what the model claims to have
 * already excluded.
 */
export function groundBrands(candidates: string[], responseText: string, targetBrandName: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of candidates) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    if (hasWholeWordMatch(trimmed, targetBrandName) || hasWholeWordMatch(targetBrandName, trimmed)) continue;
    if (!hasWholeWordMatch(responseText, trimmed)) continue;

    seen.add(key);
    result.push(trimmed);
    if (result.length >= 5) break;
  }

  return result;
}

function buildUserPrompt(targetBrandName: string, responseText: string): string {
  const exclude = targetBrandName.trim().slice(0, MAX_EXCLUDE_CHARS);
  const prefix = `EXCLUDE:${exclude}\nRESPONSE:`;
  const budget = Math.max(MIN_RESPONSE_CHARS, MAX_PROMPT_CHARS - prefix.length);
  return `${prefix}${responseText.slice(0, budget)}`.slice(0, MAX_PROMPT_CHARS);
}

/**
 * Extracts up to 5 high-confidence "other brands mentioned" from a single
 * provider response, for display ONLY when the target brand's own
 * mentionClass has already been finalized as "Not Mentioned" elsewhere.
 * Never throws, never fails the caller -- any failure mode (provider
 * error, malformed JSON, empty/invalid list, zero grounded survivors)
 * resolves to [], never a guess or filler value.
 */
export async function extractOtherBrands(targetBrandName: string, responseText: string): Promise<string[]> {
  if (!responseText) return [];

  try {
    const userPrompt = buildUserPrompt(targetBrandName, responseText);
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
    if (!parsed.ok) return [];

    const candidates = parseBrandsJson(parsed.text);
    if (!candidates) return [];

    return groundBrands(candidates, responseText, targetBrandName);
  } catch {
    return [];
  }
}
