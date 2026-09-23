import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type AuditRow = Database["public"]["Tables"]["audits"]["Row"];
export type AuditInsert = Database["public"]["Tables"]["audits"]["Insert"];

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

export async function getAuditById(id: string): Promise<AuditRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("audits").select().eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getAuditById failed: ${error.message}`);
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
