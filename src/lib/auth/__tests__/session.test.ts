import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue, verifySharedPassword } from "../session";

const ORIGINAL_PASSWORD = process.env.AI_CLINIC_SHARED_PASSWORD;

describe("session", () => {
  beforeEach(() => {
    process.env.AI_CLINIC_SHARED_PASSWORD = "test-shared-password";
  });
  afterEach(() => {
    process.env.AI_CLINIC_SHARED_PASSWORD = ORIGINAL_PASSWORD;
  });

  it("1. wrong password is denied", () => {
    expect(verifySharedPassword("definitely-wrong")).toBe(false);
  });

  it("2. correct password is accepted", () => {
    expect(verifySharedPassword("test-shared-password")).toBe(true);
  });

  it("a password of different length is denied without throwing", () => {
    expect(verifySharedPassword("x")).toBe(false);
    expect(verifySharedPassword("")).toBe(false);
  });

  it("a freshly created session cookie value verifies as valid", async () => {
    const value = await createSessionCookieValue();
    expect(await verifySessionCookieValue(value)).toBe(true);
  });

  it("a tampered cookie value fails verification", async () => {
    const value = await createSessionCookieValue();
    const [payload] = value.split(".");
    const tampered = `${payload}.not-the-real-signature`;
    expect(await verifySessionCookieValue(tampered)).toBe(false);
  });

  it("an expired cookie value fails verification", async () => {
    // A valid signature for one payload does not verify against a
    // different (already-expired) payload -- the signature check is
    // over the concatenation, so swapping the timestamp alone must fail
    // even though the format is otherwise well-formed.
    const value = await createSessionCookieValue();
    const [, signature] = value.split(".");
    const expiredPayload = String(Date.now() - 1000);
    expect(await verifySessionCookieValue(`${expiredPayload}.${signature}`)).toBe(false);
  });

  it("a missing cookie value is denied", async () => {
    expect(await verifySessionCookieValue(undefined)).toBe(false);
    expect(await verifySessionCookieValue(null)).toBe(false);
    expect(await verifySessionCookieValue("")).toBe(false);
  });
});
