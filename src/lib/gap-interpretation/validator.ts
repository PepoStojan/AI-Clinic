// AI-001: deterministic validation of Claude's interpretation output.
// Practical, rule-based checks only -- no second LLM judge (per task
// instructions: "prefer deterministic validation," "do not build another
// LLM judge unless absolutely required").

import { INTERPRETATION_FIELDS, type InterpretationOutput } from "./types";

// Every entity name this project's components ever track, across all 5
// components. Used to reject a claim about a provider/platform/crawler
// that isn't actually among THIS gap's affected checks -- e.g. Claude
// mentioning "TikTok" for a Facebook-only social gap.
const MASTER_ENTITY_NAMES = [
  // Brand Recognition / Prompt Visibility providers
  "openai", "chatgpt", "gemini", "claude", "google", "google ai", "google_ai",
  // Social platforms
  "linkedin", "facebook", "instagram", "x/twitter", "x_twitter", "twitter", "youtube", "tiktok", "threads", "reddit",
  // Directories
  "g2", "capterra", "trustpilot", "clutch",
  "google business profile", "google_business_profile",
  "bestcompany", "getapp",
  "software advice", "software_advice",
  "gartner peer insights", "gartner_peer_insights",
  "product hunt", "product_hunt",
  // Crawlers
  "googlebot", "bingbot", "gptbot", "oai-searchbot", "oai_searchbot", "claudebot", "perplexitybot",
];


// Language that must never appear regardless of context -- unsupported
// causal claims, severity/priority/score framing, and the exact banned
// phrases the task spec calls out.
const BANNED_PHRASES = [
  "you must",
  "this is critical",
  "this is damaging your rankings",
  "google penalizes",
  "google penalize",
  "ai systems prefer",
  "ranking loss",
  "traffic loss",
  "market share loss",
  "competitor advantage",
  "penalize",
  "penalizes",
  "severity",
  "priority",
  "score",
  "critical",
  "urgent",
  "high risk",
  "must fix",
  "not applicable",
  // Social/Directories component-specific overclaims (spec section
  // "Component-Specific Guardrails")
  "ranking factor",
  "does not exist",
  "every company must",
  "should be on every",
];

// Terms whose presence would frame unavailable evidence as a confirmed
// finding -- never legitimate in an interpretation of an already-
// CONFIRMED gap (CORE-002 guarantees no N/A/Could-Not-Verify row is ever
// part of a gap's evidence in the first place).
const UNAVAILABLE_EVIDENCE_PHRASES = ["n/a", "could not verify", "cannot verify", "no result"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeWord(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
}

export interface ValidationResult {
  ok: boolean;
  reason: string | null;
}

export interface ValidationContext {
  componentName: string;
  /** The gap's own affected entity names (lowercased), e.g. ["facebook"]. */
  affectedNames: string[];
  /** The gap's own title + deterministic_reason -- the only place a
   * legitimate "total" count (e.g. "1 of 3 AI systems") can come from,
   * since that total isn't reliably fixed per component (a real audit
   * can have fewer providers/prompts/etc. checked than the nominal
   * maximum). Any number actually present in this source text is
   * evidence-bound; any other number is not. */
  sourceText: string;
}

function parseStrictJson(rawText: string): unknown | null {
  const trimmed = rawText.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Full validation pipeline. Returns { ok: true } only when the output is
 * safe to persist as-is. Any failure reason is for logging only -- the
 * caller always falls back to the deterministic facts-only interpretation
 * on failure, never a partial/guessed result.
 */
export function validateInterpretation(rawText: string, context: ValidationContext): ValidationResult {
  const parsed = parseStrictJson(rawText);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "Response was not valid JSON." };
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);

  // 2. Exactly the required fields -- no extra, none missing.
  if (keys.length !== INTERPRETATION_FIELDS.length || !INTERPRETATION_FIELDS.every((f) => keys.includes(f))) {
    return { ok: false, reason: "Response did not contain exactly the 3 required fields." };
  }

  for (const field of INTERPRETATION_FIELDS) {
    if (typeof record[field] !== "string") {
      return { ok: false, reason: `Field ${field} was not a string.` };
    }
  }

  const output = record as unknown as InterpretationOutput;

  // 3. No empty required fields.
  for (const field of INTERPRETATION_FIELDS) {
    if (output[field].trim().length === 0) {
      return { ok: false, reason: `Field ${field} was empty.` };
    }
  }

  const combined = `${output.what_we_observed} ${output.what_this_suggests} ${output.what_to_consider}`;
  const loweredCombined = combined.toLowerCase();

  // 9. No two fields near-duplicated.
  const values = INTERPRETATION_FIELDS.map((f) => output[f].trim().toLowerCase());
  if (values[0] === values[1] || values[0] === values[2] || values[1] === values[2]) {
    return { ok: false, reason: "Two or more fields were duplicated." };
  }

  // 7. No unavailable-evidence framed as a confirmed finding.
  for (const phrase of UNAVAILABLE_EVIDENCE_PHRASES) {
    if (loweredCombined.includes(phrase)) {
      return { ok: false, reason: `Output referenced unavailable evidence ("${phrase}").` };
    }
  }

  // 8/10. Banned causal / severity / priority / score language.
  for (const phrase of BANNED_PHRASES) {
    if (loweredCombined.includes(phrase)) {
      return { ok: false, reason: `Output used banned language ("${phrase}").` };
    }
  }

  // 5. No unsupported provider/platform/crawler name.
  const allowed = new Set(context.affectedNames.map((n) => n.toLowerCase()));
  for (const term of MASTER_ENTITY_NAMES) {
    if (allowed.has(term)) continue;
    // An allowed name may itself be a substring match of a longer master
    // term's synonym (e.g. allowed "x_twitter" vs master "twitter") --
    // skip any master term that any allowed name already covers.
    if ([...allowed].some((a) => a.includes(term) || term.includes(a))) continue;
    if (containsWholeWord(combined, term)) {
      return { ok: false, reason: `Output mentioned an entity not among this gap's affected checks ("${term}").` };
    }
  }

  // 6. No unsupported numeric count -- a number is supported when it
  // matches the affected count, or when it literally appears in the
  // gap's own source text (title + deterministic_reason), which is the
  // only place a "total" figure can legitimately come from.
  const affectedCount = context.affectedNames.length;
  const sourceNumbers = new Set((context.sourceText.match(/\b\d+\b/g) ?? []).map(Number));
  const numberMatches = combined.match(/\b\d+\b/g) ?? [];
  for (const match of numberMatches) {
    const n = Number(match);
    if (n === affectedCount) continue;
    if (sourceNumbers.has(n)) continue;
    return { ok: false, reason: `Output stated an unsupported number ("${match}").` };
  }

  return { ok: true, reason: null };
}
