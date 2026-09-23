import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
export type ReportInsert = Database["public"]["Tables"]["reports"]["Insert"];

export async function createReport(input: ReportInsert): Promise<ReportRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("reports").insert(input).select().single();

  if (error) {
    throw new Error(`createReport failed: ${error.message}`);
  }
  return data;
}

export async function getLatestReport(auditId: string): Promise<ReportRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select()
    .eq("audit_id", auditId)
    .order("report_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestReport failed: ${error.message}`);
  }
  return data;
}
