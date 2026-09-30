import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSummary, checklistStatusFor, type SocialPlatformOutcome } from "../run-component";
import { SOCIAL_PLATFORMS } from "../../audit/checklist";

function outcome(overrides: Partial<SocialPlatformOutcome>): SocialPlatformOutcome {
  return {
    platform: "linkedin",
    profileStatus: "Found",
    profileUrl: "https://linkedin.com/company/acme",
    connected: "Yes",
    source: "apify",
    evidence: "",
    matchedSignals: [],
    unavailableReason: null,
    connectionSource: null,
    ...overrides,
  };
}

describe("checklistStatusFor", () => {
  it("Found + Connected Yes -> COMPLETED", () => {
    expect(checklistStatusFor(outcome({ profileStatus: "Found", connected: "Yes" }))).toBe("COMPLETED");
  });

  it("Found + Connected No -> GAP_FOUND", () => {
    expect(checklistStatusFor(outcome({ profileStatus: "Found", connected: "No" }))).toBe("GAP_FOUND");
  });

  it("Not Found -> GAP_FOUND", () => {
    expect(checklistStatusFor(outcome({ profileStatus: "Not Found", connected: "N/A" }))).toBe("GAP_FOUND");
  });

  it("Unverified -> GAP_FOUND (unresolved presence issue, never a confirmed absence)", () => {
    expect(checklistStatusFor(outcome({ profileStatus: "Unverified", connected: "N/A" }))).toBe("GAP_FOUND");
  });

  it("N/A — Could Not Verify -> COULD_NOT_VERIFY, never a gap", () => {
    expect(checklistStatusFor(outcome({ profileStatus: "N/A — Could Not Verify", connected: "N/A" }))).toBe(
      "COULD_NOT_VERIFY"
    );
  });
});

describe("buildSummary", () => {
  it("computes deterministic counts across a mixed run", () => {
    const summary = buildSummary([
      outcome({ platform: "linkedin", profileStatus: "Found", connected: "Yes" }),
      outcome({ platform: "facebook", profileStatus: "Found", connected: "No" }),
      outcome({ platform: "instagram", profileStatus: "Not Found" }),
      outcome({ platform: "x_twitter", profileStatus: "Unverified" }),
      outcome({ platform: "youtube", profileStatus: "N/A — Could Not Verify" }),
    ]);
    expect(summary.totalPlatforms).toBe(5);
    expect(summary.profilesFound).toBe(2);
    expect(summary.profilesConnected).toBe(1); // only linkedin, not the Found+No facebook
    expect(summary.profilesNotFound).toBe(1);
    expect(summary.profilesUnverified).toBe(1);
    expect(summary.profilesCouldNotVerify).toBe(1);
  });

  it("is deterministic for identical input", () => {
    const platforms = [outcome({ platform: "linkedin" }), outcome({ platform: "facebook", profileStatus: "Not Found" })];
    expect(buildSummary(platforms)).toEqual(buildSummary(platforms));
  });
});

// -- Full orchestration, mocked (no network) --------------------------------

vi.mock("../../providers/apify", () => ({
  runSocialDiscoveryActor: vi.fn(),
}));
vi.mock("../../providers/dataforseo", () => ({
  searchGoogleOrganic: vi.fn(),
}));
vi.mock("../website-links", () => ({
  fetchWebsiteSocialLinks: vi.fn(),
  resolveConnectionSource: vi.fn(),
}));
vi.mock("../../supabase/repositories/checklist-items", () => ({
  updateChecklistItemByIdempotencyKey: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../supabase/repositories/component-results", () => ({
  upsertComponentResult: vi.fn().mockResolvedValue({}),
}));

import { runSocialDiscoveryActor } from "../../providers/apify";
import { searchGoogleOrganic } from "../../providers/dataforseo";
import { fetchWebsiteSocialLinks, resolveConnectionSource } from "../website-links";
import { updateChecklistItemByIdempotencyKey } from "../../supabase/repositories/checklist-items";
import { upsertComponentResult } from "../../supabase/repositories/component-results";
import { runSocialProfilesComponent } from "../run-component";

const COMPANY = "Acme";
const DOMAIN = "acmecorp.io";
const WEBSITE = "https://acmecorp.io";

describe("runSocialProfilesComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: {} as never,
      errorMessage: null,
    });
    vi.mocked(resolveConnectionSource).mockReturnValue(null);
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
  });

  it("1/6. Apify finds a valid profile -> Found, and an Apify miss alone is never Not Found on its own (fallback runs)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({
      ok: true,
      candidates: [{ platform: "linkedin", url: "https://linkedin.com/company/acme", title: "Acme | LinkedIn" }],
      attempts: 1,
      errorMessage: null,
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });

    const linkedin = result.platforms.find((p) => p.platform === "linkedin")!;
    expect(linkedin.profileStatus).toBe("Found");
    expect(linkedin.connected).toBe("Yes");
    expect(linkedin.source).toBe("apify");

    // Every other platform had an Apify miss -- fallback (searchGoogleOrganic)
    // must have been invoked for each of them, proving a miss alone never
    // short-circuits straight to Not Found.
    expect(vi.mocked(searchGoogleOrganic).mock.calls.length).toBe(7);
  });

  it("2/3. Apify miss + DataForSEO fallback finds a verified official profile -> Found", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("facebook.com")) {
        return {
          ok: true,
          results: [{ title: "Acme - acmecorp.io - Official Page", url: "https://www.facebook.com/acmehq", domain: "facebook.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const facebook = result.platforms.find((p) => p.platform === "facebook")!;
    expect(facebook.profileStatus).toBe("Found");
    expect(facebook.source).toBe("dataforseo_fallback");
    expect(facebook.profileUrl).toBe("https://www.facebook.com/acmehq");
  });

  it("4. fallback reliable, no valid official profile -> Not Found (never fabricated as a gap-free pass)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    for (const p of result.platforms) {
      expect(p.profileStatus).toBe("Not Found");
      expect(p.connected).toBe("N/A");
    }
  });

  it("5/14. fallback provider failure -> N/A — Could Not Verify, never Not Found, never a gap in checklist terms other than COULD_NOT_VERIFY", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: false, candidates: [], attempts: 1, errorMessage: "Apify outage" });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: false, results: [], attempts: 1, errorMessage: "DataForSEO SERP timeout" });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    for (const p of result.platforms) {
      expect(p.profileStatus).toBe("N/A — Could Not Verify");
      expect(p.profileStatus).not.toBe("Not Found");
      expect(checklistStatusFor(p)).toBe("COULD_NOT_VERIFY");
    }
  });

  it("7. same-name wrong company is not accepted as Found even when both Apify and fallback only surface it", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({
      ok: true,
      candidates: [{ platform: "instagram", url: "https://www.instagram.com/dance.studio.207/", title: "Acme Dance Studio (@dance.studio.207)" }],
      attempts: 1,
      errorMessage: null,
    });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("instagram.com")) {
        return {
          ok: true,
          results: [{ title: "Acme Dance Studio (@dance.studio.207)", url: "https://www.instagram.com/dance.studio.207/", domain: "instagram.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const instagram = result.platforms.find((p) => p.platform === "instagram")!;
    expect(instagram.profileStatus).not.toBe("Found");
    expect(instagram.profileStatus).toBe("Unverified"); // suggestive but unconfirmed, not a confirmed absence either
  });

  it("8/9/10. connection: website link verifies -> Yes; verified profile with no detected link -> No; website check itself failing -> N/A", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("facebook.com") || query.includes("instagram.com") || query.includes("tiktok.com")) {
        const domain = query.includes("facebook.com") ? "facebook.com" : query.includes("instagram.com") ? "instagram.com" : "tiktok.com";
        return {
          ok: true,
          results: [{ title: "Acme - acmecorp.io", url: `https://www.${domain}/acme`, domain, snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });

    // Website check succeeds; only "facebook" is independently linked from the homepage.
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: {} as never,
      errorMessage: null,
    });
    vi.mocked(resolveConnectionSource).mockImplementation((_links, platform) => (platform === "facebook" ? "html" : null));

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const facebookOutcome = result.platforms.find((p) => p.platform === "facebook")!;
    expect(facebookOutcome.connected).toBe("Yes");
    expect(facebookOutcome.connectionSource).toBe("html");
    const instagramOutcome = result.platforms.find((p) => p.platform === "instagram")!;
    expect(instagramOutcome.connected).toBe("No");
    expect(instagramOutcome.connectionSource).toBe(null);

    // Now simulate the website fetch itself failing -- connection becomes N/A for fallback-sourced profiles.
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: false,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: {} as never,
      errorMessage: "fetch failed",
    });
    const result2 = await runSocialProfilesComponent({ auditId: "audit-2", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    expect(result2.platforms.find((p) => p.platform === "tiktok")!.connected).toBe("N/A");
    // Profile discovery must still continue despite the website fetch failure.
    expect(result2.platforms.find((p) => p.platform === "tiktok")!.profileStatus).toBe("Found");
  });

  it("15. all 8 platforms represented exactly once in normalized output", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    expect(result.platforms).toHaveLength(8);
    expect(new Set(result.platforms.map((p) => p.platform)).size).toBe(8);
    for (const platform of SOCIAL_PLATFORMS) {
      expect(result.platforms.some((p) => p.platform === platform)).toBe(true);
    }
  });

  it("17. one platform's fallback failure does not fail the whole component (partial results allowed)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("reddit.com")) {
        return { ok: false, results: [], attempts: 1, errorMessage: "reddit search failed" };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    expect(result.platforms).toHaveLength(8);
    const reddit = result.platforms.find((p) => p.platform === "reddit")!;
    expect(reddit.profileStatus).toBe("N/A — Could Not Verify");
    const others = result.platforms.filter((p) => p.platform !== "reddit");
    expect(others.every((p) => p.profileStatus === "Not Found")).toBe(true);
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
  });

  it("18. retry/re-run writes each checklist row exactly once (RUNNING + terminal), never duplicated per platform", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });

    // 8 platforms x 2 writes (RUNNING, then terminal) = 16 calls.
    expect(updateChecklistItemByIdempotencyKey).toHaveBeenCalledTimes(16);
    const keys = vi.mocked(updateChecklistItemByIdempotencyKey).mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(8); // one idempotency key per platform, written twice each
    expect(upsertComponentResult).toHaveBeenCalledTimes(1);
  });

  it("19/20. platform-level evidence preserves exact affected platforms -- Connected Yes never leaks into an unconnected list", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({
      ok: true,
      candidates: [{ platform: "linkedin", url: "https://linkedin.com/company/acme", title: "Acme | LinkedIn" }],
      attempts: 1,
      errorMessage: null,
    });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("facebook.com")) {
        return {
          ok: true,
          results: [{ title: "Acme - acmecorp.io", url: "https://www.facebook.com/acme", domain: "facebook.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });
    vi.mocked(resolveConnectionSource).mockReturnValue(null); // facebook not independently linked -> Connected No

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });

    const unconnected = result.platforms.filter((p) => p.profileStatus === "Found" && p.connected === "No").map((p) => p.platform);
    expect(unconnected).toContain("facebook");
    expect(unconnected).not.toContain("linkedin");

    const linkedin = result.platforms.find((p) => p.platform === "linkedin")!;
    expect(linkedin.connected).toBe("Yes");
  });

  it("Apify actor is called exactly once per component run regardless of platform count (cost control)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    expect(runSocialDiscoveryActor).toHaveBeenCalledTimes(1);
  });

  // -- SOCIAL-CONNECTION-005 -------------------------------------------------

  it("passes registeredDomain through to fetchWebsiteSocialLinks (needed for schema domain tie-back)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    expect(fetchWebsiteSocialLinks).toHaveBeenCalledWith(WEBSITE, DOMAIN);
  });

  it("both HTML and schema confirm the same profile -> connected Yes, connectionSource html+schema", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("linkedin.com")) {
        return {
          ok: true,
          results: [{ title: "Acme - acmecorp.io", url: "https://www.linkedin.com/company/acme", domain: "linkedin.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });
    vi.mocked(resolveConnectionSource).mockImplementation((_links, platform) => (platform === "linkedin" ? "html+schema" : null));

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const linkedin = result.platforms.find((p) => p.platform === "linkedin")!;
    expect(linkedin.connected).toBe("Yes");
    expect(linkedin.connectionSource).toBe("html+schema");
  });

  it("only externally discovered, no HTML/schema confirmation -> connected No, connectionSource null (Not Connected)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("youtube.com")) {
        return {
          ok: true,
          results: [
            { title: "Acme - acmecorp.io", url: "https://www.youtube.com/@acme", domain: "youtube.com", snippet: null },
          ],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });
    vi.mocked(resolveConnectionSource).mockReturnValue(null); // neither HTML nor schema confirms it

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Found");
    expect(youtube.connected).toBe("No");
    expect(youtube.connectionSource).toBe(null);
  });

  it("Ocuco YouTube regression: schema-only confirmation -> Found, connected Yes, connectionSource schema", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("youtube.com")) {
        return {
          ok: true,
          results: [
            {
              title: "Ocuco (ocuco.com) - Software with Vision",
              url: "https://www.youtube.com/@OcucoSoftwarewithVision",
              domain: "youtube.com",
              snippet: null,
            },
          ],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });
    // The audited site's Organization JSON-LD sameAs confirmed this exact
    // URL, but no visible <a href> anchor did -- schema-only confirmation.
    vi.mocked(resolveConnectionSource).mockImplementation((_links, platform, profileUrl) =>
      platform === "youtube" && profileUrl === "https://www.youtube.com/@OcucoSoftwarewithVision" ? "schema" : null
    );

    const result = await runSocialProfilesComponent({
      auditId: "audit-ocuco",
      companyName: "Ocuco",
      registeredDomain: "ocuco.com",
      websiteUrl: "https://www.ocuco.com",
    });

    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Found");
    expect(youtube.profileUrl).toBe("https://www.youtube.com/@OcucoSoftwarewithVision");
    expect(youtube.connected).toBe("Yes");
    expect(youtube.connectionSource).toBe("schema");
  });

  it("Not Found / Unverified / N/A — Could Not Verify outcomes carry connectionSource null (unchanged behavior)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    for (const p of result.platforms) {
      expect(p.profileStatus).toBe("Not Found");
      expect(p.connectionSource).toBe(null);
    }
  });

  // -- SOCIAL-CONNECTION-007: schema corroboration for Unverified candidates -

  const UNVERIFIED_YOUTUBE_URL = "https://www.youtube.com/@RandomChannelXYZ";

  function mockUnverifiedYoutubeCandidate() {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockImplementation(async (query: string) => {
      if (query.includes("youtube.com")) {
        return {
          ok: true,
          // Brand name appears in the title only -- no slug/domain
          // corroboration -- so validateProfileIdentity() (real, unmocked)
          // classifies this "Unverified", never "Confirmed".
          results: [{ title: "Acme Fan Channel", url: UNVERIFIED_YOUTUBE_URL, domain: "youtube.com", snippet: null }],
          attempts: 1,
          errorMessage: null,
        };
      }
      return { ok: true, results: [], attempts: 1, errorMessage: null };
    });
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: {} as never,
      errorMessage: null,
    });
  }

  it("Ocuco-pattern regression: Unverified candidate + exact schema sameAs match -> Found / Yes / schema, profileUrl preserved", async () => {
    mockUnverifiedYoutubeCandidate();
    vi.mocked(resolveConnectionSource).mockImplementation((_links, platform, profileUrl) =>
      platform === "youtube" && profileUrl === UNVERIFIED_YOUTUBE_URL ? "schema" : null
    );

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });

    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Found");
    expect(youtube.connected).toBe("Yes");
    expect(youtube.connectionSource).toBe("schema");
    expect(youtube.profileUrl).toBe(UNVERIFIED_YOUTUBE_URL);
    expect(youtube.matchedSignals).toContain("corroborated by validated first-party schema sameAs");
  });

  it("Unverified candidate + different schema handle -> remains Unverified", async () => {
    mockUnverifiedYoutubeCandidate();
    // Schema declares a DIFFERENT youtube handle than the discovered candidate.
    vi.mocked(resolveConnectionSource).mockImplementation((_links, platform, profileUrl) =>
      platform === "youtube" && profileUrl === "https://www.youtube.com/@SomeOtherOfficialHandle" ? "schema" : null
    );

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Unverified");
    expect(youtube.connected).toBe("N/A");
    expect(youtube.connectionSource).toBe(null);
    expect(youtube.profileUrl).toBe(null);
  });

  it("Unverified candidate + same platform but no URL-level schema match -> remains Unverified (platform alone never force-matches)", async () => {
    mockUnverifiedYoutubeCandidate();
    // resolveConnectionSource sees the correct platform but the exact URL
    // never matches anything in schema/html -- returns null, as the real
    // (unmocked) implementation would for a same-platform-only collision.
    vi.mocked(resolveConnectionSource).mockReturnValue(null);

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Unverified");
    expect(youtube.connectionSource).toBe(null);
  });

  it("Unverified candidate + invalid/wrong-domain schema -> remains Unverified", async () => {
    mockUnverifiedYoutubeCandidate();
    // Simulates website-links.ts's own domain-tie-back safeguard having
    // already rejected an unrelated Organization's sameAs -- from this
    // orchestration layer's point of view that's indistinguishable from
    // "no schema corroboration," i.e. resolveConnectionSource returns null.
    vi.mocked(resolveConnectionSource).mockReturnValue(null);

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Unverified");
    expect(youtube.connected).toBe("N/A");
  });

  it("non-promoted Unverified candidate URL is preserved internally (candidateProfileUrl) but never surfaces as profileUrl", async () => {
    mockUnverifiedYoutubeCandidate();
    vi.mocked(resolveConnectionSource).mockReturnValue(null);

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileUrl).toBe(null); // what the PDF/client-facing layer reads
    expect(youtube.candidateProfileUrl).toBe(UNVERIFIED_YOUTUBE_URL); // internal/debug-only
  });

  it("Confirmed-candidate behavior is unaffected by the new corroboration branch (early return, corroboration never runs)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({
      ok: true,
      candidates: [{ platform: "linkedin", url: "https://linkedin.com/company/acme", title: "Acme | LinkedIn" }],
      attempts: 1,
      errorMessage: null,
    });
    vi.mocked(resolveConnectionSource).mockReturnValue(null); // should never even be consulted for the Confirmed path

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const linkedin = result.platforms.find((p) => p.platform === "linkedin")!;
    expect(linkedin.profileStatus).toBe("Found");
    expect(linkedin.connected).toBe("Yes");
    expect(linkedin.connectionSource).toBe("html"); // Apify-confirmed path's existing fixed semantics, untouched
  });

  // -- SOCIAL-CONNECTION-013: validated first-party schema as a direct
  // discovery source when Apify + DataForSEO both come back completely
  // empty (no Confirmed, no Unverified candidate at all -- the real
  // AIC-2026-000014 Ocuco regression, where live discovery returned zero
  // YouTube candidates despite the site's own schema declaring one). -----

  it("no external candidate anywhere + exactly one schema sameAs URL -> Found / Yes / schema (the AIC-2026-000014 regression)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: { youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] } as never,
      errorMessage: null,
    });

    const result = await runSocialProfilesComponent({
      auditId: "audit-ocuco",
      companyName: "Ocuco",
      registeredDomain: "ocuco.com",
      websiteUrl: "https://www.ocuco.com",
    });

    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Found");
    expect(youtube.connected).toBe("Yes");
    expect(youtube.connectionSource).toBe("schema");
    expect(youtube.profileUrl).toBe("https://www.youtube.com/@OcucoSoftwarewithVision");
    expect(youtube.source).toBe("schema");
    expect(checklistStatusFor(youtube)).toBe("COMPLETED");

    // Every other platform has no schema entry either -- unchanged Not Found.
    const others = result.platforms.filter((p) => p.platform !== "youtube");
    expect(others.every((p) => p.profileStatus === "Not Found")).toBe(true);
  });

  it("no external candidate + no schema entry -> Not Found, unchanged (SOCIAL-CONNECTION-013 does not fabricate a profile)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: {} as never, // no sameAs entry for any platform
      errorMessage: null,
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Not Found");
    expect(youtube.connected).toBe("N/A");
    expect(youtube.connectionSource).toBe(null);
    expect(youtube.profileUrl).toBe(null);
  });

  it("no external candidate + two conflicting schema sameAs URLs for the same platform -> do NOT auto-promote, stays Not Found", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: {
        youtube: ["https://www.youtube.com/@OfficialHandle", "https://www.youtube.com/@AlsoDeclaredHandle"],
      } as never,
      errorMessage: null,
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Not Found");
    expect(youtube.connected).toBe("N/A");
    expect(youtube.connectionSource).toBe(null);
    expect(youtube.profileUrl).toBe(null);
  });

  it("website fetch itself failing (websiteLinks.ok = false) -> no schema source is consulted, stays Not Found", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: false,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: { youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] } as never,
      errorMessage: "fetch failed",
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(youtube.profileStatus).toBe("Not Found");
    expect(youtube.connectionSource).toBe(null);
  });

  it("non-YouTube platform: no external candidate + exactly one schema sameAs URL -> Found / Yes / schema (rule is platform-agnostic)", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({ ok: true, candidates: [], attempts: 1, errorMessage: null });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: { instagram: ["https://www.instagram.com/ocucoltd/"] } as never,
      errorMessage: null,
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const instagram = result.platforms.find((p) => p.platform === "instagram")!;
    expect(instagram.profileStatus).toBe("Found");
    expect(instagram.connected).toBe("Yes");
    expect(instagram.connectionSource).toBe("schema");
    expect(instagram.profileUrl).toBe("https://www.instagram.com/ocucoltd/");
  });

  it("a Confirmed Apify candidate on a different platform is unaffected by another platform's schema-only promotion", async () => {
    vi.mocked(runSocialDiscoveryActor).mockResolvedValue({
      ok: true,
      candidates: [{ platform: "linkedin", url: "https://linkedin.com/company/acme", title: "Acme | LinkedIn" }],
      attempts: 1,
      errorMessage: null,
    });
    vi.mocked(searchGoogleOrganic).mockResolvedValue({ ok: true, results: [], attempts: 1, errorMessage: null });
    vi.mocked(resolveConnectionSource).mockReturnValue(null);
    vi.mocked(fetchWebsiteSocialLinks).mockResolvedValue({
      ok: true,
      linksByPlatform: {} as never,
      schemaLinksByPlatform: { youtube: ["https://www.youtube.com/@OcucoSoftwarewithVision"] } as never,
      errorMessage: null,
    });

    const result = await runSocialProfilesComponent({ auditId: "audit-1", companyName: COMPANY, registeredDomain: DOMAIN, websiteUrl: WEBSITE });
    const linkedin = result.platforms.find((p) => p.platform === "linkedin")!;
    const youtube = result.platforms.find((p) => p.platform === "youtube")!;
    expect(linkedin.profileStatus).toBe("Found");
    expect(linkedin.source).toBe("apify"); // untouched -- Confirmed path returns before this branch is ever reached
    expect(youtube.profileStatus).toBe("Found");
    expect(youtube.source).toBe("schema");
  });
});
