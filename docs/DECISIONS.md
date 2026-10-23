# Decisions

Product and engineering calls made where the brief or prompt left room. Newest first. Each entry: decision, why, and how to reverse it.

## 2026-10-23: Step 1 planning

1. **AI calls are always made per Space.** "All spaces" views on Today merge lists in the UI only. Briefs, Look up, Radar and scoring each read exactly one Space. *Why:* brief §4.0 says Spaces are private from each other and Dating must never leak into Work. *Reverse:* would need a new guardrail design; not recommended.
2. **Get to know uses `web_fetch` restricted to saved links, with no `web_search`.** A server-side post-filter drops any source that isn't a saved URL. *Why:* this enforces "never runs a name search across the open web" in code, not just in the prompt.
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
13. **Personal and Dating Spaces are off by default in onboarding.** *Why:* "lead with Work". Pending confirmation (Q6).
