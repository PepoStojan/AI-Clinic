import type { ComponentName } from "../supabase/database.types";

// CORE-002: pure, deterministic output of one gap detector, before the
// orchestrator turns it into a grouped_gaps insert row (adds audit_id,
// interpretation_json: null, validation_status: PENDING).
export interface DetectedGap {
  /** Unique WITHIN an audit -- the DB constraint is (audit_id, gap_key), so
   * this never needs to embed the audit id itself. */
  gapKey: string;
  componentName: ComponentName;
  gapType: string;
  title: string;
  /** One entry per affected check -- never a clean/pass or N/A row. */
  affectedChecks: Record<string, unknown>[];
  /** Supporting evidence for the affected checks only. */
  evidence: Record<string, unknown>[];
  deterministicReason: string;
}
