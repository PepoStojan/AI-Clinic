import { getSupabaseServerClient } from "./server";

export const AUDIT_REPORTS_BUCKET = "audit-reports";

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
