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
