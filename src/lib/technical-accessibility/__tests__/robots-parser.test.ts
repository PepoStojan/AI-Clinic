import { describe, expect, it } from "vitest";
import { classifyEffectiveAccess, effectiveRulesFor, evaluateCrawlerAccess, parseRobotsTxt } from "../robots-parser";

describe("parseRobotsTxt", () => {
  it("groups consecutive User-agent lines sharing one rule set", () => {
    const groups = parseRobotsTxt("User-agent: A\nUser-agent: B\nDisallow: /x\n");
    expect(groups).toHaveLength(1);
    expect(groups[0].userAgents).toEqual(["A", "B"]);
    expect(groups[0].rules).toEqual([{ directive: "disallow", path: "/x" }]);
  });

  it("starts a new group once a rule line seals the previous one", () => {
    const groups = parseRobotsTxt("User-agent: A\nDisallow: /x\nUser-agent: B\nDisallow: /y\n");
    expect(groups).toHaveLength(2);
    expect(groups[0].userAgents).toEqual(["A"]);
    expect(groups[1].userAgents).toEqual(["B"]);
  });

  it("ignores comments and unrecognized directives", () => {
    const groups = parseRobotsTxt("# comment\nUser-agent: *\nSitemap: https://example.com/sitemap.xml\nDisallow: /admin\n");
    expect(groups).toHaveLength(1);
    expect(groups[0].rules).toEqual([{ directive: "disallow", path: "/admin" }]);
  });
});

describe("effectiveRulesFor", () => {
  it("uses the explicit matching group over wildcard when both exist", () => {
    const groups = parseRobotsTxt("User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /\n");
    expect(effectiveRulesFor(groups, "GPTBot")).toEqual([{ directive: "allow", path: "/" }]);
  });

  it("falls back to wildcard when no explicit group matches", () => {
    const groups = parseRobotsTxt("User-agent: *\nDisallow: /private\n");
    expect(effectiveRulesFor(groups, "GPTBot")).toEqual([{ directive: "disallow", path: "/private" }]);
  });

  it("returns no rules when neither an explicit nor wildcard group exists", () => {
    const groups = parseRobotsTxt("User-agent: Bingbot\nDisallow: /x\n");
    expect(effectiveRulesFor(groups, "GPTBot")).toEqual([]);
  });

  it("matches user-agent tokens case-insensitively", () => {
    const groups = parseRobotsTxt("User-agent: gptbot\nDisallow: /x\n");
    expect(effectiveRulesFor(groups, "GPTBot")).toEqual([{ directive: "disallow", path: "/x" }]);
  });

  it("merges rules across multiple groups declared for the same agent", () => {
    const groups = parseRobotsTxt("User-agent: GPTBot\nDisallow: /a\nUser-agent: GPTBot\nDisallow: /b\n");
    expect(effectiveRulesFor(groups, "GPTBot")).toEqual([
      { directive: "disallow", path: "/a" },
      { directive: "disallow", path: "/b" },
    ]);
  });
});

describe("classifyEffectiveAccess", () => {
  it("no rules -> Allowed", () => {
    expect(classifyEffectiveAccess([]).status).toBe("Allowed");
  });

  it("Disallow: / with no Allow -> Blocked", () => {
    expect(classifyEffectiveAccess([{ directive: "disallow", path: "/" }]).status).toBe("Blocked");
  });

  it("Disallow: / combined with an Allow carve-out -> Allowed with restrictions, not fully Blocked", () => {
    const result = classifyEffectiveAccess([
      { directive: "disallow", path: "/" },
      { directive: "allow", path: "/public/" },
    ]);
    expect(result.status).toBe("Allowed with restrictions");
  });

  it("a non-root Disallow path -> Allowed with restrictions", () => {
    expect(classifyEffectiveAccess([{ directive: "disallow", path: "/admin/" }]).status).toBe("Allowed with restrictions");
  });

  it("multiple non-root Disallow paths -> Allowed with restrictions", () => {
    const result = classifyEffectiveAccess([
      { directive: "disallow", path: "/admin/" },
      { directive: "disallow", path: "/private/" },
    ]);
    expect(result.status).toBe("Allowed with restrictions");
  });

  it("an empty-value Disallow (means allow everything) never restricts", () => {
    expect(classifyEffectiveAccess([{ directive: "disallow", path: "" }]).status).toBe("Allowed");
  });
});

describe("evaluateCrawlerAccess -- required scenarios", () => {
  it("1. no robots.txt (null body) -> Allowed", () => {
    expect(evaluateCrawlerAccess(null, "GPTBot").status).toBe("Allowed");
  });

  it("2. wildcard Disallow: / -> crawler Blocked", () => {
    const result = evaluateCrawlerAccess("User-agent: *\nDisallow: /\n", "GPTBot");
    expect(result.status).toBe("Blocked");
  });

  it("3. explicit GPTBot Disallow: / blocks only GPTBot; others fall through to wildcard/default", () => {
    const text = "User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n";
    expect(evaluateCrawlerAccess(text, "GPTBot").status).toBe("Blocked");
    expect(evaluateCrawlerAccess(text, "Googlebot").status).toBe("Allowed");
  });

  it("4. wildcard blocked but an explicit crawler group is allowed -- explicit rule wins", () => {
    const text = "User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /\n";
    expect(evaluateCrawlerAccess(text, "Googlebot").status).toBe("Allowed");
    expect(evaluateCrawlerAccess(text, "GPTBot").status).toBe("Blocked");
  });

  it("5. a path restriction -> Allowed with restrictions", () => {
    const text = "User-agent: *\nDisallow: /admin/\nDisallow: /private/\n";
    expect(evaluateCrawlerAccess(text, "Bingbot").status).toBe("Allowed with restrictions");
  });

  it("6. no applicable rule at all -> Allowed", () => {
    const text = "User-agent: SomeOtherBot\nDisallow: /\n";
    expect(evaluateCrawlerAccess(text, "ClaudeBot").status).toBe("Allowed");
  });
});
