import Link from "next/link";
import { Header } from "@/components/header";
import { listAudits } from "@/lib/supabase/repositories/audits";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { auditStatusColor, auditStatusLabel } from "@/lib/ui/status-colors";
import styles from "./audits-list.module.css";

export const dynamic = "force-dynamic";

export default async function AuditsListPage() {
  const audits = await listAudits();
  const reports = await Promise.all(audits.map((a) => getLatestReport(a.id)));

  return (
    <>
      <Header />
      <main className={`container ${styles.page}`}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>Audits</h1>
          <Link href="/new-audit" className={styles.newAuditButton}>
            New Audit
          </Link>
        </div>

        {audits.length === 0 ? (
          <div className={styles.empty}>
            <div>No audits yet.</div>
            <Link href="/new-audit" className={styles.emptyCta}>
              Run New Audit
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Website</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>PDF</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit, i) => {
                  const report = reports[i];
                  const pdfAvailable = report?.status === "GENERATED" && report.pdf_storage_path;
                  return (
                    <tr key={audit.id}>
                      <td className={styles.company}>{audit.company_name}</td>
                      <td className={styles.website}>{audit.website_url}</td>
                      <td>{new Date(audit.created_at).toLocaleDateString()}</td>
                      <td>
                        <span className={styles.statusBadge}>
                          <span className={styles.dot} style={{ background: auditStatusColor(audit.status) }} />
                          {auditStatusLabel(audit.status)}
                        </span>
                      </td>
                      <td>
                        {pdfAvailable ? (
                          <Link href={`/audits/${audit.id}`} className={styles.pdfLink}>
                            Download
                          </Link>
                        ) : (
                          <span className={styles.pdfDisabled}>Not available</span>
                        )}
                      </td>
                      <td>
                        <Link href={`/audits/${audit.id}`} className={styles.openLink}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
