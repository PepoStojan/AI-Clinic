import "server-only";

import { parseLlmProviderResponse, postDataForSeoWithRetry } from "../providers/dataforseo";
import type { GapInterpretationPayload } from "./types";

// AI-001: one bounded Claude call per grouped gap, via the existing
// DataForSEO Claude gateway (same endpoint/pattern as every other
// classifier in this project -- no new native Anthropic SDK). That
// endpoint caps BOTH system_message and user_prompt at 500 characters
// each (a real, previously-verified platform limit -- see
// prompt-visibility/classifier.ts) -- the JSON-contract instruction is
// placed first in the system message so truncation, if it ever happens,
// never cuts off the part that matters most.

const SYSTEM_MESSAGE = (
  'Output ONLY JSON: {"what_we_observed":"","what_this_suggests":"","what_to_consider":""}. ' +
  "All 3 required, no extra fields, no markdown, no severity/priority/score. Interpret ONLY the " +
  "given facts -- never invent causes, counts, or names. Tone: factual, diplomatic, non-alarmist. " +
  "Never claim ranking/traffic loss or that every platform is required."
).slice(0, 500);

function buildUserPrompt(payload: GapInterpretationPayload): string {
  const prefix =
    `Brand:${payload.brandName}|Component:${payload.componentName}|Gap:${payload.gapType}|` +
    `Title:${payload.title}|Reason:${payload.deterministicReason}|Affected:`;
  const affected = payload.affectedNames.join(",");
  return `${prefix}${affected}`.slice(0, 500);
}

/**
 * Returns the raw response text (unvalidated) on success, or null when
 * the provider call itself failed -- callers run validateInterpretation
 * on the returned text and treat both null and a failed validation the
 * same way: fall back, never guess.
 */
export async function callClaudeForInterpretation(payload: GapInterpretationPayload): Promise<string | null> {
  try {
    const { json } = await postDataForSeoWithRetry("ai_optimization/claude/llm_responses/live", [
      {
        user_prompt: buildUserPrompt(payload),
        model_name: "claude-haiku-4-5",
        system_message: SYSTEM_MESSAGE,
        web_search: false,
        temperature: 0,
        max_output_tokens: 800,
      },
    ]);

    const parsed = parseLlmProviderResponse(json);
    if (!parsed.ok) return null;
    return parsed.text;
  } catch {
    return null;
  }
}
