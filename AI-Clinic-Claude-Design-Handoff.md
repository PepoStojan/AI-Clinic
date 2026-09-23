# AI-Clinic — Claude Design Handoff

## Document Purpose
This document is the **visual and UX source of truth** for AI-Clinic.

Claude Design must use this document to create the final implementation-oriented design specification and visual references for the AI-Clinic MVP.

This document does **not** authorize changes to product logic, audit logic, database architecture, provider logic, component count, status semantics, report logic, or implementation architecture.

The goal is to prevent blockers, ambiguity, design drift, and implementation mistakes before Claude Code starts building.

---

# 1. Product Identity

## Product Name
Use exactly:

**AI-Clinic**

Do not rename, restyle, shorten, or remove the hyphen.

## Secondary Brand
Use:

**Developed by SmartClick**

SmartClick is secondary to AI-Clinic.

Use the exact approved SmartClick logo asset supplied by the project owner. Do not redraw, approximate, recreate, or reinterpret the logo.

## Typography
Primary typeface:

**Poppins**

Use Poppins consistently in the web application and PDF report.

---

# 2. Visual Direction

AI-Clinic should feel like a **premium consulting product**, not a dense SaaS analytics dashboard.

## Core Visual Principles
- Clean
- Premium
- Calm
- Precise
- Consultant-reviewed feel
- High trust
- Strong whitespace
- Clear hierarchy
- Minimal visual noise
- Easy to scan

Use an **Apple-like whitespace strategy**:
- generous negative space
- fewer elements competing for attention
- strong grouping
- clear hierarchy
- restrained decoration
- content should feel intentional rather than compressed

Avoid:
- dense dashboards
- excessive cards
- heavy borders
- aggressive gradients
- neon effects
- unnecessary charts
- gamification
- severity heatmaps
- visual clutter
- cramped layouts

---

# 3. Locked Design Tokens

Claude Design must provide a finalized token table using the following locked direction.

## Colors
Primary accent:
- `#28A8DF`

Supporting palette:
- White
- Dark navy
- Neutral gray scale

Use primary blue for:
- primary CTA
- selected / active states
- restrained highlights
- key report accents

Do not use red, orange, or yellow as general business-performance indicators.

Red is reserved for true system-level failure only.

N/A / Could Not Verify must remain visually neutral.

## Border Radius
Use medium rounded corners:
- approximately `12–16px`

Claude Design must select exact reusable values and document them as tokens.

## Shadows
Use subtle, low-contrast shadows only.

No heavy floating-card aesthetic.

## Spacing
Create a reusable spacing scale.

The design should favor larger spacing and breathing room over compact SaaS density.

Claude Design must specify exact spacing tokens for implementation.

## Container Width
Define exact desktop content container width(s) for:
- application screens
- PDF content

Do not let Claude Code guess these values later.

---

# 4. MVP Screen Set — Locked

There are only four visual application states/screens required for MVP:

1. Shared Access Screen
2. New Audit
3. Audits List
4. Audit Detail / Progress

Do not add a traditional dashboard.
Do not add analytics screens.
Do not add profile/settings/account screens.
Do not add onboarding flows.
Do not add signup or registration.

---

# 5. Shared Access Screen

## Purpose
Provide simple access protection for the internal AI-Clinic application.

## Required Content
- AI-Clinic branding
- Password input
- Enter button

Optional only if visually necessary:
- small `Developed by SmartClick` treatment

## Explicit Non-Goals
Do not design:
- email login
- username field
- signup
- registration
- forgot password
- password reset
- SSO
- user avatar
- account profile
- roles
- permissions management

## Visual Direction
Ultra-simple, premium, centered, calm.

This should not look like a consumer login portal.

---

# 6. New Audit Screen

## Purpose
Allow a team member to create a new AI visibility audit quickly during conference usage.

## Required Fields
- First name
- Last name
- Email
- Company name
- Website URL
- Main prompts
- Optional additional target URL / product page
- Optional target name
- Prompts for each optional target

## Required Actions
- Add additional URL
- Start Audit

## Validation States
Design must account for:
- required field missing
- invalid URL
- no prompt submitted
- optional target incomplete

Validation should be clear but not visually aggressive.

## UX Priorities
- Fast entry
- Minimal scrolling on laptop
- Clear grouping
- Easy to use while speaking to a prospect
- No unnecessary explanation text
- Additional targets should not make the form visually complex

## Responsive Rule
Desktop is primary.
Tablet must remain comfortable.
Mobile must remain usable.

No critical control may disappear on smaller screens.

---

# 7. Audits List Screen

## Purpose
Simple historical list of audits.

This is not an analytics dashboard.

## Required Columns / Data
- Company
- Website
- Date
- Audit status
- PDF status / availability
- Open action

## Required Actions
- New Audit
- Open Audit
- Download PDF when available

## Design Behavior
Desktop may use a table.

For smaller screens:
- horizontal scrolling is acceptable if well controlled, OR
- convert rows to stacked cards

Claude Design must choose one responsive pattern and document it explicitly.

No charts.
No KPI cards.
No performance dashboard.

---

# 8. Audit Detail / Progress Screen

## Top Area
Show:
- Company name
- Website
- Audit ID
- Overall audit status

## Progress Steps
Display these exact steps:

1. Preparing audit
2. Brand Recognition
3. Prompt Visibility
4. Social Profiles
5. Third-Party Listings
6. Technical Accessibility
7. Validating Findings
8. Generating Report
9. Finalizing PDF

## Exact UI States
Design only these states:
- Pending
- Running
- Completed
- N/A / Could Not Verify
- Failed

Do not invent:
- Warning
- Critical
- Needs Attention
- High Priority
- Medium Priority
- Low Priority

## State Treatment
Pending:
- neutral gray

Running:
- restrained animated indicator or pulse
- visually clear but not distracting

Completed:
- success check
- subtle completion animation permitted

N/A / Could Not Verify:
- neutral informational treatment
- must not visually imply failure

Failed:
- red only for true system-level failure

## Critical Rule
Do not show fake progress percentages.

The UI represents persisted backend/checklist states only.

The backend may execute components in parallel even though the interface displays separate progress rows.

## Revisit Behavior
The design must work when:
- user closes browser
- audit continues server-side
- user returns later
- latest state is loaded

## Available Actions
When relevant:
- Retry failed check
- Retry component
- Regenerate PDF
- Download PDF

## Completed State
Show:
- Audit Complete
- generated PDF filename
- Download PDF as primary action
- View Details
- Run New Audit

---

# 9. Reusable Web Components

Claude Design must create a component map suitable for Claude Code implementation.

At minimum define visual specifications for:

- `AppShell`
- `SharedAccessCard`
- `PageHeader`
- `AuditForm`
- `TargetPromptGroup`
- `AuditListTable` or approved responsive equivalent
- `AuditStatusStep`
- `StatusBadge`
- `PrimaryButton`
- `SecondaryButton`
- `EmptyState`
- `ErrorState`
- `CompletedAuditPanel`

For each component specify:
- layout
- spacing
- typography
- states
- responsive behavior
- interaction behavior

Do not leave component styling open to interpretation.

---

# 10. PDF Format — Locked

## Page Format
**A4 portrait**

## Rendering Context
The final report will be rendered from HTML/CSS using **Playwright**.

Design decisions must therefore be implementable reliably in browser-rendered HTML/CSS and print CSS.

Do not design effects that depend on unsupported print behavior.

## Font
Poppins.

## Page Count
Dynamic.

Do not design around a fixed total page count.

---

# 11. PDF Page Structure

## Page 1 — Cover
Required:
- AI-Clinic branding
- Developed by SmartClick
- AI Visibility Audit
- Company name
- Website
- Audit date
- Audit ID

Optional supporting line:
- `Understanding how AI systems recognize, reference, and access your brand.`

The cover should feel premium, quiet, spacious, and consultant-led.

Do not overload the cover with metrics.

## Page 2 — Executive Summary
Show five headline signals:
- Brand Recognition
- Prompt Visibility
- Social Presence
- Third-Party Presence
- AI Crawler Accessibility

Also show:
- confirmed gaps count
- unavailable checks count
- short grounded summary

Avoid an overall `/100` score.
Avoid severity.
Avoid traffic-light scoring.

## Page 3 — Brand Recognition
Show provider-level result cards for:
- ChatGPT
- Gemini
- Claude
- Google AI

Each may show:
- recognition status
- accuracy status
- short proof excerpt
- source indicator

Then a concise interpretation area using:
- What we observed
- What this suggests
- What to consider

## Pages 4+ — Prompt Visibility
Use prompt-by-prompt cards.

Each card should support:
- prompt text
- audited target
- provider icons/status
- Visible in X/Y systems
- short proof
- 1–3 source references

Also support overall Prompt Visibility percentage.

This section may span multiple pages automatically.

Do not force all prompts into one page.

## Social + Third-Party Presence
Social table supports exactly:
- LinkedIn
- Facebook
- Instagram
- X/Twitter
- YouTube
- TikTok
- Threads
- Reddit

Columns:
- Platform
- Profile status
- Connected to Website: Yes / No / —

Third-party table supports exactly:
- G2
- Capterra
- Trustpilot
- Clutch
- Google Business Profile
- BestCompany
- GetApp
- Software Advice
- Gartner Peer Insights
- Product Hunt

Columns:
- Platform
- Profile status
- Profile URL when verified

Do not add ratings or review counts.

## Technical AI Accessibility
Support rows for exactly:
- Googlebot
- Bingbot
- GPTBot
- OAI-SearchBot
- ClaudeBot
- PerplexityBot

Also include:
- robots.txt
- llms.txt

Use only deterministic statuses supplied by the report object.

Do not introduce design language that implies unsupported severity.

## Key Gaps / Expert Interpretation
This layout is locked.

One grouped gap = one horizontal row-card.

Each card includes:
- gap title
- short evidence line
- affected-check count/badge where useful

Below that, three clearly separated columns:

1. What we observed
2. What this suggests
3. What to consider

Rules:
- maximum 2–3 gap cards per page
- continue automatically to the next page
- generous whitespace
- no severity labels
- no priority labels
- no cramped dashboard treatment

## Closing Page
Show:
- short dynamic recap based only on validated findings
- opportunity framing
- subtle follow-up CTA
- AI-Clinic branding
- SmartClick branding/contact treatment

Suggested CTA tone:
`Want to understand what to address next and how?`

Do not add new analysis on this page.
Do not use aggressive sales language.

---

# 12. PDF Failure-Prevention Requirements

The design must explicitly handle all of the following without breaking layout:

- long company name
- long website URL
- long source URL
- long prompt
- long provider proof excerpt
- 1 prompt
- 5+ prompts
- no optional targets
- several optional targets
- 0 confirmed gaps
- 1 confirmed gap
- many confirmed gaps
- N/A results
- partial audit
- unavailable provider result
- long directory/profile URL
- long source title
- multiple PDF pages

## Overflow Rules
Claude Design must specify:
- wrapping behavior
- truncation rules, if any
- max content height where needed
- automatic page-break rules
- `break-inside` behavior for cards/tables
- how long URLs wrap
- how tables continue across pages

No important evidence may be silently clipped.

---

# 13. PDF Print-Safety Requirements

The final design must be safe for Playwright PDF generation.

Claude Design must account for:
- print CSS
- A4 portrait dimensions
- safe page margins
- repeating headers only if truly needed
- repeating table headers where appropriate
- avoiding orphaned headings
- avoiding half-rendered cards across pages
- avoiding horizontal clipping
- avoiding dependency on hover interactions

PDF must remain understandable when printed.

---

# 14. Assets and Icons

## SmartClick Logo
Use the exact approved asset.
Do not recreate it.

## Provider Icons
Use consistent provider icons/logos where legally and practically appropriate.

Required providers may include:
- OpenAI / ChatGPT
- Gemini
- Claude
- Google AI

Provide a consistent fallback icon if an asset is unavailable.

## PDF Asset Reliability
Prefer local/static application assets.

Do not make PDF generation depend unnecessarily on remote image URLs.

---

# 15. Responsive Behavior

## Priority Order
1. Desktop/laptop
2. Tablet
3. Mobile

Conference usage is primarily laptop-based.

## Requirements
- all critical actions visible
- forms remain usable
- status information remains readable
- tables never become clipped beyond usability
- long strings wrap safely
- buttons remain touch-friendly
- no hover-only functionality

Claude Design must define explicit breakpoints or breakpoint behavior for implementation.

---

# 16. Animation Rules

Animations must be restrained and functional.

Allowed:
- subtle running pulse/spinner
- subtle completion check animation
- soft transition between UI states

Avoid:
- decorative motion
- large entrance animations
- bouncing elements
- confetti
- looping animations unrelated to state

PDF contains no animation.

---

# 17. Accessibility / Usability

Design should maintain:
- readable contrast
- clear focus states
- keyboard usability
- visible form labels
- understandable validation
- adequate touch targets
- no status communicated by color alone

Do not rely solely on icons without readable labels where meaning could be ambiguous.

---

# 18. Design Boundaries — Do Not Change

Claude Design must not change or reinterpret:

- product name: AI-Clinic
- exactly 5 audit components
- provider logic
- social platform count
- directory platform count
- crawler list
- entity-validation rules
- gap detection rules
- gap grouping rules
- audit lifecycle/status logic
- retry rules
- database schema
- Trigger.dev architecture
- Supabase architecture
- Claude interpretation logic
- Pre-PDF Flight Checklist
- canonical report object
- PDF download-only delivery model
- no automatic email
- no competitors
- no Ahrefs
- no ratings/review counts
- no severity/priority system
- no full authentication system

If a design requirement appears to conflict with any of these rules, flag the conflict instead of redesigning the product.

---

# 19. Mandatory Claude Design Deliverables

Claude Design must return an implementation-oriented package containing:

## A. Design System
- exact color tokens
- exact typography scale
- exact spacing scale
- exact radius values
- exact shadow values
- exact container widths
- exact breakpoints
- exact PDF margins

## B. Screen Specifications
For each screen:
- hierarchy
- layout
- component composition
- dimensions/spacing
- states
- responsive behavior
- interactions

## C. Component Specifications
For each reusable component:
- visual structure
- variants
- states
- spacing
- typography
- responsive rules

## D. PDF Specification
- page-by-page design
- print rules
- page-break behavior
- overflow behavior
- dynamic-content behavior

## E. Visual References
Provide polished visual references/mockups for:
- Shared Access
- New Audit
- Audits List
- Audit Progress
- PDF Cover + Executive Summary
- Brand Recognition
- Prompt Visibility
- Social + Third-Party
- Technical Accessibility
- Key Gaps
- Closing Page

## F. Implementation Notes
Clearly identify:
- anything that requires special CSS
- anything that needs print-specific CSS
- any asset dependency
- responsive behavior that Claude Code must follow exactly

---

# 20. Design QA Checklist

Before declaring the design complete, verify:

- [ ] Product name is exactly AI-Clinic.
- [ ] SmartClick remains secondary branding.
- [ ] Poppins is used consistently.
- [ ] Primary blue is `#28A8DF`.
- [ ] Visual direction feels premium and spacious rather than dashboard-dense.
- [ ] Shared Access is minimal.
- [ ] Only the locked MVP screens exist.
- [ ] No analytics dashboard was introduced.
- [ ] No full auth flows were introduced.
- [ ] Exact progress states are preserved.
- [ ] N/A does not look like failure.
- [ ] No fake percentage progress exists.
- [ ] PDF is A4 portrait.
- [ ] PDF handles dynamic content safely.
- [ ] Long URLs/prompts/company names do not break layout.
- [ ] Key Gaps use locked row-card format.
- [ ] Maximum 2–3 gaps per PDF page.
- [ ] No severity or priority system appears.
- [ ] No Ahrefs appears.
- [ ] No competitors appear.
- [ ] No rating/review counts appear.
- [ ] No automatic email UI appears.
- [ ] All required design tokens are explicit enough that Claude Code does not have to guess.
- [ ] Every reusable component has defined states.
- [ ] Responsive behavior is explicit.
- [ ] Print/PDF behavior is explicit.

If any item fails, the design handoff is not implementation-ready.

---

# 21. Final Handoff Rule

The final Claude Design output becomes the **visual source of truth**.

Claude Code must later implement it without independently redesigning the product.

Any discrepancy between:
- Master Plan
- this Design Handoff
- final approved Design Spec

must be surfaced before implementation rather than silently resolved.

The next implementation document will be:

**`AI-Clinic-Claude-Code-Build-Spec.md`**

Do not begin implementation before the approved Design Spec and Code Build Spec pass final pilot-style QA.

---

# 22. Pilot-Style Design Handoff QA — PASS

The Design Handoff has been reviewed for implementation blockers, ambiguity, and scope drift.

## Locked Clarifications
- Provider icon set for MVP is exactly: **ChatGPT, Gemini, Claude, Google AI**. Do not introduce additional provider brands in the design.
- Shared Access must include visual states for: **idle, submitting/loading, incorrect password/error, and successful transition**. This does not expand the authentication scope.
- A report with **0 confirmed gaps** must render a clean positive/neutral empty-gap state and must not create synthetic recommendations.
- A **partial audit** or **N/A / Could Not Verify** result must remain visually neutral and must not be styled as a business-performance failure.
- Claude Design may choose exact token values where this handoff explicitly delegates them, but may not alter any locked product or audit behavior.

## Blocker Review
- [x] No missing MVP screen required for the locked workflow.
- [x] No conflict with the 5-component audit model.
- [x] No conflict with shared-password access.
- [x] No conflict with dynamic Playwright PDF generation.
- [x] Dynamic/long-content failure cases are explicitly covered.
- [x] No stale Ahrefs, competitors, email automation, ratings, severity, or full-auth scope remains.
- [x] Claude Code will be able to implement from a final Design Spec without redesigning the product.

**QA RESULT: PASS — Design Handoff is ready to give to Claude Design.**

Next artifact after Claude Design returns an approved Design Spec:

**`AI-Clinic-Claude-Code-Build-Spec.md`**

