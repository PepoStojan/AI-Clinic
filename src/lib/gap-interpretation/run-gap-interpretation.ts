import "server-only";

import { getAuditById } from "../supabase/repositories/audits";
import {
  listGroupedGapsByAuditId,
  updateGroupedGapInterpretation,
  type GroupedGapRow,
} from "../supabase/repositories/grouped-gaps";
import { callClaudeForInterpretation } from "./claude-client";
import { buildFallbackInterpretation } from "./fallback";
import type { GapInterpretationPayload, InterpretationOutput } from "./types";
import { validateInterpretation } from "./validator";

const MAX_CLAUDE_ATTEMPTS = 2; // per spec: malformed/invalid output may be retried once before falling back

function extractAffectedNames(affectedChecks: unknown): string[] {
  if (!Array.isArray(affectedChecks)) return [];
  return affectedChecks
    .map((c) => {
      const row = c as Record<string, unknown>;
      const value = row.provider ?? row.platform ?? row.crawler;
      return typeof value === "string" ? value : null;
    })
    .filter((v): v is string => Boolean(v));
}

function parseValidatedJson(rawText: string): InterpretationOutput {
  const stripped = rawText.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  return JSON.parse(stripped) as InterpretationOutput;
}

async function interpretOneGap(gap: GroupedGapRow, brandName: string): Promise<GroupedGapRow> {
  const affectedNames = extractAffectedNames(gap.affected_checks_json);
  const payload: GapInterpretationPayload = {
    brandName,
    componentName: gap.component_name,
    gapType: gap.gap_type,
    title: gap.title,
    deterministicReason: gap.deterministic_reason,
    affectedNames,
  };

  const sourceText = `${gap.title} ${gap.deterministic_reason}`;
  let validated: InterpretationOutput | null = null;
  for (let attempt = 0; attempt < MAX_CLAUDE_ATTEMPTS; attempt++) {
    const rawText = await callClaudeForInterpretation(payload);
    if (!rawText) continue;
    const validation = validateInterpretation(rawText, { componentName: gap.component_name, affectedNames, sourceText });
    if (validation.ok) {
      validated = parseValidatedJson(rawText);
      break;
    }
  }

  if (validated) {
    return updateGroupedGapInterpretation(gap.id, {
      interpretation_json: validated as unknown as GroupedGapRow["interpretation_json"],
      validation_status: "PASSED",
    });
  }

  const fallback = buildFallbackInterpretation(gap.deterministic_reason);
  try {
    return await updateGroupedGapInterpretation(gap.id, {
      interpretation_json: fallback as unknown as GroupedGapRow["interpretation_json"],
      validation_status: "FALLBACK_FACTS_ONLY",
    });
  } catch (error) {
    // Real system failure to persist even the conservative fallback --
    // last-resort best-effort write of FAILED; if that also throws, this
    // one gap's failure must not take down the rest of the batch (the
    // caller uses allSettled), so we just surface the original error.
    try {
      return await updateGroupedGapInterpretation(gap.id, {
        interpretation_json: fallback as unknown as GroupedGapRow["interpretation_json"],
        validation_status: "FAILED",
      });
    } catch {
      throw error;
    }
  }
}

/**
 * Interprets every grouped gap currently stored for this audit. Safe to
 * rerun: each call updates interpretation_json/validation_status on the
 * SAME row (by id), never creating new rows or touching gap identity
 * fields. One gap's provider failure never blocks the others --
 * allSettled, not all-or-nothing.
 */
export async function runGapInterpretation(auditId: string): Promise<GroupedGapRow[]> {
  const gaps = await listGroupedGapsByAuditId(auditId);
  if (gaps.length === 0) return [];

  const audit = await getAuditById(auditId);
  const brandName = audit?.company_name ?? "the company";

  const results = await Promise.allSettled(gaps.map((gap) => interpretOneGap(gap, brandName)));

  return results
    .filter((r): r is PromiseFulfilledResult<GroupedGapRow> => r.status === "fulfilled")
    .map((r) => r.value);
}
