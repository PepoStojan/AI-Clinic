# AI-Clinic — Restart Checkpoint

## Project Status

**AI-Clinic MVP is LIVE and production-functional.** This checkpoint reflects a verified, tagged stable state.

- Production URL: https://ai-clinic-sage.vercel.app
- GitHub `main` SHA: **`3415b81`** (pushed)
- Trigger.dev production worker version: **`20260926.3`**
- Latest verified PDF regeneration run: **`run_06gdripbqkupml6u6m8d5rjle1`** (Ocuco audit, replay of `run_06gdj04e05q4m76a2eq4bmg501`)
- Stable rollback git tag: **`ai-clinic-stable-2026-09-26`** → commit `3415b81`
- Supabase production data/storage works.
- Shared-password login works.
- Full audit pipeline works end-to-end in production (verified as of the last full audit run, prior checkpoint).

## Current Test Baseline (verified this checkpoint)

- 386 passed, 25 skipped, 0 failures
- lint PASS
- typecheck PASS
- build PASS

## Recently Completed & Verified (this session, most recent first)

### SOCIAL-LOGIC-003 + PDF-BRAND-006 — SmartClick Branding + Clean Social Profile Display — **PASS, VERIFIED LIVE**

- Commit: `3415b81` — "feat: add SmartClick PDF branding and clean social profile display"
- Files: `src/lib/pdf/logo-assets.ts`, `src/lib/pdf/html-template.ts`, `src/lib/pdf/__tests__/html-template.test.ts`
- Official SmartClick SVG (source: `Recources/smartclick-logo (1).svg`, local reference only, never referenced at runtime) embedded as `SMARTCLICK_LOGO_DATA_URI` in `logo-assets.ts`.
- Cover: SmartClick logo (~15px tall, rendered white via CSS filter) next to the existing "Developed by smartclick.agency" line. AI-Clinic remains the primary, dominant wordmark.
- Closing page: smaller SmartClick logo (~12px tall, native dark colors) next to the same text, single occurrence, not repetitive.
- Trigger.dev production worker redeployed to version `20260926.3` (`npx trigger.dev@latest deploy --native-build --detach`).
- **Verified live**: regenerated the existing Ocuco PDF (`run_06gdripbqkupml6u6m8d5rjle1`, ran on version `20260926.3`) and visually confirmed via local Playwright render of the actual regenerated `canonical_report_json`: SmartClick logo present on cover and closing page, subtle/readable, no layout regressions, Executive Summary still uses `profiles_connected` as the primary Social Profiles metric.
- Validation: 386 passed, 25 skipped, lint PASS, typecheck PASS, build PASS.

### PDF-BRAND-005 — Increase Gemini and Claude Logo Size — **PASS, VERIFIED LIVE**

- Commit: `cb1a262` — "feat: enlarge Gemini and Claude PDF logos"
- File: `src/lib/pdf/html-template.ts` only.
- Gemini and Claude provider logos in Brand Recognition cards enlarged ~38% (26px → 36px) via a provider-specific `provider-logo-emphasize` CSS class, applied only to those two providers (`ProviderDisplay.emphasizeLogo` flag). ChatGPT and Google AI logo size unchanged. Prompt Visibility row logos (fixed 22px grid column) deliberately excluded from the boost — higher-specificity `.pv-row .provider-logo` rule keeps all four providers at 18px there, avoiding column overflow/clipping.
- Trigger.dev worker redeployed to version `20260926.2`, then superseded by `20260926.3` above.
- Verified live via regenerated Ocuco PDF + Playwright screenshot: Gemini/Claude visibly larger, ChatGPT/Google AI unchanged, no clipping.
- Validation: 383 passed at the time, lint/typecheck/build PASS.

### SOCIAL-LOGIC-002 — Social Profile Presence Reporting Alignment — **PASS, VERIFIED LIVE**

- Commit: `9ff65ea` — "feat: align social profile presence reporting"
- File: `src/lib/pdf/html-template.ts` + its test file only (the underlying classification logic in `run-component.ts`/`checklistStatusFor()`/gap detectors was already correct — this was a presentation-layer fix).
- Executive Summary Social Profiles stat card headline changed from raw `profiles_found` to `profiles_connected` (the true "present" count), with `profiles_found` shown only as secondary "discovered" context.
- Per-platform display mapping (already matched by underlying logic, now correctly *displayed*): Found+Connected → Present; Found+Not Connected / Not Found / Unverified → Missing; N/A—Could Not Verify → Could Not Verify (neutral).
- Trigger.dev worker redeployed to version `20260926.1`.
- Verified live via regenerated Ocuco PDF.
- Superseded/refined further by SOCIAL-LOGIC-003 above (URL visibility rules layered on top of this same mapping).

## PDF Report — Current Design State

- AI provider logos (base64, no hotlinking): ChatGPT, Gemini (enlarged, PDF-BRAND-005), Claude (enlarged, PDF-BRAND-005), Google AI
- Social platform logos (base64, no hotlinking): LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, Threads, Reddit
- SmartClick agency branding (base64 SVG, PDF-BRAND-006): cover + closing page, secondary to AI-Clinic
- Executive Summary: dashboard-style stat cards; Social Profiles card headline = `profiles_connected / total_platforms` ("profiles present"), secondary = `profiles_found` ("discovered")
- Brand Recognition: provider logo cards
- Prompt Visibility: grouped by prompt (prompt shown once, 4 provider rows beneath)
- Social Profiles: platform logo + simplified client-facing status (see rule below)
- Third-Party Listings: compact grid
- Technical Accessibility: improved presentation
- Key Gaps: consulting-style cards (title, affected-check count, evidence, What we observed / What this suggests / What to consider)
- Cover (page 1): SmartClick-style hero (PDF-COVER-003) + SmartClick logo (PDF-BRAND-006) — **live-verified**
- `canonical_report_json` remains the sole source of truth for the renderer
- **No scoring/severity/priority system anywhere**
- Signed PDF download via private Supabase Storage bucket works (as of last full verification)

### Social Profiles — Client-Facing Display Rule (SOCIAL-LOGIC-002 + SOCIAL-LOGIC-003, locked)

Presentation-only — the underlying classification logic (`run-component.ts`, `checklistStatusFor()`, gap detectors) is unchanged and was already correct; only what the PDF renders was fixed.

| Raw state | Badge | Detail text | URL shown? |
|---|---|---|---|
| Found + Connected Yes | Present | Connected to website | ✅ Yes |
| Found + Connected No | Missing | Not connected to website | ❌ No |
| Not Found | Missing | Not connected to website | ❌ No |
| Unverified | Missing | Not connected to website | ❌ No |
| N/A — Could Not Verify | Could Not Verify (neutral) | Could not verify | ❌ No |

- Raw evidence (`profileStatus`, `connected`, `profileUrl`, `source`, `matchedSignals`, Apify/DataForSEO evidence) is **preserved untouched** in `component_results`/`canonical_report_json` — the PDF renderer simply chooses not to print a candidate/discovered URL unless the profile is confirmed Present. Nothing is deleted or rewritten in storage.
- Executive Summary headline metric = `profiles_connected / total_platforms` ("profiles present"), never raw `profiles_found`.
- Historical audits: no rerun/backfill needed — regenerating any existing audit's PDF re-reads its already-stored `canonical_report_json` and applies this display logic automatically.

### SmartClick Branding (PDF-BRAND-006, locked)

- Official SmartClick SVG embedded as a base64 data URI in `src/lib/pdf/logo-assets.ts` (`SMARTCLICK_LOGO_DATA_URI`) — sourced once from the local `Recources/` reference file, never referenced from `Recources/` at runtime.
- Cover logo present (white via CSS filter, ~15px tall), closing-page logo present (native colors, ~12px tall).
- AI-Clinic remains the primary brand everywhere; SmartClick is secondary/subtle in both placements.

## Brand Tokens / Visual Direction

- SmartClick reference (from `Recources/screencapture-smartclick-agency-...png`): primary blue `#2289F5`, navy `~#0F2A3D`, white, restrained yellow accent `#FFD84D`.
- The PDF cover (PDF-COVER-003) uses `#2289F5`.
- **Other UI/PDF sections still use the older token set** (`BRAND_BLUE = #28A8DF`, `DARK_NAVY = #12263A`, in `src/lib/pdf/html-template.ts` and the app's CSS custom properties) — this is a deliberate, scoped-only change. **Do not globally rewrite colors unless explicitly tasked.**

## SECURITY-001 — Trigger.dev Key Rotation — **PASS, CLOSED**

| Step | Status |
|---|---|
| New Trigger.dev Production key created | ✅ User confirmed created/copied |
| Vercel `TRIGGER_SECRET_KEY` updated (Config/non-sensitive type) | ✅ User confirmed saved as Config type — confirmed present via `vercel env ls production` (value never printed) |
| Vercel Production redeployed | ✅ Confirmed working — a real `run-ai-clinic-audit` production run completed successfully via the Vercel app's stored key (see connectivity evidence below) |
| Trigger.dev worker redeployed | ✅ Multiple Trigger.dev deploys since the rotation, current version `20260926.3` |
| Lightweight connectivity check | ✅ Confirmed via existing production telemetry: run `run_06gdqs05eb1chv993rbe697201` (`run-ai-clinic-audit`, worker version `20260926.2`) completed successfully after the current key was set, proving the Vercel-stored `TRIGGER_SECRET_KEY` → Trigger.dev path works end-to-end. (A direct synthetic SDK smoke-test was attempted but required materializing the raw secret locally, which the Claude Code auto-mode permission classifier correctly blocked — the real-run evidence above was used instead.) |
| Old exposed production key revoked | ✅ **User manually revoked the old key in the Trigger.dev dashboard.** Post-revocation dashboard state confirmed by user: only one Production API key visible, named **"AI-Clinic Vercel Production 2"**, marked Active, with recent "Last used" activity — the old key disappeared after the Revoke action. |

**No secret values were ever recorded in this repo, this file, or any session output** — only key *presence*, *name*, and *activity metadata* are documented here, never the key value itself.

SECURITY-001 requires no further action.

## App UX Items — Still Not Manually Live-Verified

These were implemented/pushed in an earlier session and remain **code-complete but not confirmed via a live browser check** — do not mark PASS:

- AUTH-UX-001 (Logout) — commit `b60cb30`
- PDF-COVER-003 (SmartClick-style cover) — commit `181d304` (superseded/extended by PDF-BRAND-006; the base cover composition itself was verified via regenerated PDF, but the original live-browser dashboard check was never done)
- AUDIT-DETAIL-UX-002 (Contact Details) — commit `b817241`
- ANIMATION-UX-001 (Progress Animation) — commit `b6f33ee`
- NAV-UX-001 (Breadcrumbs) — commit `ef45dc9`

## Validation / Reference

- `dataforseo-test/` is reference-only; do not restart or extend it unless explicitly requested.
- VAL-001 → VAL-003C are **frozen**. VAL-003C classification logic passed 15/15 tests, accepted with known limitations. Do not reopen.

## Known Product Logic (locked, do not change without explicit instruction)

- No scoring system.
- No severity/priority system.
- No automatic email.
- No user accounts/roles — shared-password access only.
- Partial component failures must not crash the whole audit (component crash → `PARTIAL`; clean pre-PDF gate failure → `BLOCKED`; unrecoverable pipeline/system failure → `FAILED`).
- No Result / N/A / Could Not Verify must never become a false gap, anywhere in the pipeline.
- The PDF renderer consumes `reports.canonical_report_json` only — no direct queries to component_results/grouped_gaps/checklist_items/provider APIs.
- The `audit-reports` Supabase Storage bucket remains private; downloads only via signed URL.
- Social Profiles client-facing display rule (see table above) — presentation-only, do not conflate with the underlying classification logic which remains untouched.

## Other Optional / Post-MVP Ideas (not blockers, do not implement automatically)

- Audit soft-delete (`deleted_at`)
- Richer Leads/Contacts view
- Stronger strategic/actionable report guidance (Finding → Meaning → Opportunity → Recommended Action)
- Additional PDF polish
- Additional UI polish
- Manual live-browser verification of the App UX items listed above

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
- The Vercel CLI is not installed locally as of this checkpoint — Vercel env var / redeploy steps are guided manually via the dashboard, not automated.

## Stable Rollback Point

- Git tag `ai-clinic-stable-2026-09-26` → commit `3415b81` (pushed to origin).
- To roll back: `git checkout ai-clinic-stable-2026-09-26` (detached HEAD) or `git reset --hard ai-clinic-stable-2026-09-26` on a throwaway branch, then redeploy Vercel (auto via GitHub integration on a real branch push) and separately redeploy the Trigger.dev worker for that commit's code.
- A local source-only zip backup (`AI-Clinic-stable-2026-09-26.zip`) also exists outside git, excluding `.git/`, `node_modules/`, `.next/`, `.env*`, and all local reference/secret directories.

## Restart Rules

A fresh Claude session should:

1. Read `AI-Clinic-RESTART.md` first.
2. Inspect `git status --short` and current `HEAD`.
3. Not read or modify `dataforseo-test/` unless explicitly needed.
4. Not commit `Recources/`, `Connectors/`, or other local reference files — never `git add .`/`git add -A`.
5. Preserve all frozen MVP business logic (see "Known Product Logic" above) unless a named logic task explicitly changes it.
6. Make small, isolated Task-ID-scoped changes only.
7. Run tests/lint/typecheck/build after implementation, before declaring anything done.
8. Stop after each task with a Quick Report.
9. Remember Vercel and Trigger.dev are separate deployment targets (see above).
10. Do not run a full paid audit or regenerate a production PDF unless explicitly required — regenerating a PDF is free/lightweight (reads only `canonical_report_json`, no provider calls) and generally safe to offer, but still confirm with the user first since it overwrites the live stored file.
11. Do not mark a task "verified live" unless it was actually checked live — code-complete/pushed and manually-verified are different states; keep them distinct in reporting.
