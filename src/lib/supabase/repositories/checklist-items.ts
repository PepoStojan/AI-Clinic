import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type ChecklistItemRow = Database["public"]["Tables"]["checklist_items"]["Row"];
export type ChecklistItemInsert = Database["public"]["Tables"]["checklist_items"]["Insert"];

export async function createChecklistItem(
  input: ChecklistItemInsert
): Promise<ChecklistItemRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("checklist_items").insert(input).select().single();

  if (error) {
    throw new Error(`createChecklistItem failed: ${error.message}`);
  }
  return data;
}

export async function listChecklistItemsByAuditId(auditId: string): Promise<ChecklistItemRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("checklist_items")
    .select()
    .eq("audit_id", auditId);

  if (error) {
    throw new Error(`listChecklistItemsByAuditId failed: ${error.message}`);
  }
  return data;
}
