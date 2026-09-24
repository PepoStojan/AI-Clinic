import { describe, expect, it, vi } from "vitest";
import {
  buildCrossRecordUrlIndex,
  CORROBORATION_ELIGIBLE_STATUSES,
  computeCrossRecordCorroboration,
  evaluateEntity,
  hasLooseMatch,
  hasWholeWordMatch,
  mentionClassFromEntityStatus,
  normalizeUrl,
  selectBestCandidateWindow,
  type EntityProfile,
  type SemanticCompareResult,
} from "../entity-validation";

// Port of dataforseo-test/test_entity_validation.py's VAL-002/VAL-003C
// scenarios, generalized to the real production profile shape (brandName /
// registeredDomain / productName only -- no category/services/location
// fixtures) per the approved generalization.

const PROFILE: EntityProfile = {
  brandName: "Acme",
  registeredDomain: "acme.example",
  productName: null,
};

function mustNotBeCalled(): Promise<SemanticCompareResult | null> {
  throw new Error("semanticCompareFn should not have been called for this scenario");
}

function stub(result: SemanticCompareResult) {
  const fn = vi.fn(async () => result);
  return fn;
}

describe("evaluateEntity -- VAL-002 core scenarios", () => {
  it("1. Probable Entity Match, no domain citation -> Mentioned", async () => {
    const fn = stub({ entity_status: "Probable Entity Match", confidence: 85, reason: "matches" });
    const result = await evaluateEntity({
      responseText: "Acme is a widget company based in Springfield.",
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });
    expect(result.entityStatus).toBe("Probable Entity Match");
    expect(result.usedClaudeSemantic).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mentionClassFromEntityStatus(result.entityStatus, true)).toBe("Mentioned");
  });

  it("2. Wrong Entity via conflicting semantic judgement -> Not Mentioned", async () => {
    const fn = stub({ entity_status: "Wrong Entity", confidence: 90, reason: "different company" });
    const result = await evaluateEntity({
      responseText: "Acme is a Spanish software company unrelated to widgets.",
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });
    expect(result.entityStatus).toBe("Wrong Entity");
    expect(mentionClassFromEntityStatus(result.entityStatus, true)).toBe("Not Mentioned");
  });

  it("3. Ambiguous when the response names multiple distinct companies", async () => {
    const fn = stub({ entity_status: "Ambiguous Entity", confidence: 20, reason: "multiple entities" });
    const result = await evaluateEntity({
      responseText: "Acme refers to several different companies.",
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });
    expect(result.entityStatus).toBe("Ambiguous Entity");
    expect(mentionClassFromEntityStatus(result.entityStatus, true)).toBe("Ambiguous");
  });

  it("4. Confirmed via domain citation never calls the semantic judge -> Strong Mention", async () => {
    const result = await evaluateEntity({
      responseText: "Acme provides widgets.",
      brandMention: true,
      domainCitation: true, // acme.example was cited
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: mustNotBeCalled,
    });
    expect(result.entityStatus).toBe("Confirmed Entity Match");
    expect(result.usedClaudeSemantic).toBe(false);
    expect(mentionClassFromEntityStatus(result.entityStatus, true)).toBe("Strong Mention");
  });

  it("4b. Confirmed via domain citation WITHOUT a literal brand mention -> Cited Only, never Strong Mention", async () => {
    const result = await evaluateEntity({
      responseText: "Widgets are best sourced from a Springfield-based manufacturer.",
      brandMention: false,
      domainCitation: true,
      looseMention: false,
      profile: PROFILE,
      semanticCompareFn: mustNotBeCalled,
    });
    expect(result.entityStatus).toBe("Confirmed Entity Match");
    expect(mentionClassFromEntityStatus(result.entityStatus, false)).toBe("Cited Only");
    expect(mentionClassFromEntityStatus(result.entityStatus, false)).not.toBe("Strong Mention");
  });

  it("5. Ambiguous when semantic corroboration is insufficient", async () => {
    const fn = stub({ entity_status: "Ambiguous Entity", confidence: 40, reason: "loosely related only" });
    const result = await evaluateEntity({
      responseText: "Acme provides general consulting services.",
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });
    expect(result.entityStatus).toBe("Ambiguous Entity");
    expect(mentionClassFromEntityStatus(result.entityStatus, true)).toBe("Ambiguous");
  });

  it("6. No Entity Signal never calls the semantic judge -> Not Mentioned", async () => {
    const result = await evaluateEntity({
      responseText: "This response never brings up the brand at all.",
      brandMention: false,
      domainCitation: false,
      looseMention: false,
      profile: PROFILE,
      semanticCompareFn: mustNotBeCalled,
    });
    expect(result.entityStatus).toBe("No Entity Signal");
    expect(result.usedClaudeSemantic).toBe(false);
    expect(mentionClassFromEntityStatus(result.entityStatus, false)).toBe("Not Mentioned");
  });
});

describe("evaluateEntity -- safety nets", () => {
  it("Claude cannot self-grant Confirmed Entity Match -- sanitized down to Probable", async () => {
    const fn = stub({ entity_status: "Confirmed Entity Match", confidence: 95, reason: "strong match" });
    const result = await evaluateEntity({
      responseText: "Acme is definitely the widget company in question.",
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });
    expect(result.entityStatus).toBe("Probable Entity Match");
  });

  it("malformed/null semantic output falls back to Ambiguous, never a guessed confirmed status", async () => {
    const fn = vi.fn(async () => null);
    const result = await evaluateEntity({
      responseText: "Acme is a widget company based in Springfield.",
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });
    expect(result.entityStatus).toBe("Ambiguous Entity");
    expect(result.usedClaudeSemantic).toBe(true);
  });
});

describe("selectBestCandidateWindow -- VAL-003C FIX 1 multi-occurrence scoring", () => {
  it("same un-stacked conflicting-domain score recurring across 3+ windows routes to ambiguous without calling Claude", async () => {
    const filler = "Lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(6);
    const text = [
      `Acme.io offers a diverse range of services. ${filler}`,
      `Acme.io also builds analytics dashboards. ${filler}`,
      `Acme.io additionally provides hosting. ${filler}`,
      `Acme.io furthermore runs a marketplace. ${filler}`,
    ].join(" ");

    const result = await evaluateEntity({
      responseText: text,
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: mustNotBeCalled,
    });

    expect(result.entityStatus).toBe("Ambiguous Entity");
    expect(result.usedClaudeSemantic).toBe(false);
    expect(result.snippetSelection?.ambiguousByScoring).toBe(true);
  });

  it("a single decisive conflicting-domain window (rest uninformative) still calls Claude", async () => {
    const text =
      "Acme.io is a full-service software provider specializing in AI and ML solutions " +
      "for enterprises. Users rate Acme.io highly on G2 for ease of use. Acme.io has a " +
      "strong reputation in the AI space, unrelated to the audited widget company.";

    const fn = stub({ entity_status: "Wrong Entity", confidence: 90, reason: "different Acme" });
    const result = await evaluateEntity({
      responseText: text,
      brandMention: true,
      domainCitation: false,
      looseMention: true,
      profile: PROFILE,
      semanticCompareFn: fn,
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.entityStatus).toBe("Wrong Entity");
    expect(result.snippetSelection?.ambiguousByScoring).toBe(false);
  });

  it("no occurrence found returns an empty, non-ambiguous-by-scoring selection", () => {
    const selection = selectBestCandidateWindow("Nothing relevant here.", PROFILE, 190);
    expect(selection.occurrenceCount).toBe(0);
    expect(selection.selected).toBeNull();
    expect(selection.ambiguousByScoring).toBe(false);
  });
});

describe("cross-record corroboration -- VAL-003C FIX 2", () => {
  function records() {
    return [
      {
        provider: "claude",
        citations: [{ url: "https://directory.example/profile/acme-widgets", title: "Acme reviews" }],
      },
      {
        provider: "google_ai",
        citations: [
          { url: "https://directory.example/profile/acme-widgets?page=2", title: "Acme - Widget Manufacturer - Directory" },
        ],
      },
      {
        provider: "chatgpt",
        citations: [{ url: "https://acme.io/", title: "Acme AI" }],
      },
    ];
  }

  it("attaches corroboration via normalized exact URL match, using the OTHER citation's own title signal", () => {
    const recs = records();
    const index = buildCrossRecordUrlIndex(recs, PROFILE);
    const corr = computeCrossRecordCorroboration(0, recs, index);
    expect(corr.crossRecordCorroboration).toBe(true);
    expect(corr.corroboratingProviders).toContain("google_ai");
    expect(corr.corroboratingSignals.length).toBeGreaterThan(0);
  });

  it("never fires without a shared normalized URL", () => {
    const recs = records();
    const index = buildCrossRecordUrlIndex(recs, PROFILE);
    const corr = computeCrossRecordCorroboration(2, recs, index);
    expect(corr.crossRecordCorroboration).toBe(false);
  });

  it("eligible-status set excludes Confirmed / Wrong / No Entity Signal", () => {
    expect(CORROBORATION_ELIGIBLE_STATUSES.has("Confirmed Entity Match")).toBe(false);
    expect(CORROBORATION_ELIGIBLE_STATUSES.has("Wrong Entity")).toBe(false);
    expect(CORROBORATION_ELIGIBLE_STATUSES.has("No Entity Signal")).toBe(false);
    expect(CORROBORATION_ELIGIBLE_STATUSES.has("Probable Entity Match")).toBe(true);
    expect(CORROBORATION_ELIGIBLE_STATUSES.has("Ambiguous Entity")).toBe(true);
  });

  it("normalizeUrl drops query string/trailing slash but stays exact on path", () => {
    expect(normalizeUrl("https://directory.example/profile/acme-widgets?page=2")).toBe(
      normalizeUrl("https://directory.example/profile/acme-widgets")
    );
    expect(normalizeUrl("https://directory.example/profile/acme-widgets")).not.toBe(
      normalizeUrl("https://directory.example/profile/other-widgets")
    );
  });
});

describe("word-boundary helpers", () => {
  it("hasWholeWordMatch requires a whole-word match, not a substring", () => {
    expect(hasWholeWordMatch("Acme builds widgets.", "Acme")).toBe(true);
    expect(hasWholeWordMatch("Acmeplex builds widgets.", "Acme")).toBe(false);
  });

  it("hasLooseMatch is true only when the whole-word match fails but a substring exists", () => {
    expect(hasLooseMatch("Acmeplex builds widgets.", "Acme")).toBe(true);
    expect(hasLooseMatch("Acme builds widgets.", "Acme")).toBe(false);
    expect(hasLooseMatch("Nothing relevant.", "Acme")).toBe(false);
  });
});
