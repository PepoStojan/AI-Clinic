// AI-001: shared types for evidence-bound gap interpretation.

export interface InterpretationOutput {
  what_we_observed: string;
  what_this_suggests: string;
  what_to_consider: string;
}

export const INTERPRETATION_FIELDS = ["what_we_observed", "what_this_suggests", "what_to_consider"] as const;

/** Compact facts handed to Claude -- only what section 21/AI-001 permits it
 * to see: brand name, component/gap identity, deterministic reason, and
 * the affected entities' display names (not full nested JSON). */
export interface GapInterpretationPayload {
  brandName: string;
  componentName: string;
  gapType: string;
  title: string;
  deterministicReason: string;
  affectedNames: string[];
}
