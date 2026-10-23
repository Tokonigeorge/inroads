# Inroads: technical plan (P0)

Status: **draft for review**. No app code until this is approved.
Inputs: `docs/PRODUCT_BRIEF.md` (source of truth) and `index.html` (behavioural spec).
Companion docs: `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15 (App Router) + React 19 + TypeScript strict** | Server components keep the JS sent to mid-range Android phones small; route handlers host the API; one deploy target. |
| Styling | **Tailwind CSS v4** with design tokens as CSS variables (see DESIGN_SYSTEM.md) | Tokens drive light/dark themes. Utility classes stop one-off styles creeping in. |
| UI primitives | **Radix UI** primitives (Dialog, Popover, Dropdown, Tabs, Tooltip) + **cmdk** for ⌘K | Accessible behaviour (focus traps, ARIA, keyboard) without importing anyone's visual style. |
| Database | **Supabase Postgres** (+ `pg_trgm`, `citext`, `pgvector` installed but unused until P2) | Relational model from brief §6, RLS, Realtime and Storage from one provider. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Typed queries; SQL-first migrations we can read. RLS policies, triggers and functions go in hand-written SQL migrations alongside the generated ones. |
| Auth | **Supabase Auth**: email magic link + Google sign-in | Matches the brief. Magic-link email goes out through Resend SMTP. |
| Files | **Supabase Storage**, private buckets (`imports`, `cards`) with signed upload URLs | Import files and card photos go straight from the browser to storage. The server parses them, then deletes them. |
| Jobs | **Inngest** | Durable step functions with retries, cron, concurrency keys per user, and a native Vercel integration. Each step is short, so long imports never hit serverless time limits. (Trigger.dev would also work. Inngest's per-step model suits "parse → stage → review → commit".) |
| Progress | `jobs` table updated by each step and pushed over **Supabase Realtime**, with polling as a fallback | Survives closed tabs and flaky networks: the UI reads persisted state and never depends on an open stream. |
| AI | **Anthropic TypeScript SDK**, server-side only | Server tools `web_search_20260209` / `web_fetch_20260209`, structured outputs via `output_config.format`, streaming. |
| Email | **Resend** (+ React Email templates) | Auth emails now; briefs by email later (P2). |
| Client data | **TanStack Query** (persisted to IndexedDB) + **@tanstack/react-virtual** | Cached reads for patchy networks; virtualised lists for 5,000+ people. |
| Offline / PWA | **Serwist** (Workbox successor for Next.js), web manifest, offline mutation queue for capture | Installable, works on flaky 3G, and capture never fails silently. |
| Validation | **Zod** everywhere: forms, route handlers, job payloads, AI outputs, env | One schema per boundary, shared through `@/contracts`. |
| Dates | **date-fns v4 + @date-fns/tz** | Timezone-aware wall-clock maths. Recurrence runs on calendar dates in the event's own zone (see §4.4). |
| Phones | **libphonenumber-js** (max metadata) | E.164 normalisation with the profile's default region (e.g. `NG`). |
| Testing | **Vitest** (unit), **Playwright** (smoke, mobile + desktop projects), **pglite** or a local Supabase for DB/RLS tests | Required by the brief's engineering standards. |
| Observability | **Sentry** (errors) and Vercel Analytics, both privacy-scrubbed | See open question Q9. |
| Hosting | **Vercel** (functions in `lhr1`/London) + Supabase `eu-west-2` (London) | Closest well-supported regions to Lagos. See Q5. |

Repo layout (single Next.js app, no monorepo yet):

```
src/
  app/                 routes (see §7)
    (app)/             signed-in shell: sidebar / bottom nav
    (auth)/            sign-in, callback
    api/               route handlers: /api/v1/*, /api/inngest, /api/oauth/*
  contracts/           Zod schemas shared by client + server (people, events, …)
  domain/              pure TS, no IO: recurrence, nudges, warmth, cadence, dedupe, normalise
  importers/           pure parsers: vcf, csv, ics, rrule, chat, zip
  server/
    db/                drizzle schema, client, withUser() RLS wrapper
    repos/             data access per aggregate
    ai/                client, runner, prompts/*, schemas/*, context builders
    jobs/              inngest functions
    integrations/      google, microsoft, ics-url
    crypto/            token encryption
  ui/                  design-system components
  features/            screen-level components per area
supabase/migrations/   SQL (drizzle-generated + hand-written RLS/triggers)
tests/                 unit (co-located *.test.ts) + e2e/
```

---

## 2. Schema (migrations)

Conventions: every table has `id uuid default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`, `created_at`, `updated_at` (trigger-maintained). Brief §6 mentions a future `workspace_id`: it's left out in P0, but every query goes through repos keyed by owner, so adding it later is one migration plus a policy change. Arrays use `text[]`. Emails are `citext`.

### 2.1 Tables

```sql
-- 0001_core.sql (abridged; full DDL lives in supabase/migrations)

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '', headline text, location text, background text, offerings text,
  industries text[] not null default '{}',
  emails citext[] not null default '{}',           -- used to recognise "me" in calendars
  timezone text not null default 'Africa/Lagos',   -- IANA
  default_region char(2) not null default 'NG',    -- phone parsing
  brief_time time not null default '07:30',
  onboarding_state jsonb not null default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create type space_kind as enum ('work','personal','dating','custom');
create table spaces (
  id uuid pk, user_id uuid not null,
  name text not null, kind space_kind not null, position int not null default 0,
  defaults jsonb not null,  -- SpaceDefaults (Zod): cadence_days, stages[], research_mode, copy, goal_templates
  archived_at timestamptz,
  unique (user_id, name)
);
-- research_mode: 'full' (work) | 'get_to_know' (personal/dating) | 'off'
-- Guardrail: a CHECK trigger rejects research_mode='full' when kind in ('personal','dating').

create table circles (
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces on delete cascade,
  name text not null, default_cadence_days int check (default_cadence_days is null or default_cadence_days >= 0),
  position int not null default 0
);  -- 0 = "never nudge"

create type goal_type as enum ('capital','clients','hiring','market','partners','mentors','career','friends','family','dating','other');
create table goals (
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces,
  text text not null, type goal_type not null default 'other',
  priority smallint not null default 2 check (priority between 1 and 3),  -- 1 high
  weekly_target int not null default 3, active boolean not null default true,
  stages jsonb,          -- null = inherit space defaults.stages
  due_on date, archived_at timestamptz
);

create table people (
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces,
  name text not null, emails citext[] not null default '{}', phones text[] not null default '{}', -- E.164
  company text, position text, city text, where_met text, met_on date,
  birthday text check (birthday ~ '^\d{2}-\d{2}$'),     -- MM-DD
  interests text[] not null default '{}', notes text, opportunities text,
  socials jsonb not null default '{}',                    -- {linkedin,x,instagram,github,substack,website,...}
  tags text[] not null default '{}',
  circle_id uuid references circles on delete set null,
  cadence_days int check (cadence_days is null or cadence_days >= 0),  -- null = inherit circle → space; 0 = never
  starred boolean not null default false,
  triage_state text not null default 'done' check (triage_state in ('pending','done')),
  cadence_anchor_on date,       -- baseline for "due" when there are no touches (set at triage/creation)
  last_touched_on date,         -- denormalised by trigger from interactions
  source text not null default 'manual',  -- manual|vcf|csv|linkedin|google|microsoft|contact_picker|card|chat|calendar|example
  external_refs jsonb not null default '{}', -- {google: 'people/c123', microsoft: '...'}
  example boolean not null default false,
  archived_at timestamptz, deleted_at timestamptz, merged_into_id uuid references people,
  search tsvector generated always as (to_tsvector('simple', coalesce(name,'')||' '||coalesce(company,'')||' '||coalesce(position,'')||' '||coalesce(where_met,'')||' '||coalesce(city,'')||' '||array_to_string(tags,' '))) stored
);
create index on people (user_id, space_id) where deleted_at is null;
create index on people using gin (search);
create index on people using gin (name gin_trgm_ops);
create index on people using gin (emails);
create index on people using gin (phones);
create index on people (user_id, last_touched_on);

create type touch_type as enum ('coffee','call','meeting','message','email','event','other');
create table interactions (
  id uuid pk, user_id uuid not null, person_id uuid not null references people on delete cascade,
  occurred_on date not null, occurred_at timestamptz, type touch_type not null, summary text,
  source text not null default 'manual',  -- manual|calendar|chat|voice|whatsapp|draft
  event_id uuid references events on delete set null, occurrence_on date,
  dedupe_key text,                        -- e.g. cal:<uid>:<date>, chat:<date>:<hash>
  unique (person_id, dedupe_key)
);

create table commitments (
  id uuid pk, user_id uuid not null, person_id uuid not null references people on delete cascade,
  text text not null, owner text not null check (owner in ('me','them')),
  due_on date, done_at timestamptz, source text not null default 'manual', interaction_id uuid references interactions
);

create table goal_links (
  id uuid pk, user_id uuid not null,
  goal_id uuid not null references goals on delete cascade, person_id uuid not null references people on delete cascade,
  stage text not null,            -- key from the goal's stage config
  note text, updated_at timestamptz default now(),
  unique (goal_id, person_id)
);
create table goal_link_history (  -- stage moves, for "movement" in the weekly brief and success metrics
  id uuid pk, user_id uuid not null, goal_link_id uuid not null references goal_links on delete cascade,
  from_stage text, to_stage text not null, moved_at timestamptz default now()
);

create table events (
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces,
  title text not null, kind text not null default 'meetup',
  starts_on date not null, start_time time, end_time time, all_day boolean not null default false,
  tz text not null,                 -- IANA; wall-clock times are in this zone
  location text, url text, notes text,
  rrule text,                       -- canonical RFC 5545 subset we support (FREQ/INTERVAL/BYDAY/BYSETPOS/UNTIL)
  rrule_source text,                -- original RRULE from a feed when we couldn't represent it
  until_on date,
  goal_id uuid references goals on delete set null,
  source text not null default 'manual', external_id text, connection_id uuid references connections on delete set null,
  example boolean not null default false, archived_at timestamptz, deleted_at timestamptz,
  unique (user_id, source, external_id)
);

create table event_people (
  event_id uuid references events on delete cascade, person_id uuid references people on delete cascade,
  user_id uuid not null, role text not null default 'attendee' check (role in ('attendee','met_there','speaker','organiser')),
  occurrence_on date,  -- null = whole series
  primary key (event_id, person_id, role)
);
create table event_attendance (
  event_id uuid references events on delete cascade, user_id uuid not null,
  occurrence_on date not null, attended boolean not null,
  primary key (event_id, occurrence_on)
);

create table connections (
  id uuid pk, user_id uuid not null,
  provider text not null check (provider in ('google','microsoft','apple_ics')),
  account_email citext, scopes text[] not null default '{}',
  tokens_enc bytea,              -- AES-256-GCM envelope (see §5.3); null for apple_ics
  ics_url_enc bytea,             -- apple_ics: the secret subscription URL, encrypted
  sync_state jsonb not null default '{}',  -- {contacts: {syncToken}, calendars: {<id>: {syncToken, enabled}}}
  last_synced_at timestamptz, status text not null default 'active', -- active|error|revoked|paused
  last_error text,
  unique (user_id, provider, account_email)
);

create table dossiers (
  id uuid pk, user_id uuid not null, person_id uuid not null references people on delete cascade,
  version int not null, mode text not null,  -- full|get_to_know|verify|knowledge
  payload jsonb not null, sources jsonb not null default '[]', confidence text,
  model text not null, prompt_version text not null, job_id uuid,
  created_at timestamptz default now(), unique (person_id, version)
);

create table scores (
  id uuid pk, user_id uuid not null, person_id uuid not null references people on delete cascade,
  goal_id uuid references goals on delete cascade, value smallint check (value between 0 and 100),
  why text, model text, created_at timestamptz default now()
);

create table searches (   -- Look up (ex-"Decode") + Radar results
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces,
  type text not null check (type in ('person','company','place','event','radar')),
  query text not null, result jsonb not null, sources jsonb not null default '[]',
  model text, prompt_version text, created_at timestamptz default now()
);  -- retention: last 50 per user + all from the last 90 days (cron prune)

create table suggestions (  -- every AI write is proposed here first
  id uuid pk, user_id uuid not null, space_id uuid references spaces,
  kind text not null,  -- person_field|goal_link|new_person|interaction|commitment|merge|event|note
  target_type text, target_id uuid,
  payload jsonb not null, why text, sources jsonb not null default '[]',
  origin text not null, origin_id uuid,  -- dossier|chat_import|card|score|calendar|import
  status text not null default 'pending' check (status in ('pending','accepted','edited','dismissed')),
  resolved_at timestamptz, created_at timestamptz default now()
);

create table nudge_states (
  user_id uuid not null, key text not null,      -- e.g. cold:<personId>, bday:<personId>:<YYYY-MM-DD>
  snoozed_until timestamptz, dismissed_at timestamptz,
  expires_at timestamptz not null,               -- TTL: cron deletes expired rows
  primary key (user_id, key)
);

create table briefs (
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces,
  kind text not null check (kind in ('daily','weekly')), period_key text not null,  -- 2026-10-23 | 2026-W43
  markdown text not null, sources jsonb not null default '[]', inputs jsonb, model text,
  created_at timestamptz default now(), unique (user_id, space_id, kind, period_key)
);

create table imports (
  id uuid pk, user_id uuid not null, space_id uuid not null references spaces,
  type text not null,  -- vcf|csv|linkedin|ics|zip|contact_picker|google|microsoft|apple_ics
  status text not null, -- uploaded|parsing|review|committing|done|failed|cancelled
  storage_path text, counts jsonb not null default '{}', options jsonb not null default '{}',
  error text, created_at timestamptz default now(), committed_at timestamptz
);
create table import_items (  -- staging rows for review (paged in the UI, so 10k rows are fine)
  id uuid pk, import_id uuid not null references imports on delete cascade, user_id uuid not null,
  kind text not null check (kind in ('person','event','touch')),
  raw jsonb not null, normalised jsonb not null,
  match_person_id uuid, match_kind text,  -- email|phone|external_id|name_suggestion|null
  action text not null default 'add' check (action in ('add','merge','skip','suggest_merge')),
  triage text  -- keep|priority|archive (set in triage step)
);

create table jobs (  -- user-visible progress for long work
  id uuid pk, user_id uuid not null, kind text not null, status text not null, -- queued|running|done|failed|cancelled
  progress jsonb not null default '{}',   -- {step:'Found 842 contacts', done:120, total:842}
  result_ref jsonb, error text, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table ai_usage (  -- rate limits + usage meter
  id bigserial primary key, user_id uuid not null, feature text not null, model text not null,
  input_tokens int, output_tokens int, web_searches int default 0, created_at timestamptz default now()
);
create index on ai_usage (user_id, feature, created_at);

-- embeddings (owner_type, owner_id, vector) is created in P2 when "Ask your network" lands. pgvector is enabled now.
```

### 2.2 Triggers and functions (hand-written SQL)

- `set_updated_at()` on every table.
- `people_last_touched()`: after insert/update/delete on `interactions`, recompute `people.last_touched_on = max(occurred_on)`. This keeps the people list sortable by warmth at 5,000+ rows without aggregating.
- `goal_link_history` insert on `goal_links.stage` change.
- `enforce_space_research_mode()`: rejects `spaces.defaults->>'research_mode' = 'full'` when `kind in ('personal','dating')`.
- `same_space()` checks: `event_people`, `goal_links` and `circles` must join rows from the same `space_id`. These run as constraint triggers. Rows can't cross Spaces, which is how Spaces stay sealed at the data layer.

### 2.3 RLS

RLS is enabled on every table. One policy shape per table:

```sql
alter table people enable row level security;
create policy "owner can read"   on people for select using (user_id = (select auth.uid()));
create policy "owner can insert" on people for insert with check (user_id = (select auth.uid()));
create policy "owner can update" on people for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on people for delete using (user_id = (select auth.uid()));
```

`(select auth.uid())` is evaluated once per statement (Supabase's recommended form). Child tables also carry `user_id` and are checked directly, with no joins in policies. `ai_usage`, `jobs` and `connections` are read-only to the owner. Only the service role writes them.

**How the server respects RLS with Drizzle.** Request-path queries run through `withUser(userId, tx => …)`. It opens a transaction, runs `set local role authenticated` and `select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)`, then runs the query. RLS is therefore enforced even if a repo forgets a `where user_id =` clause. Background jobs use the same wrapper with the job's `user_id`. Only system crons (TTL cleanup, token refresh sweeps) use the service role, and they live in a separate `server/system/` module that a lint rule fences off.

**RLS tests**: a Vitest suite creates two users and asserts that user B can't select, update or delete user A's rows in every table.

### 2.4 Room for P1–P3 without migrations that hurt

- Voice debrief / quick-capture NLP: `interactions.source` already allows `voice`. Both feed the same `suggestions` pipeline as chat import.
- Share target: an `imports.type = 'share'` row plus `suggestions`.
- Post-event follow-up: `event_people.role = 'met_there'` + `occurrence_on`, plus a nudge rule keyed `after:<eventId>:<date>`.
- Intro requests (P2): a `commitments` row with `owner='them'` and `kind` (a nullable column added later) plus `goal_links.stage`.
- Workspaces (P3): add `workspace_id` and widen policies. Personal and Dating Spaces get a `shareable=false` constraint.
- Embeddings (P2): `embeddings` table.

---

## 3. Prototype → new architecture

| Prototype (index.html) | New home | Notes |
|---|---|---|
| `initStore`, `goLocal`, `write`, `putContact`, `putEvent`, `saveMeta`, `retry`, `dbFail` | `server/repos/*` + `/api/v1/*` route handlers + TanStack Query mutations | Postgres replaces documents. Optimistic updates with rollback. Offline queue for capture. |
| `normProfile`, `setProfile`, `openProfileForm` | `/settings/profile`, `repos/profile`, `contracts/profile` | Emails become `citext[]`. Adds timezone, default region and brief time. |
| Goals inside profile (`goalRow`, `activeGoals`, `goalById`) | `goals` table, `/goals`, `/goals/[id]` | Goals belong to a Space and carry stages. |
| `matchGoal()` (substring) | **Removed.** The AI picks from an enum of goal IDs (Zod `z.enum(goalIds)`), and a goal link becomes a `suggestions` row | Fixes bug 7. |
| `blankContact`, `openContactForm`, `formError` | `/people/new`, `/people/[id]/edit` (desktop: inline edit in the detail pane), `contracts/person` | Zod-validated. Phones go to E.164 on save. |
| `delContact`, `delEvent` | Soft delete (`deleted_at`) + an Undo toast. Purged after 30 days by cron | Fixes bug 6. Archive is separate (`archived_at`). |
| `lastTouch`, `warmth`, `cadence`, `isCooling`, `needsContext`, `bdayNext`, `byPriority`, `coldList` | `domain/warmth.ts`, `domain/cadence.ts`, `domain/birthday.ts` (pure, unit-tested) | Cadence is **user-set**: person → circle → Space default → none. `isDue` uses `last_touched_on ?? cadence_anchor_on`. |
| `occurrences`, `nthWeekday`, `recurLabel`, `upcoming`, `agendaFor`, `weekStart` | `domain/recurrence.ts` (ported as-is, then hardened), `domain/agenda.ts` | Works on wall-clock dates in the event's zone (see §4.4). Exhaustive unit tests, plus golden tests against the prototype's output. |
| `rruleToRecur` | `importers/rrule.ts` (+ `toRRule()` for writing) | Two-way: our structure ↔ RRULE text. Unsupported rules are kept in `rrule_source` and flagged in the UI. |
| `goalProgress` | `domain/goalProgress.ts` + SQL view | Counts touches with people **in that goal's pipeline**, plus stage moves and attended events linked to the goal. Fixes bug 8. |
| `buildNudges` | `domain/nudges.ts` (pure: input = snapshot, output = nudges) + `server/repos/nudges` (loads the snapshot, applies `nudge_states`) | Same rules, plus cadence from settings, plus a triage nudge for pending imports. See §4.5. |
| `dailyBrief`, `weeklyBrief`, `agendaItem`, `prepLine` | `/today` server component + `features/today/*` | Prep line: last touch, 2 talking points from the latest dossier, the open promise you owe. |
| `filteredPeople`, `peopleList`, `personRow` (300 cap) | `/people` with keyset pagination over `/api/v1/people?cursor=` + a virtualised list | Search uses `tsvector` + trigram. Filters: Space, circle, tag, starred, due, needs context, no research, archived. Fixes bug 5. |
| `contactSheet`, `dossierHTML`, `promisesHTML`, `timelineHTML` | `/people/[id]` (detail pane on desktop, full page on mobile) | Sections: Overview, Timeline, Promises, Goals, Research (versions), Suggestions. |
| `openTouchForm` | Capture sheet → "Log a touch" (+ optional promise) | Two fields minimum. Defaults: today, last-used type. |
| `openEventForm`, `eventSheet`, `attendanceStats`, `seriesRow`, `gatherStats` | `/rooms`, `/rooms/[id]`, `/rooms/new`, `domain/attendance.ts` | Attendance in `event_attendance`. "Where your network gathers" is an SQL aggregate on `where_met`. |
| `openDraft`, `draftSheet`, `genDraft` | `/people/[id]?draft=checkin` panel + `ai/prompts/draft` + `POST /api/v1/ai/draft` (streamed) | Adds Open in WhatsApp (`https://wa.me/<digits>?text=`) and Email (`mailto:`). Sending asks "Log this as a touch?", defaulting to yes. |
| `research` | `jobs/research` (Inngest) + `ai/prompts/research.full` / `research.get_to_know` / `verify` | Result is a new `dossiers` version. Field fills, goal links and scores become `suggestions`. |
| `runDiscover`, `normDiscover`, `localPaths`, `knownFor` | "Look up" (renamed from Decode): `jobs/lookup` + `ai/prompts/lookup` → `searches` row, `/rooms/lookup/[id]` | `warmPaths` contact IDs are validated against the user's people in the **same Space**. `localPaths` is ported as a deterministic fallback. |
| `refreshRadar` | "Suggested rooms": `jobs/radar` + `ai/prompts/radar` → `searches(type='radar')` | Each item can be added as an event or dismissed. |
| `writeBrief` | `jobs/brief` + `ai/prompts/brief.daily` / `brief.weekly` → `briefs` | **Per Space** (see §4.7). |
| `scoreBatch` | `jobs/score` + `ai/prompts/score` → `scores` rows (+ goal-link suggestions) | Batches of 60, oldest first. A score is a sortable hint with its reason visible. |
| `cardTask`, `scanCard` | Capture → "Scan a card": signed upload → `POST /api/v1/ai/card` (fast tier, vision) → prefilled person form | Photo deleted after extraction unless the user attaches it. |
| `parseChat`, `finishChat`, `chatRead`, `chatExtract`, `chatApply` | `importers/chat.ts` (pure, tested) + `jobs/chat-extract` + review UI | Raw chat text is discarded after extraction (brief §7). Output is `suggestions` (interactions, commitments, details, a new person). |
| `parseVCF`, `decodeQP`, `splitUnesc`, `normBday`, `labelsToTags`, `urlsToSocials` | `importers/vcf.ts`, `importers/common.ts` | Ported with tests and fixtures (Google, iPhone, Android 2.1 QP). |
| `parseCSV`, `parseContactCSV` | `importers/csv.ts` | Google (old and new), Outlook, LinkedIn, plain. |
| `parseICSFile`, `icsDate`, `tzOffsetMs`, `zonedToDate` | `importers/ics.ts` (uses `@date-fns/tz` for zone maths) | Shared by .ics upload and the Apple ICS URL sync. |
| `readImportFiles`, `loadJSZip` | `jobs/import-parse` (server: `fflate` unzip, size limits) | Runs server-side from Storage. Zip-bomb guard (entry count, total uncompressed size). |
| `contactIndex`, `planContacts`, `fillBlanks` | `domain/dedupe.ts` (pure) | Match order: external ID → email → E.164 phone → name only as `suggest_merge`. **Never a silent name merge.** Fixes bugs 1 and 2. |
| `bulk` | Inngest step batching (500 rows per step) | |
| `importReviewSheet`, `runImport`, `importCalendars`, `addCalendarPerson`, `icsSheet` | `/settings/imports/[id]/review` → `jobs/import-commit` → `/people/triage` | Calendar people become `suggestions(kind='new_person')` with meeting counts. |
| `exampleData`, `loadExamples`, `removeExamples` | `server/seed/example.ts`, offered only in onboarding and Settings → Data | Rows flagged `example=true`. One-click removal. |
| `exportBackup`, `restoreBackup` | `/settings/data`: export JSON (all tables) and CSV (people, interactions, commitments, events) via a background job and a signed download link | Restore from a JSON export is accepted as an import type (reviewed, never a blind overwrite). |
| `cleanSources`, `modeBadge`, `sourcesHTML` | `ai/sources.ts` + `<Sources>` component | Sources come from web search/fetch result blocks, not only the model's JSON. |
| `parseLooseJSON`, `fitSchema` | Replaced by structured outputs (`output_config.format`) + Zod validation + one repair retry | |
| `webTools`, `checkWeb`, `clipResult`, `describeInput`, `WEB_SERVER` (Parallel MCP) | Anthropic server tools `web_search_20260209` / `web_fetch_20260209` | Progress steps ("Searching for …") come from streamed `server_tool_use` blocks and are written to `jobs.progress`. |
| `askClaude`, `runAI`, `aiErr` | `server/ai/run.ts` (one runner: tier, tools, schema, usage accounting, rate limit, error mapping) | |
| `openHandoff`, `handoffSheet`, `applyHandoff`, `retryHandoff`, `openPerms`, `aiWhy`, `connRows`, `openConnections`, `webNote` | **Dropped** (claude.ai-only) | `/settings/connections` is now about Google, Microsoft and Apple accounts. |
| `render`, `renderSheet`, `pushSheet`, `pointerReleased`, `flushPending`, `toast`, `md` | React components, Radix Dialog (mobile sheets only), a toast region, `react-markdown` with a strict allow-list | Desktop uses pages and panes, not stacked modals. |
| `socialUrl`, `SOCIAL_LABEL`, `lookupLinks` | `domain/socials.ts` | |
| `meBlock`, `contactBlock`, `eventBlock`, `networkDigest`, `profileUsed`, `identityRules`, `dossierFill`, `homeCity` | `server/ai/context/*` (Space-scoped builders) | Every builder takes a `spaceId` and can only read rows from that Space. |

---

## 4. Domain logic notes

### 4.1 Normalisation
- Emails: trim, lowercase, strip `mailto:`, validate. Stored as `citext`.
- Phones: `parsePhoneNumberFromString(raw, profile.default_region)`. Valid numbers are stored as E.164. Invalid ones are kept in `notes` as "Unparsed number: …" and never used for matching.
- Names: NFKD with diacritics stripped, used **only** for suggestion matching (`norm()` from the prototype).

### 4.2 Warmth (display only)
Days since `last_touched_on`: ≤14 recent, ≤45 warm, ≤90 cooling, >90 cold, null = "No touches yet". Shown as text ("3 weeks ago") plus one small dot whose tone comes from a single ramp (see DESIGN_SYSTEM.md), not five ring colours.

### 4.3 Cadence (decides nudges)
`effectiveCadence(person) = person.cadence_days ?? circle.default_cadence_days ?? space.defaults.cadence_days ?? null`. `0` or `null` means never nudge.
`dueOn = (last_touched_on ?? cadence_anchor_on ?? created_on) + cadence`.
Imported contacts start in `triage_state='pending'` with no cadence, so they don't flood Today. Triage sets circle, cadence and `cadence_anchor_on = today`. This fixes "imported contacts disappear": they show up through a triage nudge, then on cadence.

### 4.4 Recurrence and time zones
- Port `occurrences(e, from, to)` and `nthWeekday` to TS, keeping the same semantics over ISO **calendar dates** (pure date maths with no `Date` local-time ambiguity: implemented on `{y,m,d}` integers).
- An occurrence's instant is `zonedTimeToUtc(date + start_time, event.tz)`. "Today" for the user is computed in `profile.timezone`. The agenda asks for occurrences in a date window widened by ±1 day, then filters by instant. Travel and online events with another `tz` therefore land on the right local day.
- Supported: none, weekly/biweekly (± BYDAY list), monthly/quarterly (day-of-month clamped, or nth/last weekday), yearly, UNTIL, COUNT (converted to UNTIL on import, as the prototype does).
- Tests: 5th-weekday months that skip, last weekday, Feb 29 yearly, leap years, DST zones (Europe/London, America/New_York) next to WAT (no DST), UNTIL on an occurrence day, ranges starting mid-series, the 800-iteration guard, and parity fixtures generated from the prototype's functions.

### 4.5 Nudge rules (port of `buildNudges`)
Same priorities as the prototype, with these changes:

| Rule | Key | Change from prototype |
|---|---|---|
| Birthday within 7 days | `bday:<pid>:<date>` | — |
| Promise I owe, due ≤3 days or undated; overdue first | `p:<commitmentId>` | — |
| Due for a touch | `due:<pid>:<dueOn>` | Uses effective cadence (4.3), not the score. Any person with a cadence qualifies, not just starred or high-score ones. |
| Meeting someone in ≤3 days with no research | `prep:<pid>:<eventId>:<date>` | In Personal/Dating, the action is "Get to know" (or nothing if research is off). |
| New person missing context (≤14 days, not imported) | `ctx:<pid>` | — |
| Rooms in the next 7 days (not 1:1 meetings) | `ev:<eid>:<date>` | Action: "Look up" |
| **New:** imports waiting for triage | `triage:<importId>` | Fixes imports vanishing. |
| **New:** promises they owe me, overdue | `them:<commitmentId>` | Two-way ledger. |
| **New:** pending AI suggestions | `sugg:<count-bucket>` | One summary card, not one card per suggestion. |

Snooze and dismiss write `nudge_states` with `expires_at`: snooze → `snoozed_until`, expiring then. Dismiss → expires 30 days after the date in the key (dated keys) or after 180 days (undated). Daily cron: `delete from nudge_states where expires_at < now()`. Fixes bug 3. Keys that include the date make dismissing one birthday never hide next year's.

### 4.6 Dedupe and merge
`planImport(existingIndex, rows)` → for each row: `{action: add|merge|skip|suggest_merge, matchPersonId, matchKind}`. In order: external ID → any email → any E.164 phone → **name only**, which never auto-merges and creates `suggest_merge` for review. Within one file, duplicates collapse by the same keys, also never by name alone.
Merging people (from import review or `/people/duplicates`) shows a side-by-side field picker. Lists (emails, phones, tags, interests) are unioned. Interactions, commitments, goal links, event links and dossiers are re-pointed. The loser keeps `merged_into_id` and `deleted_at`. **Undo merge** is available for 30 days, using a stored merge record in `suggestions.payload` with the original field values.

### 4.7 Spaces and guardrails (brief §4.0)
- Every person, goal, event, circle, brief and search has a `space_id`. Cross-Space joins are blocked by constraint triggers (2.2).
- AI context builders take one `spaceId`, and the repo they use is Space-scoped by type (`SpaceScopedRepo`), so a Dating person can't be read into a Work prompt.
- `briefs` are generated **per Space**. Today's "All Spaces" view lists each Space's brief as its own section. Model calls never mix Spaces. Dating is never included in a Work brief or prompt.
- Research by Space mode:
  - `full` (Work): web search + fetch, as in the prototype's research prompt.
  - `get_to_know` (Personal/Dating): **no `web_search` tool**. Only `web_fetch`, with `allowed_domains` set to the domains of the person's saved links, and the prompt given only those exact URLs. Server-side post-filter: any source or item whose URL isn't one of the saved URLs (or a path beneath a saved profile URL) is dropped. Output schema is limited to `sharedInterests`, `thingsToAsk`, `funFacts` (each with a `url`). Banned categories are named in the prompt **and** the schema has no fields for them. Not stored as a dossier. Saved starters become notes.
  - `verify` (Personal/Dating, separate button): web search allowed, limited to "does this profile exist, does the photo or name appear elsewhere, any public safety red flags". Returns `yes|no|unclear` + sources. Not stored beyond the session unless the user saves the answer as a note.
  - `off`: no research buttons.
- The Space switcher is in the sidebar and in Today's header. The default view is "All Spaces" for lists, while AI calls are always issued per Space.

---

## 5. AI layer

### 5.1 Structure
```
server/ai/
  client.ts            Anthropic SDK singleton (server-only import guard)
  config.ts            MODEL_TIERS from env: { fast: 'claude-haiku-5-5', strong: 'claude-opus-5-5' }, effort per feature
  run.ts               runAI({feature, tier, prompt, schema, tools, userId, spaceId, onProgress})
  prompts/             one file per prompt, exporting {version, build(ctx), schema}
    research.full.ts  research.get_to_know.ts  verify.ts  lookup.ts  radar.ts
    draft.ts  brief.daily.ts  brief.weekly.ts  score.ts  chat-extract.ts  card.ts
  schemas/             Zod schemas → JSON Schema for output_config.format (zod-to-json-schema)
  context/             meBlock, personBlock, eventBlock, networkDigest (Space-scoped)
  sources.ts           collect citations from web_search/web_fetch result blocks + model JSON, dedupe, cap 12
```
- **Prompts** are ported from the prototype nearly word for word: identity disambiguation, matched/conflicts, "never invent dates", the knowledge-only fallback. Each has a `version` string stored with its outputs (`dossiers.prompt_version` etc.), so outputs can be traced to the prompt that produced them.
- **Structured outputs**: JSON features pass `output_config: {format: {type: 'json_schema', schema}}`. The response is then validated with Zod. If validation fails, one repair call is sent with the Zod error. A second failure marks the job failed with a plain message. (Structured outputs can't be combined with document citations, so sources come from web tool result blocks plus the schema's `sources` field.)
- **Goal IDs and person IDs** in model output are constrained with `enum` in the JSON schema. They're re-validated server-side against the Space's rows.
- **Tiers** (env-configurable): `fast` = `claude-haiku-5-5` for draft, score, chat extraction and card OCR. `strong` = `claude-opus-5-5` (effort `medium` by default, `high` for research) for research, look up, radar and briefs. Model IDs live only in `config.ts`/env. Refusal handling: check `stop_reason === 'refusal'` and show a plain message. We enable the API's server-side `fallbacks: "default"` option on the strong tier.
- **Web**: `{type:'web_search_20260209', name:'web_search', max_uses: 4}` and `{type:'web_fetch_20260209', name:'web_fetch', max_uses: 3}`. `user_location` is taken from the profile city/country for radar. Server-tool errors arrive as result blocks, not exceptions, and are handled as such.
- **Streaming**: every call uses `client.messages.stream(...)`. Draft text streams to the browser over SSE (short, interactive). Long jobs stream inside Inngest steps and write progress ("Searching for 'Ada Okafor Paystack'", "Reading linkedin.com") to `jobs.progress`, which the UI follows over Realtime.

### 5.2 Suggestions, not silent writes
Each job writes its **artifact** (dossier version, search, brief, score) and a set of `suggestions` for anything that would change the user's data: field fills (from `found`/`profiles`), goal links (from `goal`), new people (calendar attendees, card scan, chat), interactions and commitments (chat). The UI shows them as cards with **Accept / Edit / Discard**, the reason, and sources. Accepting runs the normal Zod-validated mutation. Nothing in `people`, `goal_links`, `interactions` or `commitments` is written by a job without a user action. The one exception is calendar sync for people the user already has: past meetings are logged as touches on them, as the brief's Loop A describes. Even that is reported as "12 meetings logged from Google Calendar" with an undo.

### 5.3 Background jobs (Inngest functions)
`research`, `lookup`, `radar`, `brief` (on demand, plus a cron at each user's `brief_time` that **prepares** but doesn't email in P0), `score-batch`, `chat-extract`, `import-parse`, `import-commit`, `sync-google`, `sync-microsoft`, `sync-ics-url`, `export`, `delete-account`, and the crons `prune-nudge-states`, `prune-searches`, `purge-soft-deleted`, `purge-import-files`.
Concurrency: `{key: 'event.data.userId', limit: 2}` for AI jobs, and 1 per connection for syncs. Each job row is created before enqueueing, so the UI shows "Queued" straight away and the work isn't lost if the tab closes.

### 5.4 Rate limits and usage
`ai_usage` is written after each call (input/output tokens, web searches). Before enqueueing, `checkLimit(userId, feature)` counts rows over a rolling 24h and 30d against `LIMITS` config (e.g. research 20/day, lookup 20/day, radar 5/day, brief 6/day, draft 100/day, score 10 batches/day, card 50/day, chat 20/day: all placeholders, see Q7). When a limit is hit, the user sees a clear message with the reset time. `/settings/usage` shows the meter. Postgres is enough at this scale, with no Redis needed.

### 5.5 Privacy
- Settings → Data explains what is sent to the model per feature.
- Chat import raw text and card photos are deleted after extraction (the files after commit; text is never stored). Opt-in "keep original" per import.
- No customer data used for training (Anthropic API default). Stated in the privacy policy.

---

## 6. Integrations (milestone 7)

### 6.1 Google (Contacts + Calendar)
- **Separate from sign-in.** "Continue with Google" for auth asks only `openid email profile`. Connecting data is a second incremental-auth step with only the data scopes, so sign-in never triggers the verification-gated consent screen.
- Scopes (narrowest read-only):
  - `https://www.googleapis.com/auth/contacts.readonly` (People API: `people.connections.list`)
  - `https://www.googleapis.com/auth/calendar.events.readonly` (events)
  - `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (to let the user pick calendars)
  - Optional, off by default: `contacts.other.readonly` ("Other contacts", the auto-saved Gmail addresses). Noisy, so we don't ask for it in P0.
- Sync: first run does a full list with `personFields=names,emailAddresses,phoneNumbers,organizations,birthdays,urls,memberships,biographies,addresses`. Then incremental with `syncToken`, which expires after 7 days, so a weekly cron does a full resync on HTTP 410. Calendar: `events.list` with `singleEvents=false` (we keep series and our own recurrence) and `syncToken` per calendar. A window of -6 months to +3 months on first sync, matching the prototype's import. Cron every 30 min per active connection, plus "Sync now". Push channels (`events.watch`) deferred.
- **OAuth verification needs** (to be done by the account owner):
  - These are **sensitive** scopes (not restricted), so Google requires app verification. **No CASA security assessment** is needed (that's for restricted scopes like Gmail, which we are deliberately not using).
  - Requirements: verified domain in Search Console, a public homepage and privacy policy on that domain that describe the Google data use and Limited Use compliance, app logo, support email, scope justifications, and a **demo video** of the consent flow and how each scope is used. Review typically takes several days to a few weeks.
  - Until verified: "Testing" mode with up to 100 named test users, who see an "unverified app" warning; refresh tokens expire after 7 days in Testing.
- Tokens: refresh token stored encrypted (6.4). Access tokens are short-lived and not stored.

### 6.2 Microsoft 365 / Outlook
- MSAL (auth code + PKCE) against `common`, scopes `User.Read Contacts.Read Calendars.Read offline_access`.
- Graph delta queries: `/me/contacts/delta`, `/me/calendarView/delta` (window) or `/me/events` for series.
- Needs an Azure app registration. **Publisher verification** (MPN ID) is recommended so users don't see "unverified". Some organisations block user consent, so we show a clear message when that happens.

### 6.3 Android Contact Picker / iPhone
- `navigator.contacts.select(['name','email','tel'], {multiple: true})` where `'contacts' in navigator` (Chrome on Android). Selected contacts are POSTed as an import (`type='contact_picker'`) and go through the same review and triage.
- Elsewhere: .vcf upload with a 3-step illustrated guide for iPhone (Contacts → select → Share → Save to Files).

### 6.4 Apple Calendar (ICS URL)
- User pastes a `webcal://` or `https://` URL (iCloud public-calendar link). It's stored encrypted (the URL is a secret).
- The server fetches it with an **SSRF guard**: https only after rewriting webcal, DNS-resolved IP not private/loopback/link-local, 10 MB cap, 15 s timeout, ETag/If-Modified-Since. Parsed with `importers/ics.ts`. Synced every 60 min.

### 6.5 Token encryption
AES-256-GCM, with a random 12-byte IV per value. The key comes from `TOKEN_ENC_KEYS` (a JSON map `{v1: base64}`) plus `TOKEN_ENC_CURRENT=v1`. Stored format: `version || iv || ciphertext || tag`. Rotation: decrypt with the old key, re-encrypt with the current one in a cron. Tokens are decrypted only inside sync jobs and never returned to the client. Revoking a connection deletes the tokens and calls the provider's revoke endpoint.

### 6.6 Onboarding flow
1. Sign in → 2. "What should Inroads call you" + city (sets timezone/region; editable) → 3. Spaces: Work on, Personal and Dating off by default (toggle) → 4. Connect: Google / Microsoft / phone contacts / Apple calendar / "Skip, I'll add people myself" → 5. Live progress ("Found 842 contacts and 63 meetings…") → 6. Triage → 7. One goal → Today. Example data is offered at step 4 as "Explore with example data".

---

## 7. Screens and navigation

### 7.1 Information architecture
`Today` · `People` · `Rooms` · `Goals` · `Settings`. A Space switcher sits at the top of the sidebar (desktop) and in the Today/People headers (mobile).

### 7.2 Routes

| Route | Desktop | Mobile |
|---|---|---|
| `/today` | Two columns: agenda with prep (left), nudge feed (right). Brief per Space, collapsible. | Single column: agenda, then nudges, then brief. |
| `/people` | List pane (virtualised, filters as a compact toolbar) + detail pane for `/people/[id]` | List; tapping opens the full-screen detail |
| `/people/[id]` | Detail pane: header (name, role, warmth text, cadence, circle), actions (Log touch, Draft, Research), then sections: Timeline, Promises, Goals, Research, Suggestions | Full page with the same sections; sticky action bar |
| `/people/new`, `/people/[id]/edit` | Inline form in the detail pane | Full-screen form |
| `/people/triage` | Keyboard-driven card queue (`k` keep, `p` priority, `a` archive, `1–4` cadence) | Swipe-free tap queue with large buttons |
| `/people/duplicates` | Pairs list + side-by-side merge | Stacked merge with field toggles |
| `/rooms` | Tabs: Upcoming, Series, Suggested rooms. List + detail pane | Same tabs; full-screen detail |
| `/rooms/[id]` | Event detail: when, where, people, prep, attendance, Look up result | Full page |
| `/rooms/new` | Form with recurrence builder | Full-screen form |
| `/rooms/lookup` + `/rooms/lookup/[id]` | Query box (person/company/place/event) + saved results list; result: overview, people to know, warm paths, openings, tips, sources | Same, single column |
| `/goals` | Goal list grouped by Space, with weekly progress | List |
| `/goals/[id]` | Pipeline as columns by stage (stage change via menu or keyboard in P0; drag in P2) + "People to meet" | Stage sections as a vertical list with a stage picker per person |
| `/settings/profile` · `/spaces` · `/circles` · `/imports` · `/imports/[id]/review` · `/connections` · `/usage` · `/data` | Settings with a left sub-nav | List of settings, then each page |
| `/onboarding/*` | Centred single-column steps | Full screen |
| `/sign-in`, `/auth/callback` | | |

Global: **Capture** (`c`, or the central mobile button) opens a sheet with: Add person · Log a touch · Add a promise · Scan a card · Import a chat · Add a room. **⌘K** palette: jump to any person, room or goal; run any action; switch Space. Shortcuts: `/` search, `j/k` move in lists, `enter` open, `e` edit, `l` log touch, `d` draft, `g t / g p / g r / g g` go to section, `?` shortcut help.

### 7.3 Navigation map

```
Desktop                                       Mobile (PWA)
┌──────────┬───────────────┬───────────────┐  ┌─────────────────────────┐
│ Space ▾  │ List          │ Detail        │  │ Header: Space ▾  avatar │→ Settings
│ Today    │ (virtualised) │ (route child) │  │                         │
│ People   │               │               │  │  page content           │
│ Rooms    │               │               │  │                         │
│ Goals    │               │               │  ├────┬────┬────┬────┬────┤
│ ──────   │               │               │  │Tdy │Ppl │ ＋ │Rms │Gls │
│ Settings │               │               │  └────┴────┴────┴────┴────┘
│ ⌘K       │               │               │       ＋ = Capture sheet
└──────────┴───────────────┴───────────────┘
```

---

## 8. Fixes for the brief's "Engineering bugs and limits"

| # | Bug | Fix |
|---|---|---|
| 1 | Name-only matches merge different people | `domain/dedupe.ts` never merges on name. Name matches create `suggest_merge` rows that need explicit review. Unit tests include two "David Okafor"s with different phones staying separate. |
| 2 | Phones unused in matching | E.164 normalisation with the profile region. Phone is the third match key after external ID and email. GIN index on `phones`. Tests for local Nigerian formats (`0803…`, `+234 803…`, `234803…`) resolving to one number. |
| 3 | Unbounded `meta.dismissed` / `meta.searches` | `nudge_states` with `expires_at` and a daily prune cron. `searches` in its own table with a retention cron. Briefs and radar get their own rows. |
| 4 | localStorage ceiling | Postgres + Storage. The browser only holds a bounded query cache (TanStack Query persister with an LRU cap). |
| 5 | Full re-render, lost scroll and focus, 300-row cap | React with keyed components, list/detail routes that keep the list mounted (parallel routes), virtualised lists, keyset pagination, server-side search. Perf budget: People list stays interactive with 10k seeded rows on a throttled Moto G profile (Playwright + Lighthouse CI). |
| 6 | No undo, no archive | `deleted_at` soft delete + an Undo toast (10 s) + a 30-day purge. `archived_at` hides from lists and nudges, restorable from a filter. Undo for merges too. |
| 7 | Substring goal matching | Removed. The model chooses from an enum of goal IDs. Links are suggestions. |
| 8 | Goal progress only counts auto-linked people | Progress counts touches with people in the goal's pipeline (explicit `goal_links`), stage moves (`goal_link_history`) and attended goal-linked events. Linking is always explicit. |
| 9 | claude.ai-only flows | Removed: hand-off, permissions UI, connector checks, `window.claude`. |

---

## 9. Offline and performance (Android, patchy networks)

- JS budget: < 170 KB gzipped on first load of `/today`. Server components for read views; client components only for interactive parts.
- Fonts self-hosted with `next/font` (subset latin + latin-ext, `display: swap`). The display face loads only on page titles.
- Service worker: precache the app shell. Stale-while-revalidate for `GET /api/v1/*`. Network-first for HTML.
- **Offline capture**: Add person, Log touch, Add promise and Mark done are queued in IndexedDB with a client-generated UUID (idempotency key) and replayed when back online. The UI shows "Saved on this phone, will sync". The server upserts by ID, so replays are safe.
- Images (card scans) are compressed client-side to ≤1600px JPEG before upload.
- Realtime is optional: if the socket drops, job progress falls back to polling every 3 s with backoff.

---

## 10. P0 milestones and definition of done

Every milestone ships with: types passing (`tsc --noEmit`), lint passing, unit tests for its domain code, a Playwright smoke test for its main flow (mobile + desktop viewport), CHANGELOG entry, README/DECISIONS updates, and one commit (or a small series) with a clear message.

| # | Milestone | Definition of done |
|---|---|---|
| 1 | Scaffold, auth, schema, seed | Next.js app runs locally against local Supabase. Magic link + Google sign-in work. All §2 tables migrated with RLS, and the RLS test suite passes (user B can't touch user A's rows). `withUser()` wrapper in place. Example seed script. Design tokens + base components (Button, Input, Field, ListRow, Pane, Toast, Sheet). App shell with sidebar/bottom nav. PWA manifest installs. CI (GitHub Actions) runs typecheck, lint, unit, e2e. |
| 2 | Spaces | Spaces CRUD with defaults (cadence, stages, research mode, copy). Work/Personal/Dating templates + custom. DB trigger rejects full research in Personal/Dating. Constraint triggers block cross-Space links. Space switcher. Tests show a Dating person can't appear in a Work context builder. |
| 3 | People, interactions, promises | List with keyset pagination + virtualisation (10k seeded rows smooth), search, filters, circles, cadence (person → circle → Space). Detail, create/edit (Zod, E.164), archive/unarchive, soft delete with Undo. Log touch (with optional promise) in under 10 s on mobile. Promises ledger both ways. Unit tests for warmth, cadence and normalisation. |
| 4 | Rooms + recurrence | `domain/recurrence.ts` ported with exhaustive tests + parity fixtures from the prototype. Event CRUD with a recurrence builder and tz. Attendance per occurrence. Event ↔ people with roles. Agenda correct across time zones. |
| 5 | Goals + pipeline | Goals per Space with stages (from Space default or custom). `goal_links` with stage changes and history. Pipeline view (columns on desktop, stage list on mobile). Weekly progress counts what §8 #8 says. Linking only by explicit action. |
| 6 | Today | Agenda with prep lines. Nudge feed from `domain/nudges.ts` (unit-tested per rule), with snooze/dismiss persisted in `nudge_states` with TTL. Prune cron. "All Spaces" vs one-Space view. |
| 7 | Connections | Google Contacts + Calendar connect (incremental auth, narrowest scopes), background incremental sync with syncTokens, live progress, lands in triage. Microsoft 365 the same via Graph delta. Android Contact Picker. Apple ICS URL with SSRF guard. Tokens encrypted at rest with a rotation path. Disconnect revokes. The verification checklist from §6.1 is written up in README. *(See Q1: this may move to P1.)* |
| 8 | File importers | vcf/csv/LinkedIn/ics/zip parsed server-side from Storage, ported with fixture tests. Review step with paged staging rows. Dedupe (external → email → phone → name suggestion). Merge UI with undo. Triage (keep/priority/archive + cadence). Raw files deleted after commit. 5,000-contact vCard imports in under a minute end to end. |
| 9 | AI | Runner with tiers, structured outputs + Zod, web tools, streamed progress into `jobs`, per-user limits + meter. Features: research (versioned dossiers) / get-to-know / verify, Look up, Suggested rooms, Draft (+ Open in WhatsApp/email + log touch), daily & weekly brief per Space, chat import extraction, card scan, batch scoring. Every data change goes through `suggestions` with Accept/Edit/Discard, reasons and sources. Prompts versioned. Guardrail tests: get-to-know requests carry no `web_search` tool and only saved-URL domains, and the post-filter drops foreign sources. |
| 10 | Settings | Profile (timezone, region, brief time), goals link, imports history, connected accounts, usage, export JSON + CSV (background job → signed link), delete account (confirm by typing email; revokes tokens, deletes Storage objects, cascades rows, deletes the auth user). |

---

## 11. Environment variables (for README)

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
ANTHROPIC_API_KEY, AI_MODEL_FAST, AI_MODEL_STRONG
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
RESEND_API_KEY, EMAIL_FROM
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET          (data connection; sign-in is configured in Supabase)
MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT=common
TOKEN_ENC_KEYS, TOKEN_ENC_CURRENT
APP_URL, SENTRY_DSN (optional)
```

---

## 12. Open questions

1. **Google/Microsoft OAuth sync: P0 or P1?** Your milestone list puts one-tap connections in P0 (milestone 7), and so does the brief, but the "don't start P1 features" line lists "Google OAuth sync". My plan builds it in P0 as milestone 7. Confirm, or I'll move it after milestone 10.
2. **Goal pipeline in P0.** The brief puts drag-between-stages pipelines in P2, while your milestone 5 asks for `goal_links` with stages. Plan: stages, a pipeline view, and stage changes by menu or keyboard in P0; drag-and-drop in P2. OK?
3. **Get to know and Verify in P0?** They follow from the Space guardrails, so I've included them in milestone 9. Say if you'd rather ship Personal/Dating with research off at first.
4. **Domain and Google Cloud / Azure ownership.** OAuth verification needs a verified domain, privacy policy and demo video, and an Azure app registration for Microsoft. What's the production domain, and who owns the Google Cloud and Azure accounts?
5. **Hosting region.** Supabase `eu-west-2` (London) + Vercel `lhr1` is my default for Lagos latency. Any data-residency requirement (e.g. NDPA) that would change this?
6. **Default Spaces.** Plan: Work on, Personal and Dating off until the user turns them on in onboarding (in line with "lead with Work"). OK?
7. **AI limits for the free tier.** The numbers in §5.4 are placeholders. Do you have target per-user monthly costs or limits?
8. **Model tiers.** `claude-opus-5-5` for research/look up/radar/briefs and `claude-haiku-5-5` for draft/score/extraction/card, both overridable by env. Happy with that cost/quality split?
9. **Error tracking and analytics.** OK to add Sentry and a privacy-respecting product analytics tool (e.g. PostHog EU) for the activation and retention metrics in brief §8?
10. **Daily brief email.** Brief delivery by email is P2. In P0 the brief is prepared at `brief_time` and shown on Today. Confirm no email in P0.
11. **Example data**: keep the prototype's Lagos example network (6 people, 4 events) as the seed? It would be shown only in onboarding and Settings → Data.
