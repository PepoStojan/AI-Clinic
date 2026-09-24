import { describe, expect, it } from "vitest";
import { selectBestCandidate, validateProfileIdentity } from "../identity-validation";

const BRAND = "Acme";
// Domain label ("acmecorp") deliberately differs from the brand name
// ("Acme") so tests can distinguish "domain explicitly referenced" (strong)
// from "brand name merely mentioned" (weak) -- using the same string for
// both would make those two signals indistinguishable.
const DOMAIN = "acmecorp.io";

describe("validateProfileIdentity", () => {
  it("Confirmed when the profile URL slug matches the brand name", () => {
    const result = validateProfileIdentity({
      platform: "linkedin",
      profileUrl: "https://www.linkedin.com/company/acme/",
      profileTitle: "Acme | LinkedIn",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Confirmed");
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it("Confirmed when the search title/snippet references the registered domain", () => {
    const result = validateProfileIdentity({
      platform: "facebook",
      profileUrl: "https://www.facebook.com/acmehq",
      profileTitle: "Acme - acmecorp.io - Official Page",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Confirmed");
  });

  it("Reject when the URL does not belong to the expected platform's domain", () => {
    const result = validateProfileIdentity({
      platform: "linkedin",
      profileUrl: "https://www.facebook.com/acme",
      profileTitle: "Acme",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Reject");
  });

  it("same-name profile with no slug/domain corroboration is never Confirmed (not accepted as Found)", () => {
    // A different "Acme" company entirely -- name collision only. The
    // handle carries no brand/domain signal at all, and the brand name
    // shows up only in the title, attached to an unrelated business.
    const result = validateProfileIdentity({
      platform: "instagram",
      profileUrl: "https://www.instagram.com/dance.studio.207/",
      profileTitle: "Acme Dance Studio (@dance.studio.207)",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).not.toBe("Confirmed");
  });

  it("Unverified when only a bare brand-name mention exists in the title, with no slug/domain corroboration", () => {
    const result = validateProfileIdentity({
      platform: "x_twitter",
      profileUrl: "https://x.com/randomhandle123",
      profileTitle: "Acme mentioned here",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Unverified");
  });

  it("Reject when there is no brand/domain signal at all", () => {
    const result = validateProfileIdentity({
      platform: "youtube",
      profileUrl: "https://www.youtube.com/@totallyunrelated",
      profileTitle: "Totally Unrelated Channel",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Reject");
  });
});

describe("live-verification regressions (2026-09-24, real Stripe fallback data)", () => {
  // Stripe's registered domain label ("stripe") equals its brand name
  // ("Stripe") -- the common real-world case. A real DataForSEO fallback
  // result for tiktok.com returned an unrelated video whose caption merely
  // said "Stripe" in prose; with the domain-label check this collapsed onto
  // the SAME signal as a bare brand mention and was wrongly Confirmed.
  it("does not Confirm via 'domain referenced' when the domain label equals the brand name and only the bare word is present", () => {
    const result = validateProfileIdentity({
      platform: "tiktok",
      profileUrl: "https://www.tiktok.com/@randomuser/video/123456",
      profileTitle: "What is Stripe payment processing? A quick explainer",
      brandName: "Stripe",
      registeredDomain: "stripe.com",
    });
    expect(result.verdict).not.toBe("Confirmed");
  });

  it("Confirms via 'domain referenced' when the FULL domain text is actually present", () => {
    const result = validateProfileIdentity({
      platform: "tiktok",
      profileUrl: "https://www.tiktok.com/@stripe",
      profileTitle: "Stripe (stripe.com) on TikTok",
      brandName: "Stripe",
      registeredDomain: "stripe.com",
    });
    expect(result.verdict).toBe("Confirmed");
  });

  it("a content/post-page URL whose long slug merely contains the brand as one word is never Confirmed via slug match", () => {
    // Real result: tiktok.com/discover/what-is-stripe-payment -- a topic
    // page, not stripe's profile.
    const result = validateProfileIdentity({
      platform: "tiktok",
      profileUrl: "https://www.tiktok.com/discover/what-is-stripe-payment",
      profileTitle: "What is Stripe Payment | TikTok Search",
      brandName: "Stripe",
      registeredDomain: "stripe.com",
    });
    expect(result.verdict).not.toBe("Confirmed");
  });

  it("a genuine profile-shaped URL (short handle path) still Confirms via slug match", () => {
    const result = validateProfileIdentity({
      platform: "tiktok",
      profileUrl: "https://www.tiktok.com/@stripe",
      profileTitle: "Stripe on TikTok",
      brandName: "Stripe",
      registeredDomain: "stripe.com",
    });
    expect(result.verdict).toBe("Confirmed");
  });
});

describe("selectBestCandidate", () => {
  it("prefers a Confirmed candidate over an Unverified one", () => {
    const best = selectBestCandidate([
      { verdict: "Unverified" as const, id: "a" },
      { verdict: "Confirmed" as const, id: "b" },
    ]);
    expect(best?.id).toBe("b");
  });

  it("falls back to Unverified when nothing is Confirmed", () => {
    const best = selectBestCandidate([{ verdict: "Unverified" as const, id: "a" }, { verdict: "Reject" as const, id: "c" }]);
    expect(best?.id).toBe("a");
  });

  it("returns null when every candidate is Rejected or the list is empty", () => {
    expect(selectBestCandidate([{ verdict: "Reject" as const, id: "a" }])).toBeNull();
    expect(selectBestCandidate([])).toBeNull();
  });
});
