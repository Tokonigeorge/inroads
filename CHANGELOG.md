# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added: milestone 11 (Quick capture)
- Type one line, like "Met Ada, partnerships @ Paystack, wants intro to Tola by Friday", and Inroads reads it into who, how you were in touch, what was promised (and by whom) and when to follow up.
- Check it before saving: pick someone you already know or add someone new, edit the touch, tick or edit each promise, set a follow-up date.
- In the capture sheet (the + button, or `c`), and from ⌘K: type anything and choose "Capture".
- Works offline: the line is read on your phone and saved when you're back online.
- With AI set up, the line is read by the model (60 a day, then the built-in reader takes over).

### Added: milestone 10 (Settings)
- Settings → Profile: name, what you do, where you're based, background, what you can offer, industries, time zone, phone country and brief time.
- Daily briefs are prepared at your brief time in the Spaces where you read them (with background jobs set up).
- Export your data: a .zip with everything as JSON, plus spreadsheets of your people, touches, promises and rooms. Made in the background and kept for 7 days.
- Delete your account: type your email to confirm. Connected accounts are revoked and everything is removed.
- Settings links to your goals, import history and AI usage; "Edit your profile" and "Export your data" are in the ⌘K palette.

### Fixed
- File uploads could be ignored if you chose files before the page had finished loading.

### Added: milestone 9 (AI)
- Research a Work contact: a summary, talking points and sources, with suggested details (company, role, city, social links) to accept, edit or discard. Research can be deleted.
- Personal and Dating: "Get to know" gives conversation starters from what you saved, and "Check they're real" gives a quick safety check. Dating never offers full research.
- Draft a message to anyone, in your voice, then copy it, open it in WhatsApp or email, and log it as a touch.
- Import a chat (pasted or the exported .txt): promises, touches and interests come back as suggestions. The chat itself isn't kept.
- Scan a business card from the capture sheet to fill in the Add person form.
- Look up a person or company: who they are, why it matters to your goals and who in that Space could introduce you.
- Suggested rooms: events worth going to for your goals, which you can add as rooms.
- Daily and weekly briefs on Today, one per Space.
- "Who could help" on a goal suggests people to add to it.
- Settings → AI usage shows what you've used today and this month. Each feature has a daily limit and there is a monthly allowance.

### Added: milestone 8 (File imports and merging)
- Import contacts and calendars from files, in Settings → Connections → Files:
  - vCard (.vcf) from iPhone, Android (including old quoted-printable exports), Google and Outlook.
  - CSV from Google (current and older layouts), Outlook and LinkedIn connections (with "connected on" as when you met).
  - Calendar .ics files, and .zip archives such as Google Takeout or LinkedIn's data export.
- A review step before anything is saved: how many new people, details filled in, already up to date, possible duplicates and calendar events, with the new people listed. Choose the Space, then import or cancel. New people go to the sorting queue.
- Importing the same file twice adds nothing. 5,000 contacts import in a few seconds.
- Possible duplicates (same name, no shared email or phone) can be reviewed side by side in People → "Review possible duplicates": choose who to keep and which details win, or keep both. Everything they had moves across, and a merge can be undone for 30 days.

### Added: milestone 7 (Today)
- Today's rooms, in your time zone, with a prep line for everyone you'll see: what they do, your last touch and anything you owe them.
- A follow-up feed that tells you who to get back to:
  - Birthdays this week, promises you owe (overdue first), promises they owe you that are late.
  - People due a touch by the reminder you set, prep for meetings in the next 3 days, rooms this week, new people missing context, and one small "Sort 5 new people" card a day after an import.
  - Each card has its actions: Mark done, Log a touch, Open, Snooze or Hide. Snooze, hide and done have Undo.
- Today follows the Space switcher: one Space, or all of them.
- ⌘K (Ctrl K) palette: jump to any person, room or goal, run any command, or switch Space. A search button opens it on phones.
- Keyboard: `g` then `t`, `p`, `r`, `g` or `s` goes to a section; `?` shows every shortcut.

### Added: milestone 6 (Goals)
- Goals per Space: what you're aiming for, kind, priority, touches a week and an optional finish date. Pause, archive or delete.
- A pipeline for each goal, using the Space's stages or its own (e.g. hiring stages for a hiring goal):
  - Desktop shows a column per stage; on a phone the stages are stacked.
  - Change anyone's stage from their card, or press `[` / `]` on desktop. Every move is recorded, and recent moves show on the goal.
  - Add people you know, or someone you want to meet by name. Remove with Undo.
- Weekly progress that counts real things: touches with people on the goal, sessions you went to of rooms tied to it, and people moving forward or won.
- Goals list grouped by Space with this week's meter and a one-line summary.
- A person's page shows their goals with a stage picker, and can add them to another goal in their Spaces.

### Changed
- The pipeline-stage editor is shared between Spaces and goals.

### Added: milestone 5 (Connections)
- Connect Google (Contacts and Calendar, read-only) and Outlook (Microsoft 365 and Outlook.com), from Settings → Connections or during onboarding.
  - Tokens are encrypted at rest; scopes are the narrowest read-only ones.
  - The first sync starts as soon as you're back from Google, with live progress ("Reading your Google contacts (1,200 so far)").
  - Re-syncs every 30 minutes with Inngest, only fetching what changed. "Sync now" and "Disconnect" on each account.
  - An expired Google connection says "Needs reconnecting" instead of failing silently.
- Calendar links: paste an iCloud public calendar, Outlook "publish" link or any `.ics` URL. Links are fetched safely (https only, public addresses only, size and time limits) and stored encrypted.
- Phone contacts on Android through the Contact Picker. Only the people you pick are shared.
- Imports, for all of the above:
  - Matches by external id, then email, then phone. A name-only match never merges; it's flagged as a possible duplicate.
  - Existing people gain missing details without anything being overwritten.
  - Past meetings become touches; events become rooms (repeating ones too), with people linked by role.
  - Recent imports in Settings → Connections, each with Undo.
- Sorting new people (People → "Sort N new people"): everyone gets a suggested sort with a reason. Use the suggested sort for everyone in one go, or go one at a time with Priority, Keep or Not now and an optional reminder.
- Onboarding: your name, time zone and phone country, then connect, then sort. Today shows "Finish setting up" until it's done.

### Fixed
- Loading placeholders had a label but no role, which screen readers ignore. They're now announced as loading.

### Added: milestone 4 (Rooms)
- Repeating rooms, ported from the prototype's `occurrences()` and `nthWeekday()`:
  - Weekly (on several days), every 2 weeks, monthly (on a date, or the 1st–5th or last weekday), every 3 months, yearly, with an optional end date.
  - Calendar repeat rules (RRULE) are read and written, including UNTIL, COUNT and BYSETPOS. Rules Inroads can't represent are kept as-is and flagged.
  - Tests compare the port against the prototype's own code on 3,000 random series, and run in several time zones.
- Time zones: every room has its own zone, and times are shown in yours, e.g. "1am (8pm New York)", correctly across daylight-saving changes.
- Rooms screens (list on the left, room on the right on desktop):
  - Upcoming (next 60 days, by day), Repeating (with "went 4 of 6"), and Past.
  - Room page with people by role (going, met there, speaking, organising), "Did you go?" for each past session, the next dates, notes and the goal it serves.
  - Add or edit a room with a repeat builder (days of the week, nth weekday, until) and a time-zone picker.
  - Delete with Undo.
- Linking people to rooms only offers people from the room's Space. Moving a room with people in it to another Space is refused.
- A person's page lists their rooms. The capture sheet's "Add a room" now works.

### Fixed
- Faded Delete and Remove buttons failed colour contrast. They now use the standard muted colour.
- People and Rooms pages were sent to the browser twice while loading (once inside a loading fallback). The list/detail layout now decides which pane to show with a small marker and CSS, so each page is rendered once, which matters on slow connections.


### Added: milestone 3 (People)
- People list built for 10,000+ people:
  - Pages load as you scroll, and only the rows on screen are drawn.
  - Search covers name, role, company, city, email, phone digits, where you met, notes and tags.
  - Filters: priority, due for a touch, needs context, no touches yet, not sorted yet, archived. Filter by circle or tag too.
  - Sorts: name, last spoken to, most overdue, recently added.
  - Shows when you last spoke ("3 weeks ago") or how overdue someone is.
- Desktop shows the list on the left and the person on the right; on mobile each takes the full screen. Keyboard: `/` search, `j`/`k` move, `l` log a touch, `e` edit, `c` capture.
- Person page:
  - Contact links (call, WhatsApp, email, profiles).
  - Promises both ways ("You owe" / "They owe"), with due and overdue dates.
  - Timeline of touches.
  - One section per Space (where you met, reminder, circle, interests, tags, notes, opportunities), plus goals and birthday.
- Adding and editing people:
  - Emails are lowercased.
  - Phones are stored in international format using your region, so 0803… becomes +234803…, and invalid ones are explained instead of saved.
  - Add someone to another Space, or remove them from one (which deletes what you logged there).
- Archive and unarchive, and delete with Undo. Deleted people can be restored for 30 days.
- Reminders you set: per person, then circle, then Space default, or never. People who've never been touched count from when they were added or sorted, so they don't disappear.
- Circles in Settings → Spaces (e.g. "Investors: every month").
- One capture sheet for the whole app (mobile + button, `c`, buttons on a person's page): add a person, log a touch (with an optional promise), add a promise. The last touch type you used is remembered.
- Offline capture:
  - Adding people, logging touches, adding promises and ticking promises done all work without a connection.
  - They're saved on the phone and sent when you're back online, in order and without duplicates.
  - A notice shows what's waiting.
- APIs: `POST /api/v1/capture`, `GET /api/v1/people`, `GET /api/v1/spaces`.
- Tests:
  - Unit tests for normalisation, reminders and "last spoke".
  - Database tests for every list filter and sort, paging through 10,000 people, Space removal, undo and isolation.
  - Browser tests for the main People flows, including going offline and coming back.

### Fixed
- After an offline capture, the app no longer tries to refresh the page, which used to land on the offline screen.


### Added: milestone 2 (Spaces)
- Settings → Spaces:
  - Add a Space by choosing a type: Work, Personal, Dating or Other.
  - Rename, reorder, archive and unarchive Spaces. Delete a Space only when it's empty.
- Per-Space defaults: the default reminder, the research mode (only the options the type allows), and pipeline stages (rename, reorder, add, remove, mark as an end state).
  - Renaming a stage keeps people's pipeline positions.
  - Removing a stage that people are at is blocked with a clear message.
- Space switcher (sidebar on desktop, header on mobile):
  - Appears once two Spaces have people in them.
  - Remembers your choice, and People, Rooms and Goals follow it.
- Mobile header with a Settings link (Settings was unreachable on mobile before).
- Space-scoped AI context loaders. Prompts can only see one Space's notes, touches, promises, goals and research; tests prove Dating details never reach Work.
- Database: full research is now Work-only for every other Space type, including Other, and a Space's type can't change after creation.


### Added: milestone 1 (scaffold, auth, schema, example data)
- Next.js 16 app with TypeScript strict, Tailwind v4 design tokens (light and dark), and base components: Button, Field, Input, ListRow, Avatar, PageHeader, Section, EmptyState, Sheet and Toast.
- App shell: sidebar on desktop; on mobile, a bottom nav with a central Capture button. Today, People, Rooms, Goals and Settings pages.
- Sign-in with Google through Supabase Auth. Email magic links are built but off until there's a domain. A proxy refreshes sessions and redirects signed-out visitors.
- Full P0 schema (25 tables) as Drizzle + SQL migrations:
  - Row-level security on every table.
  - Every request runs as the `authenticated` role, so RLS applies to server code too.
  - Cross-account references and cross-Space links are rejected by triggers.
  - OAuth token columns can't be read by users.
  - People are modelled as a graph (`people` + `person_spaces` + `person_links`).
  - New accounts get a profile and Work, Personal and Dating Spaces.
- Example Lagos network (6 people, 4 rooms, 2 goals). Load and remove it from Settings.
- PWA manifest, icons, and a service worker with an offline page.
- Tests:
  - Unit tests for date handling.
  - Database tests for RLS isolation, Space sealing, the research guardrail, triggers and example data.
  - Playwright smoke tests on desktop and mobile with axe accessibility checks in both themes.
- GitHub Actions CI: typecheck, lint, unit and database tests, build, end-to-end tests.

### Changed
- Moved the prototype to `prototype/index.html`.

### Added: planning
- `docs/TECH_PLAN.md`: stack, schema with RLS, prototype → module map, AI layer, integrations, screens, P0 milestones and open questions.
- `docs/DESIGN_SYSTEM.md`: tokens, components, copy rules and three example screens.
- `docs/DECISIONS.md`: decisions made during planning.
