import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type AuditTargetRow = Database["public"]["Tables"]["audit_targets"]["Row"];
export type AuditTargetInsert = Database["public"]["Tables"]["audit_targets"]["Insert"];

export async function createAuditTarget(input: AuditTargetInsert): Promise<AuditTargetRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("audit_targets").insert(input).select().single();

  if (error) {
    throw new Error(`createAuditTarget failed: ${error.message}`);
  }
  return data;
}

export async function listAuditTargetsByAuditId(auditId: string): Promise<AuditTargetRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_targets")
    .select()
    .eq("audit_id", auditId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`listAuditTargetsByAuditId failed: ${error.message}`);
  }
  return data;
}
