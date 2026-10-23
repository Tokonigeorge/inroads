# Prompt for the coding agent

Copy everything below the line into your coding agent, run from the root of the `Tokonigeorge/inroads` repo.

---

You're rebuilding **Inroads** as a production web app. Inroads is a personal relationship and networking tool for people whose work depends on who they know (founders, freelancers, agencies, creatives), with Lagos as the first market. It is built around three ideas: **goals first**, **rooms (events) as first-class**, and **a two-way promises ledger**.

## Read first, in this order
1. `docs/PRODUCT_BRIEF.md`: the source of truth for what to build, why, the target data model, the AI architecture, the design direction and the phases. Where it conflicts with the prototype, the brief wins.
2. `index.html`: a working single-file prototype built for the Claude artifact runtime (`window.claude.use(...)`). Treat it as a **behavioural spec**. It shows every flow, the recurrence engine, the importers (vCard, Google/Outlook/LinkedIn CSV, Takeout .zip, .ics with RRULE), the nudge rules and the AI prompts with their JSON schemas. Reuse the logic and prompts. Don't reuse its architecture, its rendering approach or its visual design.

## Step 1: plan before you code (stop for my review)
Write `docs/TECH_PLAN.md` covering:
- Stack choice and why. Default unless you have a strong reason: **Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, Storage, RLS), Drizzle ORM, Anthropic API server-side, a background job runner (Inngest or Trigger.dev), Resend for email, deployed on Vercel, installable as a PWA.**
- The schema as migrations, based on section 6 of the brief, with RLS policies.
- How each prototype feature maps to the new architecture: a table of prototype function → new module, route or job.
- The AI layer: prompt files, Zod schemas, model tiers via config, server-side web search tool, background jobs with streamed progress, per-user rate limits.
- How each item in the brief's "Engineering bugs and limits" list is fixed.
- A screen inventory and navigation map for desktop and mobile.
- Milestones for P0 with a definition of done for each.
- Open questions for me.

**Then stop and wait for my approval before writing app code.**

## Step 2: build P0 (after approval)
Build phase **P0** from the brief, one milestone at a time, committing after each with a clear message:
1. Scaffold, auth (magic link + Google), schema and migrations, seed/example data.
2. People (list, detail, create/edit, archive/undo, search, filters, circles, cadence), interactions, promises.
3. Events with full recurrence (port `occurrences()` and `nthWeekday()` with unit tests), attendance, event ↔ people.
4. Goals and the goal pipeline (`goal_links` with stages).
5. Today: agenda with prep, the nudge feed (port `buildNudges()` rules, using the user-set cadence rather than score-derived cadence), snooze and dismiss with TTL.
6. Importers, server-side: port the parsers with tests, a review step, **duplicate detection and merge UI** (email → phone E.164 → name only as a *suggestion*, never a silent merge), and import triage (keep / priority / archive + cadence).
7. AI features: research dossier (versioned), Decode, Radar, draft (with **Open in WhatsApp** via `wa.me` and auto-log), daily and weekly brief, chat import extraction, business-card scan, batch fit scoring. Every AI result is shown as a reviewable suggestion with sources and why. Nothing writes to the user's data silently.
8. Settings: profile, goals, imports, connected accounts, export (JSON + CSV), delete account.

Drop the prototype's claude.ai-only flows: the hand-off copy/paste, the permissions UI and the connector checks.

## Design requirements (not optional)
Follow section 5 of the brief. In short: calm and mature, like Linear, Things or Attio. One accent colour. No uppercase monospace eyebrow labels, no pills everywhere, no emoji as UI, no gimmicky copy ("decode", "magic", "one tap"). Desktop uses a sidebar, list on the left and detail on the right, plus a ⌘K palette and keyboard shortcuts. Mobile uses bottom nav with a central capture button, and has to work well as an installable PWA on mid-range Android phones over patchy networks (the main market). Competitors are weak there. Light and dark themes, WCAG AA, reduced-motion support. Plain, specific microcopy with verbs on buttons. Before building screens, write `docs/DESIGN_SYSTEM.md` with tokens (type scale, colour, spacing, radius), core components and three example screens described in words. Include it in the Step 1 review.

## Engineering standards
- TypeScript strict. Zod at every boundary (forms, API, AI output).
- Unit tests for recurrence, nudges, warmth and cadence, importers, dedupe and merge. Playwright smoke tests for the main flows.
- No API keys or model calls in the client.
- Normalise emails (lowercase) and phones (E.164, default region from the profile).
- Pagination or virtualised lists, built for 5,000+ contacts.
- Timezone-correct dates (store timezone on the profile and on events).
- Keep a `CHANGELOG.md` and update the README with setup, environment variables and deploy steps.

## How to work with me
- Ask when a product decision is genuinely ambiguous. Otherwise make a sensible call and note it in `docs/DECISIONS.md`.
- At the end of each milestone, give me what changed, how to try it, and anything you deferred.
- Don't start P1 features (Google OAuth sync, voice debrief, quick-capture NLP, share target) until I say so. Do design the schema so they slot in.
