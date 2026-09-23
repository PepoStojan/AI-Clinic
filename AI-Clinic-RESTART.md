# AI-Clinic — Restart Checkpoint

**Current phase:** Build order, immediately after INFRA-001.

**Completed tasks:**
- INFRA-001 — Supabase Foundation: PASS

**Current task status:**
- INFRA-001 is PASS. Migration applied to live `AI-Clinic` project (`xpeqqatqxasfpujdwkxd`). Live integration tests green.

**Next task:**
- INFRA-002 — Trigger.dev Foundation (not started; awaiting explicit go-ahead)

**Blockers:**
- None blocking INFRA-002 start.

**Infrastructure status:**
- Supabase project `xpeqqatqxasfpujdwkxd` linked via project-local CLI (`npx supabase`)
- 6 core tables + triggers + constraints + indexes live (migration `20260923000001_init_core_schema.sql`)
- Follow-up grants migration live (`20260923000002_grant_service_role_privileges.sql`) — see "Manual actions" for why
- Private `audit-reports` storage bucket confirmed live (`public = false`)
- Next.js + TypeScript + App Router scaffold in place; no UI built yet
- Git initialized locally; no GitHub remote yet

**Tests:**
- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run build` — pass
- `npm test` (unit, offline) — 13/13 pass
- `npm run test:integration` (live DB) — 7/7 pass

**Latest commit SHA:**
`f9c4a5d3011b64e6b9d6c02e8646b0a1353c40e3` — "chore: initialize AI-Clinic foundation"

**Manual actions pending:**
1. Rotate/disable the legacy `anon` and `service_role` API keys for this project (Dashboard → Project Settings → API → Legacy API Keys) — they were inadvertently printed in full during an earlier CLI call in this session. Not used by the app (we use the new publishable/secret key model), but should be rotated as a precaution.
2. Create the GitHub repo — `gh` CLI isn't installed locally. Either `brew install gh && gh auth login && gh repo create AI-Clinic --private --source=. --remote=origin --push`, or create `AI-Clinic` manually on github.com and `git remote add origin <url> && git push -u origin main`.
3. `.env.local` on this machine holds real Supabase keys — untracked, gitignored, not to be committed.

**Important files:**
- `supabase/migrations/20260923000001_init_core_schema.sql` — core schema
- `supabase/migrations/20260923000002_grant_service_role_privileges.sql` — service_role grants fix
- `src/lib/supabase/` — server client, storage helper, typed repositories, `database.types.ts`
- `src/lib/audit/` — audit-code, idempotency-key, filename utilities (+ unit tests)
- `tests/integration/schema.integration.test.ts` — live schema validation suite
- `.env.example` — required env var names (no values)
