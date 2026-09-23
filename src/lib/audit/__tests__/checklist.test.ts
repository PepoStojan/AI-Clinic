import { describe, expect, it } from "vitest";
import {
  BRAND_RECOGNITION_PROVIDERS,
  DIRECTORY_PLATFORMS,
  PROMPT_VISIBILITY_PROVIDERS,
  SOCIAL_PLATFORMS,
  TECHNICAL_CRAWLERS,
  TECHNICAL_FILES,
  buildChecklistItems,
  countExpectedChecklistItems,
} from "../checklist";

const AUDIT_ID = "audit-1";

function byComponent(items: ReturnType<typeof buildChecklistItems>, component: string) {
  return items.filter((item) => item.component_name === component);
}

describe("canonical vocabulary sizes", () => {
  it("locks the exact counts from the Build Spec", () => {
    expect(BRAND_RECOGNITION_PROVIDERS).toHaveLength(4);
    expect(PROMPT_VISIBILITY_PROVIDERS).toHaveLength(4);
    expect(SOCIAL_PLATFORMS).toHaveLength(8);
    expect(DIRECTORY_PLATFORMS).toHaveLength(10);
    expect(TECHNICAL_CRAWLERS).toHaveLength(6);
    expect(TECHNICAL_FILES).toHaveLength(2);
  });
});

describe("buildChecklistItems", () => {
  it("creates exactly 4 Brand Recognition rows, domain-level (no target)", () => {
    const items = buildChecklistItems(AUDIT_ID, [{ id: "t1", prompts: [] }]);
    const brand = byComponent(items, "brand_recognition");
    expect(brand).toHaveLength(4);
    expect(brand.every((row) => row.target_id === null)).toBe(true);
  });

  it("creates exactly 8 social, 10 directory, and 8 technical rows regardless of prompts", () => {
    const items = buildChecklistItems(AUDIT_ID, [{ id: "t1", prompts: [] }]);
    expect(byComponent(items, "social_profiles")).toHaveLength(8);
    expect(byComponent(items, "directories")).toHaveLength(10);
    // 6 crawlers + robots.txt + llms.txt
    expect(byComponent(items, "technical_accessibility")).toHaveLength(8);
  });

  it("expands Prompt Visibility per target x prompt x 4 providers", () => {
    const items = buildChecklistItems(AUDIT_ID, [
      { id: "homepage", prompts: ["p1", "p2"] },
      { id: "additional-1", prompts: ["p3"] },
    ]);
    const promptVisibility = byComponent(items, "prompt_visibility");
    // (2 prompts + 1 prompt) * 4 providers = 12
    expect(promptVisibility).toHaveLength(12);
    expect(promptVisibility.filter((row) => row.target_id === "homepage")).toHaveLength(8);
    expect(promptVisibility.filter((row) => row.target_id === "additional-1")).toHaveLength(4);
  });

  it("creates zero Prompt Visibility rows for a target with no prompts", () => {
    const items = buildChecklistItems(AUDIT_ID, [{ id: "t1", prompts: [] }]);
    expect(byComponent(items, "prompt_visibility")).toHaveLength(0);
  });

  it("produces a deterministic idempotency key per row, stable across calls", () => {
    const first = buildChecklistItems(AUDIT_ID, [{ id: "t1", prompts: ["p1"] }]);
    const second = buildChecklistItems(AUDIT_ID, [{ id: "t1", prompts: ["p1"] }]);
    expect(first.map((row) => row.idempotency_key)).toEqual(
      second.map((row) => row.idempotency_key)
    );
    // and every key within one audit is unique
    const keys = first.map((row) => row.idempotency_key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("countExpectedChecklistItems", () => {
  it("matches the documented formula: 30 + 4 * totalPrompts", () => {
    expect(countExpectedChecklistItems([{ id: "t1", prompts: ["p1"] }])).toBe(34);
    expect(countExpectedChecklistItems([{ id: "t1", prompts: [] }])).toBe(30);
    expect(
      countExpectedChecklistItems([
        { id: "t1", prompts: ["p1", "p2"] },
        { id: "t2", prompts: ["p3"] },
      ])
    ).toBe(42);
  });

  it("matches the actual number of rows buildChecklistItems produces", () => {
    const targets = [
      { id: "t1", prompts: ["p1", "p2"] },
      { id: "t2", prompts: ["p3"] },
    ];
    expect(buildChecklistItems(AUDIT_ID, targets)).toHaveLength(
      countExpectedChecklistItems(targets)
    );
  });
});
