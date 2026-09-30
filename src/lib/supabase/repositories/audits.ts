import { getSupabaseServerClient } from "../server";
import type { AuditStatus, Database } from "../database.types";
import { TERMINAL_AUDIT_STATUSES } from "../../audit/constants";

export type AuditRow = Database["public"]["Tables"]["audits"]["Row"];
export type AuditInsert = Database["public"]["Tables"]["audits"]["Insert"];
export type AuditUpdate = Database["public"]["Tables"]["audits"]["Update"];

export async function createAudit(input: AuditInsert): Promise<AuditRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("audits").insert(input).select().single();

  if (error) {
    // .code preserves the Postgres error code (e.g. "23505" unique_violation)
    // so callers can distinguish a recoverable audit_code collision from a
    // real failure without string-matching the message.
    throw Object.assign(new Error(`createAudit failed: ${error.message}`), {
      code: error.code,
    });
  }
  return data;
}

/**
 * Highest existing sequence number used in audit codes for the given year
 * (e.g. `AIC-2026-000042` -> 42), or 0 if none exist yet. Used to compute
 * the next candidate sequence; concurrent creation is handled by retrying
 * on a unique_violation, not by locking.
 */
export async function getMaxAuditCodeSequenceForYear(year: number): Promise<number> {
  const supabase = getSupabaseServerClient();
  const prefix = `AIC-${year}-`;
  const { data, error } = await supabase
    .from("audits")
    .select("audit_code")
    .like("audit_code", `${prefix}%`)
    .order("audit_code", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`getMaxAuditCodeSequenceForYear failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    return 0;
  }
  const match = data[0].audit_code.match(/-(\d{6})$/);
  return match ? Number(match[1]) : 0;
}

/**
 * Deletes an audit and, via ON DELETE CASCADE, every dependent row
 * (targets, component_results, checklist_items, grouped_gaps, reports).
 * This is the rollback mechanism for a failed audit-creation attempt --
 * see src/lib/audit/create-audit.ts.
 */
export async function deleteAudit(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("audits").delete().eq("id", id);
  if (error) {
    throw new Error(`deleteAudit failed: ${error.message}`);
  }
}

// AUDIT-DELETE-001B: excludes soft-deleted audits -- every normal
// application read path (list, detail, status polling, retry lookups) goes
// through this, so a deleted audit is invisible here by construction. A
// caller that genuinely needs a deleted row (none currently do) must query
// `audits` directly rather than adding an `includeDeleted` flag here.
export async function getAuditById(id: string): Promise<AuditRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("audits").select().eq("id", id).is("deleted_at", null).maybeSingle();

  if (error) {
    throw new Error(`getAuditById failed: ${error.message}`);
  }
  return data;
}

/**
 * UI-001's only status-transition write path -- always sets `status`
 * (plus whatever extra fields the caller passes, e.g. completed_at) by
 * audit id. Never invents/guesses a status; every call site names the
 * exact target status explicitly.
 *
 * AUDIT-DELETE-001B: the update is conditioned on `deleted_at IS NULL`, so
 * a soft-deleted audit's status can never be mutated by this function --
 * defense-in-depth against a raced retry/Trigger.dev call, independent of
 * any read-path or action-level check. If the row doesn't match (already
 * deleted, or truly missing), Postgrest's `.single()` throws rather than
 * silently succeeding on zero rows -- every current caller already runs
 * this inside a try/catch (see run-audit-pipeline.ts, audits/actions.ts).
 */
export async function updateAuditStatus(
  id: string,
  status: AuditStatus,
  extra: Omit<AuditUpdate, "id" | "status"> = {}
): Promise<AuditRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("audits")
    .update({ status, ...extra })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    throw new Error(`updateAuditStatus failed: ${error.message}`);
  }
  return data;
}

/**
 * AUDIT-DELETE-001B: atomic, conditional soft delete. The WHERE clause
 * (id + deleted_at IS NULL + status IN terminal-statuses) does the entire
 * eligibility check in the same statement as the write -- no separate
 * existence/status check can race against it. Returns the updated row on
 * success, or null if nothing matched (already deleted, doesn't exist, or
 * not in a terminal status) -- idempotent and safe to call more than once.
 * Never hard-deletes; unrelated to deleteAudit() above.
 */
export async function softDeleteAudit(id: string): Promise<AuditRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("audits")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .in("status", [...TERMINAL_AUDIT_STATUSES])
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`softDeleteAudit failed: ${error.message}`);
  }
  return data;
}

export async function listAudits(): Promise<AuditRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("audits")
    .select()
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listAudits failed: ${error.message}`);
  }
  return data;
}

export async function getAuditByCode(auditCode: string): Promise<AuditRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("audits")
    .select()
    .eq("audit_code", auditCode)
    .maybeSingle();

  if (error) {
    throw new Error(`getAuditByCode failed: ${error.message}`);
  }
  return data;
}
