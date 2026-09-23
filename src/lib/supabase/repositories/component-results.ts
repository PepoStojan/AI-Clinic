import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type ComponentResultRow = Database["public"]["Tables"]["component_results"]["Row"];
export type ComponentResultInsert = Database["public"]["Tables"]["component_results"]["Insert"];

export async function createComponentResult(
  input: ComponentResultInsert
): Promise<ComponentResultRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("component_results")
    .insert(input)
    .select()
    .single();

  if (error) {
    throw new Error(`createComponentResult failed: ${error.message}`);
  }
  return data;
}

export async function listComponentResultsByAuditId(
  auditId: string
): Promise<ComponentResultRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("component_results")
    .select()
    .eq("audit_id", auditId);

  if (error) {
    throw new Error(`listComponentResultsByAuditId failed: ${error.message}`);
  }
  return data;
}
