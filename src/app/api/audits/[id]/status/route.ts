import { NextResponse } from "next/server";
import { getAuditById } from "@/lib/supabase/repositories/audits";
import { listComponentResultsByAuditId } from "@/lib/supabase/repositories/component-results";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { computeProgressSteps } from "@/lib/ui/audit-progress";

// UI-001: the one endpoint the Audit Detail page polls. Never returns
// secrets -- only already-public-within-the-app audit facts.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await getAuditById(id);
  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const [componentResults, report] = await Promise.all([
    listComponentResultsByAuditId(id),
    getLatestReport(id),
  ]);

  const componentStatuses = Object.fromEntries(componentResults.map((c) => [c.component_name, c.status]));

  const steps = computeProgressSteps({
    auditStatus: audit.status,
    componentStatuses,
    reportStatus: report?.status ?? null,
  });

  return NextResponse.json({
    audit: {
      id: audit.id,
      auditCode: audit.audit_code,
      companyName: audit.company_name,
      websiteUrl: audit.website_url,
      status: audit.status,
      createdAt: audit.created_at,
      completedAt: audit.completed_at,
    },
    steps,
    report: report
      ? {
          status: report.status,
          readyForPdf: report.ready_for_pdf,
          blockingReasons: report.blocking_reasons,
          pdfFilename:
            (report.canonical_report_json as { metadata?: { pdf_filename?: string } } | null)?.metadata
              ?.pdf_filename ?? null,
          pdfAvailable: report.status === "GENERATED" && Boolean(report.pdf_storage_path),
        }
      : null,
  });
}
