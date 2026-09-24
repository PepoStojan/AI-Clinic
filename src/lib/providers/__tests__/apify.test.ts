import { describe, expect, it } from "vitest";
import { extractSocialCandidates } from "../apify";

// Regression test for the REAL codescraper/website-social-links-scraper
// output shape, captured from a live actor run against stripe.com during
// COMP-003 live verification (2026-09-24). The actor nests results under
// `socialProfiles`, keyed by ITS OWN platform names (`socialProfiles.twitter`,
// not `x_twitter`), each an array of URLs -- not the flat/guessed shape
// originally assumed. extractSocialCandidates deep-scans by URL domain
// rather than trusting field names, so it should extract correctly without
// any awareness of this specific field layout.
const REAL_ACTOR_OUTPUT_SAMPLE = [
  {
    inputUrl: "https://stripe.com",
    targetDomain: "stripe.com",
    brandName: "stripe",
    statistics: { pagesScanned: 5, totalProfilesFound: 7, platformsFound: 5, bioLinksFollowed: 0 },
    socialProfiles: {
      facebook: ["https://facebook.com/stripehq"],
      twitter: ["https://twitter.com/stripe", "https://x.com/stripe"],
      linkedin: ["https://linkedin.com/company/stripe"],
      instagram: ["https://instagram.com/stripehq"],
      youtube: ["https://youtube.com/@stripe", "https://youtube.com/@StripeDev"],
    },
  },
];

describe("extractSocialCandidates -- real codescraper/website-social-links-scraper output", () => {
  it("extracts all 7 candidate URLs across the 5 platforms the actor found, correctly classified", () => {
    const candidates = extractSocialCandidates(REAL_ACTOR_OUTPUT_SAMPLE);
    expect(candidates).toHaveLength(7);

    const byPlatform = candidates.reduce<Record<string, string[]>>((acc, c) => {
      (acc[c.platform] ??= []).push(c.url);
      return acc;
    }, {});

    expect(byPlatform.facebook).toEqual(["https://facebook.com/stripehq"]);
    expect(byPlatform.linkedin).toEqual(["https://linkedin.com/company/stripe"]);
    expect(byPlatform.instagram).toEqual(["https://instagram.com/stripehq"]);
    expect(byPlatform.youtube).toEqual(["https://youtube.com/@stripe", "https://youtube.com/@StripeDev"]);

    // The actor's own field is named "twitter" -- must still classify onto
    // our canonical "x_twitter" key, and both twitter.com/x.com hosts
    // collapse onto that same platform.
    expect(byPlatform.x_twitter).toEqual(["https://twitter.com/stripe", "https://x.com/stripe"]);
    expect(byPlatform.twitter).toBeUndefined();
  });

  it("platforms absent from socialProfiles (not even an empty array) simply produce zero candidates, never an error", () => {
    // tiktok/threads/reddit were absent entirely in the real captured
    // payload (stripe.com has no detected profile there) -- confirms a
    // missing key is handled the same as a miss, not a crash.
    const candidates = extractSocialCandidates(REAL_ACTOR_OUTPUT_SAMPLE);
    expect(candidates.some((c) => c.platform === "tiktok")).toBe(false);
    expect(candidates.some((c) => c.platform === "threads")).toBe(false);
    expect(candidates.some((c) => c.platform === "reddit")).toBe(false);
  });
});
