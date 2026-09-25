import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type GroupedGapRow = Database["public"]["Tables"]["grouped_gaps"]["Row"];
export type GroupedGapInsert = Database["public"]["Tables"]["grouped_gaps"]["Insert"];

export async function createGroupedGap(input: GroupedGapInsert): Promise<GroupedGapRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("grouped_gaps").insert(input).select().single();

  if (error) {
    throw new Error(`createGroupedGap failed: ${error.message}`);
  }
  return data;
}

export async function listGroupedGapsByAuditId(auditId: string): Promise<GroupedGapRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("grouped_gaps").select().eq("audit_id", auditId);

  if (error) {
    throw new Error(`listGroupedGapsByAuditId failed: ${error.message}`);
  }
  return data;
}

export async function deleteGroupedGapsByAuditId(auditId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("grouped_gaps").delete().eq("audit_id", auditId);

  if (error) {
    throw new Error(`deleteGroupedGapsByAuditId failed: ${error.message}`);
  }
}

export async function createGroupedGaps(rows: GroupedGapInsert[]): Promise<GroupedGapRow[]> {
  if (rows.length === 0) return [];

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("grouped_gaps").insert(rows).select();

  if (error) {
    throw new Error(`createGroupedGaps failed: ${error.message}`);
  }
  return data;
}

/**
 * CORE-002's rerun strategy: delete every existing grouped gap for this
 * audit, then insert the freshly-detected set. Simplest safe MVP approach
 * for "rerun must reflect current source facts, no stale gaps" -- no
 * diff/versioning logic. Not wrapped in a DB transaction (the Supabase JS
 * client has no simple multi-statement transaction primitive); an MVP-
 * acceptable window, consistent with this codebase's existing tolerance
 * for similar non-atomic sequences (e.g. audit-code retry logic).
 */
export async function replaceGroupedGapsForAudit(
  auditId: string,
  rows: GroupedGapInsert[]
): Promise<GroupedGapRow[]> {
  await deleteGroupedGapsByAuditId(auditId);
  return createGroupedGaps(rows);
}
