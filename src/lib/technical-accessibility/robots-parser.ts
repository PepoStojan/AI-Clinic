// COMP-005: deterministic robots.txt parser + crawler-access evaluator.
// Pure, network-free logic (per Build Spec section 18: "No AI judgment for
// Allowed / Blocked" -- fetch + parse only). Deliberately a small, MVP
// parser, not a full replication of Google's production robots parser
// (the task explicitly says not to attempt that) -- it handles the common,
// well-defined cases: explicit user-agent groups grouped by consecutive
// "User-agent:" lines, wildcard "*" fallback, root "/" disallow as a full
// block, and any other non-empty Disallow path as a partial restriction.

export type CrawlerStatus = "Allowed" | "Blocked" | "Allowed with restrictions" | "Cannot Verify";

export interface RobotsRule {
  directive: "allow" | "disallow";
  path: string;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

/**
 * Groups consecutive "User-agent:" lines into one group (the standard
 * robots.txt convention for declaring several agents under one rule set).
 * Once a rule line (Allow/Disallow) is seen for the current group, the
 * next "User-agent:" line starts a NEW group -- never appended to the
 * sealed one. Unrecognized directives (Sitemap, Crawl-delay, comments,
 * blank lines) are ignored.
 */
export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sealed = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const uaMatch = /^user-agent\s*:\s*(.*)$/i.exec(line);
    if (uaMatch) {
      const ua = uaMatch[1].trim();
      if (!ua) continue;
      if (current && !sealed) {
        current.userAgents.push(ua);
      } else {
        current = { userAgents: [ua], rules: [] };
        groups.push(current);
        sealed = false;
      }
      continue;
    }

    const ruleMatch = /^(allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (ruleMatch && current) {
      current.rules.push({ directive: ruleMatch[1].toLowerCase() as "allow" | "disallow", path: ruleMatch[2].trim() });
      sealed = true;
    }
    // Any other directive (Sitemap, Crawl-delay, Host, ...) is ignored --
    // out of scope for crawler-access evaluation.
  }

  return groups;
}

/**
 * Effective rule set for one crawler: explicit user-agent group(s) first
 * (merged if more than one matches the same agent), otherwise the
 * wildcard "*" group(s), otherwise no rules at all.
 */
export function effectiveRulesFor(groups: RobotsGroup[], userAgentToken: string): RobotsRule[] {
  const lowered = userAgentToken.toLowerCase();
  const explicit = groups.filter((g) => g.userAgents.some((ua) => ua.toLowerCase() === lowered));
  if (explicit.length > 0) {
    return explicit.flatMap((g) => g.rules);
  }
  const wildcard = groups.filter((g) => g.userAgents.some((ua) => ua === "*"));
  return wildcard.flatMap((g) => g.rules);
}

function normalizePath(path: string): string {
  return path.trim();
}

export interface CrawlerEvaluation {
  status: CrawlerStatus;
  reason: string;
  applicableRules: RobotsRule[];
}

/**
 * Classifies effective access from a rule set. Root "/" disallow is a
 * full block UNLESS an explicit Allow rule exists alongside it (a real,
 * if unusual, carve-out pattern: "Disallow: /" + "Allow: /public/") --
 * in that case the crawler is not entirely prevented from accessing the
 * site, so it's a restriction, not a full block. Any other non-empty
 * Disallow path is a restriction. No applicable rules at all (or only
 * empty-value Disallow lines, which per the robots.txt spec mean "allow
 * everything") is a clean Allowed.
 */
export function classifyEffectiveAccess(rules: RobotsRule[]): CrawlerEvaluation {
  const meaningful = rules.filter((r) => normalizePath(r.path) !== "");
  if (meaningful.length === 0) {
    return { status: "Allowed", reason: "No applicable robots.txt restriction for this crawler.", applicableRules: [] };
  }

  const rootDisallow = meaningful.filter((r) => r.directive === "disallow" && normalizePath(r.path) === "/");
  const anyAllow = meaningful.filter((r) => r.directive === "allow");
  const otherDisallow = meaningful.filter((r) => r.directive === "disallow" && normalizePath(r.path) !== "/");

  if (rootDisallow.length > 0 && anyAllow.length === 0) {
    return {
      status: "Blocked",
      reason: "robots.txt disallows the entire site (\"Disallow: /\") for this crawler.",
      applicableRules: rootDisallow,
    };
  }

  if (rootDisallow.length > 0 && anyAllow.length > 0) {
    return {
      status: "Allowed with restrictions",
      reason: "robots.txt disallows the site root but also allows specific paths for this crawler.",
      applicableRules: [...rootDisallow, ...anyAllow],
    };
  }

  if (otherDisallow.length > 0) {
    return {
      status: "Allowed with restrictions",
      reason: `robots.txt disallows ${otherDisallow.length} specific path(s) for this crawler.`,
      applicableRules: otherDisallow,
    };
  }

  return { status: "Allowed", reason: "No applicable robots.txt restriction for this crawler.", applicableRules: [] };
}

/**
 * Full evaluation for one crawler against a robots.txt body. `robotsText`
 * is null when robots.txt itself was confirmed absent (404) -- per spec,
 * "absence itself must NOT block crawlers," so that always evaluates to
 * Allowed. Callers must handle the "could not be fetched/parsed reliably"
 * case (Cannot Verify) themselves, before ever calling this -- it is never
 * decided here from a null body (null means "confirmed absent," not
 * "unknown").
 */
export function evaluateCrawlerAccess(robotsText: string | null, userAgentToken: string): CrawlerEvaluation {
  if (robotsText === null) {
    return { status: "Allowed", reason: "robots.txt not found; no restrictions apply.", applicableRules: [] };
  }
  const groups = parseRobotsTxt(robotsText);
  const rules = effectiveRulesFor(groups, userAgentToken);
  return classifyEffectiveAccess(rules);
}
