import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 15. Static check: no "use client" component may import a module that
// touches a secret (Supabase service key, Trigger.dev secret key,
// DataForSEO/Apify credentials, or any repository/provider module that
// reads them). This can't fully prove a secret never leaks, but it
// deterministically catches the actual mistake this rule guards against
// -- a client component accidentally importing server-only code.

const CLIENT_FILES = [
  "src/app/login/login-form.tsx",
  "src/app/new-audit/new-audit-form.tsx",
  "src/app/audits/[id]/audit-detail-client.tsx",
  "src/components/header.tsx",
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from ["']@\/lib\/supabase\/repositories/,
  /from ["']@\/lib\/supabase\/server/,
  /from ["']@\/lib\/supabase\/storage/,
  /from ["']@\/lib\/providers\//,
  /from ["']@\/lib\/audit\/create-audit/,
  /from ["']@\/lib\/trigger\/run-audit-client/,
  /process\.env\.(SUPABASE_SECRET_KEY|TRIGGER_SECRET_KEY|DATAFORSEO_LOGIN|DATAFORSEO_PASSWORD|APIFY_API_TOKEN|AI_CLINIC_SHARED_PASSWORD)/,
];

describe("no secret appears client-side", () => {
  it("every 'use client' component starts with the directive", () => {
    for (const file of CLIENT_FILES) {
      const source = readFileSync(file, "utf-8");
      expect(source.trimStart().startsWith('"use client"')).toBe(true);
    }
  });

  it("no client component imports a secret-holding module or reads a secret env var directly", () => {
    for (const file of CLIENT_FILES) {
      const source = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
