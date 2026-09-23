import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type AuditRow = Database["public"]["Tables"]["audits"]["Row"];
export type AuditInsert = Database["public"]["Tables"]["audits"]["Insert"];

export async function createAudit(input: AuditInsert): Promise<AuditRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("audits").insert(input).select().single();

  if (error) {
    throw new Error(`createAudit failed: ${error.message}`);
  }
  return data;
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
