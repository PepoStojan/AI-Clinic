import { NextResponse } from "next/server";
import { getAuditById } from "@/lib/supabase/repositories/audits";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { getReportSignedUrl } from "@/lib/supabase/storage";

// UI-001: download access. Reuses the existing private-storage
// signed-URL helper from INFRA-001 -- the bucket stays private; this
// route is the only thing that ever calls it, server-side.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // AUDIT-DELETE-001B: getLatestReport() queries `reports` directly by
  // audit_id and has no knowledge of deleted_at -- without this explicit
  // check, a deleted audit's PDF would still be downloadable via a direct
  // hit on this route even though it's hidden everywhere else. The
  // underlying storage object itself is never touched -- this only blocks
  // the app's own signed-URL hand-out.
  const audit = await getAuditById(id);
  if (!audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  const report = await getLatestReport(id);

  if (!report || report.status !== "GENERATED" || !report.pdf_storage_path) {
    return NextResponse.json({ error: "PDF is not available for this audit." }, { status: 404 });
  }

  try {
    const signedUrl = await getReportSignedUrl(report.pdf_storage_path);
    return NextResponse.redirect(signedUrl);
  } catch {
    return NextResponse.json({ error: "Could not generate a download link." }, { status: 500 });
  }
}
