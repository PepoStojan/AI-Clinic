# AI-Clinic — Restart Checkpoint

## Project Status

**AI-Clinic MVP is LIVE and production-functional.** All work below is committed and pushed to `main` (`HEAD` = `ef45dc9`); Vercel is connected via GitHub integration and auto-deploys on push, but individual deployments were not all manually re-verified live after this session's pushes (see per-task notes).

- Production URL: https://ai-clinic-sage.vercel.app
- GitHub `main` is current as of `ef45dc9`.
- Supabase production data/storage works.
- Shared-password login works.
- Full audit pipeline works end-to-end in production (verified as of the last full audit run, prior checkpoint).

## Recent Task Log (this session, most recent first)

### 6. NAV-UX-001 — Breadcrumbs + Back Navigation — COMMITTED, PUSHED

- Commit: `ef45dc9` — "feat: add breadcrumbs and back navigation to audit detail"
- Files: `src/app/audits/[id]/audit-detail-client.tsx`, `src/app/audits/[id]/audit-detail.module.css`
- `← Back to Audits` link + `Audits / {Company Name}` breadcrumb, both using explicit `/audits` navigation (no `router.back()`). Company name is plain current-page text, not a link.
- Validation: 377 passed, 25 skipped, lint PASS, typecheck PASS, build PASS.
- Pushed to `main`. **Not manually verified live** — no dashboard/browser confirmation performed this session.

### 5. ANIMATION-UX-001 — Audit Progress Lottie Animation — COMMITTED, PUSHED

- Commit: `b6f33ee` — "feat: add audit progress animation"
- New dependency: `@lottiefiles/dotlottie-react` (`^0.19.16`)
- New asset: `public/animations/ai-audit-flow.lottie`
- Files: `package.json`, `package-lock.json`, `src/app/audits/[id]/audit-detail-client.tsx`, `src/app/audits/[id]/audit-detail.module.css`
- Renders centered above the progress-step list, gated by the existing `isRunning` value (`!isTerminalAuditStatus(status)`), so visible for `CREATED / QUEUED / PROCESSING / VALIDATING / READY_FOR_PDF / GENERATING_PDF` and hidden for `COMPLETED / BLOCKED / PARTIAL / FAILED`. Autoplay, loop, no controls, responsive width `clamp(180px, 40vw, 240px)`.
- Validation: 377 passed, 25 skipped, lint PASS, typecheck PASS, build PASS.
- Pushed to `main`. **Not manually verified live.**

### 4. AUDIT-DETAIL-UX-002 — Contact Details on Completed Audit Screen — COMMITTED, PUSHED

- Commit: `b817241` — "feat: show audit contact details"
- Files: `src/app/audits/[id]/page.tsx`, `src/app/api/audits/[id]/status/route.ts`, `src/app/audits/[id]/audit-detail-client.tsx`, `src/app/audits/[id]/audit-detail.module.css`
- Completed Audit Detail screen now shows Contact name (as stored, unsplit — `contact_name` has no separate first/last columns), Email (`mailto:` link), Company, Website (clickable link). Audit code intentionally excluded from this block (already shown elsewhere on the page).
- No schema change, no new query — the data was already fetched by `getAuditById()` and just wasn't being projected through to the client.
- Validation: 377 passed, 25 skipped, lint PASS, typecheck PASS, build PASS.
- Pushed to `main`. **Not manually verified live.**

### 3. PDF-COVER-003 — SmartClick-Style Cover Redesign — COMMITTED, PUSHED, WORKER DEPLOYED, **NOT YET VERIFIED IN A REGENERATED PRODUCTION PDF**

- Commit: `181d304` — "feat: SmartClick-style PDF cover redesign"
- File: `src/lib/pdf/html-template.ts` (`renderCover()` + `.cover*` CSS only — page 1, no other page touched)
- Direction: full-bleed hero, `#2289F5` → deeper blue diagonal gradient, white typography, two-column layout —
  - Left: `AI-Clinic` / `Developed by smartclick.agency` (top), `AI Visibility Audit` headline, supporting tagline, company name, website
  - Right: CSS-only decorative composition (no images/SVG files) — translucent rounded cards labeled "AI Recognition", "Prompt Visibility", "Crawler Access", "Brand Presence" with thin connector lines and one restrained `#FFD84D` accent dot. **Decorative only — never derived from report data, never real metrics.**
  - Bottom: divider + Audit date / Audit code metadata bar
- Reference used: `Recources/screencapture-smartclick-agency-...png` (full-page SmartClick homepage screenshot, user-supplied).
- Trigger.dev production worker redeployed to **version `20260925.7`** (confirmed via `trigger.dev whoami` / deploy output — this key rotation note matters: the deploy used the CLI's own logged-in session, not `TRIGGER_SECRET_KEY`).
- **Verification status:** the new cover was rendered locally via a temporary Playwright screenshot test (confirmed visually correct, then deleted — never committed) and pushed live. **A production PDF has not yet been regenerated and re-checked since this deploy** — I offered to trigger `regenerate-audit-pdf` for the Ocuco audit (`run_06gdj04e05q4m76a2eq4bmg501` replay) and the user chose to verify it themselves instead. **Do not assume the live cover is confirmed — this needs an actual regenerated-PDF check before calling PDF-COVER-003 fully done.**

### 2. AUTH-UX-001 — Logout — COMMITTED, PUSHED, **NOT MANUALLY VERIFIED**

- Commit: `b60cb30` — "feat: add logout action"
- Files: `src/lib/auth/actions.ts` (new — `logoutAction`), `src/components/header.tsx`, `src/components/header.module.css`
- `logoutAction` deletes the `ai_clinic_session` cookie (`path: "/"` match) and redirects to `/login`. Header now shows a Logout button (styled as a form-submit button matching `.navLink`). Reuses `SESSION_COOKIE_NAME` from the existing `session.ts` — no new auth architecture.
- Pushed to `main`. **Chrome browser automation was unreliable all session (repeated `tabs_context_mcp` timeouts) — the 4 manual verification steps (login works / Logout visible / click redirects to `/login` / `/audits` redirects to `/login` after logout) were never completed or confirmed.** Mark this as implemented-but-unverified until someone manually checks it in production.

### 1. INPUT-001 — Domain/URL Normalization — COMMITTED, PUSHED, VALIDATED

- Commit: `cb75bff` — "feat: accept bare domains in audit URL inputs"
- Files: `src/lib/audit/url.ts` (new `ensureProtocol()`), `src/lib/audit/validation.ts`, `src/app/new-audit/new-audit-form.tsx` (URL inputs changed `type="url"` → `type="text"` — required, since native browser validation blocked bare-domain entry client-side), plus `url.test.ts` / `validation.test.ts`.
- Accepts `ocuco.com`, `www.ocuco.com`, `https://ocuco.com`, `https://www.ocuco.com` — trims whitespace, prepends `https://` only when no explicit scheme (`://`) is present, preserves `www.`, rejects invalid text and non-http/https schemes (e.g. `ftp://`). Applies to both the main Website URL and Additional Target URLs.
- Validation: 377 passed, 25 skipped, lint PASS, typecheck PASS, build PASS.
- No downstream Supabase/Trigger.dev/report/PDF logic changed — `registered_domain` extraction and storage format unchanged.

## PDF Report — Current Design State

- AI provider logos (base64, no hotlinking): ChatGPT, Gemini, Claude, Google AI
- Social platform logos (base64, no hotlinking): LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, Threads, Reddit
- ~10 pages on recent samples
- Executive Summary: dashboard-style stat cards
- Brand Recognition: provider logo cards
- Prompt Visibility: grouped by prompt (prompt shown once, 4 provider rows beneath)
- Social Profiles: platform logo + status pills
- Third-Party Listings: compact grid
- Technical Accessibility: improved presentation
- Key Gaps: consulting-style cards (title, affected-check count, evidence, What we observed / What this suggests / What to consider)
- Cover (page 1): SmartClick-style hero — see PDF-COVER-003 above, **pending live regeneration check**
- `canonical_report_json` remains the sole source of truth for the renderer
- **No scoring/severity/priority system anywhere**
- Signed PDF download via private Supabase Storage bucket works (as of last full verification)

**Product-quality observation (not yet actioned):** the report is visually much stronger post-redesign, but strategic/actionable guidance could still improve. Potential future direction discussed: a `Finding → Meaning → Opportunity → Recommended Action` structure for Key Gaps. **Do not implement automatically** — this is a idea, not a task.

## Brand Tokens / Visual Direction

- SmartClick reference (from `Recources/screencapture-smartclick-agency-...png`): primary blue `#2289F5`, navy `~#0F2A3D`, white, restrained yellow accent `#FFD84D`.
- The PDF cover (PDF-COVER-003) now intentionally uses `#2289F5`.
- **Other UI/PDF sections still use the older token set** (`BRAND_BLUE = #28A8DF`, `DARK_NAVY = #12263A`, in `src/lib/pdf/html-template.ts` and the app's CSS custom properties) — this is a deliberate, scoped-only change. **Do not globally rewrite colors unless explicitly tasked.**

## SECURITY-001 — Trigger.dev Key Rotation — **NOT COMPLETE, DO NOT MARK PASS**

Started because an earlier Trigger.dev production key was exposed during setup/troubleshooting (rotated once, then a second key was pasted into troubleshooting conversation history).

Status of each required step, verified against this session's actual conversation/tooling — **not all confirmed:**

| Step | Status |
|---|---|
| New Trigger.dev Production key created | ✅ User confirmed created/copied |
| Vercel `TRIGGER_SECRET_KEY` updated (Config/non-sensitive type) | ✅ User confirmed saved as Config type |
| Vercel Production redeployed (as a direct response to the rotation) | ⚠️ **Not directly confirmed** — the manual dashboard redeploy step was never confirmed complete before the conversation moved to other tasks. Six subsequent code pushes to `main` (INPUT-001 through NAV-UX-001) would each trigger a fresh Vercel deploy via the GitHub integration, which would pick up the current env var value — but this was never explicitly checked/confirmed live. |
| Trigger.dev worker redeployed after rotation | ⚠️ **Not done as a distinct rotation step.** Note: `TRIGGER_SECRET_KEY` is used by Vercel/Next.js to *call* Trigger.dev, not something the worker itself needs redeployed for — so this step may not actually be necessary, but it was never explicitly executed or reasoned through with the user. (A Trigger.dev deploy *did* happen later, to version `20260925.7`, but that was for PDF-COVER-003, unrelated to key rotation.) |
| Lightweight Trigger.dev SDK connectivity check run | ❌ **Not done.** |
| Old exposed production key revoked | ❌ **Not confirmed.** Only "new key created" was confirmed by the user — revocation of the old key in the Trigger.dev dashboard was never asked about or confirmed. |

**Next required step for SECURITY-001:** confirm the old key is actually revoked in the Trigger.dev dashboard, and run one lightweight connectivity check against production. Do not run a full paid audit for this.

## Validation / Reference

- `dataforseo-test/` is reference-only; do not restart or extend it unless explicitly requested.
- VAL-001 → VAL-003C are **frozen**. VAL-003C classification logic passed 15/15 tests, accepted with known limitations. Do not reopen.

## Current Test Status (last full run, this session)

- 377/377 unit tests PASS, 25 skipped
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

## Next Planned Task — SOCIAL-LOGIC-002 (do NOT implement yet)

**Director requirement:** a social profile should count as present only if it is connected to the audited official website — not merely discovered somewhere on the web.

Platforms: LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, Threads, Reddit.

Desired final classification:
- Found + Connected → **PRESENT**
- Found + Not Connected → **MISSING**
- Not Found → **MISSING**
- Unverified → **MISSING**
- Could Not Verify / N/A → **COULD NOT VERIFY / neutral**

Raw evidence must be preserved internally regardless of final classification: discovered profile URL, raw found status, connection status.

**Impact areas to inspect before implementing:**
- Social Profiles component logic (`src/lib/social-profiles/`)
- Connection detection logic
- Deterministic gap detector
- Executive Summary social counts
- Canonical report assembly
- PDF Social Profiles presentation
- Tests
- Historical report regeneration behavior (existing reports built under the old classification)

This was **only scoped, not implemented,** during this checkpoint.

## Other Optional / Post-MVP Ideas (not blockers, do not implement automatically)

- Audit soft-delete (`deleted_at`)
- Richer Leads/Contacts view
- Stronger strategic/actionable report guidance (Finding → Meaning → Opportunity → Recommended Action)
- Additional PDF polish
- Additional UI polish
- SECURITY-001 completion (see above — this one is a required follow-up, not truly optional)

## Security / Local Git Safety

**The GitHub repository is public.** Never commit:
- `Connectors/`
- `Recources/`
- `dataforseo-test/`
- `.env.local`
- `Smartclick-APIs.rtf`
- any other API/reference/secret file
- local screenshots/reference assets, unless explicitly approved for a specific task (e.g. the SmartClick homepage screenshot used as design reference for PDF-COVER-003 stayed local-only, never committed)

These remain local/reference-only. Never use `git add .` / `git add -A` — always stage exact files by name and review `git status`/`git diff` before committing.

## Vercel / Trigger.dev — Separate Deploy Targets

- Production project: `stojan-s-projects/ai-clinic`, URL: https://ai-clinic-sage.vercel.app
- Trigger.dev project: `proj_pazyklzkrxxmecphnoco` (SmartClick org, AI-Clinic project) — current known deployed worker version: `20260925.7`
- **A Vercel redeploy does NOT update the Trigger.dev worker, and vice versa.** Any change to code imported by `src/trigger/*` (including `src/lib/pdf/html-template.ts`, `logo-assets.ts`, anything the PDF renderer or audit pipeline touches) requires a separate `npx trigger.dev@latest deploy` (use `--native-build --detach` to avoid the CLI's log-stream connection dropping; poll `trigger.dev runs list` afterward to confirm the deployed version, or use the CLI directly — it stays authenticated via its own login session).
- The Vercel CLI is not installed locally as of this checkpoint — Vercel env var / redeploy steps in this session were guided manually via the dashboard, not automated.

## Restart Rules

A fresh Claude session should:

1. Read `AI-Clinic-RESTART.md` first.
2. Inspect `git status --short` and current `HEAD`.
3. Not read or modify `dataforseo-test/` unless explicitly needed.
4. Not commit `Recources/`, `Connectors/`, or other local reference files — never `git add .`/`git add -A`.
5. Preserve all frozen MVP business logic (see "Known Product Logic" above) unless a named logic task (e.g. SOCIAL-LOGIC-002) explicitly changes it.
6. Make small, isolated Task-ID-scoped changes only.
7. Run tests/lint/typecheck/build after implementation, before declaring anything done.
8. Stop after each task with a Quick Report.
9. Remember Vercel and Trigger.dev are separate deployment targets (see above).
10. Do not run a full paid audit or regenerate a production PDF unless explicitly required — regenerating a PDF is free/lightweight (reads only `canonical_report_json`, no provider calls) and generally safe to offer, but still confirm with the user first since it overwrites the live stored file.
11. Do not mark a task "verified live" unless it was actually checked live — code-complete/pushed and manually-verified are different states; keep them distinct in reporting.
