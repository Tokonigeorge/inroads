# Decisions

Product and engineering calls made where the brief or prompt left room. Newest first. Each entry: decision, why, and how to reverse it.

## 2026-10-23: answers from Step 1 review

14. **Google connections are built early**: milestone 5, right after People and Rooms.
15. **Free tiers only for now; no domain.** Google sign-in only (magic link built, switched off). Google data runs in Testing mode (100 named users, reconnect weekly) until there is a domain. See TECH_PLAN §12.
16. **Hidden per-user AI safety cap + an Anthropic monthly spend limit**, even with no user-facing limits, because the API is the one paid service.
17. **Import triage is pre-sorted and one-tap** (TECH_PLAN §4.3a), with no AI cost.

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
13. **Spaces: three built-in, plus your own.** Every account starts with Work, Personal and Dating (empty), and the user can add more (e.g. "Church", "Alumni"). There is no fixed master list. Every person lives in exactly one Space: Work by default, or whichever Space you picked when importing or adding them. Moving someone is one action. The Space switcher only appears once a second Space has people in it, so a work-only user never sees it.
