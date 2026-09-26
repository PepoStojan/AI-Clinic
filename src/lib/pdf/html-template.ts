// PDF-001 / PDF-DESIGN-002: pure HTML/CSS template builder. Reads ONLY the
// canonical report object (Build Spec section 25: "No database/business
// decisions inside renderer") -- presentation only, no analysis, no
// reclassification. No remote asset dependency (Google Fonts, provider
// logo hotlinks, etc.) -- a close system-font fallback stack plus locally
// embedded base64 logo assets (see logo-assets.ts) are used instead, so
// PDF generation never depends on network access inside the Trigger.dev
// Playwright environment.

import type { CanonicalReport } from "../report/types";
import {
  CHATGPT_LOGO_DATA_URI,
  CLAUDE_LOGO_DATA_URI,
  GEMINI_LOGO_DATA_URI,
  GOOGLE_AI_LOGO_DATA_URI,
  LINKEDIN_LOGO_DATA_URI,
  FACEBOOK_LOGO_DATA_URI,
  INSTAGRAM_LOGO_DATA_URI,
  X_TWITTER_LOGO_DATA_URI,
  YOUTUBE_LOGO_DATA_URI,
  TIKTOK_LOGO_DATA_URI,
  THREADS_LOGO_DATA_URI,
  REDDIT_LOGO_DATA_URI,
} from "./logo-assets";

const BRAND_BLUE = "#28A8DF";
const DARK_NAVY = "#12263A";
const NEUTRAL_BG = "#F5F7FA";
const NEUTRAL_BORDER = "#E2E8F0";
const NEUTRAL_BORDER_SUBTLE = "#ECEEF1";
const MUTED_TEXT = "#64748B";
const LABEL_GRAY = "#94A3B8";
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

// -- Provider display (logo + label) -- presentation-only lookup, never
// changes the underlying provider key or any classification/status value.
interface ProviderDisplay {
  label: string;
  logo: string | null;
  // PDF-BRAND-005: Gemini and Claude's source logos render visually smaller
  // than ChatGPT/Google AI at the same shared box size -- this opts only
  // those two providers into a larger logo box (see .provider-logo-emphasize),
  // never changing the shared size used by every other provider.
  emphasizeLogo?: boolean;
}

const PROVIDER_DISPLAY: Record<string, ProviderDisplay> = {
  openai: { label: "ChatGPT", logo: CHATGPT_LOGO_DATA_URI },
  chatgpt: { label: "ChatGPT", logo: CHATGPT_LOGO_DATA_URI },
  claude: { label: "Claude", logo: CLAUDE_LOGO_DATA_URI, emphasizeLogo: true },
  gemini: { label: "Gemini", logo: GEMINI_LOGO_DATA_URI, emphasizeLogo: true },
  google: { label: "Google AI", logo: GOOGLE_AI_LOGO_DATA_URI },
  google_ai: { label: "Google AI", logo: GOOGLE_AI_LOGO_DATA_URI },
};

function providerDisplay(providerKey: string): ProviderDisplay {
  return PROVIDER_DISPLAY[providerKey.toLowerCase()] ?? { label: providerKey, logo: null };
}

function providerLogo(display: ProviderDisplay): string {
  if (display.logo) {
    const logoClass = display.emphasizeLogo ? "provider-logo provider-logo-emphasize" : "provider-logo";
    return `<img class="${logoClass}" src="${display.logo}" alt="${escapeHtml(display.label)}" />`;
  }
  return `<div class="provider-logo-fallback">${escapeHtml(display.label.slice(0, 1))}</div>`;
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
  "Present", // SOCIAL-LOGIC-002 display mapping -- Found + Connected Yes only
]);
const NEUTRAL_STATUSES = new Set([
  "No Result",
  "N/A — Could Not Verify",
  "N/A",
  "Cannot Verify",
  "Not Found", // robots.txt/llms.txt file absence specifically -- handled per-section, see llmsTxtStatusDot
  "Could Not Verify", // SOCIAL-LOGIC-002 display mapping -- neutral, never shown as Missing
  "—",
]);

function statusDotColor(status: string): string {
  if (GOOD_STATUSES.has(status)) return GOOD;
  if (NEUTRAL_STATUSES.has(status)) return NEUTRAL_DOT;
  return ATTENTION; // everything else is a confirmed gap-shaped status (Blocked, Not Found (platform), Ambiguous, ...)
}

function tintFor(color: string): string {
  if (color === GOOD) return "rgba(31,157,107,0.12)";
  if (color === ATTENTION) return "rgba(192,138,30,0.12)";
  return "#EEF0F3";
}

function statusBadge(status: string | null | undefined, colorOverride?: string): string {
  const label = status ?? "—";
  const color = colorOverride ?? statusDotColor(label);
  const bg = tintFor(color);
  return `<span class="badge" style="background:${bg}"><span class="dot" style="background:${color}"></span>${escapeHtml(label)}</span>`;
}

function card(title: string, bodyHtml: string): string {
  return `<div class="card"><h3>${escapeHtml(title)}</h3>${bodyHtml}</div>`;
}

// -- Cover -------------------------------------------------------------

// SmartClick-style hero cover (PDF-COVER-003). Decorative composition is
// pure CSS (no images/SVGs) so PDF generation keeps zero external asset
// dependencies -- the "AI Recognition / Prompt Visibility / Crawler Access
// / Brand Presence" labels below are static decoration, never derived from
// report data, and must never be read as real findings/scores.
function renderCover(report: CanonicalReport): string {
  const { audit_info } = report;
  return `
    <section class="page cover">
      <div class="cover-grid"></div>
      <div class="cover-glow"></div>
      <div class="cover-top">
        <div class="cover-brand">AI-Clinic</div>
        <div class="cover-secondary">Developed by smartclick.agency</div>
      </div>
      <div class="cover-body">
        <div class="cover-left">
          <div class="cover-title">AI Visibility Audit</div>
          <div class="cover-tagline">Understanding how AI systems recognize, reference, and access your brand.</div>
          <div class="cover-client">
            <div class="cover-company">${escapeHtml(audit_info.company_name)}</div>
            <div class="cover-website">${escapeHtml(audit_info.website_url)}</div>
          </div>
        </div>
        <div class="cover-right">
          <div class="cover-card cover-card-a">
            <span class="cover-card-dot"></span>
            <span class="cover-card-label">AI Recognition</span>
          </div>
          <div class="cover-card cover-card-b">
            <span class="cover-card-dot cover-card-dot-accent"></span>
            <span class="cover-card-label">Prompt Visibility</span>
          </div>
          <div class="cover-card cover-card-c">
            <span class="cover-card-dot"></span>
            <span class="cover-card-label">Crawler Access</span>
          </div>
          <div class="cover-card cover-card-d">
            <span class="cover-card-dot"></span>
            <span class="cover-card-label">Brand Presence</span>
          </div>
          <svg class="cover-connectors" viewBox="0 0 320 360" preserveAspectRatio="none">
            <line x1="120" y1="70" x2="230" y2="150" />
            <line x1="230" y1="150" x2="90" y2="240" />
            <line x1="90" y1="240" x2="220" y2="310" />
          </svg>
        </div>
      </div>
      <div class="cover-footer">
        <div class="cover-divider"></div>
        <div class="cover-meta">
          <div>Audit date · ${formatDate(audit_info.created_at)}</div>
          <div>Audit code · ${escapeHtml(audit_info.audit_code)}</div>
        </div>
      </div>
    </section>`;
}

// -- Executive Summary ---------------------------------------------------

function statCard(label: string, value: string, sub?: string): string {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ""}
    </div>`;
}

function renderExecutiveSummary(report: CanonicalReport): string {
  const c = report.executive_fact_counts;

  const brandCard = statCard(
    "Brand Recognition",
    `${c.brand_recognition.recognized_by} / ${c.brand_recognition.total_providers}`,
    `systems recognized the brand · ${c.brand_recognition.accuracy_confirmed} accuracy confirmed`
  );

  const promptCard =
    c.prompt_visibility.visibility_percentage === null
      ? statCard("Prompt Visibility", "—", "Not enough valid checks to measure")
      : statCard(
          "Prompt Visibility",
          `${c.prompt_visibility.visibility_percentage}%`,
          `${c.prompt_visibility.positive_checks} of ${c.prompt_visibility.valid_checks} valid checks positive`
        );

  // SOCIAL-LOGIC-002: the headline must reflect PRESENT (Found + Connected
  // Yes) profiles only -- a discovered-but-unconnected profile is never
  // "present." profiles_found is shown only as secondary discovery context.
  const socialCard = statCard(
    "Social Profiles",
    `${c.social_profiles.profiles_connected} / ${c.social_profiles.total_platforms}`,
    `profiles present · ${c.social_profiles.profiles_found} discovered`
  );

  const directoriesCard = statCard(
    "Third-Party Listings",
    `${c.directories.listings_found} / ${c.directories.total_directories}`,
    "directories found"
  );

  // Exact wording rule: never imply universal access when any crawler is
  // Blocked, Restricted, or Cannot Verify.
  const t = c.technical_accessibility;
  const technicalHeadline =
    t.blocked === 0 && t.restricted === 0 && t.cannot_verify === 0
      ? `All ${t.total_crawlers} audited crawlers are allowed`
      : `${t.allowed} allowed · ${t.restricted} restricted · ${t.blocked} blocked${t.cannot_verify > 0 ? ` · ${t.cannot_verify} could not verify` : ""}`;
  const technicalCard = statCard("AI Crawler Accessibility", technicalHeadline);

  return `
    <section class="page">
      <div class="section-eyebrow">Executive Summary</div>
      <h2 class="section-heading">Where ${escapeHtml(report.audit_info.company_name)} stands with AI systems</h2>
      <div class="stat-grid stat-grid-3">
        ${brandCard}${promptCard}${socialCard}
      </div>
      <div class="stat-grid stat-grid-2" style="margin-top:14px">
        ${directoriesCard}${technicalCard}
      </div>
      <div class="highlight-row">
        <div class="highlight-tile">
          <div class="highlight-value">${c.confirmed_gaps_count}</div>
          <div class="highlight-label">Confirmed Gaps</div>
        </div>
        <div class="highlight-tile">
          <div class="highlight-value highlight-value-muted">${c.checks_unavailable_count}</div>
          <div class="highlight-label">Checks Unavailable</div>
        </div>
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

  const cards = providers
    .map((p) => {
      const display = providerDisplay(p.provider);
      return `
      <div class="br-card">
        <div class="br-top">
          ${providerLogo(display)}
          <div class="br-name">${escapeHtml(display.label)}</div>
          ${statusBadge(p.recognitionStatus)}
        </div>
        ${p.evidence ? `<div class="br-evidence wrap">${escapeHtml(p.evidence)}</div>` : ""}
        ${p.source ? `<div class="br-source wrap">Source: ${escapeHtml(p.source)}</div>` : ""}
      </div>`;
    })
    .join("");

  return `
    <section class="page">
      <div class="section-eyebrow">Brand Recognition</div>
      <h2 class="section-heading">Do AI systems know who you are</h2>
      <div class="br-list">${cards || `<div class="empty-state">No provider results available.</div>`}</div>
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

  const targetsById = new Map(report.audit_info.audited_targets.map((t) => [t.id, t]));
  const multiTarget = report.audit_info.audited_targets.length > 1;

  // Group the flat findings array by prompt (+ target, so the same prompt
  // audited against two different targets stays separate) -- a render-time
  // grouping only; the underlying findings array and every field on each
  // row are untouched.
  const groups = new Map<string, { prompt: string; targetId?: string; rows: PromptVisibilityFinding[] }>();
  for (const r of rows) {
    const key = `${r.targetId ?? ""}::${r.prompt}`;
    const existing = groups.get(key);
    if (existing) existing.rows.push(r);
    else groups.set(key, { prompt: r.prompt, targetId: r.targetId, rows: [r] });
  }

  const cards = Array.from(groups.values())
    .map((g) => {
      const target = g.targetId ? targetsById.get(g.targetId) : undefined;
      const targetLabel = multiTarget && target ? target.name || target.url : null;

      const providerRows = g.rows
        .map((r) => {
          const display = providerDisplay(r.provider);
          return `
          <div class="pv-row">
            ${providerLogo(display)}
            <div class="pv-provider-name">${escapeHtml(display.label)}</div>
            ${statusBadge(r.mentionClass)}
            <div class="pv-evidence wrap">${escapeHtml(r.evidence ?? "")}</div>
          </div>`;
        })
        .join("");

      return `
      <div class="pv-card">
        <div class="pv-prompt">"${escapeHtml(g.prompt)}"</div>
        ${targetLabel ? `<div class="pv-target">For ${escapeHtml(targetLabel)}</div>` : ""}
        <div class="pv-providers">${providerRows}</div>
      </div>`;
    })
    .join("");

  return `
    <section class="page">
      <div class="section-eyebrow">Prompt Visibility</div>
      <div class="pv-header">
        <h2 class="section-heading" style="margin-bottom:0">Do you show up when prospects ask</h2>
        <div class="pv-pct">
          ${pct === null ? `<span class="metric-sub">Not enough valid checks to measure</span>` : `Visible in <span class="pv-pct-value">${pct}%</span> of checks`}
        </div>
      </div>
      <div class="pv-list">${cards || `<div class="empty-state">No prompt visibility results available.</div>`}</div>
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

function platformName(raw: string): string {
  return raw
    .split("_")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Social Profiles platform -> logo lookup -- presentation-only, keyed by
// the exact platform keys the social_profiles component already produces.
// Never used for Third-Party Listings, which is a different platform set.
const SOCIAL_PLATFORM_LOGOS: Record<string, string> = {
  linkedin: LINKEDIN_LOGO_DATA_URI,
  facebook: FACEBOOK_LOGO_DATA_URI,
  instagram: INSTAGRAM_LOGO_DATA_URI,
  x_twitter: X_TWITTER_LOGO_DATA_URI,
  youtube: YOUTUBE_LOGO_DATA_URI,
  tiktok: TIKTOK_LOGO_DATA_URI,
  threads: THREADS_LOGO_DATA_URI,
  reddit: REDDIT_LOGO_DATA_URI,
};

function socialPlatformLogo(platformKey: string): string {
  const logo = SOCIAL_PLATFORM_LOGOS[platformKey.toLowerCase()];
  if (logo) {
    return `<img class="platform-logo" src="${logo}" alt="${escapeHtml(platformName(platformKey))}" />`;
  }
  return `<div class="platform-logo-fallback">${escapeHtml(platformName(platformKey).slice(0, 1))}</div>`;
}

// SOCIAL-LOGIC-002: pure presentation mapping only -- never touches the
// underlying profileStatus/connected values, never recomputes them. A
// profile counts as PRESENT only when it was Found AND connected to the
// audited website; everything else the component can produce (Found but
// not connected, Not Found, Unverified) displays as Missing, never as a
// false Present. Could Not Verify stays neutral, never shown as Missing.
function socialDisplayStatus(profileStatus: string, connected: string): "Present" | "Missing" | "Could Not Verify" {
  if (profileStatus === "N/A — Could Not Verify") return "Could Not Verify";
  if (profileStatus === "Found" && connected === "Yes") return "Present";
  return "Missing";
}

// Raw-evidence detail line shown alongside the derived Status badge --
// keeps the underlying profileStatus/connected nuance visible in the PDF
// without ever letting it be mistaken for the primary display status.
function socialDetailText(profileStatus: string, connected: string): string {
  if (profileStatus === "N/A — Could Not Verify") return "Discovery could not be verified";
  if (profileStatus === "Found" && connected === "Yes") return "Connected to website";
  if (profileStatus === "Found" && connected === "No") return "Found, not connected";
  if (profileStatus === "Unverified") return "Possible match, unconfirmed";
  return "No profile found"; // Not Found
}

function renderSocialAndDirectories(report: CanonicalReport): string {
  const socialFindings = report.component_results.social_profiles?.findings as
    | { platforms?: SocialFinding[] }
    | undefined;
  const directoryFindings = report.component_results.directories?.findings as
    | { platforms?: DirectoryFinding[] }
    | undefined;

  const socialRows = (socialFindings?.platforms ?? [])
    .map((p) => {
      const displayStatus = socialDisplayStatus(p.profileStatus, p.connected);
      const detailText = socialDetailText(p.profileStatus, p.connected);
      return `
      <div class="matrix-item">
        <div class="matrix-row-3">
          <div class="matrix-platform">${socialPlatformLogo(p.platform)}${escapeHtml(platformName(p.platform))}</div>
          <div>${statusBadge(displayStatus)}</div>
          <div class="matrix-detail">${escapeHtml(detailText)}</div>
        </div>
        ${p.profileUrl ? `<div class="matrix-url wrap">${escapeHtml(p.profileUrl)}</div>` : ""}
      </div>`;
    })
    .join("");

  const directoryCards = (directoryFindings?.platforms ?? [])
    .map(
      (p) => `
      <div class="listing-card">
        <div class="listing-top">
          <div class="listing-platform">${escapeHtml(platformName(p.platform))}</div>
          ${statusBadge(p.status)}
        </div>
        ${p.listingUrl ? `<div class="listing-url wrap">${escapeHtml(p.listingUrl)}</div>` : ""}
      </div>`
    )
    .join("");

  return `
    <section class="page">
      <div class="section-eyebrow">Social &amp; Third-Party Presence</div>
      <h2 class="section-heading">Social Profiles</h2>
      <div class="matrix">
        <div class="matrix-row-3 matrix-head">
          <div>Platform</div><div>Status</div><div>Detail</div>
        </div>
        ${socialRows || `<div class="empty-state">No social profile results available.</div>`}
      </div>

      <h2 class="section-heading" style="margin-top:28px">Third-Party Listings</h2>
      <div class="listing-grid">
        ${directoryCards || `<div class="empty-state">No directory results available.</div>`}
      </div>
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
        <td class="crawler-name">${escapeHtml(c.userAgent)}</td>
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
      <div class="section-eyebrow">Technical Accessibility</div>
      <h2 class="section-heading">Can AI crawlers reach your site</h2>
      <table class="crawler-table">
        <thead><tr><th>Crawler</th><th>Status</th><th>Rule / Reason</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" class="empty">No crawler results available.</td></tr>`}</tbody>
      </table>
      <div class="stat-grid stat-grid-2" style="margin-top:18px">
        ${card("robots.txt", statusBadge(robotsStatus, robotsStatus === "Not Found" || robotsStatus === "Cannot Verify" ? NEUTRAL_DOT : undefined))}
        ${card("llms.txt", `${statusBadge(llmsStatus, NEUTRAL_DOT)}<div class="metric-sub">Optional and experimental -- absence is not a required fix.</div>`)}
      </div>
    </section>`;
}

// -- Key Gaps -----------------------------------------------------------

function renderGapCard(
  gap: CanonicalReport["grouped_gaps"][number],
  interpretation: CanonicalReport["interpretations"][number] | undefined
): string {
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
        <div class="section-eyebrow">Key Gaps</div>
        <h2 class="section-heading">Expert interpretation</h2>
        <div class="empty-state">No confirmed gaps were identified in the audited checks.</div>
      </section>`;
  }

  const interpretationsById = new Map(report.interpretations.map((i) => [i.gap_id, i]));
  const cards = report.grouped_gaps.map((gap) => renderGapCard(gap, interpretationsById.get(gap.gap_id))).join("");

  return `
    <section class="page">
      <div class="section-eyebrow">Key Gaps</div>
      <h2 class="section-heading">Expert interpretation</h2>
      <div class="gap-list">${cards}</div>
    </section>`;
}

// -- Closing -----------------------------------------------------------

function renderClosing(report: CanonicalReport): string {
  const c = report.executive_fact_counts;
  return `
    <section class="page closing">
      <div>
        <div class="section-eyebrow">Closing</div>
        <h2 class="section-heading">Where ${escapeHtml(report.audit_info.company_name)} goes from here</h2>
        <p class="wrap closing-body">
          This audit reviewed brand recognition across ${c.brand_recognition.total_providers} AI systems, prompt visibility,
          presence across ${c.social_profiles.total_platforms} social platforms and ${c.directories.total_directories} third-party
          directories, and accessibility for ${c.technical_accessibility.total_crawlers} AI crawlers.
          ${c.confirmed_gaps_count} confirmed finding${c.confirmed_gaps_count === 1 ? "" : "s"} ${c.confirmed_gaps_count === 1 ? "is" : "are"} detailed above.
        </p>
      </div>
      <div class="closing-footer">
        <div class="cta">${escapeHtml(report.closing.cta_text)}</div>
        <div class="closing-brand-row">
          <div class="closing-brand">AI-Clinic</div>
          <div class="closing-secondary">Developed by smartclick.agency</div>
        </div>
      </div>
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
    padding: 40px 44px;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; }

  .section-eyebrow {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${LABEL_GRAY};
    margin-bottom: 6px;
  }
  h2.section-heading { font-size: 19px; font-weight: 600; color: ${DARK_NAVY}; margin: 0 0 20px; }
  h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: ${DARK_NAVY}; }
  .wrap { overflow-wrap: break-word; word-break: break-word; }

  /* -- Cover (PDF-COVER-003, SmartClick-style hero) -- */
  .cover {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 0;
    overflow: hidden;
    text-align: left;
    color: #FFFFFF;
    background: linear-gradient(135deg, #2289F5 0%, #1B6FD1 100%);
  }
  .cover-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.5;
  }
  .cover-glow {
    position: absolute;
    top: -120px;
    right: -140px;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%);
  }
  .cover-top {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    padding: 40px 52px 0;
  }
  .cover-brand { font-size: 18px; font-weight: 700; letter-spacing: 0.3px; color: #FFFFFF; }
  .cover-secondary { font-size: 10.5px; color: rgba(255,255,255,0.75); margin-top: 3px; }
  .cover-body {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 0 52px;
  }
  .cover-left { flex: 1 1 56%; }
  .cover-title { font-size: 42px; font-weight: 700; line-height: 1.12; letter-spacing: -0.3px; color: #FFFFFF; }
  .cover-tagline { font-size: 15px; color: rgba(255,255,255,0.8); margin-top: 16px; max-width: 65%; line-height: 1.6; }
  .cover-client { margin-top: 52px; }
  .cover-company { font-size: 26px; font-weight: 700; color: #FFFFFF; }
  .cover-website { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 6px; overflow-wrap: break-word; max-width: 90%; }
  .cover-right { position: relative; flex: 1 1 44%; height: 360px; }
  .cover-connectors { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cover-connectors line { stroke: rgba(255,255,255,0.3); stroke-width: 1; }
  .cover-card {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 18px;
    border-radius: 14px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.25);
    box-shadow: 0 12px 28px rgba(15,42,61,0.18);
    font-size: 12px;
    font-weight: 600;
    color: #FFFFFF;
    white-space: nowrap;
  }
  .cover-card-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.85); flex-shrink: 0; }
  .cover-card-dot-accent { background: #FFD84D; }
  .cover-card-a { top: 10px; left: 40px; }
  .cover-card-b { top: 108px; left: 190px; }
  .cover-card-c { top: 208px; left: 20px; }
  .cover-card-d { top: 288px; left: 170px; }
  .cover-footer {
    position: relative;
    z-index: 2;
    padding: 0 52px 40px;
  }
  .cover-divider { width: 100%; height: 1px; background: rgba(255,255,255,0.25); margin-bottom: 14px; }
  .cover-meta { display: flex; gap: 28px; font-size: 11px; color: rgba(255,255,255,0.7); }

  /* -- Stat cards (Executive Summary) -- */
  .stat-grid { display: flex; gap: 14px; flex-wrap: wrap; }
  .stat-grid-3 > .stat-card { flex: 1 1 30%; }
  .stat-grid-2 > .stat-card { flex: 1 1 45%; }
  .stat-card {
    background: ${NEUTRAL_BG};
    border: 1px solid ${NEUTRAL_BORDER};
    border-top: 3px solid ${BRAND_BLUE};
    border-radius: 14px;
    padding: 16px 18px;
    break-inside: avoid;
  }
  .stat-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; color: ${LABEL_GRAY}; margin-bottom: 8px; }
  .stat-value { font-size: 22px; font-weight: 700; color: ${DARK_NAVY}; line-height: 1.15; }
  .stat-sub { font-size: 11px; color: ${MUTED_TEXT}; margin-top: 5px; }

  .highlight-row { display: flex; gap: 14px; margin-top: 22px; }
  .highlight-tile {
    flex: 1;
    background: ${DARK_NAVY};
    border-radius: 14px;
    padding: 18px 20px;
    color: #FFFFFF;
  }
  .highlight-value { font-size: 30px; font-weight: 700; color: ${BRAND_BLUE}; line-height: 1; }
  .highlight-value-muted { color: #FFFFFF; }
  .highlight-label { font-size: 11px; color: #B9C4D1; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }

  .metric-sub { font-size: 11px; color: ${MUTED_TEXT}; }

  /* -- Provider logos -- */
  .provider-logo { width: 26px; height: 26px; object-fit: contain; flex: none; }
  /* PDF-BRAND-005: Gemini/Claude only, ~40% larger than the shared 26px box
     -- aspect ratio preserved via object-fit:contain (inherited), no
     stretching/clipping. Every other provider keeps the 26px default. */
  .provider-logo-emphasize { width: 36px; height: 36px; }
  .provider-logo-fallback {
    width: 26px; height: 26px; border-radius: 50%; background: ${NEUTRAL_BG};
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: ${MUTED_TEXT}; flex: none;
  }

  /* -- Badges -- */
  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex: none; }

  /* -- Brand Recognition cards -- */
  .br-list { display: flex; flex-direction: column; gap: 12px; }
  .br-card { background: #FFFFFF; border: 1px solid ${NEUTRAL_BORDER}; border-radius: 14px; padding: 16px 18px; break-inside: avoid; }
  .br-top { display: flex; align-items: center; gap: 12px; }
  .br-name { flex: 1; font-size: 13.5px; font-weight: 600; color: ${DARK_NAVY}; }
  .br-evidence { font-size: 11.5px; color: ${MUTED_TEXT}; margin-top: 10px; line-height: 1.6; }
  .br-source { font-size: 10.5px; color: ${LABEL_GRAY}; margin-top: 6px; }

  /* -- Prompt Visibility -- */
  .pv-header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .pv-pct { font-size: 12px; color: ${MUTED_TEXT}; }
  .pv-pct-value { font-weight: 700; color: ${GOOD}; font-size: 13px; }
  .pv-list { display: flex; flex-direction: column; gap: 14px; }
  .pv-card { background: #FFFFFF; border: 1px solid ${NEUTRAL_BORDER}; border-radius: 14px; padding: 16px 18px; break-inside: avoid; }
  .pv-prompt { font-size: 13px; font-weight: 600; color: ${DARK_NAVY}; }
  .pv-target { font-size: 10.5px; color: ${LABEL_GRAY}; margin-top: 3px; }
  .pv-providers { margin-top: 12px; display: flex; flex-direction: column; gap: 9px; }
  .pv-row { display: grid; grid-template-columns: 22px 76px auto 1fr; align-items: center; gap: 10px; padding-top: 9px; border-top: 1px solid ${NEUTRAL_BORDER_SUBTLE}; }
  .pv-providers .pv-row:first-child { border-top: none; padding-top: 0; }
  /* PDF-BRAND-005: this fixed-width grid column (22px, see .pv-row above)
     intentionally does NOT get the Gemini/Claude emphasize boost -- the
     row layout must not change, so higher-specificity selector wins here
     and keeps every provider logo, Gemini/Claude included, at 18px. */
  .pv-row .provider-logo, .pv-row .provider-logo-fallback { width: 18px; height: 18px; }
  .pv-provider-name { font-size: 11px; font-weight: 600; color: ${DARK_NAVY}; }
  .pv-evidence { font-size: 10.5px; color: ${MUTED_TEXT}; }

  /* -- Social matrix -- */
  .matrix { border: 1px solid ${NEUTRAL_BORDER}; border-radius: 14px; overflow: hidden; }
  .matrix-row-3 { padding: 11px 16px; display: grid; grid-template-columns: 1.4fr 1fr 1fr; align-items: center; gap: 10px; }
  .matrix-head { background: ${NEUTRAL_BG}; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: ${LABEL_GRAY}; }
  .matrix-item { border-bottom: 1px solid ${NEUTRAL_BORDER_SUBTLE}; break-inside: avoid; }
  .matrix-item:last-child { border-bottom: none; }
  .matrix-platform { font-size: 12px; font-weight: 500; color: ${DARK_NAVY}; display: flex; align-items: center; gap: 9px; }
  .platform-logo { width: 18px; height: 18px; object-fit: contain; flex: none; }
  .platform-logo-fallback {
    width: 18px; height: 18px; border-radius: 50%; background: ${NEUTRAL_BG};
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: ${MUTED_TEXT}; flex: none;
  }
  .matrix-url { padding: 0 16px 12px; margin-top: -2px; font-size: 10.5px; color: ${LABEL_GRAY}; }
  .matrix-detail { font-size: 10.5px; color: ${MUTED_TEXT}; }

  /* -- Directory listing cards -- */
  .listing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .listing-card { border: 1px solid ${NEUTRAL_BORDER}; border-radius: 12px; padding: 12px 14px; break-inside: avoid; }
  .listing-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .listing-platform { font-size: 12px; font-weight: 600; color: ${DARK_NAVY}; }
  .listing-url { font-size: 10px; color: ${LABEL_GRAY}; margin-top: 6px; }

  /* -- Technical Accessibility table -- */
  .crawler-table { width: 100%; border-collapse: collapse; }
  .crawler-table thead { display: table-header-group; }
  .crawler-table tr { break-inside: avoid; }
  .crawler-table th {
    text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px;
    color: ${LABEL_GRAY}; border-bottom: 1px solid ${NEUTRAL_BORDER}; padding: 9px 12px;
  }
  .crawler-table td { padding: 11px 12px; border-bottom: 1px solid ${NEUTRAL_BORDER_SUBTLE}; font-size: 11.5px; vertical-align: top; }
  .crawler-name { font-weight: 600; color: ${DARK_NAVY}; }
  td.empty { color: ${MUTED_TEXT}; text-align: center; padding: 20px; }

  .card {
    background: ${NEUTRAL_BG};
    border: 1px solid ${NEUTRAL_BORDER};
    border-radius: 14px;
    padding: 16px;
    break-inside: avoid;
  }

  /* -- Key Gaps -- */
  .gap-list { display: flex; flex-direction: column; gap: 14px; }
  .gap-card {
    background: #FFFFFF;
    border: 1px solid ${NEUTRAL_BORDER};
    border-left: 4px solid ${BRAND_BLUE};
    border-radius: 12px;
    padding: 16px 20px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .gap-header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .gap-title { font-size: 14.5px; font-weight: 600; color: ${DARK_NAVY}; }
  .gap-badge {
    font-size: 10px;
    font-weight: 600;
    color: ${ATTENTION};
    background: rgba(192,138,30,0.1);
    border-radius: 999px;
    padding: 3px 10px;
    white-space: nowrap;
  }
  .gap-evidence { font-size: 11px; color: ${MUTED_TEXT}; margin-top: 6px; }
  .gap-columns {
    display: flex;
    gap: 16px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid ${NEUTRAL_BORDER_SUBTLE};
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

  /* -- Closing -- */
  .closing { display: flex; flex-direction: column; justify-content: space-between; height: 100vh; }
  .closing-body { color: ${MUTED_TEXT}; font-size: 12.5px; line-height: 1.7; max-width: 460px; }
  .closing-footer { display: flex; flex-direction: column; gap: 20px; }
  .cta { font-size: 16px; font-weight: 600; color: ${DARK_NAVY}; }
  .closing-brand-row { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid ${NEUTRAL_BORDER_SUBTLE}; padding-top: 18px; }
  .closing-brand { font-size: 14px; font-weight: 700; color: ${DARK_NAVY}; }
  .closing-secondary { font-size: 10.5px; color: ${MUTED_TEXT}; }
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
