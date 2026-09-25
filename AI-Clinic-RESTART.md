# AI-Clinic — Restart Checkpoint

## Current Phase
Same-day MVP shipping phase. The application now works end-to-end locally with real services.

## Completed Tasks
- INFRA-001 — Supabase Foundation — PASS / CLOSED
- INFRA-002 — Trigger.dev Foundation — PASS / CLOSED
- CORE-001 — Audit Creation + Checklist Engine — PASS / CLOSED
- COMP-001 — Brand Recognition — PASS / CLOSED
- COMP-002 — Prompt Visibility — PASS / CLOSED
- COMP-003 — Social Profiles — PASS / CLOSED
- COMP-004 — Directories — PASS / CLOSED
- COMP-005 — Technical Accessibility — PASS / CLOSED
- CORE-002 — Deterministic Gap Detection + Grouping — PASS / CLOSED
- AI-001 — Evidence-Bound Gap Interpretation — PASS / CLOSED
- REPORT-001 — Canonical Report Object + Pre-PDF Gate — PASS / CLOSED
- PDF-001 — Playwright PDF Generation — PASS / CLOSED
- UI-001 — MVP UI + End-to-End Audit Execution — PASS / CLOSED

## Current State
- Last completed task: UI-001
- Next task: QA-001
- After QA-001: DEPLOY-001
- Do not start QA-001 without explicit user authorization
- Current blockers: None blocking QA

## Current Working Product

Live-verified end-to-end flow:

```
Shared Password Login
→ New Audit
→ Audit Creation
→ Checklist Generation
→ Trigger.dev Queue
→ 5 Audit Components
→ Deterministic Gap Detection
→ Evidence-Bound Interpretation
→ Canonical Report
→ Pre-PDF Gate
→ Playwright PDF
→ Private Supabase Storage
→ COMPLETED
→ Signed PDF Download
```

- Final clean real end-to-end run: **38.4 seconds**
- Test company: Stripe
- Result: PASS

## UI-001 State

**Shared access:** shared password only, verified server-side, signed httpOnly session cookie. No user accounts, roles, or SSO.

**Screens (exactly 4):**
1. Shared Access
2. New Audit
3. Audits List
4. Audit Detail / Progress

**Progress polling:** ~every 4 seconds, stops on terminal status, no fake percentages.

**Audit statuses:** CREATED, QUEUED, PROCESSING, VALIDATING, READY_FOR_PDF, GENERATING_PDF, COMPLETED, BLOCKED, PARTIAL, FAILED.

**Current interpretation (accepted for MVP unless QA finds a concrete issue):**
- Component crash → PARTIAL
- Clean pre-PDF gate failure → BLOCKED
- Unrecoverable pipeline/system failure → FAILED

## Orchestration State

Real Trigger.dev orchestration exists. Main task: `run-ai-clinic-audit`.

Pipeline:
1. PROCESSING
2. `runBrandRecognitionComponent`
3. `runPromptVisibilityComponent`
4. `runSocialProfilesComponent`
5. `runDirectoriesComponent`
6. `runTechnicalAccessibilityComponent`
7. VALIDATING
8. `runGapDetection`
9. `runGapInterpretation`
10. `runReportAssembly`
11. GENERATING_PDF
12. `runPdfGeneration`
13. COMPLETED

The 5 components run via `Promise.allSettled`. `CREATED → QUEUED` occurs only after successful Trigger.dev submission. The browser does not need to remain open.

## Important Locked Implementation Decisions

1. Brand Recognition uses the DataForSEO unified gateway for ChatGPT, Gemini, Claude, and Google AI. No native OpenAI/Gemini/Anthropic SDK adapters.
2. Prompt Visibility uses the validated DataForSEO / VAL-003C entity-validation logic, generalized to the real schema (no SmartClick-specific fixtures).
3. Social Profiles: Apify actor `meU6XrAxXviSICIXQ` primary, DataForSEO SERP fallback; real actor output schema verified live.
4. Directories: exactly 10 platforms, DataForSEO primary, Claude/DataForSEO web-search fallback, no "Not Applicable," no ratings/review counts.
5. Technical Accessibility: exactly 6 crawlers, robots.txt + llms.txt only, fully deterministic, no AI.
6. N/A / Could Not Verify / No Result never becomes a gap, anywhere in the pipeline.
7. Gap detection (CORE-002) is deterministic; Claude never decides whether a gap exists.
8. Claude interpretation (AI-001) can never change facts, counts, or identity fields — only produces `what_we_observed` / `what_this_suggests` / `what_to_consider`.
9. The PDF renderer consumes `reports.canonical_report_json` only — no direct queries to component_results/grouped_gaps/checklist_items/provider APIs.
10. The `audit-reports` Supabase Storage bucket remains private; downloads only via signed URL.
11. Shared access only — no full authentication system.
12. No overall score, severity, or priority anywhere in the product.

## Latest Test Status

- **COMP-005:** full regression 200/200 PASS
- **CORE-002:** full regression 238/238 PASS
- **AI-001:** full regression 269/269 PASS
- **REPORT-001:** full regression 304/304 PASS
- **PDF-001:** full regression 329/329 PASS; real 8-page PDF generated, uploaded, downloaded, manually inspected
- **UI-001:** new UI/orchestration tests 34/34 PASS; full regression 364/364 PASS; typecheck/lint/build PASS; real end-to-end audit PASS (38.4s); PDF download PASS

## Latest Commits

- CORE-002: `a7efa83`
- AI-001: `70ee9f2`
- REPORT-001: `1b967cf`
- PDF-001: `f7088dc`
- UI-001: `ba0100d`

Latest/current commit: `ba0100d`

## Deployment Risk — Important

**Trigger.dev production deployment has NOT yet been verified.**

- Local `npx trigger.dev dev` works successfully.
- `trigger.config.ts` now includes the Playwright build setup (`build.external` + the official `playwright()` build extension) required to avoid a `playwright-core` / `chromium-bidi` bundling failure that otherwise blocks the worker from building at all.
- A separate `regenerate-pdf` Trigger.dev task was added so Playwright never runs inside a Vercel Server Action.

Still required during DEPLOY-001:
- Run a production Trigger.dev deployment (`trigger.dev deploy`).
- Verify the worker builds successfully in that environment.
- Execute a real production task.
- Verify Playwright PDF generation in the deployed Trigger.dev environment.

This is **not** blocking QA-001. It is a DEPLOY-001 acceptance requirement.

## Vercel Status

Not linked, not deployed. No `.vercel` directory, no `vercel.json` in the repository. Production is **not** live.

## GitHub Status

- Local git: initialized, working tree clean, branch `main`.
- Remote: **not configured** (`git remote -v` returns nothing).
- Latest commit: `ba0100d` — "feat: add AI-Clinic MVP interface and audit orchestration"

## Security Notes

Some development API keys/tokens were exposed during tooling/debugging sessions. Rotation is required before production/final handoff. This is currently a pre-production security task, not a QA blocker.

## Pending Work

Only two main build stages remain:

1. **QA-001** — real functional QA, regression, UI smoke, one clean end-to-end audit, failure-state sanity, production-readiness checks. No polishing rabbit holes.
2. **DEPLOY-001** — GitHub remote (still missing), Vercel, environment variables, Trigger.dev production deploy, production task execution, production PDF, production smoke audit.

## Important Files
- `AI-Clinic-RESTART.md`
- `AI-Clinic-Claude-Code-Build-Spec.md`
- `AI-Clinic-Master-Planning-Final-QA.md`
- `AI-Clinic-Claude-Design-Handoff-Final-QA.md`

## Fresh Chat Startup

When starting a fresh Claude Code chat:

1. Read `AI-Clinic-RESTART.md` first.
2. Briefly report: current phase, last completed task, next task, blockers, deployment risk.
3. Do not reread the full project by default.
4. Read only the canonical sections relevant to QA-001.
5. Do not start QA-001 until explicitly authorized by the user.
6. Preserve the same-day MVP shipping priority: working live product > optional polish.
