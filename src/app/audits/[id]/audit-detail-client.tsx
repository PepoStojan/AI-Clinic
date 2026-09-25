"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { auditStatusColor, auditStatusLabel } from "@/lib/ui/status-colors";
import { isTerminalAuditStatus, type ProgressStep } from "@/lib/ui/audit-progress";
import { retryAuditAction, retryQueueAction, regeneratePdfAction } from "../actions";
import styles from "./audit-detail.module.css";

const POLL_INTERVAL_MS = 4000;

interface StatusSnapshot {
  audit: {
    id: string;
    auditCode: string;
    companyName: string;
    websiteUrl: string;
    contactName: string;
    contactEmail: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  };
  steps: ProgressStep[];
  report: {
    status: string;
    readyForPdf: boolean;
    blockingReasons: string[];
    pdfFilename: string | null;
    pdfAvailable: boolean;
  } | null;
}

export function AuditDetailClient({ initial }: { initial: StatusSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${initial.audit.id}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const data: StatusSnapshot = await res.json();
      setSnapshot(data);
    } catch {
      // Transient network hiccup -- next poll tick will retry.
    }
  }, [initial.audit.id]);

  useEffect(() => {
    if (isTerminalAuditStatus(snapshot.audit.status)) return;
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [snapshot.audit.status, poll]);

  const { audit, steps, report } = snapshot;
  const isRunning = !isTerminalAuditStatus(audit.status);

  function handleRetryQueue() {
    setActionError(null);
    startTransition(async () => {
      const result = await retryQueueAction(audit.id);
      if (!result.success) setActionError(result.error ?? "Failed to retry.");
      else poll();
    });
  }
  function handleRetryAudit() {
    setActionError(null);
    startTransition(async () => {
      const result = await retryAuditAction(audit.id);
      if (!result.success) setActionError(result.error ?? "Failed to retry.");
      else poll();
    });
  }
  function handleRegeneratePdf() {
    setActionError(null);
    startTransition(async () => {
      const result = await regeneratePdfAction(audit.id);
      if (!result.success) setActionError(result.error ?? "Failed to regenerate PDF.");
      else poll();
    });
  }

  return (
    <>
      <div className={styles.navRow}>
        <Link href="/audits" className={styles.backLink}>
          ← Back to Audits
        </Link>
        <div className={styles.breadcrumb}>
          <Link href="/audits" className={styles.breadcrumbLink}>
            Audits
          </Link>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span className={styles.breadcrumbCurrent}>{audit.companyName}</span>
        </div>
      </div>

      <div className={styles.topCard}>
        <div className={styles.company}>{audit.companyName}</div>
        <div className={styles.meta}>
          {audit.websiteUrl} · {audit.auditCode} · {new Date(audit.createdAt).toLocaleDateString()}
        </div>
        <div className={styles.statusRow}>
          <span className={styles.dot} style={{ background: auditStatusColor(audit.status) }} />
          <span className={styles.statusLabel}>{auditStatusLabel(audit.status)}</span>
        </div>
      </div>

      {audit.status === "CREATED" && (
        <div className={styles.issueBlock}>
          <div className={styles.issueTitle}>Queueing did not start</div>
          <p>The audit was created, but starting the automated run failed. You can retry.</p>
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={handleRetryQueue} disabled={pending}>
              {pending ? "Retrying..." : "Retry Queueing"}
            </button>
          </div>
        </div>
      )}

      {audit.status === "COMPLETED" ? (
        <div className={styles.completedBlock}>
          <div className={styles.completedTitle}>Audit Complete</div>
          {report?.pdfFilename && <div className={styles.filename}>{report.pdfFilename}</div>}
          <div className={styles.contactBlock}>
            <div className={styles.contactRow}>
              <span className={styles.contactLabel}>Contact name</span>
              <span className={styles.contactValue}>{audit.contactName}</span>
            </div>
            <div className={styles.contactRow}>
              <span className={styles.contactLabel}>Email</span>
              <a className={styles.contactLink} href={`mailto:${audit.contactEmail}`}>
                {audit.contactEmail}
              </a>
            </div>
            <div className={styles.contactRow}>
              <span className={styles.contactLabel}>Company</span>
              <span className={styles.contactValue}>{audit.companyName}</span>
            </div>
            <div className={styles.contactRow}>
              <span className={styles.contactLabel}>Website</span>
              <a className={styles.contactLink} href={audit.websiteUrl} target="_blank" rel="noreferrer">
                {audit.websiteUrl}
              </a>
            </div>
          </div>
          <div className={styles.actions}>
            <a className={styles.primaryButton} href={`/api/audits/${audit.id}/pdf`} target="_blank" rel="noreferrer">
              Download PDF
            </a>
            <Link href="/new-audit" className={styles.secondaryButton}>
              Run New Audit
            </Link>
          </div>
        </div>
      ) : (
        <>
          {isRunning && (
            <div className={styles.progressAnimation}>
              <DotLottieReact src="/animations/ai-audit-flow.lottie" autoplay loop />
            </div>
          )}
          <div className={styles.stepsCard}>
            {steps.map((step) => (
            <div className={styles.step} key={step.label}>
              <span className={styles.stepIcon} style={{ background: stepIconBg(step.state) }}>
                {step.state === "Completed" && (
                  <span className={styles.stepCheck} style={{ color: stepColor(step.state) }}>
                    ✓
                  </span>
                )}
                {step.state === "Running" && (
                  <span
                    className={`${styles.stepDot} ${styles.pulse}`}
                    style={{ background: stepColor(step.state) }}
                  />
                )}
                {step.state === "Failed" && (
                  <span className={styles.stepBang} style={{ color: stepColor(step.state) }}>
                    !
                  </span>
                )}
                {(step.state === "Pending" || step.state === "N/A") && (
                  <span className={styles.stepDotSmall} style={{ background: stepColor(step.state) }} />
                )}
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
              <span className={styles.stepState}>{step.state}</span>
            </div>
            ))}
          </div>
        </>
      )}

      {(audit.status === "BLOCKED" || audit.status === "PARTIAL" || audit.status === "FAILED") && (
        <div className={styles.issueBlock}>
          <div className={audit.status === "FAILED" ? `${styles.issueTitle} ${styles.issueTitleDanger}` : styles.issueTitle}>
            {audit.status === "FAILED"
              ? "The audit could not complete due to a system error."
              : audit.status === "PARTIAL"
                ? "The audit completed with some checks unavailable."
                : "The report could not be finalized yet."}
          </div>
          {report && report.blockingReasons.length > 0 && (
            <ul className={styles.reasonList}>
              {report.blockingReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={handleRetryAudit} disabled={pending}>
              {pending ? "Retrying..." : "Retry Audit"}
            </button>
            {report?.readyForPdf && (
              <button className={styles.secondaryButton} onClick={handleRegeneratePdf} disabled={pending}>
                Regenerate PDF
              </button>
            )}
          </div>
        </div>
      )}

      {actionError && <p className={styles.issueTitle}>{actionError}</p>}
      {isRunning && <p className={styles.meta} style={{ marginTop: 12 }}>Checking for updates...</p>}
    </>
  );
}

function stepColor(state: string): string {
  switch (state) {
    case "Completed":
      return "#1F9D6B";
    case "Running":
      return "#28A8DF";
    case "Failed":
      return "#D9463B";
    case "N/A":
      return "#94A3B8";
    default:
      return "#CBD5E1";
  }
}

function stepIconBg(state: string): string {
  switch (state) {
    case "Completed":
      return "rgba(31, 157, 107, 0.12)";
    case "Running":
      return "rgba(40, 168, 223, 0.12)";
    case "Failed":
      return "rgba(217, 70, 59, 0.12)";
    default:
      return "#EEF0F3";
  }
}
