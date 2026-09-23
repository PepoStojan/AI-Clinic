import "server-only";

import { buildIdempotencyKey } from "../audit/idempotency";
import type { Database } from "../supabase/database.types";
import { callGoogleAiMode, callLlmProvider, type LlmProviderKey } from "../providers/dataforseo";
import {
  updateChecklistItemByIdempotencyKey,
  type ChecklistItemRow,
} from "../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../supabase/repositories/component-results";
import { classifyBrandRecognitionAnswer } from "./classifier";
import { buildBrandRecognitionPrompt, buildReferenceProfile, type ReferenceProfile } from "./reference-profile";

export const BRAND_RECOGNITION_CHECK_KEYS = ["openai", "gemini", "claude", "google"] as const;
export type BrandRecognitionProviderKey = (typeof BRAND_RECOGNITION_CHECK_KEYS)[number];

export type BrandRecognitionStatus =
  | "Accurate"
  | "Partially Accurate"
  | "Inaccurate"
  | "Not Recognized"
  | "No Result";

export interface BrandRecognitionProviderOutcome {
  provider: BrandRecognitionProviderKey;
  recognitionStatus: BrandRecognitionStatus;
  evidence: string;
  source: string;
  providerUnavailable: boolean;
  accuracyUnavailable: boolean;
  errorMessage: string | null;
  attempts: number;
}

export interface BrandRecognitionSummary {
  recognized_by: number;
  accuracy_confirmed: number;
  accuracy_unavailable: number;
  provider_could_not_verify: number;
  narrative: string;
}

export interface BrandRecognitionResult {
  auditId: string;
  providers: BrandRecognitionProviderOutcome[];
  summary: BrandRecognitionSummary;
}

const DATAFORSEO_PROVIDER_KEYS: Record<"openai" | "gemini" | "claude", LlmProviderKey> = {
  openai: "chat_gpt",
  gemini: "gemini",
  claude: "claude",
};

function noSourceOrFirstCitation(citations: { title: string | null; url: string }[]): string {
  if (citations.length === 0) return "No source provided.";
  const first = citations[0];
  return first.title ? `${first.title} (${first.url})` : first.url;
}

async function runOneProvider(
  provider: BrandRecognitionProviderKey,
  prompt: string,
  profile: ReferenceProfile
): Promise<{ outcome: BrandRecognitionProviderOutcome; raw: unknown }> {
  const callResult =
    provider === "google"
      ? await callGoogleAiMode(prompt).catch((error) => ({
          parsed: { ok: false, text: "", citations: [], cost: null, noResultReason: String(error) },
          attempts: 1,
          raw: null,
          error,
        }))
      : await callLlmProvider(DATAFORSEO_PROVIDER_KEYS[provider], prompt).catch((error) => ({
          parsed: { ok: false, text: "", citations: [], cost: null, noResultReason: String(error) },
          attempts: 1,
          raw: null,
          error,
        }));

  const { parsed, attempts, raw } = callResult;

  if (!parsed.ok) {
    return {
      raw,
      outcome: {
        provider,
        recognitionStatus: "No Result",
        evidence: "",
        source: "No source provided.",
        providerUnavailable: true,
        accuracyUnavailable: false,
        errorMessage: parsed.noResultReason,
        attempts,
      },
    };
  }

  const classification = await classifyBrandRecognitionAnswer(profile, parsed.text);
  const source = noSourceOrFirstCitation(parsed.citations);

  if (!classification) {
    return {
      raw,
      outcome: {
        provider,
        recognitionStatus: "No Result",
        evidence: parsed.text.slice(0, 280),
        source,
        providerUnavailable: false,
        accuracyUnavailable: true,
        errorMessage: "Accuracy classifier unavailable or returned unparseable output.",
        attempts,
      },
    };
  }

  return {
    raw,
    outcome: {
      provider,
      recognitionStatus: classification.status,
      evidence: classification.evidence || parsed.text.slice(0, 280),
      source,
      providerUnavailable: false,
      accuracyUnavailable: false,
      errorMessage: null,
      attempts,
    },
  };
}

export function checklistStatusFor(outcome: BrandRecognitionProviderOutcome): ChecklistItemRow["status"] {
  if (outcome.recognitionStatus === "Accurate") return "COMPLETED";
  if (
    outcome.recognitionStatus === "Partially Accurate" ||
    outcome.recognitionStatus === "Inaccurate" ||
    outcome.recognitionStatus === "Not Recognized"
  ) {
    return "GAP_FOUND";
  }
  return "COULD_NOT_VERIFY"; // No Result, whether provider- or classifier-caused
}

export function buildSummary(providers: BrandRecognitionProviderOutcome[]): BrandRecognitionSummary {
  const recognized_by = providers.filter(
    (p) => !p.providerUnavailable && p.recognitionStatus !== "Not Recognized"
  ).length;
  const accuracy_confirmed = providers.filter((p) => p.recognitionStatus === "Accurate").length;
  const accuracy_unavailable = providers.filter(
    (p) => !p.providerUnavailable && p.accuracyUnavailable
  ).length;
  const provider_could_not_verify = providers.filter((p) => p.providerUnavailable).length;

  const unavailableParts: string[] = [];
  if (accuracy_unavailable > 0) {
    unavailableParts.push(`${accuracy_unavailable} accuracy check${accuracy_unavailable === 1 ? "" : "s"}`);
  }
  if (provider_could_not_verify > 0) {
    unavailableParts.push(
      `${provider_could_not_verify} provider result${provider_could_not_verify === 1 ? "" : "s"}`
    );
  }

  let narrative =
    `${recognized_by} system${recognized_by === 1 ? "" : "s"} recognized the brand; ` +
    `accuracy was confirmed for ${accuracy_confirmed}.`;
  if (unavailableParts.length > 0) {
    narrative += ` ${unavailableParts.join(" and ")} ${unavailableParts.length === 1 ? "was" : "were"} unavailable.`;
  }

  return { recognized_by, accuracy_confirmed, accuracy_unavailable, provider_could_not_verify, narrative };
}

export async function runBrandRecognitionComponent(input: {
  auditId: string;
  companyName: string;
  registeredDomain: string;
  websiteUrl: string;
  productName?: string | null;
}): Promise<BrandRecognitionResult> {
  const profile = buildReferenceProfile(input);
  const prompt = buildBrandRecognitionPrompt(profile.brandName);

  await Promise.all(
    BRAND_RECOGNITION_CHECK_KEYS.map((provider) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({
          auditId: input.auditId,
          componentName: "brand_recognition",
          targetId: null,
          checkKey: provider,
        }),
        { status: "RUNNING", started_at: new Date().toISOString() }
      )
    )
  );

  const results = await Promise.all(
    BRAND_RECOGNITION_CHECK_KEYS.map((provider) => runOneProvider(provider, prompt, profile))
  );

  await Promise.all(
    results.map(({ outcome }) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({
          auditId: input.auditId,
          componentName: "brand_recognition",
          targetId: null,
          checkKey: outcome.provider,
        }),
        {
          status: checklistStatusFor(outcome),
          result_json: { recognitionStatus: outcome.recognitionStatus, evidence: outcome.evidence },
          evidence_json: { source: outcome.source },
          retry_count: Math.max(0, outcome.attempts - 1),
          last_error: outcome.errorMessage,
          completed_at: new Date().toISOString(),
        }
      )
    )
  );

  const providers = results.map((r) => r.outcome);
  const summary = buildSummary(providers);

  await upsertComponentResult({
    audit_id: input.auditId,
    component_name: "brand_recognition",
    status: "COMPLETED",
    raw_result_json: {
      referenceProfile: profile,
      providers: Object.fromEntries(results.map((r) => [r.outcome.provider, r.raw])),
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["raw_result_json"],
    normalized_result_json: { providers, summary } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["normalized_result_json"],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  return { auditId: input.auditId, providers, summary };
}
