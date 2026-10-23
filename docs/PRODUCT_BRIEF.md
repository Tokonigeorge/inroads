# Inroads — Product Brief (v1 rebuild)

> Source of truth for rebuilding Inroads as a standalone web app. The current `index.html` is a working prototype built inside the Claude artifact runtime. Treat it as a **behavioural spec**: it shows the domain, the flows and the AI prompts. Don't port it as-is: the code structure, the visual design and several product decisions change here.

---

## 1. What Inroads actually solves

**One line:** Inroads turns the people you meet into outcomes. It remembers the context, catches the follow-ups you'd drop, and gets you ready for the rooms that matter to your goals.

**Who it's for:** people whose income or progress depends on who they know, and who don't have a sales team or CRM admin. Founders raising or selling, freelancers and agencies winning clients, creatives building a scene, operators hiring, job-seekers. The first market is Lagos, then Africa's other relationship-driven economies, where deals start in rooms and continue on WhatsApp.

**The jobs, in the user's words:**

| Job | Pain today | What the prototype does |
|---|---|---|
| "Help me remember who this is and what we said" | Context lives in your head, WhatsApp threads and scattered notes | Contact record, timeline of touches, interests, where you met, WhatsApp/Telegram chat import with AI extraction |
| "Don't let me drop the ball" | Promises ("I'll send the deck", "I'll intro you to Bola") get forgotten, and relationships go quiet | Promises ledger (you owe / they owe), warmth decay (hot → cold), cadence-based "going cold" nudges, birthdays |
| "Prep me before I walk in" | You meet people unprepared, or go to events blind | Per-person research dossier (talking points, openings, sources), "Decode the room" for any person, place or event, daily brief with agenda prep |
| "Is this event worth my evening?" | You can't tell which rooms pay off | Radar of upcoming events matched to your goals, recurring-event attendance tracking, "where your network gathers" stats |
| "Is my networking moving my goals?" | Networking feels busy but you can't measure it | Goals with weekly touch targets, AI goal-fit scores, goal-progress meters, weekly digest |

**What's actually different here:** most personal CRMs are address books with reminders. Inroads has three ideas that the mainstream tools mostly don't put first:
1. **Goals come first.** Every person, event and nudge is weighed against what you're trying to achieve this quarter.
2. **Rooms are first-class.** Events aren't just calendar items. Each one has a before (decode, prep), a during (capture) and an after (follow-up), and you get evidence of which rooms pay off.
3. **Promises are tracked.** A two-way ledger of who owes whom, built from conversations.

The rebuild should go hard on these three and not try to out-feature Clay or Dex on enrichment.

---

## 2. Honest assessment of the prototype

### What's good (keep)
- The domain model: contacts, interactions, commitments, events with real recurrence (weekly by-day, nth-weekday monthly, until-dates), goals, dossiers, scores.
- Nudge logic: birthdays within 7 days, open or overdue promises, cooling priority contacts, prep for people you're meeting within 3 days, context capture for new people. All of it can be snoozed or dismissed.
- Importers: vCard, Google/Outlook/LinkedIn CSV, Google Takeout .zip, .ics with RRULE → recurrence, past meetings logged as touches, attendees offered as new people. Merging on email and alt-emails.
- AI prompts are well built: strict JSON schemas, identity disambiguation ("matched" / "conflicts" against saved data), source citations, confidence and caveats, "never invent dates".
- Review-before-save on imports.

### What's weak (fix in the rebuild)
**Product**
- **Capture is too much work, and that's the biggest risk.** Getting data in means Google Takeout exports, file uploads and long forms. Personal CRMs die when upkeep feels like homework.
- **Imported contacts disappear.** Someone with no logged touch is "fresh" forever. `isCooling()` needs a last touch, so 2,000 imported contacts never surface. There's no triage step.
- **Cadence is inferred, not chosen.** Follow-up frequency comes from the AI score (30, 60 or 120 days). Users can't say "monthly for Ada".
- **Scores are a black box.** The 0–100 "goal-fit" number is hard to trust or act on. Goals have no pipeline, so there's no sense of *moving* someone toward an outcome.
- **The loop isn't closed.** Drafts end at "Copy message". You can't open WhatsApp with the text filled in, and sending doesn't log a touch automatically.
- **Events have no "after".** Nothing follows up the morning after an event ("Who did you meet at X?").
- **Warm paths are thin.** They come from string matching on company, where-met and notes, and there's no flow for asking for an intro.

**Engineering bugs and limits found in the code**
1. **Wrong merges on name-only matches.** `planContacts()` matches on normalised name when there's no email, so two different "David Okafor"s silently become one.
2. **Phone numbers are never used for matching.** Dedupe uses only email or name. Phone-book vCards often have no email, so they fall straight into the risky name match above. Normalise phones to E.164 (default region from the user's location, e.g. NG) and match on them before name.
3. **Unbounded metadata.** `meta.dismissed` grows forever and is never pruned. `meta.searches` stores 12 full Decode results, plus radar and briefs, in one document. This hits document and storage limits.
4. **Storage ceiling.** Standalone mode keeps everything in one `localStorage` key (around 5 MB), and dossiers plus chat imports fill it.
5. **Rendering.** Every state change re-renders the whole view with `innerHTML`. There's a press-and-release workaround so taps aren't swallowed. Scroll position is lost, focus is fragile, and it gets slow past a few hundred contacts. The people list is hard-capped at 300 with no pagination.
6. **No undo** on deleting a person or event, and nothing gets archived.
7. **Fuzzy goal matching.** `matchGoal()` uses substring `includes`, so short goal texts can attach the wrong goal to a contact.
8. **Goal progress** only counts touches on contacts already linked to that goal, and that linking is mostly automatic and silent.
9. **Dead flows off-platform.** The copy/paste "hand-off" to a Claude chat, the permissions UI and connector checks only make sense inside claude.ai. Remove them.

**Design ("AI-ish" tells to remove)**
- Uppercase monospace eyebrow "stamps" on every section, pill buttons everywhere, emoji ★, five ring colours on avatars, a card for everything.
- Cute copy: "Decode the room", "Rooms that matter", "Know the room before you walk in", "One tap pulls together…". Keep **one** piece of signature language ("rooms") and write everything else plainly.
- Stacked modal sheets for everything, including on desktop. Desktop should be a list-and-detail layout, not a phone UI stretched wide.
- Long single-page "Goals" tab mixing profile, scoring, imports, backup, examples and connections.

---

## 3. Competitive landscape

Researched October 2026. Some review sources are written by competitors (notably Dex's blog), and those claims are marked.

| Product | Who it's for | Strengths | Gaps that matter for Inroads | Price |
|---|---|---|---|---|
| **Mesh** (formerly Clay; bought by Automattic in Jun 2025, renamed Mar 2026) | Individual professionals | Auto-imports email, calendar, LinkedIn, X and iMessage; job-change and news alerts; "Nexus" AI assistant | No Android app, no WhatsApp, feels noisy, weak for people met in person | Free up to 1,000 contacts; Pro $10/mo |
| **Dex** | Networkers, job-seekers | LinkedIn, email, calendar and WhatsApp sync; keep-in-touch reminders; AI research; meeting briefs; on every platform | WhatsApp sync is thin (computer only, keeps only the latest message, skips groups of more than five, creates duplicates); weak at events; no free plan | $12–20/mo |
| **folk** | Small teams, leaning toward sales | Enrichment, LinkedIn extension, AI assistants, WhatsApp | No mobile app; expensive for one person; monthly AI caps | $24–60 per member/mo |
| **Covve** | Phone-contacts-first users | Card scanning, news alerts, reminders | Mobile only; free for just 20 contacts; 2020 data breach | ~$10–13/mo |
| **Cloze** | Real estate and sales professionals | Auto-captures email, calls and calendar; daily agenda | Steep learning curve, duplicates, clutter | ~$17–42/mo |
| **Monica** | Privacy-minded personal use | Open source; tracks gifts, debts and reminders | Everything typed by hand; no mobile app; being rebuilt as v3 | Free self-hosted, ~$9/mo hosted |
| **Pally** (YC S25) | US founders and investors | Assistant you text; pulls from iMessage, WhatsApp, LinkedIn, Gmail and X; meeting prep; search your network in plain language | In beta; US-focused | n/a |
| **Happenstance** | Founders, recruiters | AI search across your own and your group's networks for warm intros | Search only, not a relationship system | Free / $24/mo |
| **Boardy** | Founders | An AI "superconnector" that makes introductions on its own | Finds new people for you; doesn't track the network you already have | n/a |
| **Affinity, Attio, Rings AI** | VC/PE firms and teams | Relationship scoring, intro paths | Built for teams and firms, not individuals | $35–$2,700/user |

UpHabit reportedly shut down in April 2026 (per Dex, not independently confirmed), and Kith shows no 2026 activity. Garden, FollowUp and Nouri are dead. **The category has a lot of churn, so trust and longevity are part of the pitch.**

**Features every tool now has** (P0 must match these): contact records with a timeline, tags and groups, keep-in-touch reminders, birthdays, email and calendar sync, CSV, Google and iCloud import, LinkedIn import, and some form of AI summary or research. Pre-meeting briefs are fast becoming standard (Dex, Pally, Cloze).

**Complaints users keep repeating, and what they mean for us**
1. *Typing everything in kills usage.* → Capture is our critical path (section 4).
2. *Auto-capture creates noise and duplicates.* → Review-before-save, a merge UI, and import triage.
3. *Patchy platforms.* Mesh has no Android app; folk has no mobile app at all. → A web app plus an installable PWA that works properly on Android first.
4. *Tiny free tiers, priced in USD.* → A free tier generous enough to build a habit, plus naira pricing.
5. *Weak at in-person events.* → This is exactly where the "rooms" loop is strong.
6. *WhatsApp is an afterthought.* → Make WhatsApp a first-class channel: chat import, Open-in-WhatsApp, and later a WhatsApp bot.

**Where the opening is:** we found no personal relationship tool built for markets where networking runs on WhatsApp and the phone. Nigeria's WhatsApp CRMs (ChatDaddy, Privyr) are for businesses selling to leads, not for people managing relationships. Nobody bills in naira. **Inroads' wedge: goals plus rooms plus promises, WhatsApp-native, Android-first, priced locally.**

**A trend to design for:** Mesh (a planned version for AI agents), Dex ("Dex for Agents") and Rings (an MCP connector) are all opening their data to AI assistants. Plan an API and MCP server so a user's Claude or other assistant can query their Inroads network (P3).

---

## 4. Product direction (opinionated)

**Positioning:** *The networking OS for people who live on referrals: goal-driven, room-centric, WhatsApp-native, Android-first, priced locally.*

**The critical path is capture.** If logging a meeting takes more than about 10 seconds, nothing else matters. Every major feature below is ranked by how much it cuts upkeep or how directly it gets the user to an outcome.

### 4.1 Core loops to design around

**Loop A: the room loop (before → during → after)**
1. *Before:* an event lands on the calendar (synced) → Inroads lists who you know who's likely there, who to meet, and a 5-line prep. One tap opens the full decode.
2. *During:* quick capture from the phone. Scan a card, type one line ("Ada, partnerships @ Paystack, wants intro to Tola"), or record a 30-second voice note.
3. *After:* next morning, a "Who did you meet at X?" card. Confirm the people you captured, and their follow-ups are scheduled 24–48h out. Attendance is logged, and the event's ROI updates.

**Loop B: the relationship loop**
Cadence per person (user-set, with a suggested default) → a nudge when it's due → a draft with context → **"Open in WhatsApp"** (`wa.me/<E164>?text=`) or email → logged as a touch automatically → warmth updates.

**Loop C: the goal loop**
Goal → a **pipeline** of people in stages (Identified → Warm path found → Introduced → Met → In conversation → Won or Closed) → a weekly digest showing movement, not just touch counts. AI fit becomes **suggestions** ("12 people in your network could help with 'Raise pre-seed'") instead of an opaque number on every row.

### 4.2 Feature list by phase

**P0: Parity, done properly (ship first)**
- Accounts and auth (email magic link + Google), multi-device sync, server-side storage.
- People, events, goals, interactions, promises: everything the prototype does, keyboard- and mobile-friendly.
- All existing importers, server-side, with a review step and a **duplicate-merge** UI (no silent name-only merges).
- **Import triage:** a fast keep / priority / archive pass over newly imported contacts that sets cadence and circle.
- User-set **cadence** per person or circle ("Inner circle: 2 weeks", "Investors: monthly", "Dormant: never").
- Research dossier, Decode, Radar, Draft, daily and weekly brief, chat import, card scan, all via the Anthropic API server-side with the web search tool.
- **Open in WhatsApp / email** from drafts, with auto-logging.
- Undo for deletes, plus archive. Full JSON/CSV export and account deletion.

**P1: Remove capture friction**
- **Google Contacts + Calendar OAuth sync** (incremental, two-way optional later) in place of Takeout uploads. Calendar attendees → people, past meetings → touches, upcoming → agenda.
- **Quick capture bar** (⌘K on desktop, a floating button on mobile): one natural-language line parsed into person, touch, promise and follow-up date.
- **Voice debrief:** record → transcribe → the same extraction as chat import → review → save.
- **PWA with a share target:** share a LinkedIn profile URL, a WhatsApp message or a contact card into Inroads.
- **Post-event follow-up flow** (Loop A, step 3).

**P2: Intelligence that earns trust**
- **Goal pipelines** (Loop C) with drag-between-stages, replacing the score as the primary signal. Keep the fit score as a sortable hint with its reason visible.
- **Intro requests:** pick a warm path → draft a double-opt-in ask to the connector → track it as a promise ("they owe: intro to X").
- **Ask your network:** natural-language search over your own data ("who do I know in fintech in Accra who's raised before?"). Use embeddings on notes, dossiers and interactions.
- **Event ROI:** for each event or recurring series, people met, touches since, and pipeline movement attributable to it.
- Daily brief delivered by email (and later WhatsApp) at a set time.

**P3: Growth and money**
- Shared workspaces for small teams (agency BD, founding teams): shared contacts with private notes, "who on the team knows X".
- WhatsApp bot (WhatsApp Business Platform): forward a message or voice note to log it.
- Public API + MCP server so the user's own AI assistant can query and update their network.
- Plans: Free (limited contacts and AI runs), Pro (unlimited, sync, voice, radar). Local pricing via Paystack (NGN) plus Stripe (USD).

### 4.3 What NOT to build (yet)
- Automatic LinkedIn scraping or sync (against the ToS, and brittle). Accept pasted or shared profile URLs instead.
- Gmail inbox ingestion (restricted Google scope with a costly security assessment). Calendar and Contacts are enough for v1.
- Sending messages on the user's behalf. Inroads drafts, and the user sends.
- A full sales CRM (deals, quotes). Stay personal-first.

---

## 5. UX and design direction

**Feel:** calm, editorial, dense where it matters. Think Linear, Things or Attio rather than a chat app or a dashboard template. "Mature" means restraint: one accent colour, real typographic hierarchy, few borders, and no decoration that doesn't carry information.

- **Information architecture:** `Today` · `People` · `Rooms` (events + radar) · `Goals` (pipelines) · `Settings` (profile, imports, connections, data). Profile, imports, backup and examples move into Settings.
- **Desktop:** left sidebar, list on the left, detail on the right. Detail pages, not modals. ⌘K command palette and keyboard shortcuts (`c` capture, `/` search, `j/k` navigate, `e` edit).
- **Mobile (PWA):** bottom nav with 4 items and a central capture button. Full-screen detail pages with native-feeling transitions.
- **Typography:** one serif or grotesk display face used sparingly for page titles, and a highly legible sans for UI. Drop the monospace eyebrows. Use numbers in tabular figures only where they're compared.
- **Colour:** neutral warm greys plus one accent. Warmth shown as a small, consistent indicator (a dot or a text label like "3 weeks ago"), not five ring colours.
- **Copy:** plain, specific, short. Buttons are verbs ("Research", "Log meeting", "Open in WhatsApp"). No "magic", "one tap", "decode", "supercharge".
- **AI surfaces:** always show *why* (sources, which saved details were used, confidence) and always let the user edit before saving. AI output is a suggestion card with Accept / Edit / Discard, never a silent write. This fixes the silent goal-linking problem.
- **Empty states** teach the next action in one line. Example data stays available, but only from onboarding.
- Accessible: WCAG AA contrast, full keyboard support, `prefers-reduced-motion`, and light and dark themes.

---

## 6. Data model (target)

Relational (Postgres). Every row scoped by `user_id` (later `workspace_id`) with row-level security.

- `profiles` (name, headline, location, background, offerings, industries[], emails[], timezone, brief_time)
- `goals` (id, text, type, priority, weekly_target, active, stages config)
- `people` (name, emails[], phones[] in E.164, company, position, city, where_met, met_on, birthday MM-DD, interests[], notes, socials jsonb, tags[], circle_id, cadence_days, starred, archived_at, source, created_at, updated_at)
- `circles` (name, default_cadence_days)
- `interactions` (person_id, date, type, summary, source: manual|calendar|chat|voice|whatsapp, event_id?)
- `commitments` (person_id, text, owner: me|them, due, done_at, source)
- `goal_links` (goal_id, person_id, stage, updated_at, note) ← the pipeline
- `events` (title, start, end, tz, location, url, kind, recurrence rrule, until, goal_id, notes, source, external_id)
- `event_people` (event_id, person_id, role: attendee|met_there|speaker)
- `event_attendance` (event_id, occurrence_date, attended)
- `dossiers` (person_id, version, payload jsonb, sources jsonb, mode, confidence, created_at): versioned, not overwritten
- `scores` (person_id, goal_id, value, why, created_at)
- `searches` (query, type, result jsonb, created_at): its own table, not inside a single meta document
- `nudge_states` (key, snoozed_until | dismissed_at) with TTL cleanup
- `briefs` (kind, period_key, markdown, sources, created_at)
- `imports` (type, status, counts, created_at) for an audit trail and re-runs
- `embeddings` (owner_type, owner_id, vector) for "Ask your network"

---

## 7. AI architecture

- All model calls happen **server-side** through the Anthropic API. No keys in the browser.
- Keep the prototype's prompts (`research`, `runDiscover`, `refreshRadar`, `writeBrief`, `genDraft`, `scoreBatch`, chat extraction, card scan) as a starting point. Move them into versioned prompt files with typed (Zod) output schemas, and validate and repair the JSON.
- Use Claude's **server-side web search tool** for research, Decode, Radar and brief news (in place of the Parallel Search MCP connector). Always return sources.
- Model tiers: a fast or cheap model for drafts, scoring, extraction and card OCR; a stronger model for research, Decode, Radar and briefs. Keep model IDs in config.
- Long jobs (research, radar, briefs, imports, batch scoring) run as **background jobs** with progress streamed to the UI and results persisted, so closing the tab doesn't lose work.
- Per-user rate limits and a usage meter (needed for pricing).
- Privacy: tell users what's sent to the model. Chat and voice raw text is processed, then discarded unless the user chooses to keep it. Don't use customer data for training.

---

## 8. Success metrics

- **Activation:** within the first session, at least 20 people imported or added, at least 1 goal set, and at least 1 touch logged.
- **Capture speed:** median time to log a touch under 10 seconds.
- **Weekly retention:** the user acts on at least 1 nudge per week (draft sent, touch logged, promise closed).
- **Outcome signal:** goal-pipeline stage moves per user per week.
