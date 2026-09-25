import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { SESSION_COOKIE_NAME, createSessionCookieValue } from "../../src/lib/auth/session";

const ORIGINAL_PASSWORD = process.env.AI_CLINIC_SHARED_PASSWORD;

describe("proxy (access control) -- protected routes", () => {
  beforeEach(() => {
    process.env.AI_CLINIC_SHARED_PASSWORD = "test-shared-password";
  });
  afterEach(() => {
    process.env.AI_CLINIC_SHARED_PASSWORD = ORIGINAL_PASSWORD;
  });

  it("3. a protected route without a session cookie redirects to /login", async () => {
    const request = new NextRequest(new URL("http://localhost/audits"));
    const response = await proxy(request);
    expect(response.status).toBe(307); // NextResponse.redirect default
    expect(response.headers.get("location")).toContain("/login");
  });

  it("a protected route with a valid session cookie passes through", async () => {
    const cookieValue = await createSessionCookieValue();
    const request = new NextRequest(new URL("http://localhost/audits"), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
    });
    const response = await proxy(request);
    // NextResponse.next() has no redirect location and a 200-ish passthrough status.
    expect(response.headers.get("location")).toBeNull();
  });

  it("a protected route with an invalid session cookie still redirects", async () => {
    const request = new NextRequest(new URL("http://localhost/audits"), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=garbage` },
    });
    const response = await proxy(request);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("/login itself is never redirected (no infinite loop)", async () => {
    const request = new NextRequest(new URL("http://localhost/login"));
    const response = await proxy(request);
    expect(response.headers.get("location")).toBeNull();
  });
});
