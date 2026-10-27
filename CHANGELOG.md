# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed: records open as sheets; People, Events and Discover as the prototype has them (P4, P5, P8)
- **Sheets:**
  - People and events open as a sheet over the page you're on: a panel from the right on a laptop, rising from the bottom on a phone. Back closes it, and a link or a refresh opens the same record as a full page.
  - Add person, Edit person, Add event, Edit event, and the import review open as sheets too.
  - Saving "Add person" or "Add event" shows the new record in its place.
- **Person record**, in the prototype's order:
  - Who they are, with a warmth ring and tags (warmth and days, fit score, goals, #tags), plus the fit reason.
  - A ★ priority toggle.
  - One row of actions: Log a touch, Draft message, Decode their world, Edit, and More.
  - Then Context (where you met, interests, notes, birthday, email and phone with Copy, profile links), Dossier, Promises (one checklist) and Timeline (with "+ Log a touch" and "Import chat history").
  - Introductions, events and goal stages follow.
- **Dossier:**
  - A source badge ("Live web · 6 sources").
  - "Look them up yourself" links (Google, LinkedIn, X, News).
  - "Add these N to their profile" accepts every missing detail at once.
- **Add person** follows the prototype field for field. Space, circle and reminder sit in a "More" fold.
- **People:**
  - "Your network", with how many people there are and how many are cooling.
  - Five ways in: + Add person, Import from Google, Scan a business card, Import contacts, Import a chat.
  - Search, and a sort that defaults to Priority.
  - Filter chips: All, Priority, Going cold, Needs context, No dossier, your circles and #tags.
  - Rows with warmth rings, "Met: …", fit scores and days since you spoke, then the legend.
- **Events** is one page, "Rooms that matter":
  - Next 30 days, with date tiles and at most two sessions per series.
  - Radar, with Scan for this week or Refresh radar, and cards with "+ My events" and "Decode".
  - Recurring, with attendance.
  - "Where your network gathers", the places you meet people most.
  - Past, folded.
- **Event record:** in the prototype's order (Decode the room, Notes, Attendance, Coming up, People), with the event page link in the actions. The form uses the prototype's labels (Title, Location, Repeats until).
- **Discover:**
  - The room decoder is Person / Place / Event, with one search box, "Decode" and "Add what you already know".
  - The result shows under it in the prototype's sections: Key facts, Key people, Your warm paths in, Opportunities for your goals, How to work the room, Sources, Look it up yourself, then "+ Add to my events" and "Clear result".
  - Recent rooms have date tiles.
- **Chat import** has the prototype's three steps:
  1. Choose a WhatsApp .txt or Telegram .json, or paste.
  2. "Which one is you?" with message counts and the date range, and who to save to (someone new is fine).
  3. Key moments, Promises and Details to add, then "Save to {name}".
- **Import review:**
  - Contacts on or off, "Skip N entries with no name", one checkbox per calendar (holidays and birthdays start unticked), "Also add upcoming events with no other guests", and "Your email address in these calendars" (remembered on your profile).
  - Then an "Import complete" summary with what was added, and links to sort new people or see events.
- **Moved:**
  - Sort new people → `/sort`
  - Duplicates → `/duplicates`
  - Ask your network → `/ask`
  - Suggestions → `/suggestions`
  - Suggested rooms → the Events page's Radar.
  - The old addresses redirect.

### Changed: the Goals tab is the prototype's "Profile & goals", and there's no set-up wizard (P6–P7)
- **Goals tab** (prototype L967–995), in the prototype's order:
  - The hero (your name, headline, "Edit profile & goals").
  - Goals as rows with a High/Med/Low badge, type, touches a week and people.
  - About you, then Goal-fit scores ("Score 60 people").
  - Import from Google (Connect Google, with the file steps in a fold).
  - Other sources (contacts files, calendars, chat history, business card).
  - Backup, Example network, Connections, then a link to Account.
- **Profile & goals sheet:** the prototype's questions, in one sheet that saves in one go.
  - Your name, Based in, Headline, Background, What you offer, Target industries, Your email addresses.
  - One row per goal: text, type, priority, touches a week, active, Remove; plus "+ Add goal".
  - Goals removed from the sheet are archived, not deleted.
- **Backup:**
  - "Download backup" downloads the file as soon as it's ready.
  - **Restore from backup** is new. It adds the people, rooms, touches, promises and goals from an Inroads backup (.zip or inroads.json) or the prototype's backup .json.
  - Restore never overwrites what you have: restoring onto the same account adds nothing twice. New ids keep a backup from another account separate.
- **No set-up wizard:**
  - Today's start card leads (Import from Google, Other contacts file, + Add person, Set goals, Load examples), and "Set goals" opens the Profile & goals sheet.
  - Time zone and phone region come from the browser the first time a new account opens Inroads. They're never changed for an account that's already set.
  - `/onboarding` redirects.
- **Settings is now "Account and Spaces":** profile basics, time zone, Spaces, connections, AI usage, sign out and delete. Backup and the example network moved to the Goals tab.

### Changed: Today as the prototype has it (P3)
- **Hero:** a stamp ("Mon 26 Oct 2026 · Daily brief"), "Good evening, Ada", a one-line summary ("2 rooms today · 3 cooling · 1 promise open") and a Today / This week toggle.
- **First-run and goals cards:** the prototype's "Start with the people you already know" card, with Import from Google, Other contacts file, + Add person, Set goals and Load examples. Then the "Set up" card when there are no goals.
- **Daily view:** Today's rooms with + Event. Each room shows a time column and prep cards (last touch, two talking points or "Research before you go", what you owe). Rooms with no one linked get "Decode this room". The brief follows inline as a card ("Written 2 h ago · Rewrite").
- **Weekly view:** "Week of …" with Rooms to be in, Going cold (with Draft), New openings and Goal progress, then the weekly brief and rooms found for your goals.
- **Nudges:** a grid of cards with a coloured mono kind label and the first action filled. "Going cold" uses the prototype's copy ("34 days since you spoke with Kemi"). "This week" cards are back for each room, with "Decode the room", or "See the plan" once it has one.

### Changed: the prototype's look and navigation (P1–P2 of docs/PROTOTYPE_GAP.md)
- **Look:** the prototype's colours (indigo on blue-grey, light and dark), fonts (Bricolage Grotesque, Geist, Geist Mono), pill buttons, 44px fields, rounded cards and warmth rings on avatars. App icons are now indigo.
- **Navigation:**
  - Five tabs as in the prototype (Today, People, Discover, Events, Goals): a bottom bar on phones and an 88px rail from 900px.
  - A sticky brand bar with a status pill ("Synced", "Sync stopped" or "Not connected", plus "AI off").
  - Quick capture moves to a + in the brand bar.
- **Discover tab** (`/discover`): "Know the room before you walk in", with recent look-ups. Old `/rooms/lookup` links redirect here.
- **Sheets:** they rise from the bottom on phones and slide in as a 620px panel from the right on desktop, with a sticky title bar.
- **Sync on open:** now a plain request instead of a server action, so it can't hold up other updates on the page.

### Fixed
- **Calendar sync keeps itself up to date.**
  - Opening Inroads syncs any connected account that's more than 10 minutes behind (calendar links: 30), on top of the 30-minute schedule. The page refreshes when it's done.
  - When Google needs you to sign in again, Today says so with a "Reconnect Google" button. Before, it only showed in Settings.

### Added: milestone 22 (Less static)
- **Work shows as it happens.** A running AI job lists its steps live ("Searching for …", "Reading …"), with earlier ones ticked and a shimmer bar. Results fade in one after another.
- **Progress feels like progress.** Goal bars grow into place, and a goal that hits its weekly target gets a "Week done" badge. Ticking a step gives a small pop and "Step done. Nice."
- **Motion.** Cards you can open lift on hover. Lists fade in with a short stagger. Dismissed follow-up cards slide away. All of it stops under the system's reduce-motion setting.
- **Character.**
  - People's initials sit on a colour tint picked from their name.
  - Rooms carry an icon for their kind (conference, dinner, mixer…).
  - Empty states are friendlier: "All caught up" when nothing needs you.
  - Today greets you for the time of day and names what's ahead ("Big week: Moonshot on Wednesday, and 1 more room.").

### Added: milestone 21 (Always a next step)
- Today has **Coming up this week**: the next seven days' rooms, each with where its plan stands (ready, with how many people and openings it found; preparing; or "Prepare for this room"). Upcoming rooms no longer also appear as "This week" follow-up cards.
- A plan opens with **What to do next**: numbered steps (add the people worth meeting, ask for intros, turn openings into goal steps, what happens on the day) with progress, each linking to its part of the plan.
- **Who to meet** has one goal choice for everyone (not a picker per person), an **Add all** button, and a clear "Add to …" button on each person.
- An event look-up that isn't a room yet offers **Add as a room**: the form opens filled in (name, dates, times, venue, event page, notes, goal) and the look-up becomes the room's plan.
- The sidebar **collapses** to icons; the choice is remembered in this browser.

### Changed: milestone 21
- Everything you can click shows a pointer, and disabled controls show not-allowed (Tailwind 4's reset had dropped it on buttons).
- Ghost buttons use the accent colour so they read as buttons; the Rooms page's "Find rooms for my goals" and "Look something up" are buttons with icons.

### Added
- `AI_UNLIMITED_EMAILS`: sign-in emails exempt from the daily and per-person monthly AI limits (the owner while testing). The whole-app monthly cap still applies.

### Added: milestone 20 (Walk in prepared, follow up in one tap)
- **Today's agenda prepares you:** each person you'll see has two talking points from their research, or a button to research them before you go. Rooms link to their plan. The "You meet X soon" card offers **Research now**.
- **People you're meeting in the next two days are researched automatically** at your brief time (up to three a day).
- **Conferences, mixers and dinners in your calendar become rooms** even with no other guests, and the next ones get a plan after a sync.
- **Look up their world** on a person's page, and **Give Inroads more to work with**: paste a bio or LinkedIn About to sharpen research.
- **Draft from Today's cards:** due, birthday and "they owe you" cards draft a message ready for WhatsApp.
- **Goals in set-up:** a new step asks what you're working towards (pick or write), and Today asks if you have none.
- The research section shows company, career, shared ground and what matched your saved details.

### Added: milestone 19 (Proactive: rooms prepare themselves, people get researched)
- Add someone by name (form, quick capture, share, "Who did you meet?", a goal) and Inroads researches them straight away. Their role, company, city, profiles and the goal they fit come back as suggestions to keep or dismiss. Their page shows the research running.
- Add a room by name and press **Find details**: the web fills in the date, time, venue and event page, and the same search becomes the room's plan. Rooms you add by hand without it are prepared in the background.
- A room's page shows **Your plan**: who to meet and why, who can introduce you, openings for your goals with a first move, and tips. **Prepare** or **Prepare again** runs it on demand.
- One tap turns the plan into action: **Add to goal** saves the person, puts them on the goal and links them to the room. **Add as a step** puts a first move on the goal.
- Goals have **Next steps** you can tick off, and steps due soon are on **Today**.
- Every week, at your brief time, Inroads looks for events that serve your goals and shows this week's on **Today**.

### Changed
- Add a room, after **Find details**: what it found (overview, key facts, multi-day dates) goes into the notes, a preview shows who to meet, and the goal its openings serve is picked for you. Event look-ups now gather ticket and registration details, who attends, headline speakers and sponsors, agenda themes and side events.
- **Serves goal** on a room has **+ New goal…**, so you can make a goal without leaving the form, and it's always shown, even before you have goals.
- Connections: Google comes first; a calendar link, phone contacts and files are folded under "Other ways to add people" (optional). Sources this server hasn't been set up for (such as Outlook without keys) are no longer shown. The calendar link says it isn't needed for Google Calendar.

### Fixed
- Add a goal: the browser no longer pre-fills the goal with something you typed before.
- Goals with nothing added yet showed "Add a goal" twice; the header button is enough.
- Dropdowns have room on the right for their arrow, which now follows the theme. In forms, a field with a hint no longer pushes the fields beside it out of line (Add a room: Date, Starts, Ends).
- Background jobs never ran in production: the sign-in check redirected Inngest's calls to `/api/inngest` to the sign-in page. That endpoint is now let through (Inngest signs every request).

### Added: milestone 18 (Ask your network)
- Ask a question about the people you know, in your own words ("Who do I know in fintech in Accra who's raised before?"), in People or from ⌘K.
- You get up to 8 people with a reason for each, citing what you've recorded about them. Only one Space is searched at a time.
- With AI set up, the question is widened and the results are ranked by the model (20 a day); without it, Inroads matches the words in your question.

### Added: milestone 17 (Room ROI)
- A room's page shows what it has led to: the people you met there, how many you've kept in touch with (and in the last 60 days), and who has moved forward on your goals since, person by person.
- Repeating and past rooms in the list show "Met 6 · 4 in touch".

### Added: milestone 16 (Intro requests)
- "Ask for an intro" on a person's page: see who in that Space could introduce you and why (they know them, they work at the same company, you've seen them at the same rooms), or pick anyone.
- A consent-first message to send by WhatsApp or email, or to copy. Pick a goal and the person moves to "Warm path found".
- The intro is tracked as a promise the connector owes you, with a reminder on Today if it's late. Tick it done when it happens: the person moves to "Introduced" and Inroads remembers who introduced you.

### Added: milestone 15 (Pipeline drag and fit)
- On desktop, drag people between stages of a goal's pipeline. The stage picker and `[` / `]` still work.
- A person's fit for the goal shows on their card with the reason, and you can order each stage by best fit, recently moved or name.

### Added: milestone 14 (Voice debrief)
- Record a voice note in the capture sheet: say who you met and what was promised, press Stop, and check what was read before saving. Your browser turns speech into text; no audio is sent to Inroads.
- Quick capture now takes up to 1,000 characters.

### Added: milestone 13 (Share target)
- Install Inroads on Android and it appears in the share menu of other apps.
- Share a LinkedIn (or X, Instagram, TikTok, GitHub) profile to add that person, with their name, role and company filled in from the page. If you already have them, Inroads opens them instead.
- Share a WhatsApp message or any text to read it like a quick capture.
- Share a contact card (.vcf) or calendar file to go straight to the import review.

### Fixed
- Quick capture could put what you typed in the address bar if you pressed "Read it" before the page had finished loading.

### Added: milestone 12 (After the room)
- The day after a room, Today asks "Who did you meet at X?". Tick the people you met (anyone linked to the room is listed), add people you know or someone new, note what you talked about, and choose when to follow up: tomorrow, in 2 days, or not.
- Saving logs that you went, links them as "met there", logs a touch with each and puts the follow-ups on Today. New people get where and when you met filled in.
- "I didn't go" clears the card. Past sessions on a room's page have a "Who did you meet?" link too.

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
