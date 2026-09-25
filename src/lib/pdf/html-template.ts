// PDF-001: pure HTML/CSS template builder. Reads ONLY the canonical
// report object (Build Spec section 25: "No database/business decisions
// inside renderer") -- presentation only, no analysis, no reclassification.
// No remote asset dependency (Google Fonts etc.) -- a close system-font
// fallback stack is used instead, so PDF generation never depends on
// network access.

import type { CanonicalReport } from "../report/types";

const BRAND_BLUE = "#28A8DF";
const DARK_NAVY = "#12263A";
const NEUTRAL_BG = "#F5F7FA";
const NEUTRAL_BORDER = "#E2E8F0";
const MUTED_TEXT = "#64748B";
const GOOD = "#1F9D6B"; // restrained green -- never a bright/alarming red anywhere in this report
const ATTENTION = "#C08A1E"; // restrained amber for a confirmed gap -- not red, no severity language
const NEUTRAL_DOT = "#94A3B8"; // unavailable/neutral (No Result, N/A, Cannot Verify)

function escapeHtml(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}

// Every canonical status string this report ever displays, mapped to one
// of exactly 3 dot colors -- good / attention / neutral. No red, no
// severity/priority language, no "critical" framing anywhere.
const GOOD_STATUSES = new Set([
  "Accurate",
  "Strong Mention",
  "Mentioned",
  "Cited Only",
  "Found",
  "Yes",
  "Allowed",
]);
const NEUTRAL_STATUSES = new Set([
  "No Result",
  "N/A — Could Not Verify",
  "N/A",
  "Cannot Verify",
  "Not Found", // robots.txt/llms.txt file absence specifically -- handled per-section, see llmsTxtStatusDot
  "—",
]);

function statusDotColor(status: string): string {
  if (GOOD_STATUSES.has(status)) return GOOD;
  if (NEUTRAL_STATUSES.has(status)) return NEUTRAL_DOT;
  return ATTENTION; // everything else is a confirmed gap-shaped status (Blocked, Not Found (platform), Ambiguous, ...)
}

function statusBadge(status: string | null | undefined, colorOverride?: string): string {
  const label = status ?? "—";
  const color = colorOverride ?? statusDotColor(label);
  return `<span class="badge"><span class="dot" style="background:${color}"></span>${escapeHtml(label)}</span>`;
}

function card(title: string, bodyHtml: string): string {
  return `<div class="card"><h3>${escapeHtml(title)}</h3>${bodyHtml}</div>`;
}

// -- Cover -------------------------------------------------------------

function renderCover(report: CanonicalReport): string {
  const { audit_info } = report;
  return `
    <section class="page cover">
      <div class="cover-brand">AI-Clinic</div>
      <div class="cover-secondary">Developed by smartclick.agency</div>
      <div class="cover-title">AI Visibility Audit</div>
      <div class="cover-company">${escapeHtml(audit_info.company_name)}</div>
      <div class="cover-website">${escapeHtml(audit_info.website_url)}</div>
      <div class="cover-meta">
        <div>Audit date: ${formatDate(audit_info.created_at)}</div>
        <div>Audit code: ${escapeHtml(audit_info.audit_code)}</div>
      </div>
    </section>`;
}

// -- Executive Summary ---------------------------------------------------

function renderExecutiveSummary(report: CanonicalReport): string {
  const c = report.executive_fact_counts;

  const brandCard = card(
    "Brand Recognition",
    `<div class="metric">${c.brand_recognition.recognized_by} of ${c.brand_recognition.total_providers} systems recognized the brand</div>
     <div class="metric-sub">Accuracy confirmed: ${c.brand_recognition.accuracy_confirmed}</div>`
  );

  const promptCard = card(
    "Prompt Visibility",
    c.prompt_visibility.visibility_percentage === null
      ? `<div class="metric">Not enough valid checks to measure</div>`
      : `<div class="metric">${c.prompt_visibility.visibility_percentage}% visibility</div>
         <div class="metric-sub">${c.prompt_visibility.positive_checks} of ${c.prompt_visibility.valid_checks} valid checks positive</div>`
  );

  const socialCard = card(
    "Social Profiles",
    `<div class="metric">${c.social_profiles.profiles_found} of ${c.social_profiles.total_platforms} platforms found</div>
     <div class="metric-sub">${c.social_profiles.profiles_connected} connected to the website</div>`
  );

  const directoriesCard = card(
    "Third-Party Listings",
    `<div class="metric">${c.directories.listings_found} of ${c.directories.total_directories} directories found</div>`
  );

  // Exact wording rule: never imply universal access when any crawler is
  // Blocked, Restricted, or Cannot Verify.
  const t = c.technical_accessibility;
  const technicalHeadline =
    t.blocked === 0 && t.restricted === 0 && t.cannot_verify === 0
      ? `All ${t.total_crawlers} audited crawlers are allowed`
      : `${t.allowed} allowed · ${t.restricted} restricted · ${t.blocked} blocked${t.cannot_verify > 0 ? ` · ${t.cannot_verify} could not verify` : ""}`;
  const technicalCard = card("AI Crawler Accessibility", `<div class="metric">${escapeHtml(technicalHeadline)}</div>`);

  return `
    <section class="page">
      <h2>Executive Summary</h2>
      <div class="grid grid-3">
        ${brandCard}${promptCard}${socialCard}${directoriesCard}${technicalCard}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        ${card("Confirmed Gaps", `<div class="metric">${c.confirmed_gaps_count}</div>`)}
        ${card("Checks Unavailable", `<div class="metric">${c.checks_unavailable_count}</div>`)}
      </div>
    </section>`;
}

// -- Brand Recognition ---------------------------------------------------

interface BrandProviderFinding {
  provider: string;
  recognitionStatus: string;
  evidence?: string;
  source?: string;
}

function renderBrandRecognition(report: CanonicalReport): string {
  const findings = report.component_results.brand_recognition?.findings as
    | { providers?: BrandProviderFinding[] }
    | undefined;
  const providers = findings?.providers ?? [];

  const rows = providers
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.provider)}</td>
        <td>${statusBadge(p.recognitionStatus)}</td>
        <td class="wrap">${escapeHtml(p.evidence ?? "")}</td>
        <td class="wrap">${escapeHtml(p.source ?? "")}</td>
      </tr>`
    )
    .join("");

  return `
    <section class="page">
      <h2>Brand Recognition</h2>
      <table>
        <thead><tr><th>System</th><th>Status</th><th>Evidence</th><th>Source</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="empty">No provider results available.</td></tr>`}</tbody>
      </table>
    </section>`;
}

// -- Prompt Visibility -----------------------------------------------------

interface PromptVisibilityFinding {
  targetId?: string;
  prompt: string;
  provider: string;
  mentionClass: string;
  evidence?: string;
}

function renderPromptVisibility(report: CanonicalReport): string {
  const findings = report.component_results.prompt_visibility?.findings as
    | { providers?: PromptVisibilityFinding[] }
    | undefined;
  const rows = findings?.providers ?? [];
  const pct = report.executive_fact_counts.prompt_visibility.visibility_percentage;

  const body = rows
    .map(
      (r) => `
      <tr>
        <td class="wrap">${escapeHtml(r.prompt)}</td>
        <td>${escapeHtml(r.provider)}</td>
        <td>${statusBadge(r.mentionClass)}</td>
        <td class="wrap">${escapeHtml(r.evidence ?? "")}</td>
      </tr>`
    )
    .join("");

  return `
    <section class="page">
      <h2>Prompt Visibility</h2>
      <div class="metric-sub" style="margin-bottom:12px">
        ${pct === null ? "Not enough valid checks to measure overall visibility." : `Overall visibility: ${pct}%`}
      </div>
      <table>
        <thead><tr><th>Prompt</th><th>Provider</th><th>Result</th><th>Evidence</th></tr></thead>
        <tbody>${body || `<tr><td colspan="4" class="empty">No prompt visibility results available.</td></tr>`}</tbody>
      </table>
    </section>`;
}

// -- Social + Third-Party Presence ----------------------------------------

interface SocialFinding {
  platform: string;
  profileStatus: string;
  connected: string;
  profileUrl?: string | null;
}

interface DirectoryFinding {
  platform: string;
  status: string;
  listingUrl?: string | null;
}

function renderSocialAndDirectories(report: CanonicalReport): string {
  const socialFindings = report.component_results.social_profiles?.findings as
    | { platforms?: SocialFinding[] }
    | undefined;
  const directoryFindings = report.component_results.directories?.findings as
    | { platforms?: DirectoryFinding[] }
    | undefined;

  const socialRows = (socialFindings?.platforms ?? [])
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.platform)}</td>
        <td>${statusBadge(p.profileStatus)}</td>
        <td>${statusBadge(p.connected)}</td>
        <td class="wrap">${p.profileUrl ? escapeHtml(p.profileUrl) : "—"}</td>
      </tr>`
    )
    .join("");

  const directoryRows = (directoryFindings?.platforms ?? [])
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.platform)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="wrap">${p.listingUrl ? escapeHtml(p.listingUrl) : "—"}</td>
      </tr>`
    )
    .join("");

  return `
    <section class="page">
      <h2>Social Profiles</h2>
      <table>
        <thead><tr><th>Platform</th><th>Profile</th><th>Connected</th><th>URL</th></tr></thead>
        <tbody>${socialRows || `<tr><td colspan="4" class="empty">No social profile results available.</td></tr>`}</tbody>
      </table>

      <h2 style="margin-top:28px">Third-Party Listings</h2>
      <table>
        <thead><tr><th>Platform</th><th>Status</th><th>URL</th></tr></thead>
        <tbody>${directoryRows || `<tr><td colspan="3" class="empty">No directory results available.</td></tr>`}</tbody>
      </table>
    </section>`;
}

// -- Technical Accessibility ------------------------------------------------

interface CrawlerFinding {
  crawler: string;
  userAgent: string;
  status: string;
  reason?: string;
}

function renderTechnical(report: CanonicalReport): string {
  const findings = report.component_results.technical_accessibility?.findings as
    | { crawlers?: CrawlerFinding[]; robotsTxtStatus?: string; llmsTxtStatus?: string }
    | undefined;
  const crawlers = findings?.crawlers ?? [];

  const rows = crawlers
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.userAgent)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="wrap">${escapeHtml(c.reason ?? "")}</td>
      </tr>`
    )
    .join("");

  // llms.txt absence is explicitly never presented as a problem -- always
  // the neutral dot, regardless of the generic status-color rule.
  const llmsStatus = findings?.llmsTxtStatus ?? "—";
  const robotsStatus = findings?.robotsTxtStatus ?? "—";

  return `
    <section class="page">
      <h2>Technical AI Accessibility</h2>
      <table>
        <thead><tr><th>Crawler</th><th>Status</th><th>Rule / Reason</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" class="empty">No crawler results available.</td></tr>`}</tbody>
      </table>
      <div class="grid grid-2" style="margin-top:16px">
        ${card("robots.txt", statusBadge(robotsStatus, robotsStatus === "Not Found" || robotsStatus === "Cannot Verify" ? NEUTRAL_DOT : undefined))}
        ${card("llms.txt", `${statusBadge(llmsStatus, NEUTRAL_DOT)}<div class="metric-sub">Optional and experimental -- absence is not a required fix.</div>`)}
      </div>
    </section>`;
}

// -- Key Gaps -----------------------------------------------------------

function renderGapCard(gap: CanonicalReport["grouped_gaps"][number], interpretation: CanonicalReport["interpretations"][number] | undefined): string {
  const observed = interpretation?.what_we_observed ?? gap.deterministic_reason;
  const suggests = interpretation?.what_this_suggests ?? "";
  const consider = interpretation?.what_to_consider ?? "";

  return `
    <div class="gap-card">
      <div class="gap-header">
        <div class="gap-title">${escapeHtml(gap.title)}</div>
        <div class="gap-badge">${gap.affected_count} affected check${gap.affected_count === 1 ? "" : "s"}</div>
      </div>
      <div class="gap-evidence">${escapeHtml(gap.deterministic_reason)}</div>
      <div class="gap-columns">
        <div><div class="gap-col-label">What we observed</div><div class="wrap">${escapeHtml(observed)}</div></div>
        <div><div class="gap-col-label">What this suggests</div><div class="wrap">${escapeHtml(suggests)}</div></div>
        <div><div class="gap-col-label">What to consider</div><div class="wrap">${escapeHtml(consider)}</div></div>
      </div>
    </div>`;
}

function renderKeyGaps(report: CanonicalReport): string {
  if (report.grouped_gaps.length === 0) {
    return `
      <section class="page">
        <h2>Key Gaps</h2>
        <div class="empty-state">No confirmed gaps were identified in the audited checks.</div>
      </section>`;
  }

  const interpretationsById = new Map(report.interpretations.map((i) => [i.gap_id, i]));
  const cards = report.grouped_gaps.map((gap) => renderGapCard(gap, interpretationsById.get(gap.gap_id))).join("");

  return `
    <section class="page">
      <h2>Key Gaps</h2>
      <div class="gap-list">${cards}</div>
    </section>`;
}

// -- Closing -----------------------------------------------------------

function renderClosing(report: CanonicalReport): string {
  const c = report.executive_fact_counts;
  return `
    <section class="page closing">
      <h2>Closing</h2>
      <p class="wrap">
        This audit reviewed brand recognition across ${c.brand_recognition.total_providers} AI systems, prompt visibility,
        presence across ${c.social_profiles.total_platforms} social platforms and ${c.directories.total_directories} third-party
        directories, and accessibility for ${c.technical_accessibility.total_crawlers} AI crawlers.
        ${c.confirmed_gaps_count} confirmed finding${c.confirmed_gaps_count === 1 ? "" : "s"} ${c.confirmed_gaps_count === 1 ? "is" : "are"} detailed above.
      </p>
      <div class="cta">${escapeHtml(report.closing.cta_text)}</div>
      <div class="closing-brand">AI-Clinic · Developed by smartclick.agency</div>
    </section>`;
}

// -- Document ------------------------------------------------------------

const STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Poppins', -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: ${DARK_NAVY};
    background: #FFFFFF;
    font-size: 12px;
    line-height: 1.5;
  }
  .page {
    padding: 36px 40px;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; }
  h2 { font-size: 20px; font-weight: 600; color: ${DARK_NAVY}; margin: 0 0 16px; }
  h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: ${DARK_NAVY}; }
  .wrap { overflow-wrap: break-word; word-break: break-word; }

  .cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    background: linear-gradient(180deg, #FFFFFF 0%, ${NEUTRAL_BG} 100%);
  }
  .cover-brand { font-size: 28px; font-weight: 700; color: ${BRAND_BLUE}; letter-spacing: 0.5px; }
  .cover-secondary { font-size: 11px; color: ${MUTED_TEXT}; margin-top: 4px; }
  .cover-title { font-size: 22px; font-weight: 500; color: ${DARK_NAVY}; margin-top: 56px; }
  .cover-company { font-size: 30px; font-weight: 700; margin-top: 12px; }
  .cover-website { font-size: 14px; color: ${MUTED_TEXT}; margin-top: 6px; overflow-wrap: break-word; max-width: 80%; }
  .cover-meta { margin-top: 48px; font-size: 12px; color: ${MUTED_TEXT}; }
  .cover-meta div { margin-top: 4px; }

  .grid { display: flex; gap: 14px; flex-wrap: wrap; }
  .grid-2 > .card { flex: 1 1 45%; }
  .grid-3 > .card { flex: 1 1 30%; }

  .card {
    background: ${NEUTRAL_BG};
    border: 1px solid ${NEUTRAL_BORDER};
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 1px 2px rgba(18,38,58,0.04);
    break-inside: avoid;
  }
  .metric { font-size: 16px; font-weight: 600; color: ${DARK_NAVY}; }
  .metric-sub { font-size: 11px; color: ${MUTED_TEXT}; margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: ${MUTED_TEXT};
    border-bottom: 1px solid ${NEUTRAL_BORDER};
    padding: 8px 10px;
  }
  td {
    padding: 9px 10px;
    border-bottom: 1px solid ${NEUTRAL_BORDER};
    font-size: 11.5px;
    vertical-align: top;
  }
  td.empty { color: ${MUTED_TEXT}; text-align: center; padding: 20px; }

  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }

  .gap-list { display: flex; flex-direction: column; gap: 14px; }
  .gap-card {
    background: #FFFFFF;
    border: 1px solid ${NEUTRAL_BORDER};
    border-radius: 14px;
    padding: 16px 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .gap-header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .gap-title { font-size: 14px; font-weight: 600; color: ${DARK_NAVY}; }
  .gap-badge {
    font-size: 10px;
    color: ${ATTENTION};
    background: rgba(192,138,30,0.1);
    border-radius: 8px;
    padding: 3px 8px;
    white-space: nowrap;
  }
  .gap-evidence { font-size: 11px; color: ${MUTED_TEXT}; margin-top: 6px; }
  .gap-columns {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .gap-columns > div { flex: 1 1 30%; min-width: 150px; }
  .gap-col-label {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: ${BRAND_BLUE};
    font-weight: 600;
    margin-bottom: 4px;
  }

  .empty-state {
    text-align: center;
    color: ${MUTED_TEXT};
    padding: 60px 20px;
    font-size: 13px;
  }

  .closing { display: flex; flex-direction: column; justify-content: center; height: 100vh; }
  .cta { font-size: 16px; font-weight: 600; color: ${BRAND_BLUE}; margin-top: 24px; }
  .closing-brand { font-size: 10.5px; color: ${MUTED_TEXT}; margin-top: 40px; }
`;

/**
 * Builds the complete report HTML document from the canonical report
 * object only -- the sole content input, per Build Spec section 25.
 */
export function buildReportHtml(report: CanonicalReport): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report.audit_info.company_name)} — AI Visibility Audit</title>
<style>${STYLES}</style>
</head>
<body>
${renderCover(report)}
${renderExecutiveSummary(report)}
${renderBrandRecognition(report)}
${renderPromptVisibility(report)}
${renderSocialAndDirectories(report)}
${renderTechnical(report)}
${renderKeyGaps(report)}
${renderClosing(report)}
</body>
</html>`;
}
