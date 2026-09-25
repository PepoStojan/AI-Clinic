import { describe, expect, it } from "vitest";
import { buildFallbackInterpretation } from "../fallback";
import { validateInterpretation } from "../validator";

describe("buildFallbackInterpretation", () => {
  it("11. always contains exactly the 3 required fields", () => {
    const result = buildFallbackInterpretation("2 of 8 platforms had no verified profile.");
    expect(Object.keys(result).sort()).toEqual(["what_this_suggests", "what_to_consider", "what_we_observed"]);
  });

  it("12. never invents facts -- what_we_observed is the deterministic_reason verbatim", () => {
    const reason = "1 of 6 crawlers are fully blocked by robots.txt.";
    const result = buildFallbackInterpretation(reason);
    expect(result.what_we_observed).toBe(reason);
    expect(result.what_this_suggests).toBe("Visibility/presence/access is limited for the affected checks.");
    expect(result.what_to_consider).toBe("Review the affected checks and consider addressing them where relevant.");
  });

  it("the fallback output itself always passes validation for any component/affected set", () => {
    const reason = "1 platform(s) have a verified profile that is not connected to the official website.";
    const result = buildFallbackInterpretation(reason);
    const validation = validateInterpretation(JSON.stringify(result), {
      componentName: "social_profiles",
      affectedNames: ["facebook"],
      sourceText: reason,
    });
    expect(validation.ok).toBe(true);
  });
});
