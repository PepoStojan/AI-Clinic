// COMP-002: entity validation layer, ported from the validated VAL-002 /
// VAL-003C algorithm in dataforseo-test/entity_validation.py. Same shape --
// deterministic domain-citation override, multi-occurrence candidate
// windows scored by decisiveness, a bounded Claude semantic judge only when
// deterministic scoring can't resolve identity, and title-only cross-record
// corroboration as secondary metadata that can never upgrade a status.
//
// One deliberate generalization from the validated script (approved --
// "generalization away from SmartClick-specific keyword fixtures"): VAL-003C's
// positive/negative keyword tables ("seo agency", "north macedonia", ...)
// came from a category/services/market/location profile that only existed
// in dataforseo-test/config.py as test fixtures for the SmartClick
// validation brand -- the real audits/audit_targets schema only carries
// brandName, registeredDomain, and an optional productName. The signal
// table below is reduced to what's actually available: audited domain
// text, product name text, a conflicting-domain regex parameterized on the
// real registered domain, and generic (non-brand-specific) multi-entity
// phrasing. The scoring/windowing/decisiveness algorithm itself is
// unchanged.

export const ENTITY_STATUSES = [
  "Confirmed Entity Match",
  "Probable Entity Match",
  "Ambiguous Entity",
  "Wrong Entity",
  "No Entity Signal",
] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

// Claude's semantic judge may never grant "Confirmed Entity Match" (deterministic-only)
// and is never called when there's no brand mention at all, so "No Entity Signal" is
// excluded too -- see build spec / ENTITY_VALIDATION_NOTES.md "known limitations".
const CLAUDE_ALLOWED_STATUSES = new Set<EntityStatus>([
  "Probable Entity Match",
  "Ambiguous Entity",
  "Wrong Entity",
]);

export interface EntityProfile {
  brandName: string;
  registeredDomain: string;
  productName: string | null;
}

export interface SemanticCompareResult {
  entity_status: string | null | undefined;
  matched_signals?: string[];
  conflicting_signals?: string[];
  confidence?: number | null;
  reason?: string;
}

export interface CandidateWindow {
  window: string;
  score: number;
  matchedSignals: string[];
  conflictingSignals: string[];
}

export interface CandidateSelection {
  occurrenceCount: number;
  candidates: CandidateWindow[];
  selected: CandidateWindow | null;
  ambiguousByScoring: boolean;
  selectionReason: string;
}

export interface EntityEvaluation {
  entityStatus: EntityStatus;
  matchedSignals: string[];
  conflictingSignals: string[];
  confidence: number | null;
  reason: string;
  usedClaudeSemantic: boolean;
  snippetSelection?: CandidateSelection;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every case-insensitive whole-word occurrence of `name` in `text`. */
export function findAllOccurrences(text: string, name: string): number[] {
  if (!text || !name) return [];
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name.trim())}(?![A-Za-z0-9])`, "gi");
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    indices.push(match.index);
    if (match[0].length === 0) pattern.lastIndex++; // guard against zero-width match loops
  }
  return indices;
}

export function hasWholeWordMatch(text: string, name: string): boolean {
  return findAllOccurrences(text, name).length > 0;
}

/** Loose/partial match: name appears as a substring but not as a whole word. */
export function hasLooseMatch(text: string, name: string): boolean {
  if (!text || !name) return false;
  return text.toLowerCase().includes(name.trim().toLowerCase()) && !hasWholeWordMatch(text, name);
}

function domainFromRegisteredDomain(registeredDomain: string): string {
  return registeredDomain.trim().toLowerCase().replace(/^www\./, "");
}

/** Reduced, generic multi-entity phrasing -- not brand-specific keyword fixtures. */
function multiEntityPhrases(brandName: string): string[] {
  return [
    "different companies",
    "distinct companies",
    "different entities",
    "distinct entities",
    "refers to several",
    "refers to different",
    "refers to a few different",
    "several different",
    `which ${brandName.toLowerCase()}`,
  ];
}

interface RawWindow {
  start: number;
  end: number;
  text: string;
}

function buildCandidateWindows(responseText: string, profile: EntityProfile, budget: number): RawWindow[] {
  const text = (responseText ?? "").trim();
  if (!text || budget <= 0) return [];

  const names = [profile.brandName, profile.productName].filter((n): n is string => Boolean(n));
  const occurrences = new Set<number>();
  for (const name of names) {
    for (const idx of findAllOccurrences(text, name)) occurrences.add(idx);
  }
  const sorted = Array.from(occurrences).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const rawWindows = sorted.map((idx) => {
    const provisionalStart = Math.max(0, idx - Math.floor(budget / 3));
    const end = Math.min(text.length, provisionalStart + budget);
    const start = Math.max(0, end - budget);
    return { start, end };
  });

  const merged: { start: number; end: number }[] = [];
  for (const w of rawWindows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }

  return merged.map((m) => ({ start: m.start, end: m.end, text: text.slice(m.start, m.end) }));
}

function scoreCandidateWindow(
  windowText: string,
  profile: EntityProfile
): { score: number; matched: string[]; conflicting: string[] } {
  const lowered = windowText.toLowerCase();
  let score = 0;
  const matched: string[] = [];
  const conflicting: string[] = [];

  const domainText = domainFromRegisteredDomain(profile.registeredDomain);
  if (domainText && lowered.includes(domainText)) {
    score += 5;
    matched.push("audited domain text");
  }
  if (profile.productName && lowered.includes(profile.productName.toLowerCase())) {
    score += 2;
    matched.push("product name mentioned");
  }

  // Conflicting domain: same brand-name-as-domain-label but a different
  // domain than the audited registered domain (e.g. "brand.io" cited
  // alongside real domain "brand.agency") -- generalized, parameterized
  // form of VAL-003C's _CONFLICTING_DOMAIN_RE. Find every "<brand>.<tld>"
  // -looking token and flag it only if none of them match the real domain.
  const brandLabel = escapeRegExp(profile.brandName.trim().toLowerCase().replace(/\s+/g, ""));
  if (brandLabel && domainText) {
    const domainLikeRe = new RegExp(`\\b${brandLabel}\\.[a-z]{2,}(?:\\.[a-z]{2,})?\\b`, "gi");
    const found = lowered.match(domainLikeRe) ?? [];
    if (found.some((m) => m !== domainText)) {
      score -= 5;
      conflicting.push("conflicting domain text in window");
    }
  }

  if (multiEntityPhrases(profile.brandName).some((p) => lowered.includes(p))) {
    score -= 3;
    conflicting.push("window itself flags multiple unresolved entities");
  }

  return { score, matched, conflicting };
}

const DECISIVE_THRESHOLD = 3;

export function selectBestCandidateWindow(
  responseText: string,
  profile: EntityProfile,
  budget: number
): CandidateSelection {
  const windows = buildCandidateWindows(responseText, profile, budget);
  if (windows.length === 0) {
    return {
      occurrenceCount: 0,
      candidates: [],
      selected: null,
      ambiguousByScoring: false,
      selectionReason: "No brand occurrence found to window around.",
    };
  }

  const candidates: CandidateWindow[] = windows.map((w) => {
    const { score, matched, conflicting } = scoreCandidateWindow(w.text, profile);
    return { window: w.text, score, matchedSignals: matched, conflictingSignals: conflicting };
  });

  const ranked = [...candidates].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const top = ranked[0];
  const second = ranked.length > 1 ? ranked[1] : null;

  // Deliberately NO blanket "top score too weak -> abstain" gate here. That
  // gate made sense against VAL-003C's rich SmartClick-specific keyword
  // table, where an on-topic window almost always scored decisively one way
  // or the other, so a flat/near-zero score really was a red flag. Against
  // this generalized, sparser signal set (domain/product text + conflicting
  // domain + generic multi-entity phrasing), a flat score is the NORMAL case
  // for an ordinary single mention with nothing locally to disambiguate --
  // that's exactly what the bounded Claude semantic judge exists to resolve,
  // not a reason to skip it. Abstention below is reserved for genuine
  // STRUCTURAL multi-entity signals: the same weak score recurring across
  // 3+ windows (a blend pattern), or two comparably decisive windows
  // pointing in opposite directions.
  const tiedAtTop = candidates.filter((c) => c.score === top.score);
  if (top.score !== 0 && tiedAtTop.length >= 3) {
    return {
      occurrenceCount: windows.length,
      candidates,
      selected: null,
      ambiguousByScoring: true,
      selectionReason:
        `The same un-stacked score (${top.score}) recurred across ${tiedAtTop.length} of ` +
        `${windows.length} occurrence windows, none reinforced by a second signal -- reads as ` +
        `an undifferentiated multi-entity blend rather than one identifiable entity; cannot be ` +
        `safely resolved.`,
    };
  }

  if (
    second !== null &&
    Math.abs(Math.abs(top.score) - Math.abs(second.score)) <= 2 &&
    (top.score > 0) !== (second.score > 0) &&
    Math.abs(second.score) >= DECISIVE_THRESHOLD
  ) {
    return {
      occurrenceCount: windows.length,
      candidates,
      selected: null,
      ambiguousByScoring: true,
      selectionReason:
        `Top two candidate windows scored ${top.score} and ${second.score} -- comparably ` +
        `decisive but pointing in opposite directions -- identity cannot be safely resolved ` +
        `between ${windows.length} candidate window(s).`,
    };
  }

  return {
    occurrenceCount: windows.length,
    candidates,
    selected: top,
    ambiguousByScoring: false,
    selectionReason:
      `Selected the most decisive window (score=${top.score}) out of ${windows.length} ` +
      `occurrence window(s); no other window presented comparable, conflicting-direction evidence.`,
  };
}

function sanitizeSemanticResult(result: SemanticCompareResult): {
  entityStatus: EntityStatus;
  matchedSignals: string[];
  conflictingSignals: string[];
  confidence: number | null;
  reason: string;
} {
  let status = result.entity_status as EntityStatus | null | undefined;
  if (status === "Confirmed Entity Match") status = "Probable Entity Match";
  if (!status || !CLAUDE_ALLOWED_STATUSES.has(status)) status = "Ambiguous Entity";
  return {
    entityStatus: status,
    matchedSignals: result.matched_signals ?? [],
    conflictingSignals: result.conflicting_signals ?? [],
    confidence: result.confidence ?? null,
    reason: result.reason ?? "",
  };
}

export interface EvaluateEntityInput {
  responseText: string;
  brandMention: boolean;
  domainCitation: boolean;
  looseMention: boolean;
  profile: EntityProfile;
  snippetBudget?: number;
  /** Called ONLY when brandMention is true, domainCitation is false, and
   * candidate-window scoring found a clear winner. Never called otherwise. */
  semanticCompareFn: (snippet: string) => Promise<SemanticCompareResult | null>;
}

export async function evaluateEntity(input: EvaluateEntityInput): Promise<EntityEvaluation> {
  const { responseText, brandMention, domainCitation, looseMention, profile, semanticCompareFn } = input;
  const snippetBudget = input.snippetBudget ?? 190;

  if (domainCitation) {
    return {
      entityStatus: "Confirmed Entity Match",
      matchedSignals: ["audited_domain_citation"],
      conflictingSignals: [],
      confidence: 100,
      reason: "Audited domain/URL was cited -- deterministic match, no semantic judgement needed.",
      usedClaudeSemantic: false,
    };
  }

  if (brandMention) {
    const snippetSelection = selectBestCandidateWindow(responseText, profile, snippetBudget);

    if (snippetSelection.ambiguousByScoring) {
      return {
        entityStatus: "Ambiguous Entity",
        matchedSignals: [],
        conflictingSignals: snippetSelection.candidates.flatMap((c) => c.conflictingSignals),
        confidence: 0,
        reason:
          "Deterministic candidate scoring could not safely resolve identity: " +
          snippetSelection.selectionReason,
        usedClaudeSemantic: false,
        snippetSelection,
      };
    }

    const compareInput = snippetSelection.selected ? snippetSelection.selected.window : responseText;
    const semanticResult = await semanticCompareFn(compareInput);

    if (!semanticResult || !semanticResult.entity_status) {
      return {
        entityStatus: "Ambiguous Entity",
        matchedSignals: [],
        conflictingSignals: [],
        confidence: 0,
        reason: "Semantic comparison unavailable or returned malformed output; defaulting to Ambiguous.",
        usedClaudeSemantic: true,
        snippetSelection,
      };
    }

    const sanitized = sanitizeSemanticResult(semanticResult);
    return { ...sanitized, usedClaudeSemantic: true, snippetSelection };
  }

  if (looseMention) {
    return {
      entityStatus: "Ambiguous Entity",
      matchedSignals: [],
      conflictingSignals: [],
      confidence: 0,
      reason: "Partial/loose name match only -- not an exact brand mention, cannot confirm entity.",
      usedClaudeSemantic: false,
    };
  }

  return {
    entityStatus: "No Entity Signal",
    matchedSignals: [],
    conflictingSignals: [],
    confidence: 100,
    reason: "No brand/product mention and no domain citation found.",
    usedClaudeSemantic: false,
  };
}

export type MentionClass =
  | "Strong Mention"
  | "Mentioned"
  | "Cited Only"
  | "Ambiguous"
  | "Not Mentioned"
  | "No Result";

/**
 * Locked mapping (explicit clarification):
 *  - Strong Mention = Confirmed Entity Match AND a literal brand/product
 *    mention in the response AND an audited domain/URL citation.
 *  - Cited Only = audited domain/URL is cited BUT the brand/product is not
 *    literally mentioned. Never collapsed into Strong Mention.
 */
export function mentionClassFromEntityStatus(entityStatus: EntityStatus, brandMention: boolean): MentionClass {
  if (entityStatus === "Confirmed Entity Match") {
    return brandMention ? "Strong Mention" : "Cited Only";
  }
  if (entityStatus === "Probable Entity Match") return "Mentioned";
  if (entityStatus === "Ambiguous Entity") return "Ambiguous";
  return "Not Mentioned"; // Wrong Entity | No Entity Signal
}

// --------------------------------------------------------------------------
// Cross-record corroboration -- secondary metadata only, never upgrades a
// status. Generalized from VAL-003C's title-only location/category phrase
// match: since the real schema has no category/location profile data, the
// generic signal is "this OTHER citation's own title independently names
// the audited brand/product/domain" -- still scoped to that citation's
// title text alone, never the record's whole response text (VAL-003B's
// caught false-positive-borrowing bug).
// --------------------------------------------------------------------------

export const CORROBORATION_ELIGIBLE_STATUSES = new Set<EntityStatus>([
  "Probable Entity Match",
  "Ambiguous Entity",
]);

export interface CorroborationCitation {
  url: string;
  title: string | null;
}

export interface CorroborationRecord {
  provider: string;
  citations: CorroborationCitation[];
}

export function normalizeUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    const path = parsed.pathname.replace(/\/$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function extractCorroborationSignals(title: string | null, profile: EntityProfile): string[] {
  if (!title) return [];
  const lowered = title.toLowerCase();
  const found: string[] = [];
  const domainText = domainFromRegisteredDomain(profile.registeredDomain);
  const domainLabel = domainText.split(".")[0];

  if (profile.brandName && hasWholeWordMatch(title, profile.brandName)) {
    found.push(`'${profile.brandName}' present in citation title`);
  }
  if (profile.productName && hasWholeWordMatch(title, profile.productName)) {
    found.push(`'${profile.productName}' present in citation title`);
  }
  if (domainLabel && lowered.includes(domainLabel)) {
    found.push(`'${domainLabel}' present in citation title`);
  }
  return found;
}

interface UrlIndexEntry {
  recordIndex: number;
  provider: string;
  signals: string[];
}

export function buildCrossRecordUrlIndex(
  records: CorroborationRecord[],
  profile: EntityProfile
): Map<string, UrlIndexEntry[]> {
  const index = new Map<string, UrlIndexEntry[]>();
  records.forEach((record, i) => {
    const seenUrlsThisRecord = new Set<string>();
    for (const c of record.citations ?? []) {
      const norm = normalizeUrl(c.url);
      if (!norm || seenUrlsThisRecord.has(norm)) continue;
      seenUrlsThisRecord.add(norm);
      const signals = extractCorroborationSignals(c.title, profile);
      const entry: UrlIndexEntry = { recordIndex: i, provider: record.provider, signals };
      const existing = index.get(norm);
      if (existing) existing.push(entry);
      else index.set(norm, [entry]);
    }
  });
  return index;
}

export interface CrossRecordCorroboration {
  crossRecordCorroboration: boolean;
  corroboratingProviders: string[];
  corroboratingSourceUrl: string | null;
  corroboratingSignals: string[];
}

export function computeCrossRecordCorroboration(
  recordIndex: number,
  records: CorroborationRecord[],
  urlIndex: Map<string, UrlIndexEntry[]>
): CrossRecordCorroboration {
  const record = records[recordIndex];
  const providersSeen = new Set<string>();
  const signalsCollected: string[] = [];
  let chosenUrl: string | null = null;

  for (const c of record.citations ?? []) {
    const norm = normalizeUrl(c.url);
    if (!norm) continue;
    for (const entry of urlIndex.get(norm) ?? []) {
      if (entry.recordIndex === recordIndex) continue; // never self-corroborate
      if (entry.signals.length === 0) continue; // only OTHER records with signal count
      if (providersSeen.has(entry.provider)) continue; // never double-count a provider
      providersSeen.add(entry.provider);
      signalsCollected.push(...entry.signals);
      chosenUrl = chosenUrl ?? c.url;
    }
  }

  if (providersSeen.size === 0) {
    return {
      crossRecordCorroboration: false,
      corroboratingProviders: [],
      corroboratingSourceUrl: null,
      corroboratingSignals: [],
    };
  }

  return {
    crossRecordCorroboration: true,
    corroboratingProviders: Array.from(providersSeen).sort(),
    corroboratingSourceUrl: chosenUrl,
    corroboratingSignals: Array.from(new Set(signalsCollected)).sort(),
  };
}
