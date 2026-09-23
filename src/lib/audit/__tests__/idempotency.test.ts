import { describe, expect, it } from "vitest";
import { buildIdempotencyKey } from "../idempotency";

describe("buildIdempotencyKey", () => {
  it("is stable for identical inputs", () => {
    const params = {
      auditId: "audit-1",
      componentName: "brand_recognition",
      targetId: "target-1",
      checkKey: "chatgpt_what_is",
    };
    expect(buildIdempotencyKey(params)).toBe(buildIdempotencyKey({ ...params }));
  });

  it("changes when any component of the key changes", () => {
    const base = {
      auditId: "audit-1",
      componentName: "brand_recognition",
      targetId: "target-1",
      checkKey: "chatgpt_what_is",
    };
    const baseline = buildIdempotencyKey(base);

    expect(buildIdempotencyKey({ ...base, auditId: "audit-2" })).not.toBe(baseline);
    expect(buildIdempotencyKey({ ...base, componentName: "prompt_visibility" })).not.toBe(
      baseline
    );
    expect(buildIdempotencyKey({ ...base, targetId: "target-2" })).not.toBe(baseline);
    expect(buildIdempotencyKey({ ...base, checkKey: "gemini_what_is" })).not.toBe(baseline);
  });

  it("normalizes a null target to a stable placeholder", () => {
    const key = buildIdempotencyKey({
      auditId: "audit-1",
      componentName: "social_profiles",
      targetId: null,
      checkKey: "linkedin",
    });
    expect(key).toBe("audit-1:social_profiles:none:linkedin");
  });
});
