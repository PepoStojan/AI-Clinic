# AI-Clinic — Restart Checkpoint

## Project Status

**AI-Clinic MVP is LIVE and fully functional in production.**

- Production URL: https://ai-clinic-sage.vercel.app
- GitHub `main` is current.
- Vercel production deployment works.
- Trigger.dev production worker works.
- Supabase production data/storage works.
- Shared-password login works.
- Full audit pipeline works end-to-end in production.
- PDF download via signed URL works.

QA-001 (PASS) and DEPLOY-001 (PASS) are both complete. The MVP itself is production-functional. Remaining work is optional polish and one required security follow-up (see "Next Required Step" below).

## Latest Verified Production Audit

- Company: Ocuco
- Audit code: `AIC-2026-000002`
- Audit ID: `3e865f0c-41d6-4ad3-87c1-987b38ab94f3`
- Status flow: `CREATED → QUEUED → PROCESSING → VALIDATING → GENERATING_PDF → COMPLETED`
- Execution time during smoke run: ~64 seconds
- All 5 components: COMPLETED
- Grouped gaps: 5
- Report status: `GENERATED`, `ready_for_pdf: true`
- Signed PDF download: verified working

## 5 Production Components

1. Brand Recognition
2. Prompt Visibility
3. Social Profiles
4. Third-Party Listings (Directories)
5. Technical Accessibility

## Production PDF

The redesigned PDF report is live in production.

- Current production Trigger.dev worker version: `20260925.6`
- PDF is currently 10 pages for the Ocuco audit
- AI provider logos embedded (base64, no hotlinking) and verified rendering: ChatGPT, Gemini, Claude, Google AI
- Social platform logos embedded (base64, no hotlinking) and verified rendering: LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, Threads, Reddit
- Prompt Visibility is grouped by prompt: prompt shown once, four provider rows beneath it (no more repeated-prompt flat table)
- Executive Summary uses redesigned dashboard-style stat cards
- Brand Recognition uses provider logo cards
- Social Profiles uses platform logo + status pills
- Key Gaps uses consulting-style cards (title, affected-check count, evidence, What we observed / What this suggests / What to consider)
- `canonical_report_json` remains the sole source of truth for the renderer — presentation-only changes throughout
- No scoring/severity/priority system exists anywhere
- Latest verified production PDF regenerate run: `run_06gdj04e05q4m76a2eq4bmg501`
- Signed production PDF download re-verified after this change

**Important lesson learned:** `src/lib/pdf/html-template.ts` and `logo-assets.ts` are imported by the Trigger.dev task `regenerate-audit-pdf` / `run-ai-clinic-audit`. Any change to these (or anything else imported by `src/trigger/*`) requires a separate `npx trigger.dev@latest deploy` — a Vercel redeploy does **not** update the Trigger.dev worker. This was missed once during this work and caught by checking the run's reported version before declaring success.

## Recent Commits (most recent first)

- `51b48d2` — feat: add social platform logos to PDF report
- `cffbb25` — feat: redesign AI-Clinic PDF report
- `d7294c9` — feat: refine AI-Clinic production UI
- `d972ccf` — chore: prepare AI-Clinic production deployment (DEPLOY-001 start)

Current HEAD: `51b48d2`

## UI

- Login page: works
- Audits page: works
- New Audit page: works (individual prompt inputs with add/remove — never changed to a free-text textarea, despite the approved design mockup using one, to preserve exact existing form-submission behavior)
- Audit Detail / Progress page: works, includes per-step icon treatment (checkmark / pulse / `!` / neutral dot)
- UI redesign (CSS + one visual-only JSX change) deployed to production

**Canonical UI tokens (already matched the codebase before the redesign, no color values needed to change):**
- Primary blue: `#28A8DF`
- Dark navy: `#12263A`
- Font: Poppins
- Brand text: `AI-Clinic`
- Secondary text: `Developed by smartclick.agency`

## Trigger.dev

- Production deploy is **separate** from Vercel — remember this every time.
- Whenever code imported by a Trigger.dev task changes (especially the PDF renderer/template), run: `npx trigger.dev@latest deploy` (use `--native-build --detach` to avoid the CLI's log-stream connection dropping in this environment; poll `runs get <id>` afterward to confirm the deployed `Version`).
- Current verified worker version: `20260925.6`
- Project: `proj_pazyklzkrxxmecphnoco` (SmartClick org, AI-Clinic project)

## Vercel

- Production project: `stojan-s-projects/ai-clinic`
- Production URL: https://ai-clinic-sage.vercel.app
- Environment variables read by Edge Middleware/`proxy.ts` (currently just `AI_CLINIC_SHARED_PASSWORD`) must be **Config** (non-sensitive) type, not the default **Secret** (sensitive/encrypted) type — sensitive vars were found to fail even in plain Node serverless functions on this project, not just Edge, so all 10 app env vars are currently set as Config. Only `DATABASE_URL` remains Secret type (it's unused by the app code, so this is harmless).
- `TRIGGER_SECRET_KEY` is configured for production as Config type.
- Required production env vars (11 total, see `.env.example` for the full list): `NEXT_PUBLIC_APP_URL`, `AI_CLINIC_SHARED_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (unused), `TRIGGER_SECRET_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `APIFY_API_TOKEN`, `APIFY_SOCIAL_ACTOR_ID`.

## Security

**Do not commit:**
- `Connectors/`
- `Recources/`
- `dataforseo-test/`
- `.env.local`
- `Smartclick-APIs.rtf`
- any other API/reference/secret file

These remain local/reference-only. **The GitHub repository is public** — treat any accidental commit of the above as an urgent rotation event, not just a revert.

**Outstanding security item:** a Trigger.dev production API key was exposed during setup and rotated once; a second production key was later pasted during troubleshooting conversation history. **Before final handoff:** rotate the current Trigger.dev Production API key again, update Vercel's `TRIGGER_SECRET_KEY` (as Config type, per the note above), redeploy Vercel, and redeploy the Trigger.dev worker, then verify with one lightweight connectivity check (not a full paid audit).

Never print secret values in reports/output — this was maintained throughout (values were always piped through shell variables or entered by the user directly, never echoed).

## Validation / Reference

- `dataforseo-test/` is reference-only; do not restart or extend it unless explicitly requested.
- VAL-001 → VAL-003C are frozen. VAL-003C classification logic passed 15/15 tests.

## Current Test Status

- 358/358 unit tests PASS
- lint PASS
- typecheck PASS
- build PASS

## Known Product Logic (locked, do not change without explicit instruction)

- No scoring system.
- No severity/priority system.
- No automatic email.
- No user accounts/roles — shared-password access only.
- Partial component failures must not crash the whole audit (component crash → `PARTIAL`; clean pre-PDF gate failure → `BLOCKED`; unrecoverable pipeline/system failure → `FAILED`).
- No Result / N/A / Could Not Verify must never become a false gap, anywhere in the pipeline.
- The PDF renderer consumes `reports.canonical_report_json` only — no direct queries to component_results/grouped_gaps/checklist_items/provider APIs.
- The `audit-reports` Supabase Storage bucket remains private; downloads only via signed URL.

## Next Optional Product Tasks

Do **not** automatically implement these — post-MVP ideas only:
- Audit deletion / soft delete (`deleted_at` recommended)
- Optional additional UI polish
- Optional further PDF polish
- Final secret rotation/security handoff (see below — this one is required, not optional)

## Next Required Step

The MVP itself is production-functional. Before declaring final handoff complete:

1. Rotate the currently exposed Trigger.dev Production key.
2. Update Vercel `TRIGGER_SECRET_KEY` (Config/non-sensitive type).
3. Redeploy Vercel and redeploy the Trigger.dev worker.
4. Verify with one lightweight Trigger.dev connectivity check.
5. Do not run another full paid audit unless necessary.

## Restart Rules

A fresh Claude session should:

1. Read `AI-Clinic-RESTART.md` first.
2. Inspect `git status`.
3. Inspect current HEAD (`git log -1`).
4. Not read or modify `dataforseo-test/` unless explicitly needed.
5. Not commit `Recources/`, `Connectors/`, or other local reference files.
6. Preserve all frozen MVP business logic (see "Known Product Logic" above).
7. Make small, isolated tasks only.
8. Stop after each task with a Quick Report.
