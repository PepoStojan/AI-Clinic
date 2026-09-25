import { getSupabaseServerClient } from "../server";
import type { Database } from "../database.types";

export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
export type ReportInsert = Database["public"]["Tables"]["reports"]["Insert"];
export type ReportUpdate = Database["public"]["Tables"]["reports"]["Update"];

export async function createReport(input: ReportInsert): Promise<ReportRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("reports").insert(input).select().single();

  if (error) {
    throw new Error(`createReport failed: ${error.message}`);
  }
  return data;
}

export async function updateReport(id: string, patch: ReportUpdate): Promise<ReportRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("reports").update(patch).eq("id", id).select().single();

  if (error) {
    throw new Error(`updateReport failed: ${error.message}`);
  }
  return data;
}

/**
 * REPORT-001's rerun-safe write: reuse the audit's existing report row
 * (same report_version) and update it in place when one already exists;
 * otherwise create the first one at version 1. Keeps this the simplest
 * safe MVP strategy -- no report-versioning system, no duplicate logical
 * report per audit.
 */
export async function upsertReportForAudit(
  auditId: string,
  data: Omit<ReportInsert, "audit_id" | "report_version">
): Promise<ReportRow> {
  const existing = await getLatestReport(auditId);
  if (existing) {
    return updateReport(existing.id, data);
  }
  return createReport({ ...data, audit_id: auditId, report_version: 1 });
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
