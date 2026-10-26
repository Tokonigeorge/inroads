# Decisions

Product and engineering calls made where the brief or prompt left room. Newest first. Each entry: decision, why, and how to reverse it.

## 2026-10-26: Profile & goals, backup and restore, no wizard

150. **The Goals tab is the prototype's "Profile & goals" and holds what the prototype keeps there.** That covers profile, goals, scores, imports, backup, examples and connections. Time zone, phone region, brief time, Spaces, AI usage and account deletion are the app's own additions, so they sit on an Account page linked from the bottom of Goals. Goal pipelines stay as drill-ins from each goal row.
151. **Restore only adds.** It gives every restored row a new id unless that id already exists in this account, so a backup from another account can't collide, and restoring your own adds nothing twice. Goals are matched by text within a Space. The profile is filled only where it's empty. Research, scores and searches aren't restored; they're cheap to regenerate and tied to the old ids.
152. **No set-up wizard.** The prototype asks its questions in the Profile & goals sheet and leads with a start card on Today. A new account's time zone and phone region come from the browser once, and never for an account that has already set them (or finished the old set-up).

## 2026-10-26: the prototype is the UI/UX spec

147. **The prototype (`prototype/index.html`) is now the spec for the UI, the flows, the questions asked and the copy, not only the behaviour.** This supersedes the brief's "don't port it as-is" (PRODUCT_BRIEF §5), the design direction in DESIGN_SYSTEM §1–4 (green, Inter and Newsreader, no mono, no cards) and decision #3 (renaming Decode and Radar). Owner feedback: the app "focuses on the wrong thing" and "isn't the same as the other one". The backend stays: Supabase with RLS, Google and Outlook sync, Inngest AI jobs, staged imports. `docs/PROTOTYPE_GAP.md` lists every difference and the milestones; `docs/PROTOTYPE_PROMPTS.md` does the same for the AI prompts.
148. **Tokens, fonts and shapes are the prototype's**: indigo `#2B44C8` on blue-grey, Bricolage Grotesque, Geist and Geist Mono, 16px cards, pill buttons and warmth rings on avatars. One deliberate change: small text uses a darker grey than the prototype's "faint" (`#656C80` light, `#8A93A8` dark), because the prototype's is below 4.5:1. Borders and inactive icons keep the prototype colour.
149. **Five tabs, as in the prototype**: Today, People, Discover, Events, Goals. They sit in a bottom bar on phones and an 88px rail from 900px, under a sticky brand bar with the status pill. Quick capture, the app's own addition, moves from a central tab-bar button to a small + in the brand bar, so the tabs stay five equal ones. Settings stays reachable from a gear in the brand bar until it moves into the Goals tab (gap report M6).

## 2026-10-26: sync on open

145. **Opening the app syncs accounts that are behind**, as well as the 30-minute scheduled sync. Feedback was that the calendar "doesn't auto-sync"; the schedule alone depends on Inngest's cron and can lag by up to 30 minutes. Throttled per browser session (10 minutes) and skipped when a sync is already running. Google push notifications were considered and left for later: they need a channel renewal job and public domain setup, and sync-on-open covers the moment it matters (when you look).
146. **"Needs reconnecting" is shown on Today**, not only in Settings, because a silent stop is what made sync look broken.

## 2026-10-25: milestone 22 (Less static)

142. **Motion is CSS-only, calm and switch-offable.** A handful of utilities (rise, lift, grow, pop, leaving, shimmer, glow) instead of an animation library: no extra JS on a cheap phone, 150–600ms, no bounce, and all stopped (delays too) under `prefers-reduced-motion`.
143. **Avatar colour comes from a hash of the name** (a hue on an OKLCH tint, lightness set per theme), so the same person is always the same colour and contrast holds in light and dark. This revises the earlier "initials on sunken" rule, which read as lifeless.
144. **The greeting is computed from the user's local hour and what's ahead**, in order: today's rooms, then the week's, then follow-ups, then a quiet-day nudge. Pure function with unit tests; the hour is read on the server in the user's time zone.

## 2026-10-25: milestone 21 (Always a next step)

137. **Every screen that results from AI work says what to do next.** A plan opens with numbered steps and progress counts; Today lists the week's rooms with each plan's state. Feedback was "I'm not sure what to do next", so the next action is named, not implied.
138. **One goal choice per plan, not per person.** A select beside every row read as a form to fill in. The plan's people share one choice (shown as a sentence when there is only one goal), with "Add all" and a per-person "Add to …" button.
139. **Upcoming rooms live in Today's "Coming up this week", not in the follow-up feed.** A "This week" card with only Open/Hide duplicated the room and hid its plan state; the list shows ready / preparing / prepare instead.
140. **Sidebar collapse is a per-browser preference** (localStorage), not a profile setting: it's about screen size, not the person. The server renders it open, so a collapsed sidebar can show open for a moment on load.
141. **Clickable things show a pointer, globally.** Tailwind 4's preflight resets buttons to the default cursor; a base rule restores pointer on buttons, summaries, selects, checkboxes, radios and their labels, and not-allowed when disabled.

## 2026-10-25: testing allowance

136. **`AI_UNLIMITED_EMAILS` lifts the daily and per-person monthly AI limits for listed sign-in emails**, so the owner can test without raising limits for every tester. The whole-app monthly cap (`AI_APP_MONTHLY_USD`) still applies to everyone, as the backstop on spend.

## 2026-10-25: milestone 20 (Walk in prepared, follow up in one tap)

128. **Built from a comparison with the prototype.** A feature-by-feature check of `prototype/index.html` against the app found five gaps that matter most for meeting investors and clients at events. M20 closes them; the smaller ones (dossier sections, place suggestions, Telegram chat import, restore from backup, "Where your network gathers") are listed for later.
129. **Today's agenda carries talking points.** Each person you'll see today shows the top two talking points from their latest research in that room's Space, or a "Research them before you go" button. Rooms that aren't plain meetings link to their plan ("Prepare for this room" or "Your plan for this room"). The "You meet X soon" card offers **Research now** first when they haven't been researched.
130. **People you're meeting in the next two days are researched at your brief time**, at most three a day, within the Space's research mode and the daily limit, for people who signed in within 30 days. *Why:* calendar-synced attendees are never auto-researched on import (decision #122); this researches just the few you're actually about to see.
131. **Calendar events that are events become rooms.** An upcoming entry in your own calendar whose title says what it is ("… Conference", "… Summit", "… Mixer", "… Meetup", "Founders breakfast", "… Hackathon") becomes a room of that kind even with no other guests. Meetings with others stay rooms of kind "meeting", and appointments ("Dentist", "Lunch with Kemi") stay out. A sync then prepares up to two such rooms happening in the next three weeks that have no plan yet. The title rules live in `domain/room-kind.ts`.
132. **Look up their world** (Work Spaces) runs a person look-up from their page with everything saved about them, and opens the result. **Give Inroads more to work with** takes pasted text (LinkedIn About, a bio, a speaker page) for that research or look-up only; it isn't stored.
133. **Cards offer a draft:** "Draft a message" when someone's due, "Draft a note" on a birthday, "Draft a nudge" when they owe you. The draft opens in the same sheet as on a person's page, ready for WhatsApp, email or copying. Without AI these buttons don't show.
134. **Goals are part of set-up** (About you → What are you working towards → Bring in your people). Pick from common goals or write your own; they're saved in Work. Today asks once there are no real goals ("Set your goals"), and from there the step returns to Goals. *Why:* look-up openings, fit, briefs and suggested rooms are generic without goals.
135. **The research section shows more of what research found:** company, career, shared ground and what matched your saved details. These were already generated and stored, just not shown.

## 2026-10-25: milestone 19 (Proactive: rooms prepare themselves, people get researched)

121. **Inroads does the research first; you keep what's right.** Owner feedback from the first real test: "people don't want to fill forms… it should find it and suggest what to keep." So typing a name is enough. Everything found still arrives as suggestions or a plan to act on; nothing is saved without a tap (as with research suggestions since M9).
122. **Someone added by hand is researched automatically**: from the person form, quick capture, the capture sheet, a share, "Who did you meet?", or a goal's "add someone new". The capture API only researches people it actually created, so a replayed offline capture doesn't trigger it twice. Imports and calendar syncs are never auto-researched (hundreds of people would cost too much). It respects the Space's research mode and the daily research limit (5); past the limit it quietly skips and the Research button still works. The person's page shows the research running (job kind `ai:research:<personId>`).
123. **A room has a plan.** A room look-up is stored as a search with `event_id` set (`searches.event_id`, checked to be in the room's Space). The plan shows on the room page while the room is upcoming: who to meet (with why), who can introduce you, openings for your goals with a first move, and tips. It is made three ways: **Find details** on Add a room (one search fills the date, time, venue, time zone and event page, and becomes the room's plan when you save), automatically when you add a room by hand without it (not for plain meetings, not for calendar syncs), or with **Prepare** on the room.
124. **The look-up schema gains `when`** (`lookup@2`): start/end date and time, the venue's time zone, venue and event page. Only well-formed, not-in-the-past values are kept; otherwise the form keeps what you typed.
125. **Plans turn into actions in one tap.** "Add to goal" saves the named person (or reuses your contact with the same name in that Space), adds them to the goal at its first stage, and links them to the room as speaker, organiser or attendee from their role, then researches them. A role without a name ("Investor relations lead") can't be saved until someone's found. "Add as a step" puts an opening's first move on the goal.
126. **Goals get steps** (`goal_steps`: text, optional due date, done, and the plan it came from). They're on the goal page ("Next steps"), and steps due within two days are on Today ("Steps due"). A step from a room's plan is due the day before the room, or within a week. *Why not promises?* Promises are owed to or by a person; a step like "book an office-hours slot" often has no one attached yet.
127. **Rooms for your goals are found every week without asking.** At the user's brief time, each Space with an active goal gets a Suggested rooms search if none ran in the last 7 days and the owner signed in within 30 days (so inactive accounts don't spend). Today shows up to three found for this week, with "Add as a room". The radar limit (2 a day) and the monthly caps still apply.

## 2026-10-24: milestone 18 (Ask your network)

118. **Ask your network searches one Space at a time** (decision #1), across what you've recorded there: name, role, company and city, your notes, interests, tags, where you met and opportunities, the latest research, and recent touch summaries. People from other Spaces are never candidates and never reach the model.
119. **Two fast-model calls, counted as one use** (limit 20 a day): the first widens your question into search terms (synonyms, related words), and the second ranks up to 30 Postgres matches, picks at most 8 and gives a reason that cites what you recorded. Ids the model returns are checked against the candidates, so it can't invent people. Without AI, or past the limit, you get the best word matches with the words they matched.
120. **The email brief (P2) waits for a sending domain**, so P2 ships with M15–M18. When there's a domain: Resend, the brief time from Settings, and an unsubscribe link.

## 2026-10-24: milestone 17 (Room ROI)

116. **"What it's led to" counts only what you recorded.** People you marked as met there (M12), touches with them after the day you met (the debrief's own touch doesn't count), whether the latest is in the last 60 days, and forward moves or wins on goals in that Space since you met. Nothing is inferred from who was merely invited. A room with nothing recorded says how to start.
117. **The rooms list shows "Met 6 · 4 in touch"** on repeating and past rooms, so you can see which rooms are worth your evenings at a glance. Per-room detail is on the room page.

## 2026-10-24: milestone 16 (Intro requests)

112. **An intro request is a promise the connector owes you** (`commitments.kind = 'intro'`, `about_person_id` = who you want to meet, optional `goal_id`), as planned in TECH_PLAN §2.4. It reads "Introduce you to Tunde Bakare", is due in a week, and shows on Today like any late promise. The database checks that both people and the goal are in the same Space.
113. **Warm paths come from your own data in that Space:** people you've linked to them, people at the same company, and people linked to the same rooms. Each comes with its reason. Anyone else in the Space can be picked too. Dating Spaces don't offer intros.
114. **The ask is consent-first** ("Would you be open to asking if they'd be happy to be introduced?"), written from a template and editable, then opened in WhatsApp or email, or copied. Inroads never sends it. "I've asked" logs a touch with the connector.
115. **Goals move with the intro.** Asking moves the person to "Warm path found" (adding them to the goal if needed), and ticking the intro done moves them to "Introduced", but only forward, and only if the goal has those stages. Done also records who introduced you, which shows up as a warm path later.

## 2026-10-24: P2 plan and milestone 15 (Pipeline drag and fit)

108. **P2 is built as M15 Pipeline drag and fit, M16 Intro requests, M17 Room ROI, M18 Ask your network.** The daily brief by email waits for a sending domain (decision #15: no domain yet). Resend can only send to the account owner's own address without one.
109. **Drag and drop uses the browser's own drag events on desktop.** Phones keep the stage picker, and the picker plus `[` / `]` stay on desktop, so dragging is never the only way to move someone (WCAG 2.5.7). The stage you drop on is highlighted.
110. **The fit score is a hint, not the main signal.** The latest score for that goal shows on the card with its reason ("Fit 86 · Invests at your stage"), and "Best fit" is one of three orders, alongside "Recently moved" (the default) and "Name".
111. **"Ask your network" (M18) uses Postgres search plus the fast model, not embeddings.** The model turns the question into search terms and filters, Postgres finds candidates in that Space (people, notes, research, touches), and the model ranks them and says why, citing only what was found. *Why:* the Anthropic API has no embeddings, and the free-tiers-only rule rules out a paid embeddings service. pgvector stays installed for later.

## 2026-10-24: milestone 14 (Voice debrief)

105. **Voice uses the browser's speech recognition and feeds quick capture.** Press "Record a voice note", talk, press Stop: the words appear as you speak, and stopping reads them straight away with the same review as a typed line. No audio reaches Inroads. Recording stops by itself after 90 seconds. Where the browser has no speech recognition (Firefox, some in-app browsers), the button isn't shown.
106. **Quick capture takes up to 1,000 characters** (was 500), enough for a 30–60 second voice note. Speech often comes out in lower case, which the rules parser can miss (it looks for capitalised names), so voice works best with AI set up. The review form is always there to fix a name.
107. **P1 is complete** (M11–M14). Next is P2 from the brief (see #108).

## 2026-10-24: milestone 13 (Share target)

101. **The installed app is a share target** (`share_target` in `app/manifest.ts`, a multipart POST to `/share`). Android Chrome supports it; iPhone Safari doesn't offer web share targets yet, so there you paste a link or line into quick capture instead.
102. **What's shared decides what happens.** A profile link (LinkedIn, X, Instagram, TikTok, GitHub) becomes "Add this person", prefilled from the shared page title ("Name - Role - Company | LinkedIn") or the link itself. If someone already has that link, Inroads opens them instead of adding a duplicate. Contact and calendar files go to the usual import review. Anything else (a WhatsApp message, a note) opens in quick capture.
103. **Shared links and text wait as a `share` import, not in the URL,** so they never end up in browser history or server logs. They're deleted when you add or discard them, and after 2 days by the daily clean-up. They don't show in import history.
104. **Quick capture's "Read it" button waits for the page to hydrate.** Before that, the browser would submit the form itself and put the line in the URL.

## 2026-10-24: milestone 12 (After the room)

97. **"Who did you meet at X?" appears for rooms, not 1:1 meetings, the day after and the day after that,** until you record the session either way. Its key is `after:<eventId>:<date>`, as planned in TECH_PLAN §2.4. Recording it is what clears it: saving marks that you went, "I didn't go" marks that you didn't.
98. **Saving who you met** links each person as "met there" for that session, logs one touch per person (type "event", dated the session, with your note) and adds a follow-up promise you owe tomorrow or in 2 days (you choose, or none). New people join the room's Space with where and when you met filled in. New people get an id from the browser and touches are keyed per person and session, so saving twice adds nothing.
99. **Only people already in the room's Space can be picked;** anyone else is added as someone new there. This keeps Spaces separate (decision #1).
100. **Pages that change after the debrief are revalidated with `revalidatePath`** (Today and the room), which in this version of Next also refreshes pages you visited before, so the card is gone when you go back.

## 2026-10-24: P1 plan and milestone 11 (Quick capture)

91. **P1 is built as four milestones: M11 Quick capture, M12 After-the-room follow-up, M13 Share target, M14 Voice debrief.** Voice uses the browser's built-in speech recognition (owner decision): free, no new key, nothing stored by Inroads; where a browser doesn't support it, you type instead.
92. **Quick capture reads a line two ways.** A rules parser (`src/domain/quick-capture.ts`) runs anywhere, including offline on the phone, and handles the common shapes ("Met Ada, partnerships @ Paystack, wants intro to Tola by Friday"). When AI is set up, the fast model reads the line instead (limit 60 a day), and the rules parser takes over if the model fails or the limit is reached. Either way you review everything before it's saved.
93. **Matching people never merges by name.** The review offers people in that Space whose name matches, picks one only on an exact full-name match, and otherwise defaults to "Someone new".
94. **A follow-up date becomes a promise you owe** ("Follow up with Ada", due that day), so it shows on Today with the promises you already track. *Reverse:* a dedicated follow-up nudge kind.
95. **Saving a quick capture sends the usual captures in order** (person, touch, promises) through the offline outbox, so it works offline and replays safely. Dates use "today" in the device's zone, like the other capture forms.
96. **In the ⌘K palette, anything you type can be captured**, and the Capture option comes after any matching person, room, goal or command, so "add a room" still runs the command.

## 2026-10-24: milestone 10 (Settings)

86. **Exports are kept in Postgres (`exports`, a zip per user), not Storage, and downloaded through `/api/v1/exports/[id]`** under RLS, so only the signed-in owner can fetch one. A new export replaces the old one, and exports are deleted after 7 days. *Why:* nothing else uses Storage (files are parsed in memory, #70), and a session-checked download is safer than a signed link that works for anyone holding it. *Reverse:* write the zip to a private bucket and hand out a short-lived signed URL.
87. **The export has every table as `inroads.json` plus four CSVs** (people with one row per Space, touches, promises, rooms). Connection secrets never leave the database; staging rows, jobs, nudge states and AI usage are left out as housekeeping. CSV cells that a spreadsheet would run as a formula are prefixed with `'`, but phone numbers like `+234…` are left alone.
88. **Deleting an account** asks for the email typed exactly (case doesn't matter), asks Google to revoke its tokens, forgets every stored secret, then deletes the sign-in through the Supabase Admin API (or the `auth.users` row directly without a service key), which cascades to every row. There is no grace period: the confirmation step is the safeguard, and the copy points to Export first.
89. **Daily briefs are prepared at your brief time only in Spaces where you wrote a brief in the last week.** A scheduled job (every 30 minutes, with Inngest) checks each person's brief time in their own zone. *Why:* briefs cost AI calls; preparing them for people who never read them would use up the app's monthly budget. Briefs still appear on demand from Today.
90. **Profile fields** (what you do, where you're based, background, what you can offer, industries) are optional and feed AI context only. Time zone, phone country and brief time share their pickers with onboarding.

## 2026-10-24: milestone 9 (AI)

77. **Every AI call goes through one server-side runner** (`src/server/ai/run.ts`). It checks the daily and monthly limits, picks the model tier, records tokens and cost in `ai_usage`, and turns failures into plain messages. The key and model ids never reach the browser.
78. **Structured outputs only when no web tools are used.** Research, Look up and Suggested rooms search the web, so their reply is read as JSON from the text, missing fields are filled leniently, and a reply in the wrong shape is repaired once by the fast model. If that fails, the person sees "Couldn't read the result. Try again." *Reverse:* drop the extraction path once structured outputs work alongside web tools.
79. **The strong tier asks for server-side fallbacks**, so a busy model doesn't fail a research run. The fast tier doesn't.
80. **Get to know and Check they're real are stored like research**, as dossier versions for that one Space, and can be deleted. Dating never offers full research, only these two.
81. **Nothing AI writes lands silently.** Research, chat imports and scoring produce suggestions (a field, a social link, a goal link, a touch, a promise, interests or a note) with Accept, Edit and Discard. Research summaries and briefs are shown as AI output, not stored as facts.
82. **Chat imports and card scans run while you wait and keep no raw text or image**; only accepted suggestions are saved. A card scan prefills the Add person form.
83. **Drafts are written in one go, not streamed** to the browser. They are short, and this keeps the client free of model plumbing. Sending one offers to log a touch.
84. **Long AI jobs (research, Look up, Suggested rooms, briefs, scoring) run as background jobs** with progress, through Inngest when it is set up and right after the request otherwise (pages that start them allow 300 seconds).
85. **Warm paths from Look up are checked against your own people in that Space**; names the model invents are dropped.

## 2026-10-24: milestone 8

70. **Files are read on the server straight from the upload and never stored.** The plan said Storage first; on Vercel's free tier a request body is capped at about 4.5 MB, which fits 5,000+ contacts as a vCard, so the upload is parsed in memory instead. Up to 4 MB per upload (several files or a .zip). Bigger exports: upload in parts, or unzip and pick the contacts file.
71. **Parsed files wait for review in `import_items`, then are deleted.** The review page shows what will happen (new people, details filled in, already up to date, possible duplicates, calendar events) and the first new people. Nothing touches your people until you press Import. Reviews left for two days are cancelled by the daily clean-up.
72. **File contacts get a fingerprint id** (name, emails, phones), so importing the same file again adds nothing. Matching is still external id → email → phone → name suggestion.
73. **LinkedIn connections keep where and when you met:** "LinkedIn" and the "Connected On" date. Notes from vCards and CSVs go to the person's notes in that Space.
74. **Zip archives are read up to 40 MB unpacked**, only .vcf, .csv and .ics entries, and nested zips are ignored. Text is UTF-8, or Windows-1252 when it isn't valid UTF-8 (older Outlook and phone exports).
75. **Merging keeps one person and soft-deletes the other** (`merged_into_id`). You pick who to keep and, for each differing single detail, which value. Emails, phones and profiles are combined. Touches, promises, goals, rooms, links, research and scores move across; where both had the same Space, goal or room, the kept one's stays and the other's details fill its gaps (notes are joined). Every moved and removed row is recorded, so Undo restores both people exactly, for 30 days.
76. **Possible duplicates show as a link in People and one card on Today.** "Keep both" dismisses the pair for good.

## 2026-10-24: milestone 7

62. **Reminders follow the plan's rules (TECH_PLAN §4.5)**: birthdays within a week; promises you owe that are overdue, due within 3 days or undated; promises they owe you once late; people due by the reminder you set; prep for anyone you meet in the next 3 days; rooms from tomorrow to a week out (not 1:1 meetings); context for people you added by hand in the last 14 days; and one "Sort 5 new people" card a day while imports wait. At most 20 cards.
63. **One card per person.** If someone is due and also has a promise, a meeting or a birthday coming, only the sharper card shows.
64. **Unsorted and archived people never get reminders**, and example people don't get "add context" cards.
65. **Prep cards say who, when, your last touch and what you owe.** "Research" and "Look up" buttons join them with AI (milestone 9).
66. **Snooze and dismiss are stored with an expiry** (`nudge_states`), and the daily clean-up deletes expired rows. Dismissing a dated card (a birthday, a session) keeps the row 30 days past that date; undated ones 180 days. Every hide has Undo.
67. **Today follows the Space switcher.** "All Spaces" merges every Space's reminders and rooms in the list only; nothing is combined for AI (#1).
68. **⌘K palette searches names of people, rooms and goals across all Spaces** and runs commands (capture, add a room or goal, sort, connect, switch Space, go to a section). `g` then `t p r g s` jumps to a section; `?` lists every shortcut. On a phone the palette opens from the search button in the header.
69. **The daily and weekly AI brief arrives with milestone 9.** Today has no empty brief box until then.

## 2026-10-24: milestone 6

55. **A goal uses its Space's pipeline stages unless you give it its own.** Changing either is refused if it would leave someone at a stage that no longer exists; the message names the stage and how many people are at it.
56. **Weekly progress counts three things, all from explicit links** (fixes brief bugs 7 and 8): touches in the goal's Space with people on the goal, sessions you went to of rooms tied to the goal, and stage moves. The meter is touches plus rooms against the weekly target; moves are reported beside it ("2 moved forward · 1 won"). Weeks run Monday to Sunday in your time zone.
57. **Moving to the first end stage (usually "Won") counts as won; moving to a later end stage ("Closed") doesn't count as progress.** Moving back is recorded but not counted.
58. **People join a goal only when you add them**: from the goal, from their page, or as a new person ("Someone you want to meet"), who is created in the goal's Space. Being added to a goal also sorts them out of the import queue.
59. **No drag and drop in the pipeline yet.** Each person has a stage picker, and on desktop `[` and `]` move the focused person (TECH_PLAN §7.2; drag is P2). On a phone, stages are stacked and empty ones are hidden.
60. **Pause, archive and delete are separate.** Paused goals stay listed but don't count or appear as choices on people's pages; archived goals leave the list (still viewable under "Archived goals"); deleting removes the pipeline but keeps the people and unties the rooms.
61. **"People to meet" suggestions (brief §4.2) come with AI in milestone 9.** For now you add them by name.

## 2026-10-24: milestone 5

44. **Connected-account secrets are encrypted in the app (AES-256-GCM, keys in `TOKEN_ENC_KEYS`, versioned for rotation)**, and only a system-level store (`src/server/system/connections.ts`) decrypts them. Users can read their connection's status through RLS, but not the encrypted columns. Calendar links count as secrets too, so only the host and a short fingerprint are stored in the clear.
45. **Import order: external id → email → phone → name.** A name-only match never merges; it raises a "possible duplicate" suggestion (merge UI in milestone 8). Existing people only gain missing details; nothing they have is overwritten.
46. **New people from an import land in triage with a suggested sort.** Starred in Google or several recent meetings → Priority; a name and a company or role → Keep; a bare number or email → Not now. One button accepts every suggestion; the queue lets you go one by one (keys `1 2 3`). Not now archives the person (searchable, no reminders).
47. **Calendar imports log past meetings as touches and turn events into rooms.** Up to 12 guests per event and 200 new people per sync come from calendars; bigger meetings only link people you already have. *Why:* an all-hands invite shouldn't add 400 people to triage.
48. **Google contact deletions are ignored.** Deleting someone in Google doesn't delete them in Inroads, where you may have notes about them.
49. **Undo removes the people, rooms and touches an import created. Details it filled in on people you already had stay.** Undoing a connected account's import keeps its sync position, so the same people don't come straight back; disconnect to stop syncing.
50. **Disconnecting forgets the tokens (and revokes them at Google).** People and rooms already imported stay.
51. **Background syncs are one Inngest step per sync, with progress written to the `jobs` table and polled by the page once a second.** Supabase Realtime push (#9) is deferred; polling is simple and works through flaky networks. Without Inngest keys, a sync runs right after the request (`after()`), so local development and small deployments need no extra service.
52. **Outlook events are read in the user's time zone** (`Prefer: outlook.timezone`). Graph doesn't return the organiser's zone, so a meeting set in another zone shows at the right time but is stored in yours.
53. **Onboarding is two steps (about you, then connect), and can be skipped.** Today shows "Finish setting up" until it's done. Email sign-up and Google sign-in both land on Today.
54. **Phone contacts use the browser's Contact Picker (Chrome on Android).** Only the contacts the user picks are sent. Other phones get a note to use a contacts file (file importers arrive in milestone 8).

## 2026-10-24: milestone 4

39. **Repeats are stored as canonical RRULE text plus a separate `until_on` date.** The rule never carries UNTIL; COUNT from calendar feeds is turned into an end date when imported. *Why:* one obvious place for "when does it end", and the rule text stays stable.
40. **Occurrences are calculated on wall-clock dates in the room's own time zone, then converted to the user's zone.** A room at 8pm in New York shows on the next day in Lagos. All-day rooms stay on their date in every zone.
41. **Attendance is three-state per session: went, didn't go, or not answered.** "Went N of M" counts the last six past sessions.
42. **Database rule violations inside a request run in a savepoint**, so a refused link (e.g. a person from another Space) becomes a message without aborting the rest of the request.
43. **Rooms reuse the People list/detail layout** (`ListDetailShell`). A tiny route-aware marker in the layout plus CSS decides which pane shows on mobile. An earlier version wrapped the pages in a loading fallback, which streamed every detail page twice; a marker inside the pages also fails because Next 16 keeps the previous page mounted (hidden) after navigation.

## 2026-10-24: milestone 3

32. **Quick capture goes through one idempotent endpoint (`POST /api/v1/capture`) with ids created on the phone.** Edits that need a connection anyway (contact details, relationship details, archive, delete) use server actions. *Why:* captures must work offline and replay safely; edits are rare and easier to get right online.
33. **Archive applies to a person in every Space at once.** Removing someone from a single Space is a separate, explicit action that deletes what you logged there.
34. **"Due" uses the most recent touch in any Space and the shortest reminder across their Spaces** (repeats DECISIONS #18 in code).
35. **After bulk inserts (imports), run `ANALYZE` on `people` and `person_spaces`.** Without fresh statistics the list query took 40 s at 10,000 rows; with them, about 20 ms.
36. **"Today" in capture forms comes from the phone's clock and time zone.** Server-side pages use the profile's time zone.
37. **Deleting a touch or promise is immediate, with no undo** (they're small). Deleting a person has Undo and a 30-day restore window. The purge job arrives with background jobs (milestone 5).
38. **The ⌘K command palette is deferred to milestone 7 (Today).** Single-key shortcuts (`/ j k l e c`) work now.

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
