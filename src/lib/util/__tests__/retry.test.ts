import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../retry";

describe("withRetry", () => {
  it("returns immediately on success with no retries", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { isRecoverable: () => true, baseDelayMs: 1 });
    expect(result.value).toBe("ok");
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries recoverable errors up to maxRetries, then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("recoverable");
      return "ok";
    });
    const result = await withRetry(fn, { isRecoverable: () => true, baseDelayMs: 1, maxRetries: 2 });
    expect(result.value).toBe("ok");
    expect(result.attempts).toBe(3);
  });

  it("throws immediately for a non-recoverable error, no retry", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("non-recoverable"));
    await expect(
      withRetry(fn, { isRecoverable: () => false, baseDelayMs: 1, maxRetries: 2 })
    ).rejects.toThrow("non-recoverable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries recoverable failures (max 2 retries = 3 attempts)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(
      withRetry(fn, { isRecoverable: () => true, baseDelayMs: 1, maxRetries: 2 })
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
