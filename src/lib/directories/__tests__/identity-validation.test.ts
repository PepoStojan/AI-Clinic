import { describe, expect, it } from "vitest";
import { selectBestCandidate, validateListingIdentity } from "../identity-validation";

const BRAND = "Acme";
// Domain label ("acmecorp") deliberately differs from the brand name so
// tests can distinguish "domain explicitly referenced" from "brand name
// merely mentioned" -- see COMP-003's live-verification lesson: using the
// same string for both collapses the two signals.
const DOMAIN = "acmecorp.io";

describe("validateListingIdentity", () => {
  it("Confirmed when the registered domain appears in the listing URL path (e.g. Trustpilot's /review/<domain>)", () => {
    const result = validateListingIdentity({
      platform: "trustpilot",
      listingUrl: "https://www.trustpilot.com/review/acmecorp.io",
      listingTitle: "Acme Reviews",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Confirmed");
    expect(result.matchedSignals).toContain("registered domain present in listing URL path");
  });

  it("Confirmed when the listing URL slug matches the brand name", () => {
    const result = validateListingIdentity({
      platform: "g2",
      listingUrl: "https://www.g2.com/products/acme/reviews",
      listingTitle: "Acme Reviews & Product Details",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Confirmed");
  });

  it("Confirmed when the search title/snippet references the full registered domain", () => {
    const result = validateListingIdentity({
      platform: "capterra",
      listingUrl: "https://www.capterra.com/p/123456/acme-suite/",
      listingTitle: "Acme Suite - acmecorp.io - Capterra",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Confirmed");
  });

  it("Reject when the URL does not belong to the expected platform's domain", () => {
    const result = validateListingIdentity({
      platform: "g2",
      listingUrl: "https://www.capterra.com/p/123456/acme/",
      listingTitle: "Acme",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Reject");
  });

  it("same-name wrong company is never Confirmed from a content/editorial page merely naming the brand", () => {
    const result = validateListingIdentity({
      platform: "g2",
      listingUrl: "https://www.g2.com/categories/best-project-tools",
      listingTitle: "10 Best Project Tools including Acme and others",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).not.toBe("Confirmed");
  });

  it("live regression (2026-09-25, real Stripe data): an unrelated Google-hosted docs page is rejected as google_business_profile, not Confirmed", () => {
    // Real result: docs.cloud.google.com/integration-connectors/.../stripe/configure
    // -- a Google Cloud integration doc, not a Business Profile listing.
    // A bare "google.com" domain match let this slip through as Confirmed
    // before PLATFORM_DOMAINS.google_business_profile was narrowed.
    const result = validateListingIdentity({
      platform: "google_business_profile",
      listingUrl: "https://docs.cloud.google.com/integration-connectors/docs/connectors/stripe/configure",
      listingTitle: "Configure the Stripe connector | Integration Connectors",
      brandName: "Stripe",
      registeredDomain: "stripe.com",
    });
    expect(result.verdict).toBe("Reject");
  });

  it("a genuine g.page GBP share link is still classified and confirmed correctly", () => {
    const result = validateListingIdentity({
      platform: "google_business_profile",
      listingUrl: "https://g.page/acme",
      listingTitle: "Acme - Google Business Profile",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Confirmed");
  });

  it("Unverified when only a bare brand-name mention exists, with no domain/slug corroboration", () => {
    const result = validateListingIdentity({
      platform: "clutch",
      listingUrl: "https://clutch.co/profile/some-random-id",
      listingTitle: "Acme mentioned in this review",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Unverified");
  });

  it("Reject when there is no brand/domain signal at all", () => {
    const result = validateListingIdentity({
      platform: "product_hunt",
      listingUrl: "https://www.producthunt.com/posts/totally-unrelated",
      listingTitle: "Totally Unrelated Product",
      brandName: BRAND,
      registeredDomain: DOMAIN,
    });
    expect(result.verdict).toBe("Reject");
  });
});

describe("selectBestCandidate", () => {
  it("prefers Confirmed over Unverified", () => {
    const best = selectBestCandidate([
      { verdict: "Unverified" as const, id: "a" },
      { verdict: "Confirmed" as const, id: "b" },
    ]);
    expect(best?.id).toBe("b");
  });

  it("returns null when every candidate is Rejected or the list is empty", () => {
    expect(selectBestCandidate([{ verdict: "Reject" as const, id: "a" }])).toBeNull();
    expect(selectBestCandidate([])).toBeNull();
  });
});
