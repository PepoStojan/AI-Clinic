import "server-only";

import { buildIdempotencyKey } from "../audit/idempotency";
import { PROMPT_VISIBILITY_PROVIDERS } from "../audit/checklist";
import type { Database } from "../supabase/database.types";
import { callGoogleAiMode, callLlmProvider, type Citation, type LlmProviderKey } from "../providers/dataforseo";
import {
  updateChecklistItemByIdempotencyKey,
  type ChecklistItemRow,
} from "../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../supabase/repositories/component-results";
import { classifyEntityMatch } from "./classifier";
import { extractOtherBrands } from "./other-brands";
import {
  buildCrossRecordUrlIndex,
  CORROBORATION_ELIGIBLE_STATUSES,
  computeCrossRecordCorroboration,
  evaluateEntity,
  hasLooseMatch,
  hasWholeWordMatch,
  mentionClassFromEntityStatus,
  type CrossRecordCorroboration,
  type EntityEvaluation,
  type EntityProfile,
  type MentionClass,
} from "./entity-validation";

export type PromptVisibilityProvider = (typeof PROMPT_VISIBILITY_PROVIDERS)[number]; // chatgpt | gemini | claude | google_ai

const DATAFORSEO_PROVIDER_KEYS: Record<"chatgpt" | "gemini" | "claude", LlmProviderKey> = {
  chatgpt: "chat_gpt",
  gemini: "gemini",
  claude: "claude",
};

export interface PromptVisibilityTargetInput {
  id: string;
  prompts: string[];
}

export interface PromptVisibilityProviderOutcome {
  targetId: string;
  promptIndex: number;
  prompt: string;
  provider: PromptVisibilityProvider;
  mentionClass: MentionClass;
  entityStatus: EntityEvaluation["entityStatus"] | null;
  evidence: string;
  citations: { title: string | null; url: string }[];
  providerUnavailable: boolean;
  errorMessage: string | null;
  attempts: number;
  crossRecordCorroboration?: CrossRecordCorroboration;
  // PROMPT-COMPETITORS-002: derived display-only field, populated only when
  // mentionClass === "Not Mentioned". Never influences mentionClass/status.
  otherBrandsMentioned?: string[];
}

export interface PromptVisibilitySummary {
  totalChecks: number;
  evaluableChecks: number; // excludes No Result
  strongMentions: number;
  mentioned: number;
  citedOnly: number;
  ambiguous: number;
  notMentioned: number;
  noResult: number;
}

export interface PromptVisibilityResult {
  auditId: string;
  providers: PromptVisibilityProviderOutcome[];
  summary: PromptVisibilitySummary;
}

function firstCitationOrNone(citations: Citation[]): { title: string | null; url: string }[] {
  return citations.slice(0, 3).map((c) => ({ title: c.title, url: c.url }));
}

function domainMatches(citations: Citation[], registeredDomain: string): boolean {
  const target = registeredDomain.trim().toLowerCase().replace(/^www\./, "");
  return citations.some((c) => c.domain === target);
}

interface RawProviderRun {
  targetId: string;
  promptIndex: number;
  prompt: string;
  provider: PromptVisibilityProvider;
  ok: boolean;
  text: string;
  citations: Citation[];
  attempts: number;
  errorMessage: string | null;
}

async function callProvider(
  provider: PromptVisibilityProvider,
  prompt: string
): Promise<{ ok: boolean; text: string; citations: Citation[]; attempts: number; errorMessage: string | null }> {
  try {
    const callResult =
      provider === "google_ai" ? await callGoogleAiMode(prompt) : await callLlmProvider(DATAFORSEO_PROVIDER_KEYS[provider], prompt);
    const { parsed, attempts } = callResult;
    if (!parsed.ok) {
      return { ok: false, text: "", citations: [], attempts, errorMessage: parsed.noResultReason };
    }
    return { ok: true, text: parsed.text, citations: parsed.citations, attempts, errorMessage: null };
  } catch (error) {
    return {
      ok: false,
      text: "",
      citations: [],
      attempts: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function checklistStatusFor(mentionClass: MentionClass): ChecklistItemRow["status"] {
  if (mentionClass === "Strong Mention" || mentionClass === "Mentioned" || mentionClass === "Cited Only") {
    return "COMPLETED";
  }
  if (mentionClass === "Ambiguous" || mentionClass === "Not Mentioned") {
    return "GAP_FOUND";
  }
  return "COULD_NOT_VERIFY"; // No Result -- never a gap
}

export function buildSummary(outcomes: PromptVisibilityProviderOutcome[]): PromptVisibilitySummary {
  const noResult = outcomes.filter((o) => o.mentionClass === "No Result").length;
  return {
    totalChecks: outcomes.length,
    evaluableChecks: outcomes.length - noResult, // No Result excluded from denominator
    strongMentions: outcomes.filter((o) => o.mentionClass === "Strong Mention").length,
    mentioned: outcomes.filter((o) => o.mentionClass === "Mentioned").length,
    citedOnly: outcomes.filter((o) => o.mentionClass === "Cited Only").length,
    ambiguous: outcomes.filter((o) => o.mentionClass === "Ambiguous").length,
    notMentioned: outcomes.filter((o) => o.mentionClass === "Not Mentioned").length,
    noResult,
  };
}

export async function runPromptVisibilityComponent(input: {
  auditId: string;
  companyName: string;
  registeredDomain: string;
  productName?: string | null;
  targets: PromptVisibilityTargetInput[];
}): Promise<PromptVisibilityResult> {
  const profile: EntityProfile = {
    brandName: input.companyName,
    registeredDomain: input.registeredDomain,
    productName: input.productName ?? null,
  };

  const jobs: { targetId: string; promptIndex: number; prompt: string; provider: PromptVisibilityProvider }[] = [];
  for (const target of input.targets) {
    target.prompts.forEach((prompt, promptIndex) => {
      for (const provider of PROMPT_VISIBILITY_PROVIDERS) {
        jobs.push({ targetId: target.id, promptIndex, prompt, provider });
      }
    });
  }

  await Promise.all(
    jobs.map((job) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({
          auditId: input.auditId,
          componentName: "prompt_visibility",
          targetId: job.targetId,
          checkKey: `prompt-${job.promptIndex}:${job.provider}`,
        }),
        { status: "RUNNING", started_at: new Date().toISOString() }
      )
    )
  );

  const rawRuns: RawProviderRun[] = await Promise.all(
    jobs.map(async (job) => {
      const result = await callProvider(job.provider, job.prompt);
      return {
        targetId: job.targetId,
        promptIndex: job.promptIndex,
        prompt: job.prompt,
        provider: job.provider,
        ...result,
      };
    })
  );

  // Entity validation per run. Independent per record -- cross-record
  // corroboration is computed as a second pass below, never inline.
  const evaluations = await Promise.all(
    rawRuns.map(async (run) => {
      if (!run.ok) {
        return { run, evaluation: null as EntityEvaluation | null, brandMention: false };
      }
      const brandMention = hasWholeWordMatch(run.text, profile.brandName);
      const domainCitation = domainMatches(run.citations, profile.registeredDomain);
      const looseMention = !brandMention && hasLooseMatch(run.text, profile.brandName);

      const evaluation = await evaluateEntity({
        responseText: run.text,
        brandMention,
        domainCitation,
        looseMention,
        profile,
        semanticCompareFn: (snippet) => classifyEntityMatch(profile, snippet),
      });
      return { run, evaluation, brandMention };
    })
  );

  // Cross-record corroboration, audit-wide across every provider result
  // collected in this component run (matches VAL-003A's whole-run
  // correlation) -- secondary metadata only, computed only for eligible
  // records, never allowed to change entityStatus/mentionClass.
  const corroborationRecords = evaluations.map(({ run }) => ({
    provider: `${run.targetId}:${run.promptIndex}:${run.provider}`,
    citations: run.citations.map((c) => ({ url: c.url, title: c.title })),
  }));
  const urlIndex = buildCrossRecordUrlIndex(corroborationRecords, profile);

  const baseOutcomes: PromptVisibilityProviderOutcome[] = evaluations.map(({ run, evaluation, brandMention }, i) => {
    if (!run.ok || !evaluation) {
      return {
        targetId: run.targetId,
        promptIndex: run.promptIndex,
        prompt: run.prompt,
        provider: run.provider,
        mentionClass: "No Result",
        entityStatus: null,
        evidence: "",
        citations: [],
        providerUnavailable: true,
        errorMessage: run.errorMessage,
        attempts: run.attempts,
      };
    }

    const mentionClass = mentionClassFromEntityStatus(evaluation.entityStatus, brandMention);
    const corroboration = CORROBORATION_ELIGIBLE_STATUSES.has(evaluation.entityStatus)
      ? computeCrossRecordCorroboration(i, corroborationRecords, urlIndex)
      : undefined;

    return {
      targetId: run.targetId,
      promptIndex: run.promptIndex,
      prompt: run.prompt,
      provider: run.provider,
      mentionClass,
      entityStatus: evaluation.entityStatus,
      evidence: evaluation.reason || run.text.slice(0, 280),
      citations: firstCitationOrNone(run.citations),
      providerUnavailable: false,
      errorMessage: null,
      attempts: run.attempts,
      crossRecordCorroboration: corroboration,
    };
  });

  // PROMPT-COMPETITORS-002: derived display-only pass, strictly AFTER
  // mentionClass has already been finalized above by the frozen
  // VAL-003C-derived evaluateEntity()/classifyEntityMatch() path. Runs only
  // for "Not Mentioned" outcomes (never Strong Mention/Mentioned/Cited
  // Only/Ambiguous/No Result), at most one extraction call per such
  // outcome, and can never change mentionClass/status/evidence.
  const outcomes: PromptVisibilityProviderOutcome[] = await Promise.all(
    baseOutcomes.map(async (outcome, i) => {
      if (outcome.mentionClass !== "Not Mentioned") return outcome;
      const otherBrandsMentioned = await extractOtherBrands(profile.brandName, rawRuns[i].text);
      return otherBrandsMentioned.length > 0 ? { ...outcome, otherBrandsMentioned } : outcome;
    })
  );

  await Promise.all(
    outcomes.map((outcome) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({
          auditId: input.auditId,
          componentName: "prompt_visibility",
          targetId: outcome.targetId,
          checkKey: `prompt-${outcome.promptIndex}:${outcome.provider}`,
        }),
        {
          status: checklistStatusFor(outcome.mentionClass),
          result_json: {
            mentionClass: outcome.mentionClass,
            entityStatus: outcome.entityStatus,
            evidence: outcome.evidence,
            otherBrandsMentioned: outcome.otherBrandsMentioned ?? [],
          },
          evidence_json: { citations: outcome.citations },
          retry_count: Math.max(0, outcome.attempts - 1),
          last_error: outcome.errorMessage,
          completed_at: new Date().toISOString(),
        }
      )
    )
  );

  const summary = buildSummary(outcomes);

  await upsertComponentResult({
    audit_id: input.auditId,
    component_name: "prompt_visibility",
    status: "COMPLETED",
    raw_result_json: {
      referenceProfile: profile,
      runs: rawRuns.map((r) => ({ ...r, citations: r.citations })),
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["raw_result_json"],
    normalized_result_json: {
      providers: outcomes,
      summary,
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["normalized_result_json"],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  return { auditId: input.auditId, providers: outcomes, summary };
}
