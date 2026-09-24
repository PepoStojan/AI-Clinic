# AI-Clinic — Restart Checkpoint

## Current Phase
Implementation — audit components

## Completed Tasks
- INFRA-001 — Supabase Foundation — PASS
- INFRA-002 — Trigger.dev Foundation — PASS
- CORE-001 — Audit Creation + Checklist Engine — PASS
- COMP-001 — Brand Recognition — PASS

## Current State
- Last completed task: COMP-001
- Next task: COMP-002 — Prompt Visibility
- Do not start COMP-002 without explicit user approval
- Current blockers: None

## Important Decisions Since Previous Checkpoint

1. New audits remain `CREATED` after CORE-001. `QUEUED` is only used when real Trigger.dev orchestration hands the audit to background execution.
2. Brand Recognition uses DataForSEO as the unified gateway for all 4 systems: ChatGPT/OpenAI, Gemini, Claude, Google AI.
3. Do NOT build native OpenAI/Gemini/Anthropic SDK adapters for Brand Recognition in the MVP.
4. Brand Recognition fixed questions: "What is [Brand Name]?", "What does [Brand Name] offer?", "What kind of company is [Brand Name]?"
5. Brand Recognition reference profile currently uses: brand/company name, registered domain, website URL, optional product/service name. No live official-site content fetch is implemented yet — accepted MVP decision, not a blocker.
6. Brand Recognition statuses: Accurate, Partially Accurate, Inaccurate, Not Recognized, No Result.
7. No Result never becomes a gap.
8. Brand Recognition checklist mapping: Accurate → `COMPLETED`; Partial/Inaccurate/Not Recognized → `GAP_FOUND`; No Result → `COULD_NOT_VERIFY`; `FAILED` only for internal/system failures.
9. Brand Recognition is fully implemented and live-tested.
10. DataForSEO model choices currently used: ChatGPT `gpt-4.1-mini`, Gemini `gemini-2.5-flash`, Claude `claude-haiku-4-5`, Google AI via DataForSEO's Google AI Mode endpoint.

Do not change these during restart preparation.

## Infrastructure Status

**Supabase:** live, 6 core tables live, `audit-reports` bucket private, integration verified.

**Trigger.dev:** project live and linked, smoke task live-verified, idempotency verified, independent audit runs verified.

**Git:** initialized, working commits exist.

**GitHub remote:** not configured (`git remote -v` returns nothing).

**Vercel:** not configured (no `.vercel` directory, no `vercel.json`).

## Test Status

**CORE / schema regression:**
- schema integration: PASS
- audit creation integration: PASS

**COMP-001:**
- typecheck: PASS
- lint: PASS
- build: PASS
- unit tests: 67/67 PASS
- Brand Recognition live integration: 1/1 PASS
- schema + audit-creation regression: 12/12 PASS

## Latest Commits
- COMP-001: `fdf0ed56af692741dc178ddf99cfba9be4419734` — "feat: add brand recognition audit component"
- CORE-001: `cc9f2f01706637aa2b13a44c28adc1470d330da3` — "feat: add audit creation and checklist engine"
- INFRA-002: `4e64b70737797baa32b4ed8b95ff161300bb2931` — "chore: link Trigger.dev project ref"
- INFRA-001: `f9c4a5d3011b64e6b9d6c02e8646b0a1353c40e3` — "chore: initialize AI-Clinic foundation"

## Pending Work

**Next:** COMP-002 — Prompt Visibility

**Then:** COMP-003 — Social Profiles, COMP-004 — Directories, COMP-005 — Technical Accessibility, CORE-002, AI-001, REPORT-001, PDF-001, UI-001, QA-001, DEPLOY-001

## Security / Non-Blocking Notes
- Development keys exposed during tooling should be rotated before production.
- This is not currently blocking MVP implementation.

## Important Files
- `AI-Clinic-RESTART.md`
- `AI-Clinic-Claude-Code-Build-Spec.md`
- `AI-Clinic-Master-Planning-Final-QA.md`
- `AI-Clinic-Claude-Design-Handoff-Final-QA.md`

## Fresh Chat Instructions

When starting a new Claude Code chat:

1. Read `AI-Clinic-RESTART.md` first.
2. Briefly report: current phase, last completed task, next task, blockers.
3. Do not reread the full project by default.
4. Read only the relevant canonical sections needed for COMP-002.
5. If RESTART conflicts with canonical docs, flag the conflict.
6. Do not start COMP-002 until the user explicitly authorizes it.
