# AI-Clinic — Restart Checkpoint

## 1. Current Verified Production State

AI-Clinic MVP is live and production-functional.

- Last application code commit: `6f0a83b` (`feat: add safe audit soft delete`) — no application code has changed since; subsequent commits are documentation-only checkpoints (this one included)
- Stable rollback tags:
  - `ai-clinic-stable-2026-09-26` (points to `3415b81`) — older checkpoint, untouched
  - `ai-clinic-stable-2026-09-30` (points to `09e17ed`, the prior docs checkpoint) — untouched by this update
- Trigger.dev production worker: `20260930.4` — confirmed live by 2 real completed production audit runs after the last checkpoint (`run_06gf7lrlqljb96p0bac6a1v101`, 9/30 21:42; `run_06gfcg6ml2478lq7ialab16701`, 10/1 08:57), both COMPLETED, both on this version
- Vercel production: confirmed current deployment (`dpl_Bn12GePyWkVi7zfPGgtpaiKUaHhZ`, aliased to the production URL) matches commit `09e17ed`, deployed via GitHub integration auto-deploy ~1 minute after that push
- Production URL: https://ai-clinic-sage.vercel.app

**Current test baseline:**
- 495 passed
- 0 failures
- lint PASS
- typecheck PASS
- build PASS

Core capabilities remain:
- shared-password login
- new audit
- audits list (excludes soft-deleted audits)
- audit detail/progress
- 5 audit components
- deterministic gap detection/grouping
- interpretation
- canonical report
- PDF generation
- private Supabase storage
- signed download
- audit soft delete (terminal statuses only)
- Vercel production
- Trigger.dev production

## 2. SOCIAL CONNECTION — RESOLVED / PRODUCTION PASS

Relevant commits:
- `b426b7c19d20d312a2b8516f94265a6b35b0a08e` — feat: match legacy YouTube custom URLs with handles (SOCIAL-CONNECTION-010)
- `5ff86d9d48a2444dba10fc469f142fddab4a7fee` — feat: use first-party schema as direct social source (SOCIAL-CONNECTION-013)

Final behavior (supersedes all earlier SOCIAL-CONNECTION-00X notes below):
- validated first-party HTML/schema can establish social connection (SOCIAL-CONNECTION-005, unchanged)
- an Unverified external candidate can be corroborated by an exact-matching validated first-party schema `sameAs` URL (SOCIAL-CONNECTION-007)
- YouTube `/c/<slug>` and `/@<same-slug>` are treated as the same identity (case-insensitive, exact slug only) when comparing a candidate against schema — `/channel/<id>` remains strict and is never force-matched to either form, and no other fuzzy/substring matching was introduced (SOCIAL-CONNECTION-010)
- validated first-party schema `sameAs` can directly establish a profile even when Apify/DataForSEO return **zero** candidates at all (not just an Unverified one) — `profileStatus = Found`, `connected = Yes`, `connectionSource = schema`, `source = schema` (SOCIAL-CONNECTION-013)
- schema-only promotion requires **exactly one** trusted schema URL for that platform; two or more conflicting `sameAs` URLs for the same platform do NOT auto-promote — existing Not Found/Unverified behavior is preserved
- malformed/untrusted schema (wrong `@type`, not domain-tied) never promotes — enforced entirely by the pre-existing `extractSchemaSocialLinks` safeguards (SOCIAL-CONNECTION-005), reused unchanged
- unverified candidate URLs remain hidden from the client (`profileUrl` stays `null`; `candidateProfileUrl` is internal/debug-only, never rendered)
- `identity-validation.ts` / `validateProfileIdentity()` were never touched by any of this work

**Production Ocuco verification (`AIC-2026-000015`, run `run_06gf5koilu8e23isro7vn1ua01`, worker `20260930.3`):**
- YouTube = **Present**
- Connected to website
- URL visible: `https://www.youtube.com/@OcucoSoftwarewithVision`
- (Note: `AIC-2026-000015` was later soft-deleted by the user during AUDIT-DELETE-001 production testing — the underlying verification result above is historical/confirmed, not a currently-browsable audit.)

**The old YouTube issue (formerly sections 5/6 below, SOCIAL-CONNECTION-007/009) is RESOLVED.** Do not reopen without a new, real production regression.

## 3. PROMPT-COMPETITORS-002 — PRODUCTION PASS

Commit: `af319f789597fc0683da72b1886684fa7bd3cfe5`

Behavior: when Prompt Visibility result is exactly `mentionClass === "Not Mentioned"`, AI-Clinic may show "Other brands mentioned".

Rules:
- max 5
- target brand excluded
- duplicates removed
- only grounded brands actually present in the supplied response text
- malformed/provider failure → `[]`
- weak/ambiguous extraction → `[]`
- empty array → render nothing extra
- no "No competitors found"
- no filler, no guessing
- terminology is "Other brands mentioned", never "competitors"

Does NOT run for: Mentioned, Strong Mention, Cited Only, Ambiguous, No Result.

VAL-003C remains untouched.

Production PDF verification confirmed this feature renders correctly on Ocuco audits.

## 4. SOCIAL-LOGIC-002 / 003 — PASS (production verified)

Client-facing social rules:

| Status | Detail text | URL shown? |
|---|---|---|
| Present (Found + Connected) | Connected to website | ✅ Yes, confirmed profile URL |
| Missing (Found + Not Connected, Not Found, Unverified) | Not connected to website | ❌ No |
| Could Not Verify | Could not verify | ❌ No |

Executive Summary:
- primary metric = connected/present profiles
- secondary metric = discovered profiles

**Important:** Apify/DataForSEO raw candidate URLs/evidence remain stored internally. Nothing is deleted or rewritten in canonical data — this is a presentation-only rule in the PDF renderer. Random/unconnected Apify/DataForSEO URLs are NOT exposed in the client-facing PDF.

## 5. PDF-BRAND-008 / 009 — PRODUCTION PASS

Commit: `c40edd1057fa81678f6e3757b02ca0bb070c3797`
Trigger worker (at time of verification): `20260930.1`
Verified production regeneration run: `run_06gf4h5fbl0id3ge46aj9039e1`

Production PDF verified:

Cover:
- SmartClick logo increased to 28px
- clearly visible
- AI-Clinic remains primary

Content pages:
- subtle SmartClick footer
- no overlap
- no pagination regression

Prompt Visibility:
- note added: "Results reflect responses observed at the time of testing and may change over time."

Closing page:
- stronger SmartClick logo ~30px
- CTA headline: "Want to improve how your brand appears across AI systems?"
- clickable Book a Call button, destination `https://smartclick.agency/contact-us/`
- real PDF link annotation verified
- AI Results & Limitations section added
- old generic `closing.cta_text` no longer rendered (field itself untouched in canonical_report_json)

Disclosure copy:
> "AI-generated responses are dynamic and may vary between requests depending on the model, timing, prompt wording, location, personalization, provider updates, and other factors. Results in this report represent a point-in-time observation and may differ when the same prompt is tested again. AI systems may also produce incomplete, inaccurate, or fabricated information. Findings should therefore be treated as directional evidence and validated against primary sources where appropriate."

**Production verification: PASS**

## 6. AUDIT-DELETE-001 — PRODUCTION PASS

Commit: `6f0a83b8a5417fe882510d3d453e76f0da441b08`
Migration: `supabase/migrations/20260930000001_add_audits_deleted_at.sql` (applied to production Supabase project `xpeqqatqxasfpujdwkxd`)
Trigger worker deployed for this change: `20260930.4`

Production behavior:
- terminal audits may be soft-deleted: `COMPLETED`, `BLOCKED`, `PARTIAL`, `FAILED`
- non-terminal audits (`CREATED`, `QUEUED`, `PROCESSING`, `VALIDATING`, `READY_FOR_PDF`, `GENERATING_PDF`) cannot be deleted — no Delete affordance renders, and the server-side guard (`softDeleteAudit`'s atomic conditional UPDATE) refuses regardless of what the UI believes
- `audits.deleted_at` (nullable `timestamptz`) is the only new column — no hard deletion anywhere
- deleted audit disappears from the `/audits` list
- deleted audit's detail URL → 404 (via the existing `notFound()` pattern)
- PDF application access is blocked (the download route now checks `getAuditById` before ever touching `reports`/storage)
- retry and PDF-regeneration actions refuse for a deleted audit (both gained an explicit `getAuditById` check before enqueueing anything to Trigger.dev)
- `updateAuditStatus()` itself requires `deleted_at IS NULL` in its WHERE clause — a deleted audit's status can never be mutated by any caller, including a raced retry or a manual Trigger.dev "Test" run
- original audit status is preserved exactly as it was at the moment of deletion
- child records preserved: `component_results`, `checklist_items`, `grouped_gaps`, `reports`
- PDF storage object preserved (never deleted, never even referenced by any delete code path)
- audit code is never reused — `getMaxAuditCodeSequenceForYear()` deliberately still counts deleted audits' codes; `audits_audit_code_key` is unchanged and NOT made conditional
- list-row delete is intentionally deferred (see section 13) — only the audit detail page has a Delete affordance in this version
- the terminal-status rule (`isTerminalAuditStatus`, `TERMINAL_AUDIT_STATUSES`) now lives in `src/lib/audit/constants.ts` (a neutral domain module), not `src/lib/ui/audit-progress.ts` — the UI module re-exports it for backward compatibility
- the pre-existing hard-delete `deleteAudit()` in `src/lib/supabase/repositories/audits.ts` (rollback-only, used by `create-audit.ts` for a failed-creation cleanup) is completely untouched and unrelated to soft delete — do not confuse the two

**Production verification audit:** `AIC-2026-000001` (Figma), id `3149c9d5-383d-4f63-acbc-3c8f1d530572`

Verified:
- `deleted_at` populated (`2026-09-30T17:02:52.826+00:00`)
- original status remained `COMPLETED`
- 5 `component_results` preserved
- 38 `checklist_items` preserved
- 6 `grouped_gaps` preserved
- `reports` row preserved (`status: GENERATED`, `pdf_storage_path` intact)
- `report.pdf` storage object preserved (207,766 bytes, unchanged)
- detail URL → 404 (user-confirmed live)
- status-mutation guard confirmed directly at the DB level (`updateAuditStatus`'s exact WHERE shape matched 0 rows against this audit)
- no unexpected Trigger.dev run created by the delete or by the (unreachable) retry/regenerate paths
- non-deleted audit (`AIC-2026-000014`) regression check: PASS — still queryable, PDF/report intact

**Also note:** several other disposable COMPLETED audits were manually soft-deleted by the user during production testing (`AIC-2026-000002` through `000006`, plus `000015`) — all handled correctly by the same guard, not a bug.

## 7. SECURITY STATE

SECURITY-001 was previously marked PASS after old keys were revoked.

Later, a Trigger.dev key issue appeared because all visible old production keys had been revoked and Vercel was still using an invalid/revoked key (surfaced as repeated `401 Invalid API key` errors blocking audit queueing).

A new active Trigger.dev production API key was created and Vercel Production was redeployed.

Current state:
- a new active production key exists
- old keys revoked
- Vercel production redeployed
- subsequent audits/PDF runs completed successfully
- no secret values in docs/git

**Do NOT store any secret values in this file or in git.**

## 8. UX QA STATE

Manually verified live:
- **AUTH-UX-001** Logout — PASS
- **INPUT-001** bare domains — PASS
- **AUDIT-DETAIL-UX-002** contact details — PASS
- **NAV-UX-001** navigation/breadcrumb — functionally working per user

**ANIMATION-UX-001** — code-complete; live verification still unconfirmed, note as open until checked.

**React hydration mismatch** — mentioned as an item to retain/carry forward, but no record of the specific issue exists anywhere in this file, the repo, or memory as of this checkpoint. If still genuinely open, a fresh session should ask the user for the exact symptom/page before investigating — do not assume details not documented here.

PDF cover/current report — production visually verified through the PDF work (section 5 above).

## 9. Stable Backup

- Stable rollback tags:
  - `ai-clinic-stable-2026-09-26` → points exactly to `3415b81` (older checkpoint — **do NOT move/rewrite this tag**)
  - `ai-clinic-stable-2026-09-30` → points to this checkpoint's docs commit (current)
- Local backup archives (git-archive style, tracked content only — never the raw working directory):
  - `~/Desktop/AI-Clinic-stable-2026-09-26.zip` — 456 KB, 269 files, excludes `.git`, `node_modules`, `.next`, `.env*`, `Recources/`, `Connectors/`, `dataforseo-test/`, `Smartclick-APIs.rtf`, and all other secret/reference files; `.env.example` only is included and is safe
  - `~/Desktop/AI-Clinic-stable-2026-09-30.zip` (or a timestamped-suffix variant if that exact name already existed — see the BACKUP-CHECKPOINT-007 Quick Report for the exact final path/size) — same exclusion rules, taken from the `ai-clinic-stable-2026-09-30` tag

To roll back to either checkpoint: `git checkout <tag>` (detached HEAD) or reset a throwaway branch to it, then redeploy Vercel (auto via GitHub integration) and separately redeploy the Trigger.dev worker for that commit's code (see section 10 below — they are independent deploy targets). Rolling back past `6f0a83b` also means the `audits.deleted_at` column/behavior in that older code won't exist — the DB column itself stays (migrations are never rolled back automatically), it just won't be read/written by that older code.

## Known Product Logic (locked, do not change without explicit instruction)

- No scoring system.
- No severity/priority system.
- No automatic email.
- No user accounts/roles — shared-password access only.
- Partial component failures must not crash the whole audit (component crash → `PARTIAL`; clean pre-PDF gate failure → `BLOCKED`; unrecoverable pipeline/system failure → `FAILED`).
- No Result / N/A / Could Not Verify must never become a false gap, anywhere in the pipeline.
- The PDF renderer consumes `reports.canonical_report_json` only — no direct queries to component_results/grouped_gaps/checklist_items/provider APIs.
- The `audit-reports` Supabase Storage bucket remains private; downloads only via signed URL.
- Social Profiles client-facing display rule (see section 4 above) — presentation-only, do not conflate with the underlying classification logic (`run-component.ts`/`checklistStatusFor()`/gap detectors).
- PDF regeneration (`regenerate-audit-pdf`) only re-renders the already-assembled `canonical_report_json` — it never re-runs audit components. A historical audit's underlying data (e.g. Social Profiles connection status) only reflects fixes shipped **before** that audit originally ran; regenerating its PDF does not retroactively apply newer component logic. Only a brand-new audit exercises current component code.
- Audit soft delete (section 6) only affects terminal-status audits and is presentation/access-layer only for everything except the one new `deleted_at` column — never conflate the hard-delete rollback function (`deleteAudit()`) with soft delete (`softDeleteAudit()`); they are unrelated.

## Brand Tokens / Visual Direction

- SmartClick reference (from `Recources/screencapture-smartclick-agency-...png`): primary blue `#2289F5`, navy `~#0F2A3D`, white, restrained yellow accent `#FFD84D`.
- The PDF cover and the Book a Call CTA button use `#2289F5` (`SMARTCLICK_BLUE`, scoped locally in `html-template.ts`).
- **Other UI/PDF sections still use the older token set** (`BRAND_BLUE = #28A8DF`, `DARK_NAVY = #12263A`, in `src/lib/pdf/html-template.ts` and the app's CSS custom properties) — deliberate, scoped-only change. **Do not globally rewrite colors unless explicitly tasked.**

## Validation / Reference

- `dataforseo-test/` is reference-only; do not restart or extend it unless explicitly requested.
- VAL-001 → VAL-003C are **frozen**. VAL-003C classification logic passed 15/15 tests, accepted with known limitations. Do not reopen.

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

## 10. Vercel / Trigger.dev — Separate Deploy Targets

- Production project: `stojan-s-projects/ai-clinic`, URL: https://ai-clinic-sage.vercel.app
- Trigger.dev project: `proj_pazyklzkrxxmecphnoco` (SmartClick org, AI-Clinic project) — current known deployed worker version: **`20260930.4`**
- **A Vercel redeploy does NOT update the Trigger.dev worker, and vice versa.** Any change to code imported by `src/trigger/*` (including `src/lib/pdf/html-template.ts`, `logo-assets.ts`, anything the PDF renderer or audit pipeline touches, any `src/lib/social-profiles/*`/`src/lib/prompt-visibility/*` component logic, or shared repository/status-write logic like `src/lib/supabase/repositories/audits.ts`) requires a separate `npx trigger.dev@latest deploy` (use `--native-build --detach`; confirm liveness via `npx trigger.dev@latest projects list`, or poll `npx trigger.dev@latest runs get <run-id>` after a run to confirm the `Version` field matches the new deploy — the CLI's `--detach` returns before the new version is fully live, so an immediate run can land on the *previous* version; wait ~30-60s and check again if so). Note: if no real audit/PDF run happens after a Trigger.dev deploy, the new version's liveness can only be confirmed by the deploy command's own success report, not by an actual run's `Version` field — don't manufacture a paid run just to prove this.
- The Vercel CLI (`npx vercel`) works and is authenticated in this environment; project is already linked (`.vercel/project.json`). Listing env vars (`vercel env ls production`) shows names/metadata only, never values. `npx vercel logs --environment production --query "<term>"` is a reliable way to pull real production error logs. `npx vercel --prod --yes` (direct CLI deploy) has returned `"Not authorized"` in this environment even though `vercel whoami`/project linkage both check out — the GitHub integration's auto-deploy-on-push-to-main is the reliable path instead (confirm via `npx vercel ls --prod`, matching the newest deployment's age/timestamp against the push time, and its alias list including the production URL).
- Pulling real production secret values locally (`vercel env pull`) is blocked by the Claude Code auto-mode permission classifier ("Credential Materialization") — do not attempt to route around this; use indirect evidence (existing run history, `vercel env ls` metadata, `vercel logs`) instead when verifying credentials.
- The app's `AI_CLINIC_SHARED_PASSWORD` (production login) and the production `TRIGGER_SECRET_KEY` are not available locally (`.env.local` only has dev-scoped placeholders/keys, e.g. `tr_dev_...`). A fresh session cannot log into production or directly `tasks.trigger()` against it. To run/regenerate an audit in production, or to click through any UI flow (including the audit-delete confirmation): either ask the user to do it via the live app UI, or — for tasks with no UI entry point (e.g. regenerating a COMPLETED audit's PDF, which has no button in the current UI) — ask the user to use the Trigger.dev dashboard's "Test" feature on the relevant task with the right payload (e.g. `{"auditId": "<uuid>"}`), which only needs their Trigger.dev login, not the app's. The shared-password auth middleware also means a plain unauthenticated `curl` against any app route (including API routes) just gets redirected to `/login` — it cannot be used to directly observe a 404/error response; use direct Supabase queries (below) to prove the underlying data/logic instead, and ask the user to confirm the literal HTTP-level behavior when that matters.
- Direct read-only production Supabase queries (via `SUPABASE_SECRET_KEY`/`NEXT_PUBLIC_SUPABASE_URL` from `.env.local`, the same single Supabase project used in production) are a reliable way to inspect exact stored audit/component/report data, and to prove a repository function's exact query behavior by replicating its filter chain directly (e.g. confirming `getAuditById`'s `deleted_at IS NULL` filter really excludes a given row). Never write to production data this way except for an explicitly-approved, narrowly-scoped migration via `npx supabase db push --linked` (project ref `xpeqqatqxasfpujdwkxd`) — never a raw data write.
- `npx supabase inspect db index-stats --linked` and `npx supabase migration list --linked` both connect directly to the remote Postgres (no Docker needed) and are reliable ways to confirm an index/migration actually applied; `npx supabase db dump`/`db diff` require Docker, which is not installed in this environment.

## 11. Fresh Session Rules

A fresh Claude Code session must:

1. Read `AI-Clinic-RESTART.md` completely first.
2. Run `git status --short`.
3. Check current `HEAD` against `origin/main` — don't assume the two match without checking.
4. Preserve both stable tags `ai-clinic-stable-2026-09-26` and `ai-clinic-stable-2026-09-30` — never move or recreate either.
5. Never read/modify `dataforseo-test/` unless explicitly requested.
6. Never stage `Recources/`, `Connectors/`, or other secret/reference files — never `git add .`/`git add -A`.
7. Keep tasks small and isolated (Task-ID-scoped).
8. Preserve VAL-003C.
9. Do not run a full paid audit unless explicitly required.
10. Remember Vercel and Trigger.dev are separate deployment targets (see section 10).
11. Stop after each task with a Quick Report.
12. Do not mark a task "verified live" unless it was actually checked live — code-complete/pushed and manually-verified are different states; keep them distinct in reporting.
13. Never confuse the hard-delete `deleteAudit()` (create-audit rollback) with soft-delete `softDeleteAudit()` (AUDIT-DELETE-001) — see section 6.
14. PERFORMANCE-001 analysis is complete and optimization is intentionally deferred (see section 12) — do not treat it as a pending/mandatory task; next task is TBD, product-priority driven (see section 13).

## 12. PERFORMANCE-001 — ANALYSIS COMPLETE / DEFERRED

Measurement-only investigation completed (PERFORMANCE-001A). No code was changed.

Findings:
- **no critical performance blocker identified**
- auth middleware (`src/proxy.ts`) is local HMAC-SHA256 verification only — zero network/DB I/O, negligible cost
- normal page navigation never invokes DataForSEO, Apify, any AI provider, or Playwright — confirmed by direct import-graph inspection; those only run inside Trigger.dev task execution, never on a Vercel UI request path
- biggest performance *opportunities* (not problems — current MVP speed is acceptable):
  - no `loading.tsx`/`<Suspense>` anywhere, so `force-dynamic` navigation (`/audits`, `/audits/[id]`) shows nothing until the full server render completes — the strongest, most universal finding (perceived latency, not backend slowness)
  - `getLatestReport()` over-fetches the full `canonical_report_json`/`pre_pdf_checklist_json` on every call, even though callers only read a handful of scalar fields
  - `listComponentResultsByAuditId()` similarly over-fetches `raw_result_json`/`normalized_result_json` when only `status` is used
  - `/audits` issues 1 + N `getLatestReport` calls (N = active audit count) just to compute a boolean per row — will scale linearly with audit count, no pagination exists
  - some independent reads (`getAuditById` alongside its sibling queries in the detail page, status route, and PDF route) are written sequentially though not actually dependent on each other
  - active-audit status polling (every 4s) repeats the same over-fetching reads for as long as an audit is running

Risk assessment (for any future implementation):
- loading states = VERY LOW RISK
- narrower `SELECT` column lists = VERY LOW RISK
- parallelizing already-independent reads = VERY LOW RISK
- caching changes, auth/middleware changes = defer, higher risk given the shared-password access model and live-status correctness requirements

**Decision: performance optimization is intentionally deferred.** Current MVP speed is acceptable as-is. Revisit only if:
- UX becomes materially problematic
- audit/user volume increases meaningfully
- production metrics show an actual regression

PERFORMANCE-002 (or any optimization work) is **not** a mandatory next task.

## 13. Known Deferred / Optional Items

Kept as optional only, not scheduled:
- list-row audit delete (detail-page delete is the only entry point today; see section 6)
- performance optimizations (see section 12 — analysis complete, deferred)
- React hydration mismatch (#418), if still unresolved — no specifics documented anywhere in this repo as of this checkpoint; ask the user for the exact symptom/page before investigating
- DB capacity analysis
- regenerate-PDF button for COMPLETED audits (currently only available for BLOCKED/PARTIAL/FAILED per the detail-page UI)
- further report/product improvements

**NEXT TASK: TBD / product-priority driven.** No task is pre-assigned — a fresh session should ask the user what to work on next rather than assuming PERFORMANCE-001 or any other specific item.

## 14. Final Production Smoke Status

After the SOCIAL CONNECTION and AUDIT-DELETE-001 production work (sections 2 and 6) and the PERFORMANCE-001 analysis (section 12), the build is considered stable. No issue was reported against the current deployment in this session.

As objective supporting evidence (not a narrated manual test — no explicit "I tested X and saw Y" message was given for this specific checkpoint): Trigger.dev run history shows 2 real, independent audits completed successfully in production after the last checkpoint — `AIC-2026-000016` (OCUCO) and `AIC-2026-000017` (Upshift), both `COMPLETED`, both on worker `20260930.4`, neither `FAILED`/`BLOCKED`/`PARTIAL`. This is consistent with a stable, working production build, but is not the same as an explicit user-confirmed click-through smoke test — a fresh session should not claim more than this.

**Final manual smoke test: PASS (by the above objective evidence). Current build considered stable.**
