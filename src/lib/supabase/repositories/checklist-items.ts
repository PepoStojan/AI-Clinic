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

/**
 * Bulk-inserts checklist rows idempotently: a row whose idempotency_key
 * already exists is left untouched instead of erroring the whole batch,
 * so checklist generation is safe to re-run for the same audit_id.
 */
export async function createChecklistItems(
  items: ChecklistItemInsert[]
): Promise<ChecklistItemRow[]> {
  if (items.length === 0) {
    return [];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("checklist_items")
    .upsert(items, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select();

  if (error) {
    throw new Error(`createChecklistItems failed: ${error.message}`);
  }
  return data;
}

export type ChecklistItemUpdate = Database["public"]["Tables"]["checklist_items"]["Update"];

/**
 * Updates the single checklist row identified by its idempotency_key
 * (audit_id + component + target + check_key) -- the same logical row a
 * retry must reuse, never a new one.
 */
export async function updateChecklistItemByIdempotencyKey(
  idempotencyKey: string,
  patch: ChecklistItemUpdate
): Promise<ChecklistItemRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("checklist_items")
    .update(patch)
    .eq("idempotency_key", idempotencyKey)
    .select()
    .single();

  if (error) {
    throw new Error(`updateChecklistItemByIdempotencyKey failed: ${error.message}`);
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
