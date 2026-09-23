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

/**
 * Insert-or-update the single component_results row for (audit_id,
 * component_name) -- the schema's unique constraint on that pair means a
 * retry of the whole component reuses the same logical record instead of
 * creating a duplicate.
 */
export async function upsertComponentResult(
  input: ComponentResultInsert
): Promise<ComponentResultRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("component_results")
    .upsert(input, { onConflict: "audit_id,component_name" })
    .select()
    .single();

  if (error) {
    throw new Error(`upsertComponentResult failed: ${error.message}`);
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
