import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { getAuditById } from "@/lib/supabase/repositories/audits";
import { listComponentResultsByAuditId } from "@/lib/supabase/repositories/component-results";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { computeProgressSteps } from "@/lib/ui/audit-progress";
import { AuditDetailClient } from "./audit-detail-client";
import styles from "./audit-detail.module.css";

export const dynamic = "force-dynamic";

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await getAuditById(id);
  if (!audit) notFound();

  const [componentResults, report] = await Promise.all([
    listComponentResultsByAuditId(id),
    getLatestReport(id),
  ]);
  const componentStatuses = Object.fromEntries(componentResults.map((c) => [c.component_name, c.status]));

  const initial = {
    audit: {
      id: audit.id,
      auditCode: audit.audit_code,
      companyName: audit.company_name,
      websiteUrl: audit.website_url,
      contactName: audit.contact_name,
      contactEmail: audit.contact_email,
      status: audit.status,
      createdAt: audit.created_at,
      completedAt: audit.completed_at,
    },
    steps: computeProgressSteps({ auditStatus: audit.status, componentStatuses, reportStatus: report?.status ?? null }),
    report: report
      ? {
          status: report.status,
          readyForPdf: report.ready_for_pdf,
          blockingReasons: (report.blocking_reasons as string[]) ?? [],
          pdfFilename:
            (report.canonical_report_json as { metadata?: { pdf_filename?: string } } | null)?.metadata
              ?.pdf_filename ?? null,
          pdfAvailable: report.status === "GENERATED" && Boolean(report.pdf_storage_path),
        }
      : null,
  };

  return (
    <>
      <Header />
      <main className={`container ${styles.page}`}>
        <AuditDetailClient initial={initial} />
      </main>
    </>
  );
}
