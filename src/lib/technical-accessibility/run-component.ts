import "server-only";

import { buildIdempotencyKey } from "../audit/idempotency";
import { TECHNICAL_CRAWLERS, TECHNICAL_FILES } from "../audit/checklist";
import type { Database } from "../supabase/database.types";
import {
  updateChecklistItemByIdempotencyKey,
  type ChecklistItemRow,
} from "../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../supabase/repositories/component-results";
import { fetchTextFile, type FileFetchResult } from "./fetch-file";
import { evaluateCrawlerAccess, type CrawlerEvaluation, type CrawlerStatus } from "./robots-parser";

export type TechnicalCrawlerKey = (typeof TECHNICAL_CRAWLERS)[number];
export type TechnicalFileKey = (typeof TECHNICAL_FILES)[number]; // "robots_txt" | "llms_txt"
export type FileStatus = "Found" | "Not Found" | "Cannot Verify";

// Real-world declared User-agent tokens, per Build Spec section 18's exact
// 6 crawlers.
const CRAWLER_USER_AGENT: Record<TechnicalCrawlerKey, string> = {
  googlebot: "Googlebot",
  bingbot: "Bingbot",
  gptbot: "GPTBot",
  oai_searchbot: "OAI-SearchBot",
  claudebot: "ClaudeBot",
  perplexitybot: "PerplexityBot",
};

export interface CrawlerOutcome {
  crawler: TechnicalCrawlerKey;
  userAgent: string;
  status: CrawlerStatus;
  reason: string;
  applicableRules: { directive: string; path: string }[];
}

export interface TechnicalAccessibilitySummary {
  totalCrawlers: number; // always 6
  allowed: number;
  restricted: number;
  blocked: number;
  cannotVerify: number;
}

export interface TechnicalAccessibilityResult {
  auditId: string;
  robotsTxtStatus: FileStatus;
  llmsTxtStatus: FileStatus;
  crawlers: CrawlerOutcome[];
  summary: TechnicalAccessibilitySummary;
}

function fileStatusFromFetch(result: FileFetchResult): FileStatus {
  if (result.outcome === "found") return "Found";
  if (result.outcome === "not_found") return "Not Found";
  return "Cannot Verify";
}

export function checklistStatusForCrawler(status: CrawlerStatus): ChecklistItemRow["status"] {
  if (status === "Allowed") return "COMPLETED";
  if (status === "Cannot Verify") return "COULD_NOT_VERIFY";
  return "GAP_FOUND"; // Blocked, Allowed with restrictions
}

export function checklistStatusForFile(status: FileStatus): ChecklistItemRow["status"] {
  // Found and Not Found are both a completed, factual determination --
  // Not Found is never a gap for either file (robots.txt absence doesn't
  // block crawlers; llms.txt is optional/experimental).
  if (status === "Cannot Verify") return "COULD_NOT_VERIFY";
  return "COMPLETED";
}

export function buildSummary(crawlers: CrawlerOutcome[]): TechnicalAccessibilitySummary {
  return {
    totalCrawlers: crawlers.length,
    allowed: crawlers.filter((c) => c.status === "Allowed").length,
    restricted: crawlers.filter((c) => c.status === "Allowed with restrictions").length,
    blocked: crawlers.filter((c) => c.status === "Blocked").length,
    cannotVerify: crawlers.filter((c) => c.status === "Cannot Verify").length,
  };
}

function toOrigin(websiteUrl: string): string {
  return new URL(websiteUrl).origin;
}

export async function runTechnicalAccessibilityComponent(input: {
  auditId: string;
  websiteUrl: string;
}): Promise<TechnicalAccessibilityResult> {
  const origin = toOrigin(input.websiteUrl);

  const allCheckKeys: string[] = [...TECHNICAL_CRAWLERS.map((c) => `crawler_${c}`), ...TECHNICAL_FILES];
  await Promise.all(
    allCheckKeys.map((checkKey) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({ auditId: input.auditId, componentName: "technical_accessibility", targetId: null, checkKey }),
        { status: "RUNNING", started_at: new Date().toISOString() }
      )
    )
  );

  const [robotsFetch, llmsFetch] = await Promise.all([
    fetchTextFile(`${origin}/robots.txt`),
    fetchTextFile(`${origin}/llms.txt`),
  ]);

  const robotsTxtStatus = fileStatusFromFetch(robotsFetch);
  const llmsTxtStatus = fileStatusFromFetch(llmsFetch);

  const crawlers: CrawlerOutcome[] = TECHNICAL_CRAWLERS.map((crawler) => {
    const userAgent = CRAWLER_USER_AGENT[crawler];

    if (robotsFetch.outcome === "cannot_verify") {
      return {
        crawler,
        userAgent,
        status: "Cannot Verify",
        reason: "robots.txt could not be reliably fetched or read.",
        applicableRules: [],
      };
    }

    const robotsText = robotsFetch.outcome === "found" ? robotsFetch.body : null;
    const evaluation: CrawlerEvaluation = evaluateCrawlerAccess(robotsText, userAgent);
    return { crawler, userAgent, status: evaluation.status, reason: evaluation.reason, applicableRules: evaluation.applicableRules };
  });

  await Promise.all([
    ...crawlers.map((c) =>
      updateChecklistItemByIdempotencyKey(
        buildIdempotencyKey({ auditId: input.auditId, componentName: "technical_accessibility", targetId: null, checkKey: `crawler_${c.crawler}` }),
        {
          status: checklistStatusForCrawler(c.status),
          result_json: { status: c.status, reason: c.reason },
          evidence_json: { applicableRules: c.applicableRules },
          completed_at: new Date().toISOString(),
        }
      )
    ),
    updateChecklistItemByIdempotencyKey(
      buildIdempotencyKey({ auditId: input.auditId, componentName: "technical_accessibility", targetId: null, checkKey: "robots_txt" }),
      {
        status: checklistStatusForFile(robotsTxtStatus),
        result_json: { status: robotsTxtStatus },
        evidence_json: { httpStatus: robotsFetch.httpStatus },
        last_error: robotsFetch.errorMessage,
        completed_at: new Date().toISOString(),
      }
    ),
    updateChecklistItemByIdempotencyKey(
      buildIdempotencyKey({ auditId: input.auditId, componentName: "technical_accessibility", targetId: null, checkKey: "llms_txt" }),
      {
        status: checklistStatusForFile(llmsTxtStatus),
        result_json: { status: llmsTxtStatus },
        evidence_json: { httpStatus: llmsFetch.httpStatus },
        last_error: llmsFetch.errorMessage,
        completed_at: new Date().toISOString(),
      }
    ),
  ]);

  const summary = buildSummary(crawlers);

  await upsertComponentResult({
    audit_id: input.auditId,
    component_name: "technical_accessibility",
    status: "COMPLETED",
    raw_result_json: {
      robotsTxt: { httpStatus: robotsFetch.httpStatus, body: robotsFetch.body, errorMessage: robotsFetch.errorMessage },
      llmsTxt: { httpStatus: llmsFetch.httpStatus, body: llmsFetch.body, errorMessage: llmsFetch.errorMessage },
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["raw_result_json"],
    normalized_result_json: {
      robotsTxtStatus,
      llmsTxtStatus,
      crawlers,
      summary,
    } as unknown as Database["public"]["Tables"]["component_results"]["Insert"]["normalized_result_json"],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  return { auditId: input.auditId, robotsTxtStatus, llmsTxtStatus, crawlers, summary };
}
