// Deliberately no `import "server-only"` here -- this module must also
// run inside Next.js middleware (Edge runtime by default), which the
// server-only package's guard does not reliably support. It is never
// imported from a client component; every real caller is either
// middleware.ts or a Node-side Server Action/Route Handler.
//
// UI-001: shared-password access, no user accounts. A successful login
// sets one signed, httpOnly cookie; every protected route (via
// middleware.ts) just verifies that cookie. Uses Web Crypto (SubtleCrypto)
// rather than Node's `crypto` module so the exact same verification logic
// works in both the Node runtime (Server Actions/Route Handlers) and the
// Edge runtime Next.js middleware runs by default -- no separate secret
// needed; the signing key is the same AI_CLINIC_SHARED_PASSWORD already
// used to gate entry.

export const SESSION_COOKIE_NAME = "ai_clinic_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function getSecret(): string {
  const secret = process.env.AI_CLINIC_SHARED_PASSWORD;
  if (!secret) {
    throw new Error("Missing AI_CLINIC_SHARED_PASSWORD environment variable.");
  }
  return secret;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(signature);
}

/** True iff `submitted` matches AI_CLINIC_SHARED_PASSWORD. */
export function verifySharedPassword(submitted: string): boolean {
  const expected = getSecret();
  if (submitted.length !== expected.length) return false;
  // Simple constant-time-ish comparison -- this is a single shared
  // password checked against a small, low-volume internal tool, not a
  // per-user auth system; a full timing-safe-equal implementation is
  // more than this deserves.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= submitted.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Builds the signed cookie value for a fresh session. */
export async function createSessionCookieValue(): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = await sign(payload, getSecret());
  return `${payload}.${signature}`;
}

/** True iff the cookie value is well-formed, correctly signed, and not expired. */
export async function verifySessionCookieValue(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  let expectedSignature: string;
  try {
    expectedSignature = await sign(payload, getSecret());
  } catch {
    return false;
  }
  return signature === expectedSignature;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
