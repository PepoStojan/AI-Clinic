import { getSupabaseServerClient } from "./server";

export const AUDIT_REPORTS_BUCKET = "audit-reports";

/**
 * Uploads (or overwrites, via `upsert`) a generated report PDF at a
 * deterministic path. PDF-001 always uploads to the SAME path for a given
 * report id, so a regenerate safely replaces the previous file instead of
 * creating an uncontrolled duplicate.
 */
export async function uploadReportPdf(storagePath: string, pdf: Buffer): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.storage.from(AUDIT_REPORTS_BUCKET).upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    throw new Error(`uploadReportPdf failed: ${error.message}`);
  }
}

/**
 * Returns a time-limited signed URL for a private report object.
 * The bucket has no public access policies; every read goes through
 * this server-side path.
 */
export async function getReportSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(AUDIT_REPORTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(`getReportSignedUrl failed: ${error?.message ?? "no data returned"}`);
  }
  return data.signedUrl;
}
