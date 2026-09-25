import { NextResponse } from "next/server";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { getReportSignedUrl } from "@/lib/supabase/storage";

// UI-001: download access. Reuses the existing private-storage
// signed-URL helper from INFRA-001 -- the bucket stays private; this
// route is the only thing that ever calls it, server-side.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
