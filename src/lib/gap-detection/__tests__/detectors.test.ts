import { describe, expect, it } from "vitest";
import {
  detectBrandRecognitionGaps,
  detectDirectoriesGaps,
  detectPromptVisibilityGaps,
  detectSocialProfilesGaps,
  detectTechnicalAccessibilityGaps,
} from "../detectors";

const AUDIT_ID = "audit-1";

describe("detectBrandRecognitionGaps", () => {
  it("1. Accurate -> no gap", () => {
    const gaps = detectBrandRecognitionGaps(AUDIT_ID, {
      providers: [{ provider: "openai", recognitionStatus: "Accurate", evidence: "" }],
    });
    expect(gaps).toHaveLength(0);
  });

  it("2. Partially Accurate -> gap", () => {
    const gaps = detectBrandRecognitionGaps(AUDIT_ID, {
      providers: [{ provider: "openai", recognitionStatus: "Partially Accurate", evidence: "" }],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].affectedChecks).toHaveLength(1);
  });

  it("3. No Result -> no gap", () => {
    const gaps = detectBrandRecognitionGaps(AUDIT_ID, {
      providers: [{ provider: "openai", recognitionStatus: "No Result", evidence: "" }],
    });
    expect(gaps).toHaveLength(0);
  });

  it("30. one clean component (all Accurate/No Result) creates no phantom gaps", () => {
    const gaps = detectBrandRecognitionGaps(AUDIT_ID, {
      providers: [
        { provider: "openai", recognitionStatus: "Accurate", evidence: "" },
        { provider: "gemini", recognitionStatus: "No Result", evidence: "" },
      ],
    });
    expect(gaps).toHaveLength(0);
  });

  it("singular title when exactly one provider is affected", () => {
    const gaps = detectBrandRecognitionGaps(AUDIT_ID, {
      providers: [{ provider: "openai", recognitionStatus: "Inaccurate", evidence: "" }],
    });
    expect(gaps[0].title).toBe("Brand description is inaccurate on openai");
  });

  it("plural title when several providers are affected", () => {
    const gaps = detectBrandRecognitionGaps(AUDIT_ID, {
      providers: [
        { provider: "openai", recognitionStatus: "Inaccurate", evidence: "" },
        { provider: "gemini", recognitionStatus: "Not Recognized", evidence: "" },
      ],
    });
    expect(gaps[0].title).toBe("Brand descriptions are inconsistent across AI systems");
  });
});

describe("detectPromptVisibilityGaps", () => {
  function row(overrides: Partial<Parameters<typeof detectPromptVisibilityGaps>[1]["providers"][number]>) {
    return {
      targetId: "target-1",
      promptIndex: 0,
      prompt: "What is Acme?",
      provider: "chatgpt",
      mentionClass: "Strong Mention",
      entityStatus: "Confirmed Entity Match",
      evidence: "",
      ...overrides,
    };
  }

  it("4. Strong Mention -> no gap", () => {
    expect(detectPromptVisibilityGaps(AUDIT_ID, { providers: [row({ mentionClass: "Strong Mention" })] })).toHaveLength(0);
  });
  it("5. Mentioned -> no gap", () => {
    expect(detectPromptVisibilityGaps(AUDIT_ID, { providers: [row({ mentionClass: "Mentioned" })] })).toHaveLength(0);
  });
  it("6. Cited Only -> no gap", () => {
    expect(detectPromptVisibilityGaps(AUDIT_ID, { providers: [row({ mentionClass: "Cited Only" })] })).toHaveLength(0);
  });
  it("9. No Result -> no gap (unavailable evidence, excluded)", () => {
    expect(detectPromptVisibilityGaps(AUDIT_ID, { providers: [row({ mentionClass: "No Result" })] })).toHaveLength(0);
  });

  it("7. Ambiguous -> gap", () => {
    const gaps = detectPromptVisibilityGaps(AUDIT_ID, { providers: [row({ mentionClass: "Ambiguous" })] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapType).toBe("ambiguous");
  });

  it("8. Not Mentioned -> gap", () => {
    const gaps = detectPromptVisibilityGaps(AUDIT_ID, { providers: [row({ mentionClass: "Not Mentioned" })] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapType).toBe("not_mentioned");
  });

  it("Ambiguous and Not Mentioned are never collapsed into one gap", () => {
    const gaps = detectPromptVisibilityGaps(AUDIT_ID, {
      providers: [row({ mentionClass: "Ambiguous", provider: "claude" }), row({ mentionClass: "Not Mentioned", provider: "gemini" })],
    });
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.gapType).sort()).toEqual(["ambiguous", "not_mentioned"]);
    // Each gap contains only its OWN affected rows.
    expect(gaps.find((g) => g.gapType === "ambiguous")!.affectedChecks).toHaveLength(1);
    expect(gaps.find((g) => g.gapType === "not_mentioned")!.affectedChecks).toHaveLength(1);
  });

  it("preserves target, prompt, provider, and mention/entity status in affected checks and evidence", () => {
    const gaps = detectPromptVisibilityGaps(AUDIT_ID, {
      providers: [row({ mentionClass: "Not Mentioned", targetId: "target-42", prompt: "Best widgets?", provider: "gemini" })],
    });
    expect(gaps[0].affectedChecks[0]).toMatchObject({ targetId: "target-42", prompt: "Best widgets?", provider: "gemini" });
    expect(gaps[0].evidence[0]).toMatchObject({ target: "target-42", prompt: "Best widgets?", provider: "gemini" });
  });
});

describe("detectSocialProfilesGaps", () => {
  function row(overrides: Partial<Parameters<typeof detectSocialProfilesGaps>[1]["platforms"][number]>) {
    return { platform: "linkedin", profileStatus: "Found", connected: "Yes", evidence: "", ...overrides };
  }

  it("10. Found + Connected Yes -> no gap", () => {
    expect(detectSocialProfilesGaps(AUDIT_ID, { platforms: [row({})] })).toHaveLength(0);
  });

  it("11. Found + Connected No -> gap", () => {
    const gaps = detectSocialProfilesGaps(AUDIT_ID, { platforms: [row({ platform: "facebook", connected: "No" })] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapType).toBe("not_connected");
  });

  it("12. Not Found -> gap", () => {
    const gaps = detectSocialProfilesGaps(AUDIT_ID, { platforms: [row({ platform: "reddit", profileStatus: "Not Found", connected: "N/A" })] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapType).toBe("not_found");
  });

  it("13. N/A — Could Not Verify -> no gap", () => {
    expect(
      detectSocialProfilesGaps(AUDIT_ID, { platforms: [row({ profileStatus: "N/A — Could Not Verify", connected: "N/A" })] })
    ).toHaveLength(0);
  });

  it("14/15. a clean LinkedIn must not appear in a Facebook-only not-connected gap, and affected_count matches actual rows", () => {
    const gaps = detectSocialProfilesGaps(AUDIT_ID, {
      platforms: [
        row({ platform: "linkedin", profileStatus: "Found", connected: "Yes" }),
        row({ platform: "facebook", profileStatus: "Found", connected: "No" }),
      ],
    });
    const notConnected = gaps.find((g) => g.gapType === "not_connected")!;
    expect(notConnected.affectedChecks).toHaveLength(1);
    expect(notConnected.affectedChecks.map((c) => c.platform)).toEqual(["facebook"]);
    expect(notConnected.affectedChecks.map((c) => c.platform)).not.toContain("linkedin");
  });

  it("singular title when exactly one platform is affected", () => {
    const gaps = detectSocialProfilesGaps(AUDIT_ID, { platforms: [row({ platform: "facebook", connected: "No" })] });
    expect(gaps[0].title).toBe("Facebook profile is not connected to your website");
  });

  it("not_connected and not_found are separate gaps, each with only their own affected platforms", () => {
    const gaps = detectSocialProfilesGaps(AUDIT_ID, {
      platforms: [
        row({ platform: "facebook", profileStatus: "Found", connected: "No" }),
        row({ platform: "reddit", profileStatus: "Unverified", connected: "N/A" }),
      ],
    });
    expect(gaps).toHaveLength(2);
    const notConnected = gaps.find((g) => g.gapType === "not_connected")!;
    const notFound = gaps.find((g) => g.gapType === "not_found")!;
    expect(notConnected.affectedChecks.map((c) => c.platform)).toEqual(["facebook"]);
    expect(notFound.affectedChecks.map((c) => c.platform)).toEqual(["reddit"]);
  });
});

describe("detectDirectoriesGaps", () => {
  function row(overrides: Partial<Parameters<typeof detectDirectoriesGaps>[1]["platforms"][number]>) {
    return { platform: "g2", status: "Found", evidence: "", ...overrides };
  }

  it("16. Found -> no gap", () => {
    expect(detectDirectoriesGaps(AUDIT_ID, { platforms: [row({})] })).toHaveLength(0);
  });
  it("17. Not Found -> gap", () => {
    const gaps = detectDirectoriesGaps(AUDIT_ID, { platforms: [row({ status: "Not Found" })] });
    expect(gaps).toHaveLength(1);
  });
  it("18. Unverified -> gap", () => {
    const gaps = detectDirectoriesGaps(AUDIT_ID, { platforms: [row({ status: "Unverified" })] });
    expect(gaps).toHaveLength(1);
  });
  it("19. N/A — Could Not Verify -> no gap", () => {
    expect(detectDirectoriesGaps(AUDIT_ID, { platforms: [row({ status: "N/A — Could Not Verify" })] })).toHaveLength(0);
  });

  it("combines missing/unverified directories into one gap, excluding clean and N/A rows", () => {
    const gaps = detectDirectoriesGaps(AUDIT_ID, {
      platforms: [
        row({ platform: "g2", status: "Found" }),
        row({ platform: "capterra", status: "Not Found" }),
        row({ platform: "clutch", status: "Unverified" }),
        row({ platform: "trustpilot", status: "N/A — Could Not Verify" }),
      ],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].title).toBe("Limited third-party directory presence");
    expect(gaps[0].affectedChecks.map((c) => c.platform).sort()).toEqual(["capterra", "clutch"]);
  });
});

describe("detectTechnicalAccessibilityGaps", () => {
  function row(overrides: Partial<Parameters<typeof detectTechnicalAccessibilityGaps>[1]["crawlers"][number]>) {
    return { crawler: "googlebot", userAgent: "Googlebot", status: "Allowed", reason: "", ...overrides };
  }

  it("20. Allowed -> no gap", () => {
    expect(detectTechnicalAccessibilityGaps(AUDIT_ID, { crawlers: [row({})] })).toHaveLength(0);
  });

  it("21. Blocked -> gap", () => {
    const gaps = detectTechnicalAccessibilityGaps(AUDIT_ID, {
      crawlers: [row({ crawler: "gptbot", userAgent: "GPTBot", status: "Blocked" })],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].title).toBe("GPTBot is blocked");
  });

  it("22. Allowed with restrictions -> gap", () => {
    const gaps = detectTechnicalAccessibilityGaps(AUDIT_ID, { crawlers: [row({ status: "Allowed with restrictions" })] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapType).toBe("restricted");
  });

  it("23. Cannot Verify -> no gap", () => {
    expect(detectTechnicalAccessibilityGaps(AUDIT_ID, { crawlers: [row({ status: "Cannot Verify" })] })).toHaveLength(0);
  });

  it("blocked and restricted are separate gaps", () => {
    const gaps = detectTechnicalAccessibilityGaps(AUDIT_ID, {
      crawlers: [
        row({ crawler: "gptbot", userAgent: "GPTBot", status: "Blocked" }),
        row({ crawler: "bingbot", userAgent: "Bingbot", status: "Allowed with restrictions" }),
      ],
    });
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.gapType).sort()).toEqual(["blocked", "restricted"]);
  });

  it("24. llms.txt/robots.txt file status never factors into this detector at all (no such field exists on crawler rows)", () => {
    // This detector only ever receives crawler rows -- there is no
    // llms.txt/robots.txt field it could act on, so absence can never
    // become a gap here by construction.
    const gaps = detectTechnicalAccessibilityGaps(AUDIT_ID, { crawlers: [row({ status: "Allowed" })] });
    expect(gaps).toHaveLength(0);
  });
});
