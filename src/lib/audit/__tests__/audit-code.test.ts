import { describe, expect, it } from "vitest";
import { formatAuditCode, isValidAuditCode } from "../audit-code";

describe("formatAuditCode", () => {
  it("formats with zero-padded 6-digit sequence", () => {
    expect(formatAuditCode(2026, 1)).toBe("AIC-2026-000001");
    expect(formatAuditCode(2026, 42)).toBe("AIC-2026-000042");
    expect(formatAuditCode(2026, 999999)).toBe("AIC-2026-999999");
  });

  it("rejects invalid sequences", () => {
    expect(() => formatAuditCode(2026, 0)).toThrow();
    expect(() => formatAuditCode(2026, 1_000_000)).toThrow();
  });

  it("rejects invalid years", () => {
    expect(() => formatAuditCode(26, 1)).toThrow();
  });
});

describe("isValidAuditCode", () => {
  it("accepts the canonical pattern", () => {
    expect(isValidAuditCode("AIC-2026-000001")).toBe(true);
  });

  it("rejects malformed codes", () => {
    expect(isValidAuditCode("AIC-26-1")).toBe(false);
    expect(isValidAuditCode("AIC-2026-1")).toBe(false);
    expect(isValidAuditCode("aic-2026-000001")).toBe(false);
  });
});
