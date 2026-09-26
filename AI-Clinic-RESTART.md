# AI-Clinic — Restart Checkpoint

## 1. Current Verified Production State

- Current HEAD: `3c10910`
- Stable rollback tag: `ai-clinic-stable-2026-09-26`
- Stable tagged code SHA: `3415b81`
- Trigger.dev production worker: `20260926.3`
- Latest verified PDF regeneration run: `run_06gdripbqkupml6u6m8d5rjle1`
- Production URL: https://ai-clinic-sage.vercel.app

**Current test baseline:**
- 386 passed
- 25 skipped
- 0 failures
- lint PASS
- typecheck PASS
- build PASS

## 2. SECURITY-001 — PASS (fully closed)

- Current Trigger.dev production key exists and is Active.
- Current key has recent production usage.
- Old exposed production key was manually revoked in the Trigger.dev dashboard by the user.
- Only the intended current production key remains active.
- No secret values were ever written to git, chat, or docs.
- Current active key name (safe to document, not a secret): **AI-Clinic Vercel Production 2**

## 3. SOCIAL-LOGIC-002 — PASS (production verified)

Final client-facing Social Profiles presence logic:
- Found + Connected Yes → Present
- Found + Connected No → Missing
- Not Found → Missing
- Unverified → Missing
- N/A / Could Not Verify → Could Not Verify

Executive Summary:
- primary social metric = `profiles_connected / total_platforms`
- secondary context = `profiles_found` discovered

Commit: `9ff65ea` — "feat: align social profile presence reporting"
Trigger worker verification: `20260926.1`

## 4. PDF-BRAND-005 — PASS (production verified)

Gemini + Claude logos enlarged in Brand Recognition only.

Commit: `cb1a262` — "feat: enlarge Gemini and Claude PDF logos"

Production verified:
- Gemini larger
- Claude larger
- ChatGPT unchanged
- Google AI unchanged
- Prompt Visibility logos remain uniform (fixed-width grid column, deliberately excluded from the boost)
- no clipping/layout regression

Trigger worker: `20260926.2`

## 5. PDF-BRAND-006 — PASS (production verified)

Official SmartClick SVG embedded into production PDF assets.

Source was local: `Recources/smartclick-logo (1).svg`
**Important:** `Recources/` remains local/reference-only and is NOT committed.

Production implementation:
- embedded SmartClick logo data URI in `src/lib/pdf/logo-assets.ts`
- cover logo present
- closing-page logo present
- AI-Clinic remains primary brand
- SmartClick remains secondary branding
- "Developed by smartclick.agency" retained

Final sizing:
- cover logo ~15px tall
- closing logo ~12px tall
- aspect ratio preserved

Commit: `3415b81` — "feat: add SmartClick PDF branding and clean social profile display"
Production verified on worker: `20260926.3`

## 6. SOCIAL-LOGIC-003 — PASS (production verified)

Client-facing social URL rule:

| Status | Detail text | URL shown? |
|---|---|---|
| Present | Connected to website | ✅ Yes, confirmed profile URL |
| Missing | Not connected to website | ❌ No |
| Could Not Verify | Could not verify | ❌ No |

**Important:** Apify/DataForSEO raw candidate URLs/evidence remain stored internally. Nothing is deleted or rewritten in canonical data — this is a presentation-only rule in the PDF renderer.

Production verification confirmed:
- connected LinkedIn/Facebook/X showed URLs
- missing/unverified/not-connected profiles showed no URLs
- Could Not Verify showed no URL
- Reddit's random discovered-but-unconnected candidate URL was correctly hidden

Commit: `3415b81` (same commit as PDF-BRAND-006 — both landed together)

## 7. Stable Backup

- Stable rollback tag: `ai-clinic-stable-2026-09-26` → points exactly to `3415b81`
- Local backup archive: `~/Desktop/AI-Clinic-stable-2026-09-26.zip`
  - 456 KB, 269 files, created via `git archive` at the stable tag
  - Excludes `.git`, `node_modules`, `.next`, `.env*`, `Recources/`, `Connectors/`, `dataforseo-test/`, `Smartclick-APIs.rtf`, and all other secret/reference files
  - `.env.example` only is included and is safe
- Restart checkpoint commit: `5265869` — "docs: checkpoint stable production version"
- Security closeout commit: `3c10910` — "docs: close Trigger key rotation security item"

To roll back: `git checkout ai-clinic-stable-2026-09-26` (detached HEAD) or reset a throwaway branch to it, then redeploy Vercel (auto via GitHub integration) and separately redeploy the Trigger.dev worker for that commit's code (see section 9 below — they are independent deploy targets).

## 8. App UX Items Still Needing Manual Live Verification

Do **NOT** mark these PASS unless manually checked in the live production app:

- **AUTH-UX-001** — Logout visible; click Logout → `/login`; opening `/audits` after logout → redirects to `/login`.
- **INPUT-001** — bare domain input accepted: `ocuco.com`, `www.ocuco.com`.
- **AUDIT-DETAIL-UX-002** — Contact name, Email, Company, Website shown on a COMPLETED audit detail page.
- **ANIMATION-UX-001** — Lottie animation visible while an audit is running; hidden in terminal states.
- **NAV-UX-001** — "← Back to Audits" link, "Audits / {Company Name}" breadcrumb, explicit `/audits` navigation.
- **PDF-COVER-003** — visually confirm the current SmartClick-style cover in an actual downloaded production PDF.

These are manual QA items, not known code blockers.

## 9. Current Product State

AI-Clinic MVP is live and production-functional.

Core:
- shared-password login
- new audit
- audits list
- audit detail/progress
- 5 audit components
- deterministic gaps
- interpretation
- canonical report
- PDF generation
- private Supabase storage
- signed download
- Vercel production
- Trigger.dev production

Five components:
1. Brand Recognition
2. Prompt Visibility
3. Social Profiles
4. Third-Party Listings
5. Technical Accessibility

No:
- scoring
- severity/prioritization system
- automatic email
- user accounts/roles
- hard delete

## Known Product Logic (locked, do not change without explicit instruction)

- No scoring system.
- No severity/priority system.
- No automatic email.
- No user accounts/roles — shared-password access only.
- Partial component failures must not crash the whole audit (component crash → `PARTIAL`; clean pre-PDF gate failure → `BLOCKED`; unrecoverable pipeline/system failure → `FAILED`).
- No Result / N/A / Could Not Verify must never become a false gap, anywhere in the pipeline.
- The PDF renderer consumes `reports.canonical_report_json` only — no direct queries to component_results/grouped_gaps/checklist_items/provider APIs.
- The `audit-reports` Supabase Storage bucket remains private; downloads only via signed URL.
- Social Profiles client-facing display rule (see section 6 above) — presentation-only, do not conflate with the underlying classification logic (`run-component.ts`/`checklistStatusFor()`/gap detectors), which remains untouched and was already correct.

## Brand Tokens / Visual Direction

- SmartClick reference (from `Recources/screencapture-smartclick-agency-...png`): primary blue `#2289F5`, navy `~#0F2A3D`, white, restrained yellow accent `#FFD84D`.
- The PDF cover (PDF-COVER-003) uses `#2289F5`.
- **Other UI/PDF sections still use the older token set** (`BRAND_BLUE = #28A8DF`, `DARK_NAVY = #12263A`, in `src/lib/pdf/html-template.ts` and the app's CSS custom properties) — deliberate, scoped-only change. **Do not globally rewrite colors unless explicitly tasked.**

## Validation / Reference

- `dataforseo-test/` is reference-only; do not restart or extend it unless explicitly requested.
- VAL-001 → VAL-003C are **frozen**. VAL-003C classification logic passed 15/15 tests, accepted with known limitations. Do not reopen.

## 10. Next Recommended Step

Next task in a fresh session: **MANUAL-QA-001**

Goal: manually verify the remaining live UX items one by one (see section 8 above):
- Logout
- bare-domain input
- contact details
- Lottie
- breadcrumb/back
- current PDF cover

Do not implement anything unless a real issue is found during QA.

After QA, optional post-MVP work (not blockers):
- Audit soft-delete (`deleted_at`)
- Richer Leads/Contacts view
- Stronger strategic/actionable report guidance (Finding → Meaning → Opportunity → Recommended Action)
- Additional PDF polish
- Additional UI polish

## Security / Local Git Safety

**The GitHub repository is public.** Never commit:
- `Connectors/`
- `Recources/`
- `dataforseo-test/`
- `.env.local`
- `Smartclick-APIs.rtf`
- any other API/reference/secret file
- local screenshots/reference assets, unless explicitly approved for a specific task

These remain local/reference-only. Never use `git add .` / `git add -A` — always stage exact files by name and review `git status`/`git diff` before committing.

## Vercel / Trigger.dev — Separate Deploy Targets

- Production project: `stojan-s-projects/ai-clinic`, URL: https://ai-clinic-sage.vercel.app
- Trigger.dev project: `proj_pazyklzkrxxmecphnoco` (SmartClick org, AI-Clinic project) — current known deployed worker version: **`20260926.3`**
- **A Vercel redeploy does NOT update the Trigger.dev worker, and vice versa.** Any change to code imported by `src/trigger/*` (including `src/lib/pdf/html-template.ts`, `logo-assets.ts`, anything the PDF renderer or audit pipeline touches) requires a separate `npx trigger.dev@latest deploy` (use `--native-build --detach`; poll `npx trigger.dev@latest runs get <run-id>` after replaying a run to confirm the `Version` field matches the new deploy — the CLI's `--detach` returns before the new version is fully live, so an immediate replay can land on the *previous* version; wait ~30-60s and replay again if so).
- The Vercel CLI (`npx vercel`) works and is authenticated in this environment; project is already linked (`.vercel/project.json`). Listing env vars (`vercel env ls production`) shows names/metadata only, never values.
- Pulling real production secret values locally (`vercel env pull`) is blocked by the Claude Code auto-mode permission classifier ("Credential Materialization") — do not attempt to route around this; use indirect evidence (existing run history, `vercel env ls` metadata) instead when verifying credentials.

## 11. Fresh Session Rules

A fresh Claude Code session must:

1. Read `AI-Clinic-RESTART.md` completely first.
2. Run `git status --short`.
3. Check current `HEAD`.
4. Preserve the stable tag `ai-clinic-stable-2026-09-26` — never move or recreate it.
5. Never read/modify `dataforseo-test/` unless explicitly requested.
6. Never stage `Recources/`, `Connectors/`, or other secret/reference files — never `git add .`/`git add -A`.
7. Keep tasks small and isolated (Task-ID-scoped).
8. Do not run a full paid audit or regenerate a production PDF unless explicitly required.
9. Remember Vercel and Trigger.dev are separate deployment targets (see above).
10. Stop after each task with a Quick Report.
11. Do not mark a task "verified live" unless it was actually checked live — code-complete/pushed and manually-verified are different states; keep them distinct in reporting.
