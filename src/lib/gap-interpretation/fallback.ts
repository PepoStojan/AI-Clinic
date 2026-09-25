import type { InterpretationOutput } from "./types";

// AI-001: deterministic, facts-only fallback. Used whenever Claude fails,
// times out, returns malformed JSON, or repeatedly fails validation --
// never blocks the report. Conservative by construction: what_we_observed
// is the gap's own deterministic_reason verbatim (already a factual,
// evidence-bound sentence written by CORE-002's deterministic code), and
// the other two fields are the exact fixed wording given in the task spec
// -- no invention possible.
export function buildFallbackInterpretation(deterministicReason: string): InterpretationOutput {
  return {
    what_we_observed: deterministicReason,
    what_this_suggests: "Visibility/presence/access is limited for the affected checks.",
    what_to_consider: "Review the affected checks and consider addressing them where relevant.",
  };
}
