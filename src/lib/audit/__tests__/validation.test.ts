import { describe, expect, it } from "vitest";
import { AuditValidationError, validateAuditInput, type AuditCreationInput } from "../validation";

const baseInput: AuditCreationInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  companyName: "Analytical Engines Inc",
  websiteUrl: "https://example.com",
  mainPrompts: ["What is Analytical Engines?"],
};

describe("validateAuditInput", () => {
  it("accepts a valid brand-level audit with no additional targets", () => {
    const result = validateAuditInput(baseInput);

    expect(result.contactName).toBe("Ada Lovelace");
    expect(result.contactEmail).toBe("ada@example.com");
    expect(result.registeredDomain).toBe("example.com");
    expect(result.homepageTarget.targetType).toBe("homepage");
    expect(result.homepageTarget.prompts).toEqual(["What is Analytical Engines?"]);
    expect(result.additionalTargets).toEqual([]);
  });

  it("does not require Main Product / Service Name for a brand-level audit", () => {
    const result = validateAuditInput(baseInput);
    expect(result.homepageTarget.name).toBeNull();
  });

  it("accepts additional targets with their own prompts", () => {
    const result = validateAuditInput({
      ...baseInput,
      additionalTargets: [
        { name: "Pricing", url: "https://example.com/pricing", prompts: ["Is it expensive?"] },
      ],
    });

    expect(result.additionalTargets).toHaveLength(1);
    expect(result.additionalTargets[0]).toMatchObject({
      targetType: "additional",
      name: "Pricing",
      url: "https://example.com/pricing",
      prompts: ["Is it expensive?"],
    });
  });

  it("requires at least one main prompt", () => {
    expect(() => validateAuditInput({ ...baseInput, mainPrompts: [] })).toThrow(
      AuditValidationError
    );
    expect(() => validateAuditInput({ ...baseInput, mainPrompts: ["   "] })).toThrow(
      AuditValidationError
    );
  });

  it("removes blank prompts and dedupes case/whitespace-insensitively", () => {
    const result = validateAuditInput({
      ...baseInput,
      mainPrompts: ["  What is X?  ", "", "what is x?", "What does X offer?"],
    });
    expect(result.homepageTarget.prompts).toEqual(["What is X?", "What does X offer?"]);
  });

  it("collects every missing-field issue instead of failing on the first", () => {
    try {
      validateAuditInput({
        firstName: "",
        lastName: "",
        email: "not-an-email",
        companyName: "",
        websiteUrl: "not-a-url",
        mainPrompts: [],
      });
      throw new Error("expected validateAuditInput to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuditValidationError);
      const issues = (error as AuditValidationError).issues;
      expect(issues.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("deduplicates an additional target URL that matches the homepage", () => {
    const result = validateAuditInput({
      ...baseInput,
      additionalTargets: [{ url: "https://example.com/", prompts: [] }],
    });
    expect(result.additionalTargets).toEqual([]);
    expect(result.droppedDuplicateTargetUrls).toEqual(["https://example.com/"]);
  });

  it("deduplicates two additional targets pointing at the same URL", () => {
    const result = validateAuditInput({
      ...baseInput,
      additionalTargets: [
        { url: "https://example.com/pricing", prompts: [] },
        { url: "https://example.com/pricing/", prompts: [] },
      ],
    });
    expect(result.additionalTargets).toHaveLength(1);
    expect(result.droppedDuplicateTargetUrls).toHaveLength(1);
  });
});
