# AI-Clinic — Restart Checkpoint

## 1. Current Verified Production State

AI-Clinic MVP is live and production-functional.

- Current HEAD: `c40edd1`
- Stable rollback tag: `ai-clinic-stable-2026-09-26` (points to `3415b81`)
- Trigger.dev production worker: `20260930.1`
- Latest verified PDF regeneration run: `run_06gf4h5fbl0id3ge46aj9039e1`
- Production URL: https://ai-clinic-sage.vercel.app

**Current test baseline:**
- 443 passed
- 25 skipped
- 0 failures
- lint PASS
- typecheck PASS
- build PASS

Core capabilities remain:
- shared-password login
- new audit
- audits list
- audit detail/progress
- 5 audit components
- deterministic gap detection/grouping
- interpretation
- canonical report
- PDF generation
- private Supabase storage
- signed download
- Vercel production
- Trigger.dev production

## 2. PROMPT-COMPETITORS-002 — PRODUCTION PASS

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

## 3. SOCIAL-LOGIC-002 / 003 — PASS (production verified)

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

## 4. SOCIAL-CONNECTION-005 — IMPLEMENTED (production deployed)

Commit: `842d4f556654204b4350f5d40f0fb213e106eaf5`

Added first-party JSON-LD connection detection. A social profile may count as connected when confirmed by:
- an HTML anchor, OR
- validated first-party JSON-LD `sameAs`

Schema safeguards:
- accepted `@type`: Organization, Corporation, LocalBusiness
- entity must tie back to the audited domain via `url` or `@id`
- supports `@graph`
- supports `sameAs` as string or array
- malformed JSON-LD skipped safely, never fails the component
- unsupported platforms ignored

URL normalization supports: www/non-www, http/https, trailing slash, `x.com ↔ twitter.com`, `fb.com ↔ facebook.com`, `threads.com ↔ threads.net`. No unsafe YouTube handle/channel equivalence.

`connectionSource` persisted internally: `html` | `schema` | `html+schema` | `null`. No DB migration.

## 5. SOCIAL-CONNECTION-007 — IMPLEMENTED, PRODUCTION NOT YET PASS

Commit: `1358d47abdd6b2e83a67273bc4294f21a195cc3d`

Purpose: allow validated first-party schema `sameAs` to corroborate an otherwise Unverified external candidate.

Locked rule:
- If candidate verdict = Unverified AND validated first-party schema `sameAs` contains the exact safely-normalized same profile URL
- Then `profileStatus = Found`, `connected = Yes`, `connectionSource = schema`, `profileUrl` preserved
- Otherwise: existing Unverified behavior unchanged, `profileUrl` stays hidden, `candidateProfileUrl` may be retained internally for debugging

Important:
- `validateProfileIdentity()` untouched
- `identity-validation.ts` untouched
- no broad substring/camelCase weakening
- HTML-only corroboration intentionally NOT included in this pass

Test baseline after this feature: 437 passed / 25 skipped, lint/typecheck/build PASS.

Trigger worker deployed afterward: `20260926.6`.

**However:** a brand-new Ocuco production audit still showed YouTube = Missing / Not connected to website.

**Therefore SOCIAL-CONNECTION-007 must NOT be marked production PASS yet.**

## 6. CURRENT OPEN YOUTUBE ISSUE

Known first-party Ocuco structured data contains `https://www.youtube.com/@OcucoSoftwarewithVision` inside Organization/Corporation `sameAs`.

Yet the latest new Ocuco production PDF still showed YouTube = Missing / Not connected to website.

Current hypothesis — the remaining issue may be one of:
- external candidate URL differs from the schema URL
- `candidateProfileUrl` not retained/passed correctly
- JSON-LD not extracted in that production run
- schema entity rejected by domain tie-back
- normalization mismatch
- corroboration branch not reached
- some other orchestration issue

**Do not guess or change code before inspecting the exact new audit data path.**

**Next fresh-session task: SOCIAL-CONNECTION-009 — Final YouTube Production Debug.**

Need to inspect the newest audit's exact stored YouTube values:
- profileStatus
- connected
- connectionSource
- profileUrl
- candidateProfileUrl
- source
- evidence
- matchedSignals
- Apify candidate/verdict if available
- DataForSEO candidate/verdict if available
- parsed schema YouTube URL
- normalized candidate vs schema URL

Do not implement a fix until root cause is proven.

## 7. PDF-BRAND-008 / 009 — PRODUCTION PASS

Commit: `c40edd1057fa81678f6e3757b02ca0bb070c3797`
Trigger worker: `20260930.1`
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

## 8. SECURITY STATE

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

## 9. UX QA STATE

Manually verified live:
- **AUTH-UX-001** Logout — PASS
- **INPUT-001** bare domains — PASS
- **AUDIT-DETAIL-UX-002** contact details — PASS
- **NAV-UX-001** navigation/breadcrumb — functionally working per user

**ANIMATION-UX-001** — code-complete; live verification still unconfirmed, note as open until checked.

PDF cover/current report — production visually verified through the latest PDF work (section 7 above).

## 10. Stable Backup

- Stable rollback tag: `ai-clinic-stable-2026-09-26` → points exactly to `3415b81`
- Local backup archive: `~/Desktop/AI-Clinic-stable-2026-09-26.zip`
  - 456 KB, 269 files, created via `git archive` at the stable tag
  - Excludes `.git`, `node_modules`, `.next`, `.env*`, `Recources/`, `Connectors/`, `dataforseo-test/`, `Smartclick-APIs.rtf`, and all other secret/reference files
  - `.env.example` only is included and is safe

**Do NOT move/rewrite this tag.** Current code is ahead of that stable checkpoint due to later features.

To roll back: `git checkout ai-clinic-stable-2026-09-26` (detached HEAD) or reset a throwaway branch to it, then redeploy Vercel (auto via GitHub integration) and separately redeploy the Trigger.dev worker for that commit's code (see section 13 below — they are independent deploy targets).

## 11. Next Optional Feature After YouTube Fix

**AUDIT-DELETE-001 — Soft Delete Audits**

Planned direction:
- terminal audits only initially: COMPLETED, BLOCKED, PARTIAL, FAILED
- add `deleted_at` or reuse an existing archive/delete state if present
- delete from frontend = soft delete in DB
- hide from Audits list
- deleted audit's direct URL → 404/redirect
- preserve: component results, grouped gaps, reports, PDFs, evidence
- no hard delete for MVP
- confirmation modal
- no restore UI initially

**Do NOT start this until YouTube/social correctness is resolved.**

## Known Product Logic (locked, do not change without explicit instruction)

- No scoring system.
- No severity/priority system.
- No automatic email.
- No user accounts/roles — shared-password access only.
- Partial component failures must not crash the whole audit (component crash → `PARTIAL`; clean pre-PDF gate failure → `BLOCKED`; unrecoverable pipeline/system failure → `FAILED`).
- No Result / N/A / Could Not Verify must never become a false gap, anywhere in the pipeline.
- The PDF renderer consumes `reports.canonical_report_json` only — no direct queries to component_results/grouped_gaps/checklist_items/provider APIs.
- The `audit-reports` Supabase Storage bucket remains private; downloads only via signed URL.
- Social Profiles client-facing display rule (see section 3 above) — presentation-only, do not conflate with the underlying classification logic (`run-component.ts`/`checklistStatusFor()`/gap detectors).
- PDF regeneration (`regenerate-audit-pdf`) only re-renders the already-assembled `canonical_report_json` — it never re-runs audit components. A historical audit's underlying data (e.g. Social Profiles connection status) only reflects fixes shipped **before** that audit originally ran; regenerating its PDF does not retroactively apply newer component logic. Only a brand-new audit exercises current component code.

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

## 12. Vercel / Trigger.dev — Separate Deploy Targets

- Production project: `stojan-s-projects/ai-clinic`, URL: https://ai-clinic-sage.vercel.app
- Trigger.dev project: `proj_pazyklzkrxxmecphnoco` (SmartClick org, AI-Clinic project) — current known deployed worker version: **`20260930.1`**
- **A Vercel redeploy does NOT update the Trigger.dev worker, and vice versa.** Any change to code imported by `src/trigger/*` (including `src/lib/pdf/html-template.ts`, `logo-assets.ts`, anything the PDF renderer or audit pipeline touches, or any `src/lib/social-profiles/*`/`src/lib/prompt-visibility/*` component logic) requires a separate `npx trigger.dev@latest deploy` (use `--native-build --detach`; confirm liveness via `npx trigger.dev@latest projects list`, or poll `npx trigger.dev@latest runs get <run-id>` after a run to confirm the `Version` field matches the new deploy — the CLI's `--detach` returns before the new version is fully live, so an immediate run can land on the *previous* version; wait ~30-60s and check again if so).
- The Vercel CLI (`npx vercel`) works and is authenticated in this environment; project is already linked (`.vercel/project.json`). Listing env vars (`vercel env ls production`) shows names/metadata only, never values. `npx vercel logs --environment production --query "<term>"` is a reliable way to pull real production error logs (used successfully to diagnose the Trigger.dev key issue in section 8).
- Pulling real production secret values locally (`vercel env pull`) is blocked by the Claude Code auto-mode permission classifier ("Credential Materialization") — do not attempt to route around this; use indirect evidence (existing run history, `vercel env ls` metadata, `vercel logs`) instead when verifying credentials.
- The app's `AI_CLINIC_SHARED_PASSWORD` (production login) and the production `TRIGGER_SECRET_KEY` are not available locally (`.env.local` only has dev-scoped placeholders/keys, e.g. `tr_dev_...`). A fresh session cannot log into production or directly `tasks.trigger()` against it. To run/regenerate an audit in production: either ask the user to do it via the live app UI, or — for tasks with no UI entry point (e.g. regenerating a COMPLETED audit's PDF, which has no button in the current UI) — ask the user to use the Trigger.dev dashboard's "Test" feature on the relevant task with the right payload (e.g. `{"auditId": "<uuid>"}`), which only needs their Trigger.dev login, not the app's.
- Direct read-only production Supabase queries (via `SUPABASE_SECRET_KEY`/`NEXT_PUBLIC_SUPABASE_URL` from `.env.local`, the same single Supabase project used in production) are a reliable way to inspect exact stored audit/component/report data — used successfully throughout SOCIAL-CONNECTION debugging. Never write to production data this way.

## 13. Fresh Session Rules

A fresh Claude Code session must:

1. Read `AI-Clinic-RESTART.md` completely first.
2. Run `git status --short`.
3. Check current `HEAD`.
4. Preserve the stable tag `ai-clinic-stable-2026-09-26` — never move or recreate it.
5. Never read/modify `dataforseo-test/` unless explicitly requested.
6. Never stage `Recources/`, `Connectors/`, or other secret/reference files — never `git add .`/`git add -A`.
7. Keep tasks small and isolated (Task-ID-scoped).
8. Preserve VAL-003C.
9. Do not run a full paid audit unless explicitly required.
10. Remember Vercel and Trigger.dev are separate deployment targets (see section 12).
11. Stop after each task with a Quick Report.
12. Do not mark a task "verified live" unless it was actually checked live — code-complete/pushed and manually-verified are different states; keep them distinct in reporting.
13. **Do not mark SOCIAL-CONNECTION-007 production PASS until the YouTube issue (section 6) is actually resolved.**

## 14. Next Task

**SOCIAL-CONNECTION-009 — Final YouTube Production Debug** (see section 6 for exact scope). Do not implement a fix until root cause is proven from real stored audit data.
