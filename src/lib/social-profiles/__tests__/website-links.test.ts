import { describe, expect, it } from "vitest";
import { extractSchemaSocialLinks, extractSocialHrefs, resolveConnectionSource } from "../website-links";
import { normalizeUrlForComparison } from "../platforms";

function ldJsonHtml(json: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;
}

describe("extractSchemaSocialLinks", () => {
  const DOMAIN = "ocuco.com";

  it("extracts a sameAs string from a trusted Organization entity tied to the audited domain", () => {
    const html = ldJsonHtml({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Ocuco",
      url: "https://www.ocuco.com",
      sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision",
    });

    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
  });

  it("extracts a sameAs array, classifying each URL to its platform", () => {
    const html = ldJsonHtml({
      "@type": "Corporation",
      url: "https://www.ocuco.com",
      sameAs: [
        "https://www.youtube.com/@OcucoSoftwarewithVision",
        "https://www.linkedin.com/company/ocuco",
        "https://not-a-social-site.example/ocuco",
      ],
    });

    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
    expect(result.linkedin).toEqual(["https://www.linkedin.com/company/ocuco"]);
  });

  it("supports @graph-wrapped JSON-LD", () => {
    const html = ldJsonHtml({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", url: "https://www.ocuco.com" },
        {
          "@type": "Organization",
          "@id": "https://www.ocuco.com/#organization",
          url: "https://www.ocuco.com",
          sameAs: ["https://www.youtube.com/@OcucoSoftwarewithVision"],
        },
      ],
    });

    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
  });

  it("merges sameAs across multiple JSON-LD script blocks on the same page", () => {
    const html =
      ldJsonHtml({ "@type": "Organization", url: "https://www.ocuco.com", sameAs: "https://www.linkedin.com/company/ocuco" }) +
      ldJsonHtml({ "@type": "Organization", url: "https://www.ocuco.com", sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision" });

    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.linkedin).toEqual(["https://www.linkedin.com/company/ocuco"]);
    expect(result.youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
  });

  it("silently skips a malformed JSON-LD block instead of throwing", () => {
    const html =
      `<script type="application/ld+json">{ this is not valid json </script>` +
      ldJsonHtml({ "@type": "Organization", url: "https://www.ocuco.com", sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision" });

    expect(() => extractSchemaSocialLinks(html, DOMAIN)).not.toThrow();
    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
  });

  it("ignores an Organization entity whose url/@id cannot be tied to the audited domain", () => {
    const html = ldJsonHtml({
      "@type": "Organization",
      name: "Some Other Company",
      url: "https://www.totally-unrelated-company.com",
      sameAs: "https://www.youtube.com/@SomeoneElse",
    });

    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.youtube).toEqual([]);
  });

  it("falls back to @id when url is absent, and still requires it to be domain-tied", () => {
    const withMatchingId = ldJsonHtml({
      "@type": "Organization",
      "@id": "https://www.ocuco.com/#organization",
      sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision",
    });
    expect(extractSchemaSocialLinks(withMatchingId, DOMAIN).youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);

    const withUnrelatedId = ldJsonHtml({
      "@type": "Organization",
      "@id": "https://www.unrelated.com/#organization",
      sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision",
    });
    expect(extractSchemaSocialLinks(withUnrelatedId, DOMAIN).youtube).toEqual([]);
  });

  it("ignores entities whose @type is not Organization/Corporation/LocalBusiness", () => {
    const html = ldJsonHtml({
      "@type": "WebSite",
      url: "https://www.ocuco.com",
      sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision",
    });

    expect(extractSchemaSocialLinks(html, DOMAIN).youtube).toEqual([]);
  });

  it("accepts @type as an array containing a trusted org type", () => {
    const html = ldJsonHtml({
      "@type": ["WebPage", "LocalBusiness"],
      url: "https://www.ocuco.com",
      sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision",
    });

    expect(extractSchemaSocialLinks(html, DOMAIN).youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
  });

  it("ignores a sameAs URL that doesn't belong to any of the 8 supported platforms", () => {
    const html = ldJsonHtml({
      "@type": "Organization",
      url: "https://www.ocuco.com",
      sameAs: ["https://www.crunchbase.com/organization/ocuco", "https://www.youtube.com/@OcucoSoftwarewithVision"],
    });

    const result = extractSchemaSocialLinks(html, DOMAIN);
    expect(result.youtube).toEqual(["https://www.youtube.com/@OcucoSoftwarewithVision"]);
    expect(Object.values(result).flat()).not.toContain("https://www.crunchbase.com/organization/ocuco");
  });
});

describe("resolveConnectionSource", () => {
  function result(linksByPlatform: Record<string, string[]>, schemaLinksByPlatform: Record<string, string[]>) {
    return { linksByPlatform, schemaLinksByPlatform } as never;
  }

  it("HTML anchor match only -> 'html'", () => {
    const r = result({ youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] }, { youtube: [] });
    expect(resolveConnectionSource(r, "youtube", "https://www.youtube.com/@OcucoSoftwarewithVision")).toBe("html");
  });

  it("schema sameAs match only -> 'schema' (the Ocuco YouTube regression case)", () => {
    const r = result({ youtube: [] }, { youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] });
    expect(resolveConnectionSource(r, "youtube", "https://www.youtube.com/@OcucoSoftwarewithVision")).toBe("schema");
  });

  it("both HTML and schema match -> 'html+schema'", () => {
    const r = result(
      { youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] },
      { youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] }
    );
    expect(resolveConnectionSource(r, "youtube", "https://www.youtube.com/@OcucoSoftwarewithVision")).toBe("html+schema");
  });

  it("no match anywhere -> null (external discovery alone is never sufficient)", () => {
    const r = result({ youtube: [] }, { youtube: [] });
    expect(resolveConnectionSource(r, "youtube", "https://www.youtube.com/@OcucoSoftwarewithVision")).toBe(null);
  });

  it("x.com / twitter.com normalize to the same identity", () => {
    const r = result({ x_twitter: ["https://x.com/ocuco"] }, { x_twitter: [] });
    expect(resolveConnectionSource(r, "x_twitter", "https://twitter.com/ocuco")).toBe("html");
  });

  it("threads.com / threads.net normalize to the same identity", () => {
    const r = result({ threads: [] }, { threads: ["https://www.threads.com/@ocuco"] });
    expect(resolveConnectionSource(r, "threads", "https://www.threads.net/@ocuco")).toBe("schema");
  });

  it("different handles on the same platform do NOT match, even with normalization", () => {
    const r = result({ instagram: [] }, { instagram: ["https://www.instagram.com/ocuco.official"] });
    expect(resolveConnectionSource(r, "instagram", "https://www.instagram.com/ocuco.unrelated")).toBe(null);
  });

  it("YouTube /channel/... and /@handle are NOT force-matched to each other", () => {
    const r = result({ youtube: [] }, { youtube: ["https://www.youtube.com/channel/UCabcdefg12345"] });
    expect(resolveConnectionSource(r, "youtube", "https://www.youtube.com/@OcucoSoftwarewithVision")).toBe(null);
  });
});

describe("extractSocialHrefs (unchanged HTML anchor extraction)", () => {
  it("still extracts a literal <a href> social link", () => {
    const html = `<a href="https://www.linkedin.com/company/ocuco">LinkedIn</a>`;
    expect(extractSocialHrefs(html).linkedin).toEqual(["https://www.linkedin.com/company/ocuco"]);
  });

  it("does not pick up a JSON-LD-only sameAs as an HTML link", () => {
    const html = ldJsonHtml({
      "@type": "Organization",
      url: "https://www.ocuco.com",
      sameAs: "https://www.youtube.com/@OcucoSoftwarewithVision",
    });
    expect(extractSocialHrefs(html).youtube).toEqual([]);
  });
});

describe("normalizeUrlForComparison (threads canonicalization)", () => {
  it("canonicalizes threads.com to threads.net", () => {
    expect(normalizeUrlForComparison("https://www.threads.com/@ocuco")).toBe(
      normalizeUrlForComparison("https://www.threads.net/@ocuco")
    );
  });
});
