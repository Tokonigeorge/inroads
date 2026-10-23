# Decisions

Product and engineering calls made where the brief or prompt left room. Newest first. Each entry: decision, why, and how to reverse it.

## 2026-10-24: milestone 2

27. **New Spaces pick a type (Work, Personal, Dating or Other), and the type is fixed.** You can have several Work-type Spaces (e.g. "Agency clients"), each with full research. Other Spaces follow the Personal rules: Get to know or Off. *Why:* otherwise renaming a Space or creating a custom one could get round the research guardrail.
28. **Deleting a Space only works when it's empty.** Otherwise you archive it, which hides it from lists and reminders and keeps everything. You always keep at least one active Space.
29. **Removing a pipeline stage that people are at is blocked.** Renaming is always safe because stages keep their internal key.
30. **The selected Space is stored in a cookie (`inroads-space`)**, so lists render on the server already filtered, and the choice follows you between pages. AI features never use this choice; they always take an explicit Space.
31. **Per-Space copy and goal templates are deferred** to milestone 6 (Goals), where they're first used.

## 2026-10-23: milestone 1

21. **Next.js 16 instead of 15.** It's the current stable release. It brings Cache Components (static shell plus streamed per-user content, good on slow networks) and `proxy.ts` in place of middleware.
22. **Migrations run through Drizzle's migrator (`pnpm db:migrate`), not the Supabase CLI.** One path for local, CI and production. Files still live in `supabase/migrations`.
23. **Tests run on plain Postgres with a Supabase stand-in** (`supabase/tests/supabase-stub.sql`), and end-to-end tests use a fake auth server that signs real ES256 tokens. *Why:* no Docker or hosted project needed for CI, and the real token-verification code path still runs.
24. **The browser never queries tables directly.** `anon` has no table access, and OAuth token columns aren't readable by `authenticated`. All data goes through server code.
25. **Prototype moved to `prototype/index.html`.**
26. **Service worker is hand-written and small for now** (static assets plus an offline page). Offline capture with a queued-writes store arrives with People (milestone 3).

## 2026-10-23: answers from Step 1 review

14. **Google connections are built early**: milestone 5, right after People and Rooms.
15. **Free tiers only for now; no domain.** Google sign-in only (magic link built, switched off). Google data runs in Testing mode (100 named users, reconnect weekly) until there is a domain. See TECH_PLAN §12.
16. ~~Hidden per-user AI safety cap only.~~ Superseded by #19.
17. **Import triage is pre-sorted and one-tap** (TECH_PLAN §4.3a), with no AI cost.
18. **People are a graph.** One node per real person, which can be in several Spaces through `person_spaces`. Identity (name, contacts, company, role, city, birthday, socials) is shared. Relationship context (notes, tags, where met, cadence, circle, touches, promises, goals, rooms) belongs to one Space. Person-to-person links (`introduced_by`, `works_with`, …) are stored now to power warm paths and intros later. *Why:* owner decision; this also stops duplicates when the same person is imported into two Spaces.
19. **Usage limits** (TECH_PLAN §5.4): per-feature daily caps, about $2 per user per month, and about $25 for the whole app per month. All configurable. *Why:* the API is the one paid service. I first misread "no targets yet" as "no limits", and the owner corrected me.
20. **App URL:** `inroads.vercel.app` (fallback name if it's taken).

## 2026-10-23: Step 1 planning

1. **AI calls are always made per Space.** "All spaces" views on Today merge lists in the UI only. Briefs, Look up, Radar and scoring each read exactly one Space. *Why:* brief §4.0 says Spaces are private from each other and Dating must never leak into Work. *Reverse:* would need a new guardrail design; not recommended.
2. ~~Get to know uses `web_fetch` restricted to saved links, with no `web_search`.~~ **Superseded 2026-10-23 by owner decision:** Personal and Dating research has web search. Searches are anchored to saved handles/links and saved context; output stays conversation starters only, with the banned categories excluded by prompt and schema. This relaxes brief §4.0 ("never runs a name search across the open web").
3. **"Decode" is renamed "Look up", and "Radar" is renamed "Suggested rooms".** *Why:* brief §5 bans "decode" in copy, and these names say what the features do.
4. **Cadence `0` means never nudge. `null` inherits** person → circle → Space default. *Why:* one column covers "Dormant: never" without a separate flag.
5. **Imported people start in `triage_state = pending`, with no cadence until triaged.** Triage sets `cadence_anchor_on = today`, so "due" works without any logged touch. *Why:* fixes "imported contacts disappear" without flooding Today with 2,000 nudges.
6. **Name-only matches never merge.** They become merge suggestions. *Why:* bug 1 in the brief.
7. **Soft delete (`deleted_at`) with a 30-day purge, separate from archive (`archived_at`).** *Why:* undo for deletes, plus a way to hide people without losing them.
8. **Drizzle queries run inside a transaction that sets the `authenticated` role and JWT claims**, so Postgres RLS applies to server code too. *Why:* defence in depth; a forgotten `where user_id` can't leak data.
9. **Inngest for background jobs, with progress persisted in a `jobs` table and pushed over Supabase Realtime (polling fallback).** *Why:* durable steps fit Vercel limits; persisted progress survives closed tabs and flaky networks.
10. **Google sign-in asks only for identity. Contacts and Calendar are a separate, incremental consent.** *Why:* sign-in works before OAuth verification, and scopes stay minimal.
11. **Recurrence is stored as a canonical RRULE subset (`rrule`), with the original kept in `rrule_source` when we can't represent it.** Occurrence maths runs on calendar dates in the event's own timezone. *Why:* round-trips with calendar feeds; the ported `occurrences()` keeps its date-based semantics.
12. **Model IDs live in config:** fast = `claude-haiku-5-5`, strong = `claude-opus-5-5`, both overridable by env. *Why:* brief §7 tiers; pending confirmation (TECH_PLAN Q8).
13. **Spaces: three built-in, plus your own.** Every account starts with Work, Personal and Dating (empty), and the user can add more (e.g. "Church", "Alumni"). There is no fixed master list. ~~Every person lives in exactly one Space.~~ Superseded by #18. The Space switcher only appears once a second Space has people in it, so a work-only user never sees it.
