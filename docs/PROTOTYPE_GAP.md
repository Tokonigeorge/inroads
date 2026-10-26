# Prototype gap report

Status: audit, 2026-10-26. Compares the Next.js app (`src/`) with the original prototype (`prototype/index.html`, 2,655 lines). Line numbers `L123` refer to the prototype.

**Why this exists.** The product owner's feedback: *"the UI currently focuses on the wrong thing; it's not the same as the prototype. It should be the same UI and UX: the same questions asked (onboarding), the same things in settings, the same UI and flow."* They also asked about downloads (Settings → Backup).

**The root cause is a deliberate decision that now has to be reversed.** `docs/PRODUCT_BRIEF.md` (L3: "Don't port it as-is: … the visual design and several product decisions change here", §5) and `docs/DESIGN_SYSTEM.md` (green accent, Inter + Newsreader, "no monospace", "no uppercase labels", "lists and text, not cards", warmth as a 6px dot) told the build to restyle and rename things. `DECISIONS.md` #3 renamed Decode to "Look up" and Radar to "Suggested rooms". So the app works, but it doesn't look or flow like the prototype. **This report treats the prototype as the UI/UX spec from now on.** The backend (Supabase, RLS, Google/Outlook sync, Inngest AI jobs, imports staging, exports) stays. Add a DECISIONS.md entry that supersedes DESIGN_SYSTEM.md §1–2 and decision #3 before you start.

---

## 1. Summary: the biggest differences in focus and layout

| | Prototype | App today |
|---|---|---|
| **What Home leads with** | A hero: mono stamp "`SUN 26 OCT 2026 · DAILY BRIEF`", a big display greeting "**Good morning, Ada**", one summary line ("2 rooms today · 3 cooling · 1 promise open") and a **Today / This week** toggle (L758–760). Then *Today's rooms* agenda with prep under each person and the AI brief inline (L772–800), then a grid of **Nudges** cards (L764). | A serif date title ("Sunday 26 October") with a greeting as small subtitle, then a "Finish setting up" box, then a **Brief** card (per Space), then a two-column layout: Today's rooms + Coming up this week / Follow up, then "Rooms for your goals" + "Steps due" (`src/app/(app)/today/page.tsx`). No Today/This week toggle; no weekly view with "Going cold", "New openings", "Goal progress" meters. |
| **Empty state on Home** | One onboarding card, "**Start with the people you already know**", 3 numbered steps and five buttons (L767–771). | A "Finish setting up" box that sends you to a separate 3-step wizard (`/onboarding`), and an empty "Follow up" column that links to Settings → Load example data. |
| **Navigation** | Five equal tabs: **Today · People · Discover · Events · Goals** (L412). Bottom bar on phones; an 88px icon-and-label rail at ≥900px (L66–75). A sticky brand bar with the Inroads mark and a status pill ("Synced · Live web") that opens Connections (L359–362, L691–699). | Four tabs plus a central **+ Capture** button on phones; a 232px sidebar with Space switcher, ⌘K search and a separate **Settings** item on desktop (`features/shell/*`). Discover is gone as a tab (it's "Look something up" inside Rooms). |
| **Where records open** | **Everything opens in a sheet** stacked over the current tab: bottom sheet on phones, a 620px panel sliding in from the right on desktop (L230–242, L700–718). The tab you were on stays put. | People and Rooms use a list/detail split (380px list + detail pane) with full-page routes; forms (Add person, Add room, Edit) are full pages; only Capture, Draft and Chat import are sheets (a centred 440px dialog on desktop). |
| **Settings** | There is no Settings tab. The **Goals** tab is "Profile & goals" and holds everything: profile, goals, about you, goal-fit scores, Import from Google, other sources, **Backup**, example network, connections (L967–995). | A Goals tab with pipeline cards, plus a separate Settings page: Profile, Goals (link), Spaces, Connections, AI usage, Export, Example data, Account. |
| **Onboarding questions** | No wizard. The questions are the **Profile & goals** sheet (L1155–1177): name, based in, headline, background, what you offer, target industries, your email addresses, and a repeatable goal row (text, type, priority, touches a week, active). | A 3-step wizard: "About you" (name, time zone, region), "What are you working towards?" (7 chips + free text), "Bring in your people" (connections). Headline, background, offerings, industries, priority and touches a week are never asked. |
| **Visual language** | Cool blue-grey neutrals, indigo accent `#2B44C8`, Bricolage Grotesque display + Geist body + **Geist Mono uppercase stamps**, 16px radius cards with soft shadows, pill (999px) buttons, segmented controls and chips, **coloured warmth rings** around avatars (hot / warm / cooling / cold / no touches), goal-fit score pills. | Warm greys, green accent `#1E6B52`, Inter + Newsreader serif, no mono, 6px radius, rectangular buttons, hairline sections, a 6px warmth dot, hue-tinted avatars, no visible fit scores. |
| **Downloads** | **Download backup** (one JSON file, instant) and **Restore from backup** (L992, L2458–2476). | "Export your data" makes a .zip in a background job, then a download link that expires in 7 days. **No restore.** |

The short version: the prototype leads with *you, today, and what needs you* (greeting → rooms with prep → brief → nudge cards) and keeps the user on one surface with sheets. The app leads with structure (Spaces, panes, a wizard, a separate Settings page) and a different visual identity.

---

## 2. Navigation / information architecture

| Prototype (L412, L66–75, L358–367) | App (`features/shell/nav-items.ts`, `sidebar.tsx`, `bottom-nav.tsx`, `app/(app)/layout.tsx`) | Change |
|---|---|---|
| Brand bar: logo mark (two converging strokes, L360) + "Inroads" wordmark in Bricolage 760/20px; status pill on the right | Mobile: 56px header with Logo, Space switcher, ⌘K button, Settings cog. Desktop: no top bar | Add the sticky blurred brand bar on all sizes, with a status pill (see §6, Connections) |
| Tab 1 **Today** (sun icon, L406) | Today (Lucide `Sun`) | Keep; use the prototype's SVG icons (L405–411) |
| Tab 2 **People** (L407) | People | Keep |
| Tab 3 **Discover** (magnifier-plus, L408) | — (it's `/rooms/lookup`, linked as "Look something up") | Add a **Discover** tab at `/discover` (move or re-export `rooms/lookup`) |
| Tab 4 **Events** (calendar, L409), page h1 "Rooms that matter" | Rooms (`/rooms`) | Label the tab "Events"; keep the `/rooms` URL if you like, but the page follows §3.5 |
| Tab 5 **Goals** (target, L410), page = Profile & goals | Goals (`/goals`, pipelines) | Make `/goals` the prototype's "me" view (§3.6/§5); pipeline pages stay as drill-ins |
| — | **Settings** (sidebar bottom / header cog) | Fold into the Goals tab; keep `/settings` as an "Account" sub-page linked from the bottom of Goals |
| — | Central **+ Capture** FAB (mobile), `c` key, ⌘K palette | Not in the prototype. Drop the FAB so the bar has 5 equal tabs; keep `c` and ⌘K as desktop extras (they don't take space) |
| Desktop ≥900px: 88px rail, icons over labels, 11px/600 labels, active = accent colour (L67–73) | 232px collapsible sidebar with text rows, accent-soft active background | Replace the sidebar with the rail |
| Content column max 960px, 16px gutters, 96px bottom padding for the tab bar (L65) | 760px or 1100px `PageFrame`; list/detail panes for People/Rooms | One 960px column for every tab; no list/detail split |
| Space switcher: none (single profile) | Space switcher in sidebar/header | Keep but demote (see §10) |

---

## 3. Screen by screen

### 3.1 Home / Today

| Order | Prototype (L750–847) | App (`app/(app)/today/page.tsx`, `features/today/*`, `features/ai/briefs.tsx`) | Change needed |
|---|---|---|---|
| 1 | **Hero** (L758–760): stamp `fmtDate(today,{dow,year}) · Daily brief` (or "Weekly brief"), h1 "Good morning, {first}" (Good afternoon < 17h, Good evening after), lede summary `"{n} rooms today · {n} cooling · {n} promises open"`, segmented control **Today / This week** | `PageHeader` title = long date; subtitle = `greeting()` sentence ("Good morning, Ada. Fintech mixer is today.") | Port the hero exactly: stamp, h1 greeting, summary lede, `seg` toggle (state in URL `?brief=weekly` or local state) |
| 2 | If no people and no events: onboarding card (L767–771) — see §4 | "Finish setting up" box → `/onboarding` | Replace with the prototype card |
| 2b | Else if no active goals: nudge-styled card, kind "Set up", h3 "**Tell Inroads what you're working toward**", body "Goals drive the fit scores, research angles and your briefs. Raising capital, landing clients, hiring: add one or two.", button **Set your goals** (L762) | Similar copy, button links to `/onboarding?step=goals` | Use the prototype card style and copy; button opens the Profile & goals sheet |
| 3 (daily) | Section h2 "**Today's rooms**" with **+ Event** button (L773). Agenda `ol.agenda`: 70px mono time column (accent) / "All day", title (display 17px), location, then **prep cards** per linked person (L784–790): small avatar with warmth ring, name · role, "Last: 12 Oct · Coffee…", up to 2 talking points or link "**Research before you go**", "You owe: …" in warn colour. A room with no people gets **Decode this room** (L782) | "Today's rooms" list, time column, attendees with Avatar, "Last: …", "You owe: …", talking points or "Research {first} before you go"; non-meeting rooms get "Prepare for this room" | Close in content. Restyle as `.ag` / `.prep-p` cards; add "+ Event"; rename "Prepare for this room" to "Decode this room" |
| 3 empty | "Nothing on the calendar today. **Import your calendar** or add an event." (L775) | EmptyState "Nothing on today…" + "Add a room" | Use prototype copy; "Import your calendar" opens the Google connect/ICS flow |
| 4 (daily) | AI brief inline under the agenda (L791–800): busy line with Stop, then `.prose` card with the markdown, footer "Live web · n sources · Written 2 h ago · **Rewrite**"; or button **Write today's brief** | Separate "Brief" section **above** the rooms, one card per Space, both daily and weekly buttons | Move the brief under Today's rooms (daily) or under the week grid (weekly); one button per mode as in the prototype |
| 3–4 (weekly) | h2 "**Week of 20 Oct – 26 Oct**" and a `wk-grid` of four cards (L801–815): **Rooms to be in** (up to 7, mono day + title), **Going cold** (days + name + **Draft**), **New openings** (from research and decoded rooms in the last 7 days), full-width **Goal progress** meters ("3/3 touches · 4 people"); then **Write this week's brief** | "Coming up this week" list with plan state; "Rooms for your goals" (radar items); "Steps due" | Build the weekly view as in the prototype. "Coming up this week" becomes "Rooms to be in"; goal meters come from `domain/goal-progress.ts` (already exists). "Rooms for your goals" and "Steps due" can sit inside "New openings" / below the grid (see §10) |
| 5 | h2 "**Nudges**" with a mono count pill, then a responsive **card grid** (`.feed`, min 300px columns, L163–171, L847). Each card: coloured square + mono uppercase kind ("GOING COLD", "PROMISE", "BIRTHDAY", "PREP", "RESEARCH", "ADD CONTEXT", "THIS WEEK"), avatar with warmth ring, h3 title, muted body, action buttons (first is primary) | "Follow up · n" in the right column, a vertical list of bordered cards, sentence-case kind label, first action secondary | Port `.nudge` cards in a full-width grid under the brief; mono kind labels with per-kind colour (L167); first action `primary` |
| 5 empty | "Nothing needs you right now. As your network grows, follow-ups, birthdays and promises show up here." (L764) | "All caught up. Follow-ups, birthdays and promises show up here when they're due." | Use prototype copy and `.empty` dashed style |

Nudge kinds and copy (L816–846) vs `domain/nudges.ts`:

| Prototype kind | Title / body / actions | App |
|---|---|---|
| birthday | "{Name}'s birthday is today/tomorrow/in n days" · "{Sun 2 Nov}. A short, specific note lands better than a generic one." · **Draft a note**, Done | Same idea ("Draft a note") ✓ |
| promise / Overdue promise | "You said you'd {text}" · "For {Name} · due {in 2 days}." · **Mark done**, Open | ✓ ("You said you'd …"); app adds "They owe you" (keep) |
| cold ("Going cold") | "{n} days since you spoke with {First}" · "{role}. For someone this important you aim to touch base every {30/60/120} days." · **Draft message**, Log a touch, Snooze | "Due for a touch" based on Space/circle cadence | Rename label to "Going cold" and use the prototype title/body; keep the app's cadence source |
| research / Prep | "You meet {First} soon and have no dossier" / "{First} is high priority with no dossier" · "One tap pulls together their background, talking points and a goal-fit score." · **Research now**, Later | "Prep" ✓ (copy differs) | Use prototype copy |
| context | "What do you remember about {First}?" · "Capture where you met and their interests while it's fresh." · **Add context**, Later | ✓ | — |
| event ("This week") | Each non-meeting event in the next 7 days: title, "{Sun 2 Nov · 6:00pm · Lekki}" · **Decode the room**, Open | Not a nudge (it's "Coming up this week") | Add the kind, or keep the week list but give it this card style |
| — | — | triage, duplicates, suggestions, after_room, owed_to_me | Keep (app-only, see §10) |

### 3.2 People list

| Prototype (L850–894) | App (`features/people/people-list.tsx`, `people-list-pane.tsx`, `app/(app)/people/layout.tsx`) | Change |
|---|---|---|
| Hero tight: stamp "`{n} PEOPLE · {n} COOLING`", h1 "**Your network**" | h1 "People" (serif 24px) in a 380px pane | Port the hero |
| Action row: **+ Add person** (primary), **Import from Google**, **Scan a business card**, **Import contacts**, **Import a chat** (L858) | "Log a touch" (ghost), "+ Add"; "Sort n new people", "Review n duplicates", "Ask your network a question" links | Use the prototype's five buttons. Put "Sort n new people" / duplicates as a `.notice` strip under them (app-only) |
| Busy line for scan / "Saving people n of m" | Job progress lives in Settings → Connections | Show import progress here too |
| Toolbar: search "Search name, company, where you met…" + sort select (**Priority**, **Recently added**, **Coldest first**, **A–Z**) (L855, L860–861) | Search (same placeholder) + "Show" select + "Sort:" select (Name, Last spoken to, Most overdue, Recently added) + Circle/tag select | Sort options and default (**Priority** = starred, then fit score, then name, L597) as the prototype |
| **Chips** row (L854, L862): **All**, **Priority**, **Going cold**, **Needs context**, **No dossier**, then one chip per tag "#investor" | Filter select: Everyone, Priority, Due for a touch, Needs context, No touches yet, Not sorted yet, Archived | Replace the select with chips. Add "No dossier"; "Going cold" = due; keep "Not sorted yet"/"Archived" as extra chips at the end |
| `.list` card (white, 16px radius, row dividers). Row: 42px avatar **with warmth ring**, "★ Name · example", role line, "Met: {whereMet}", right side **fit score pill** (accent when ≥70) and mono "{n}d" / "new" (L891–894) | Virtualised rows, hue avatar, name, role line, trailing warmth dot + label or "Due …" | Port the row (keep the virtualiser). Needs the latest score per person in `PersonListItem` (`server/repos/people.ts`, `scores` table) |
| Legend under the list: Hot · 2 weeks / Warm · 6 weeks / Cooling · 3 months / Cold / No touches yet (L864) | — | Add |
| Empty: "No one here yet. Add someone you met recently, import your phone contacts (.vcf) or LinkedIn connections (.csv), or load the example network from the Goals tab." / "No one matches. Try a different search or filter." (L886–887) | "No one here yet. Add the first person…" | Use prototype copy |
| Showing 300 of n note (L889) | Infinite scroll | Keep infinite scroll |
| Tapping a row opens the **Person sheet** over the list | Navigates to `/people/[id]` in the right pane / full screen on mobile | Open as a sheet (see §6) |

### 3.3 Person detail

| Order | Prototype contact sheet (L1026–1077) | App (`app/(app)/people/[id]/page.tsx`, `features/ai/person-ai.tsx`, `features/people/person-actions.tsx`) | Change |
|---|---|---|---|
| Header | Sheet head: ×/← button, name, **★ priority toggle** icon button (L1035) | Back link, no star toggle in header | Add star toggle |
| 1 | `.ch`: 64px avatar with warmth ring; h2.big name (26px/720); role line; tags: "Example", warmth tag "Warm · 23d", "Fit 86/100", goal tags (accent), "#tags" (L1036–1037) | 40px avatar, serif name, role at company · city, warmth dot + "Last spoke …", cadence/due | Port; add fit and goal tags |
| 2 | Score reason `p.why` (L1038) | — | Add |
| 3 | Action row: **Research** / "Research again" (primary), **Decode their world**, **Log a touch**, **Draft message**, **Edit** (L1039) | Log a touch (primary), Add a promise, Edit, ⋯ menu; then a second row: Draft a message, Import a chat; research button sits inside the Research section | Single row in prototype order. "Add a promise" moves into the touch form (prototype has it there, L1150); "Archive / Add to another Space / Delete" stay in ⋯ |
| 4 | **CONTEXT** section (mono uppercase h3, L246–247): kv list "Based in, Where you met (+ date), Interests, Opportunities, Notes, Birthday, Email [Copy], Phone [Copy]", social link pills, link "Add where you met / their interests", hint "Research and Decode use everything saved here…" (L1041–1044) | Phones/emails/socials under the header (with WhatsApp links, keep); "Context" block per Space near the end; Birthday in a separate "Details" block at the bottom | Move Context to first section; merge Details into it; keep WhatsApp/mailto links as the app's extra |
| 5 | **DOSSIER** (L1045–1047, L1053–1067): source badge ("Live web · 6 sources"), identity, "Used your saved details: …", conflicts box "Doesn't match what you saved", summary, company, Talking points, Openings for your goals, Career, Recent signals, Shared ground, Confirmed from your saved details, Profiles found, **"Missing from their profile" + "Add these 3 to their profile"**, Sources, "Confidence: high · 2 h ago · Verify: …"; then "Look them up yourself" (Google, LinkedIn, X, News pills, L1272–1275) and a `details` "**Give Claude more to work with**" textarea | "Research" block per Space: summary, identity, lists, sources in a `<details>`, "Give Inroads more to work with", "Look up their world"; the "missing details" come back as a separate **Suggestions** block | Port the dossier card layout and order. Render pending `person_field`/`social` suggestions inside it as the "Missing from their profile" box with one "Add these n" button (accept all). Add "Look them up yourself" links and the source badge |
| 6 | **PROMISES**: checkbox list "You owe: …" / "{First} owes you: …" with due date (L1068–1072). Empty: "No promises logged. Add one when you log a touch, or import a chat." | "Promises" in two columns (You owe / {First} owes) + done list | Single checklist with the prototype's `.check` style; keep the done fold |
| 7 | **TIMELINE**: mono date column, summary, mono type + source; buttons **+ Log a touch**, **Import chat history** (L1049, L1073–1077) | "Timeline" ✓ with delete buttons | Add the two buttons; restyle |
| 8 | Delete: quiet "Delete person" → inline "Delete {Name} and their whole history? This can't be undone." Delete / Keep (L1050) | ⋯ → Delete with Undo toast | Either is fine; keep the app's undo |
| — | — | Introductions, Rooms, Goals (pipeline stage), Space blocks, Suggestions | Keep as extra sections after Timeline (§10) |

### 3.4 Discover (the "Room decoder")

| Prototype (L897–926) | App (`app/(app)/rooms/lookup/page.tsx`, `rooms/lookup/[id]/page.tsx`, `features/ai/lookup-form.tsx`, `features/ai/plan.tsx`) | Change |
|---|---|---|
| Hero: stamp "ROOM DECODER", h1 "**Know the room before you walk in**", lede "Search a person, place or event. You get the key people, your warm paths in, and what's in it for your goals." + web note (L899, L998–1002) | Pane header "Look up", "Find out who matters at an event, company or place, and who in your network can introduce you." | Port hero and copy |
| Decoder card: segmented **Person / Place / Event**; search input with type-specific placeholder ("A founder, investor or exec you want to meet" / "A company, venue, hub or city" / "A conference, mixer or summit"); **Decode** button; `details` "**Add what you already know**" textarea "Paste a speaker list, an event page, a company About section…" (L898–903) | "What is it" segmented (person/company/place/event), Name, Space select, "Anything to add (optional)", submit | Match the prototype: 3 types (map Place to company/place server-side), one row input + button |
| Result inline on the same page (L910–926): stamp "{kind} · confidence {x}", h2.big title, source badge, overview, "Built on what you saved about …", **Run again with live web** (n/a here); sections **Key facts** (+ "Official site ↗"), **Key people** (cards with "In your network" / "+ Save to People" / "Profile ↗"), **Your warm paths in** (rows with avatar, how, "Ask: …"), **Opportunities for your goals** (cards with goal tag, idea, "First move: …"), **How to work the room**, **Sources**, **Look it up yourself**, "Verify before relying on it: …", buttons **+ Add to my events**, **Clear result** | Separate result page `/rooms/lookup/[id]` with "Who to meet", "Who can introduce you", "Openings for your goals", "Tips for the room", "What to do next" | Render the result inline under the form (the job finishes, then the result appears), with the prototype's section names and order |
| h2 "**Recent rooms**" as a `.list` with date tiles, title, overview excerpt, mono kind (L906–907) | "Earlier" plain link list | Port |

### 3.5 Events (Rooms)

| Order | Prototype (L929–964) | App (`features/rooms/rooms-list.tsx`, `rooms-list-pane.tsx`, `app/(app)/rooms/suggested/page.tsx`) | Change |
|---|---|---|---|
| 1 | Hero: stamp "`{n} COMING UP IN 30 DAYS`", h1 "**Rooms that matter**" | h1 "Rooms" in a list pane | Port |
| 2 | Actions: **+ Add event** (primary), **Import from Google**, **Import calendar file** (L936) | "+ Add a room", "Find rooms for my goals", "Look something up" | Use prototype buttons ("Import from Google" = connect Google) |
| 3 | h2 "**Next 30 days**": `.list` of rows with **date tile** (day number + mono month), title, "Sun · 6:00pm · Lekki", "n people linked", right side mono kind + recurrence (L937, L946–949). At most two per series. Empty: "Nothing scheduled. Add an event, set a recurring commitment, or import your calendar." | Tabs Upcoming / Repeating / Past; rows grouped by day with a kind icon tile | One scrolling page with sections instead of tabs; date tiles instead of kind icons |
| 4 | h2 "**Radar**" + **Scan for this week** / **Refresh radar**; "Rooms worth your time in the next three weeks, matched to your goals and where your network already gathers."; cards: mono kind · confidence, title, date/where, why, "Who's there: …", "Find the date: …", "Open the listing ↗", **+ My events**, **Decode** (L938–942) | Separate page "Suggested rooms" (`/rooms/suggested`) and a "Rooms for your goals" block on Today | Put the Radar section on this page; rename back to "Radar"; keep the weekly auto-run (decision #127) |
| 5 | h2 "**Recurring**": rows with next-date tile, recurrence label, "Attended 2 of the last 6", "n people" (L943, L956–959). Empty: "No recurring commitments. Board dinners, club meetups and roundtables go here so you can track attendance and who you see there." | "Repeating" tab, "Went 2 of 6", "Met 6 · 4 in touch" | Section on the same page; keep the impact label as extra |
| 6 | h2 "**Where your network gathers**": bar chart of top 7 "where you met" values (L944, L960–964). Empty: "Add "where you met" to people and the places that keep paying off show up here." | — (listed as a later gap in decision #128) | Add: a `group by where_met` query over `person_spaces` |
| — | — | "Past" tab | Keep as a collapsed "Past" section at the end |

### 3.6 Event (room) detail

| Prototype event sheet (L1126–1143) | App (`app/(app)/rooms/[id]/page.tsx`) | Change |
|---|---|---|
| Stamp "MEETUP · MONTHLY · 1ST TUE", h2.big title, date · time · location, goal tag | Kind · recurrence · Space line, serif title, when, location, event page, "Serves: …" | Restyle |
| Actions: **Decode the room** (primary), **Edit**, **Event page ↗** | RoomActions (edit etc.) + "Your plan" block with "Prepare" | Rename "Prepare" → "Decode the room"; show its result inline (the plan) |
| **NOTES**, **ATTENDANCE** (checklist of past dates), **COMING UP** (next 3), **PEOPLE** (person rows), delete confirm | People by role, What it's led to, Did you go?, Coming up, Notes | Same content; order as prototype (Notes, Attendance, Coming up, People); keep "What it's led to" and debrief as extras |

### 3.7 Goals tab (Profile & goals) — this is the prototype's "Settings"

See §5 for every control. Screen order (L967–995): hero (stamp "PROFILE & GOALS", h1 = your name or "Your profile", lede = headline or "Tell Inroads who you are and what you want from your network. Scoring, research and briefs all read from here.", button **Edit profile & goals** / **Set up your profile**) → **Goals** list with "{n} active" → **About you** → **Goal-fit scores** → **Import from Google** → **Other sources** → **Backup** → **Example network** → **Connections**.

App `/goals` (`app/(app)/goals/page.tsx`): h1 "Goals", "Add a goal", pipeline cards with weekly meters, "Who could help" (score per Space), archived link. Change: make `/goals` render the prototype layout. Each `.goal-item` row (priority badge "HIGH/MED/LOW", text, "Raise capital · 3 touches a week · paused", "n people") links to the existing `/goals/[id]` pipeline page.

### 3.8 Settings

The prototype has no Settings page (see §5). App `/settings` becomes a secondary "Account" page reached from the bottom of the Goals tab: time zone, phone region, brief time, Spaces, AI usage, sign out, delete account.

### 3.9 Onboarding — see §4.

### 3.10 Import and review

| Prototype (L2227–2417, L2305–2326, L1234–1243) | App (`features/connections/file-import.tsx`, `app/(app)/settings/imports/[id]/page.tsx`, `features/people/triage-queue.tsx`) | Change |
|---|---|---|
| "Import from Google" opens a **file picker** for .zip/.csv/.vcf/.ics (several at once) from any tab, then a **Review import** sheet: "Read {files}. Nothing is saved until you tap Import."; errors notice; **CONTACTS** checkbox "Import n contacts — n new · n existing people get missing details · n already up to date"; "Skip n entries with no name"; hint "Labels become tags; starred contacts become priority."; **CALENDARS** one checkbox per calendar (Holidays/Birthdays tags, counts, date range), "Also add upcoming events with no other guests", field "Your email address in these calendars"; hint about 6 months past / 3 months ahead; footer Cancel / **Import** | Upload on Settings → Connections → "Other ways to add people" → Files, then a full page "Review import" with "What will happen", Space select, "Import n people", "Details to fill in", paged "New people". No per-calendar choice, no "skip nameless", no "include solo", no "your email" field | Open the review as a sheet from any tab with the prototype's checkboxes; wire the options into `server/import/files.ts` staging (calendar on/off, skip nameless, include solo, me-emails → `profiles.emails`) |
| After import, **Import complete** sheet: People added, Details filled in, Past meetings logged, Upcoming meetings, Skipped; "**People from your calendar you haven't saved**" list with Add / **Add all n**; Done / See people / See events | New people go to a triage queue ("Sort n new people") | Show the summary sheet; keep triage as the "Add" step for calendar people (one button to triage) |
| Google OAuth: not available (file export steps instead, L978–985) | One-tap Google/Outlook OAuth + ICS link + phone picker | **Keep the app's OAuth** — label the primary button "Import from Google" and make it start OAuth; keep the file steps in a fold for people who prefer files |

---

## 4. Onboarding: every step and question

### 4.1 Prototype (verbatim)

The prototype has **no wizard**. A first-time user sees Today with this card (L767–771):

> **Start with the people you already know**
> Bring in your phone contacts or LinkedIn connections, then add context to the ones that matter. Or load a small example network to see every feature working.
> 1. Set your goals so Inroads knows what matters
> 2. Add or import people, with where you met
> 3. Research before meetings and let the briefs do the rest
>
> [**Import from Google**] [Other contacts file] [+ Add person] [Set goals] [Load examples]

Once there's data but no goals, the "Set up" card (L762): **Tell Inroads what you're working toward** — "Goals drive the fit scores, research angles and your briefs. Raising capital, landing clients, hiring: add one or two." [**Set your goals**].

The questions are the **Profile & goals** sheet (L1155–1177), opened by "Set goals", "Set your goals", "Edit profile & goals" or "Set up your profile":

| # | Label | Type / placeholder | Hint |
|---|---|---|---|
| 1 | **Your name** | text | |
| 2 | **Based in** | text, "City, country" | |
| 3 | **Headline** | text (full width), "What you do in one line" | |
| 4 | **Background** | textarea 3 rows, "Experience, past roles, what you are known for" | |
| 5 | **What you offer** | textarea 2 rows, "Products, services, skills, capital, access" | |
| 6 | **Target industries** | text, "Fintech, energy, real estate…" | |
| 7 | **Your email addresses** | text, "Comma separated" | "Used to recognise you in calendar imports." |
| 8 | Fieldset **Networking goals**, one row per goal (starts with one empty row), **+ Add goal** | goal text "e.g. Raise a $500k pre-seed by March"; **type** select: Raise capital, Win clients, Hire talent, Enter a market, Find partners, Find mentors, Career move, Other (L413); **priority** select: High priority (default), Medium priority, Low priority; number "**touches a week**" (1–50, default 3); checkbox **Active**; link **Remove** | |
| | Footer | Cancel / **Save profile** → toast "Profile saved." | |

### 4.2 App (`app/(app)/onboarding/page.tsx`)

| Step | Title / subtitle | Questions |
|---|---|---|
| 1 "About you" | "Step 1 of 3. So reminders arrive on your day and phone numbers are read correctly." | Your name; Time zone; Phone region. **Continue** |
| 2 "What are you working towards?" | "Step 2 of 3. Inroads uses your goals to suggest who to meet…" | Chips "Pick any that fit": Raise capital, Win new clients, Hire great people, Find partners, Find a mentor, Grow my career, Enter a new market; "Or in your own words" ("e.g. Meet three seed investors before March"). **Save and continue** / Skip for now |
| 3 "Bring in your people" | "Step 3 of 3. Connect what you already use…" | Google / Outlook connect cards, other ways fold, recent imports; "Next": Sort n new people / Go to Today |

### 4.3 Gaps and change

- Missing questions: Headline, Background, What you offer, Target industries, Your email addresses, goal type as a select, goal **priority**, **touches a week**, **Active**. (All columns exist: `profiles.headline/background/offerings/industries/emails`, `goals.priority/weekly_target/active/type`.)
- Extra questions: time zone and phone region. Keep them but don't ask: default from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`, `navigator.language`) on first sign-in, editable on the Account page.
- Change: delete the wizard as the entry point. `/onboarding` redirects to `/today`; Today shows the prototype card; "Set goals" opens a `ProfileGoalsSheet` with the exact fields above; "Import from Google" starts Google OAuth (real integration), "Other contacts file" opens the file import, "+ Add person" opens the person form, "Load examples" runs `ExampleDataForm`'s action. Mark `onboardingState.completedAt` when the user first has people or goals, not when a wizard ends.

---

## 5. Settings: every section and control

### 5.1 Prototype Goals tab (L967–995), in order, verbatim

| Section | Contents and controls |
|---|---|
| Hero | Stamp "PROFILE & GOALS"; h1 name or "Your profile"; lede headline or "Tell Inroads who you are and what you want from your network. Scoring, research and briefs all read from here."; **Edit profile & goals** / **Set up your profile** (opens §4.1 sheet) |
| **Goals** `{n} active` | `.goal-item` rows: priority badge (HIGH red-tint / MED / LOW), goal text, "{type} · {n} touches a week · paused", "{n} people". Empty: "No goals yet. Examples: raise a pre-seed round, land three enterprise clients, hire a senior engineer, expand into Accra." |
| **About you** (only if filled) | kv: Based in, Background, What you offer, Target industries, Your emails |
| **Goal-fit scores** | "{x} of {n} people scored against your active goals. Each run scores the {60} people with the oldest or missing scores." **Score {n} people** + busy line |
| **Import from Google** + **Choose Google files** | "Upload the files exactly as Google downloads them: .zip, .csv, .vcf or .ics, one or several at once. You review everything before it's saved, and importing again only adds what's new." Three step cards: **Google Contacts** (+ "Open Google Contacts ↗"), **Google Calendar** (+ "Open the export page ↗"), **Both at once** (Takeout, + "Open Google Takeout ↗") |
| **Other sources** | 4 `.imp` tiles: **Phone or LinkedIn contacts** (.vcf / Outlook CSV / LinkedIn .csv), **Other calendars** (.ics), **Chat history** (WhatsApp / Telegram), **Business card** ("Snap a card and the fields fill themselves.") |
| **Backup** | "Download everything as one file, or restore from a backup." **Download backup** · **Restore from backup** |
| **Example network** | "Load six example people and four events to see every feature with data in it." **Load examples** / "{n} example records are loaded. They're marked "example" and are safe to remove." **Remove examples** |
| **Connections** + **Manage** | Three status rows (dot + title): Claude, Live web search, Sync ("Synced to your Claude account" / "Saved on this device only"). Manage opens the Connections sheet with explanations and fix buttons (L1003–1023) |

### 5.2 App `/settings` (`app/(app)/settings/page.tsx`) and `/settings/profile`

Profile (Name, Email, What you do, Time zone, Brief time; **Edit profile** → page with Name, What you do, Where you're based, Background, What you can offer, Industries, Time zone, Phone region, Brief time) · Goals (count + **Manage goals**) · Spaces (list + Add a Space) · Connections (**Manage connections**, Import history) · AI (**See usage**) · Export (.zip job) · Example data (load/remove) · Account (Sign out, Delete account).

### 5.3 Mapping

| Prototype | App today | Action |
|---|---|---|
| Edit profile & goals (one sheet, profile + goal rows) | Profile page + separate goal pages | One sheet (`ProfileGoalsSheet`), saves profile and goals in one server action. Goal rows create/update `goals` in the user's default Space |
| Label "Headline" | "What you do" | Use "Headline" |
| "Based in" | "Where you're based" | Use "Based in" |
| "What you offer" | "What you can offer" | Use "What you offer" |
| "Target industries" | "Industries" | Use "Target industries" |
| "Your email addresses" | not editable (column `profiles.emails` exists) | Add |
| Goals list | Goal cards with meters | Prototype rows; meters stay on the goal page |
| About you kv | Profile kv on Settings | Move to Goals tab |
| Goal-fit scores: "Score 60 people" | "Who could help": "Find who fits in {Space}" → suggestions only | Prototype copy and button; also **show** scores on people (list pill, person tag, why) |
| Import from Google (files) | Google OAuth on Connections | Section titled "Import from Google" with **Connect Google** primary (OAuth) and the three file steps in a fold |
| Other sources tiles | "Other ways to add people" fold (ICS link, phone picker, files) | Four tiles as the prototype; add ICS link and phone picker as extra tiles |
| Backup: Download / Restore | Export (.zip job, 7-day link); no restore | See §8 |
| Example network | Example data ✓ | Same copy as prototype ("four events") |
| Connections status rows | Connections page | Status rows: Google (synced 5 min ago / not connected), Outlook, AI (on/off/limit reached), Calendar link; Manage → `/settings/connections` |
| — | Spaces, AI usage, Time zone, Phone region, Brief time, Sign out, Delete account | "Account" section at the bottom of Goals, or `/settings` page linked as "Account and Spaces" |

---

## 6. Sheets, modals and flows

| Flow | Prototype | App | Change |
|---|---|---|---|
| **Sheet system** | One stack (`S.sheets`), sticky header with × (or ← when stacked), Escape closes, backdrop closes all, body scroll locked, sheet keeps scroll on re-render (L700–718, L2646). Phone: rises from bottom, 20px top radius, `top: 26px` (nearly full height). ≥900px: 620px panel slides in from the right, full height | Radix Dialog `Sheet`: bottom sheet max 85dvh on phones, **centred 440px dialog** on desktop; records are pages | Rebuild `ui/sheet.tsx` to the prototype's panel (right-side 620px on desktop), add a sheet stack (context) and `?sheet=` URL state so Back works; render person/event detail inside it |
| **Add / edit person** | Sheet "Add person" / "Edit {name}" (L1084–1107): 2-col grid — **Name*** "Full name", **Email** "name@company.com", **Company**, **Position** "Role or title", **City** "Where they're based", **Phone**, **Where you met** (datalist of earlier places) "Event, intro, venue…", **Met on** (date, defaults today), **Interests** "Comma separated", **Potential opportunities** "How you could help each other", **Notes** "First impressions, what they care about, family, quirks…", **Birthday** (date; "Any year works; only the day is used."), **Tags** "investor, lagos, fintech"; fieldset **Profiles** (LinkedIn, X, Instagram, Substack, GitHub, Website); fieldset **Relevant to your goals** (checkboxes); **Priority relationship** checkbox; Cancel / **Add person** → opens the new person's sheet, toast "{First} added." | `/people/new` page and `QuickAddPerson` in Capture: Name, Role, Company, City, multiple Phone/Email inputs, Birthday month/day selects, Profiles, Space, Where you met, When, Interests, Notes, How you could help each other, Tags, Circle, Reminder | Sheet with the prototype field order and labels; keep multi-email/phone as "+ another"; add **Relevant to your goals** and **Priority relationship**; Space/Circle/Reminder go in a fold "More" (only when >1 Space) |
| **Log a touch** | Sheet "Log a touch with {First}" (L1144–1154): **Date** (today), **How** select (Coffee, Call, Meeting, Message, Email, At an event, Other), **What happened** "What you talked about, what they need, anything personal worth remembering"; fieldset **Promise (optional)**: **What was promised** "Send the deck, intro to Bola…", **Who owes it** (I do / {First} does), **Due**; **Log it** → toast "Logged." | `LogTouchForm` in the Capture sheet (segmented How, date, What happened); promise is a separate "Add a promise" form; also the AI quick-capture line | Add the optional promise fieldset to the touch form; button "Log it"; keep quick capture as the top of the "+" menu only on desktop (`c`) |
| **Add / edit event** | Sheet "Add event" (L1108–1125): **Title*** "Board dinner, fintech mixer…", **Date***, **Time**, **Location**, **Event page** "https://…", **Type** (Meeting, Conference, Mixer, Dinner, Meetup, Community, Event), **Repeats** (One-off, Weekly, Every 2 weeks, Monthly, Quarterly, Yearly), **Repeats until** ("Leave blank to keep going."), **Serves goal**, **Notes**; fieldset **People you'll see there** with a filter box and checklist; **Add event** → opens the event sheet, toast "Event added." | `/rooms/new` page, `room-form.tsx`: Name, Space, Type, When (date, starts, ends, time zone), Repeats (+ days / nth weekday), Until, Where, Event page, Notes, Serves goal (+ inline new goal), people picker | Sheet; prototype order and labels ("Title", "Location", "Repeats until"); keep end time, time zone and nth-weekday as the app's extras (time zone in a fold) |
| **Draft** | Sheet "Message to {First}" / "Birthday note for {First}" (L1178–1193): starts writing at once (streamed); **Edit before you send** textarea; **Copy message** (primary), **Try another**, **Log as sent**; Phone/Email with Copy; hint "Inroads doesn't send anything. Paste this into WhatsApp, SMS or email." | `DraftSheet` "Message {First}": choose Space, purpose (Check in / Follow up / Thank you / Birthday), **Write a draft**, then Open in WhatsApp / Open in email / Copy, "Log this as a touch?" | Start the draft on open with the purpose from the trigger; prototype button labels; keep WhatsApp/email links (better than copy) |
| **Chat import** | Sheet "Import a chat" (L1196–1233), 3 steps: **input** (WhatsApp/Telegram instructions, **Choose a file** .txt/.json, "Or paste the conversation", **Read conversation**) → **map** ("{n} messages from … to …", "**Which one is you?**" select with counts, "**Save what Claude finds to**" select incl. "New person: {name}", **Extract with Claude**, Start over) → **review** (summary + tone, **Key moments**, **Promises**, **Details to add**, "Suggested next step: …", **Save to {name}**) → toast "Saved n moments and n promises to {name}." | `ChatImportForm`: person must be picked first; "Your name in the chat" text field; textarea + .txt input; **Read the chat** → summary + "n suggestions are ready" → Review suggestions on the person page | Add the parse step (participants, date range, "Which one is you?"), target select with "New person", Telegram JSON, and a review step in the sheet ("Save to {name}" accepts all the suggestions) |
| **Business card** | "Scan a business card" → photo picker → AI → opens **Add person** sheet pre-filled (L1815–1826) | `CardScan` in Capture | Same outcome; make sure it lands in the prototype's Add person sheet |
| **Person ("contact") sheet** | §3.3 | Page | Sheet |
| **Event sheet** | §3.6 | Page | Sheet |
| **Connections sheet** | "What Inroads can reach right now, and how to fix anything that's off." + status rows with fix buttons (L1003–1023), opened by the header status pill, "Manage", "See how to fix it" in AI errors | `/settings/connections` page | Status pill in brand bar ("Synced" / "Google synced 5 min ago" / "AI off"), opens a sheet with rows; full page stays for managing accounts |
| **Handoff** ("Run it in a Claude chat", L1433–1451) | Copy request → paste reply → Apply, when Claude can't run in the artifact | n/a: AI runs server-side | Not needed. When AI is off, show the prototype's `.notice` explaining why (copy from L1427–1432 adapted) instead of disabled buttons with tooltips |
| **Push** | None in the prototype | Service worker / PWA only | Nothing to match |
| **ICS / Import complete** | §3.10 | Triage | §3.10 |
| **Import review** | §3.10 | Full page | Sheet |
| **Busy / progress** | Inline `.busy` strip: spinner, bold label ("Researching Ada"), mono step ("Searching the web "…"…" or "1,240 characters written"), **Stop** (L728, L204–208) | `JobStatus` / `JobProgress` with steps and shimmer | Restyle `JobStatus` as the `.busy` strip; wire Stop to job cancel if the job runner supports it |
| **Confirm delete** | Inline in the sheet, Delete (danger) / Keep | ⋯ menu + undo toast | Keep app behaviour |
| **Toast** | Dark ink pill bottom-centre, above the tab bar, 3.4s (L349–351) | `ui/toast.tsx` | Restyle to ink background |

---

## 7. Visual language

### 7.1 Tokens to port (L9–40) — replace `src/app/globals.css` `:root`

```css
:root{
  --bg:#EDEFF5; --surface:#FFFFFF; --sunk:#F4F5F9; --ink:#121726; --muted:#586077; --faint:#8C92A5; --line:#DADEE8;
  --accent:#2B44C8; --accent-ink:#FFFFFF; --accent-soft:#E3E7FA;
  --hot:#D94B31; --warm:#DB8B22; --cool:#5585C2; --cold:#9AA1B2; --fresh:#7A68D3;
  --good:#16865A; --warn:#A36600; --bad:#C23A30;
  --scrim:rgb(10 13 22 / .45);
  --shadow:0 1px 2px rgb(18 23 38 / .06), 0 12px 28px -14px rgb(18 23 38 / .22);
  --f-display:"Bricolage Grotesque","Avenir Next","Segoe UI",system-ui,sans-serif;
  --f-body:"Geist",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --f-mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --r:16px; --r-sm:11px; --rail:88px;
}
/* dark (both under prefers-color-scheme with :root:not([data-theme="light"]) and :root[data-theme="dark"]) */
--bg:#0D1017; --surface:#161A24; --sunk:#1C2130; --ink:#E8EBF3; --muted:#A1A8BB; --faint:#6E7589; --line:#2A3144;
--accent:#8A99FF; --accent-ink:#0D1017; --accent-soft:#232A52;
--hot:#F2694F; --warm:#F0AA45; --cool:#80A9DD; --cold:#6E7589; --fresh:#A595F0;
--good:#41C08B; --warn:#E6A73C; --bad:#EF6B60;
--scrim:rgb(0 0 0 / .6); --shadow:0 1px 2px rgb(0 0 0 / .3), 0 12px 28px -14px rgb(0 0 0 / .6);
```

Mapping for the existing Tailwind names (so components don't all need rewriting at once): `--sunken`→`--sunk`, `--border`→`--line`, `--border-strong`→`--faint`, `--text`→`--ink`, `--text-muted`→`--muted`, `--text-faint`→`--faint`, `--on-accent`→`--accent-ink`, `--danger`→`--bad`. Add `--color-hot/warm/cool/cold/fresh/good/warn` to `@theme inline`. Radius: `--radius-lg` 16px (`--r`), `--radius-md` 11px (`--r-sm`), buttons/chips `999px`.

### 7.2 Fonts (L6)

Bricolage Grotesque (opsz 12–96, 500–800), Geist (400–700), Geist Mono (400–600). In `src/app/layout.tsx`, swap `Inter`/`Newsreader` for `next/font/google`'s `Bricolage_Grotesque`, `Geist`, `Geist_Mono` (check `node_modules/next/dist/docs/` first, per AGENTS.md). Base: body 15px/1.5 Geist; h1 `clamp(28px,7vw,40px)/1.06` weight 720; h2 19px/1.25 660; h3 16px/1.3 650; h4 13px 650; headings `letter-spacing:-.012em`, `text-wrap:balance` (L43–51).

### 7.3 Key classes to port (as components or `@utility`)

| Prototype class (lines) | Style | Where in the app |
|---|---|---|
| `.top`, `.top-in`, `.brand` (L59–62) | sticky, `color-mix(bg 90%)` + `backdrop-filter: saturate(1.4) blur(10px)`; 960px inner; brand 760 20px display, 26px accent mark | new `features/shell/top-bar.tsx` |
| `.tabs` (L66–75) | fixed bottom 5-col grid, surface, top hairline; buttons 11px/600, faint, active accent; ≥900px a left rail of `--rail` 88px | replace `bottom-nav.tsx` + `sidebar.tsx` |
| `.stamp` (L78) | 500 11.5px/1.2 mono, `.08em`, uppercase, muted | everywhere a page has a hero |
| `.lede`, `.sub`, `.hint`, `.empty`, `.err`, `.why` (L79–85) | lede 15.5px muted 60ch; empty = dashed line, sunk bg, `--r-sm` | `ui/layout.tsx` (`EmptyState`) |
| `.hero`, `.block`, `.block-h`, `.count` (L88–93) | hero grid gap 10, padding 18/14; block padding 22/6; count = mono 12px pill | `PageHeader` → `Hero`, `Section` → `Block` |
| `.btn` (+ `.small`, `.primary`, `.quiet`, `.danger`) (L97–105) | min-height 40 (34 small), padding 0 15, **radius 999px**, 1px line border, surface, 600 14px; primary accent fill; hover darkens via `color-mix`; active `translateY(1px)` | `ui/button.tsx` variants: primary, default (= secondary), quiet (= ghost but ink, not accent), danger; sizes small/md |
| `.link` (L106–108) | accent 600 14px text button | new `variant="link"` |
| `.icon-btn` (L109–111) | 38px round, line border; pressed = warm | sheet close, star |
| `.seg` (L112–115) | sunk pill track, 3px padding, active button surface + shadow | new `ui/segmented.tsx` (the app has a `Segmented` in `ui/field.tsx`; restyle it) |
| `.chips`, `.chip` (L116–120) | horizontal scroll, 6px gap, pressed = ink fill, bg text | people filters |
| inputs (L121–124) | min-height 44, radius 11, 16px text, focus ring accent 55% | `ui/field.tsx` |
| `.av` + `.w-*` (L129–132) | 42px circle (sm 32, lg 64), sunk bg, display 650 initials, **ring** `0 0 0 2px surface, 0 0 0 4.5px var(--ring)`; ring colour from warmth | `ui/list-row.tsx` `Avatar` gets a `warmth` prop; drop the name-hue tint |
| `.score`, `.score.hi` (L133–134) | mono 12.5px pill; ≥70 accent-soft | new `ScorePill` |
| `.tag`, `.tag.goal`, `.tag.ex` (L135–139) | 12.5px/550 pill, sunk; goal = accent-soft; example = dashed | person header, discover |
| `.onboard` (L142–143) | surface card, `--r`, shadow, 18px padding | Today empty card |
| `.agenda`, `.ag`, `.ag-time`, `.ag-title`, `.prep-p`, `.tps`, `.owed` (L144–157) | 70px mono accent time column, dashed separators, prep cards bordered `--r-sm` | Today agenda |
| `.prose`, `.ai-foot` (L159–162) | brief card, surface, shadow, 70ch | `ui/markdown.tsx` wrapper |
| `.feed`, `.nudge`, `.nudge-k`, `.k-*` (L163–171) | grid of cards min 300px; card surface + shadow + `--r`; kind label mono 11px uppercase with an 8px square in kind colour: cold→cool, birthday→fresh, promise→warn, context→faint, research→accent, event→good, goal→hot | `nudge-feed.tsx` |
| `.wk-grid`, `.wk`, `.mini-list`, `.dt`, `.meter*` (L172–182) | weekly cards bordered; meter 8px bar accent | weekly brief, `ui/meter.tsx` |
| `.list`, `.row`, `.row-*`, `.ago` (L185–194) | one surface card with 1px row dividers, row 10/14 padding, hover sunk; `.ago` mono 12 faint | people, events, discover lists (`ui/list-row.tsx`) |
| `.date-tile` (L195–197) | 46×50, radius 10, sunk, day 18px display 700, month mono 10.5 uppercase | events rows (replaces `RoomKindIcon`) |
| `.kind`, `.legend` (L198–201) | mono 11 uppercase; legend dots | events, people |
| `.busy`, `.spin` (L205–208) | accent-soft strip, 16px spinner | `JobStatus` |
| `.decoder`, `.search-row`, `details.more` (L211–217) | surface card + shadow; "+ / –" summary prefix | Discover |
| `.res-sec>h3`, `.cards`, `.mini`, `.in-net` (L218–226) | mono uppercase section heads; auto-fill 260px cards | Discover result, Radar |
| `.panel`, `.sh`, `.sh-t`, `.sheet-body`, `.sec>h3`, `.kv` (L231–250) | sheet panel bg = `--bg`, phone top inset 26px radius 20; desktop right 620px; sticky header; sections separated by a top hairline and a **mono uppercase 12px h3** | `ui/sheet.tsx`, person/event sheets |
| `.dossier`, `.timeline`, `.checks`/`.check` (L253–267) | dossier = bordered surface card; timeline 62px mono date column, dashed rows; custom 20px checkbox, done = good + strike-through | person sheet |
| `form.sheet-form`, `.fgrid`, `.f`, `fieldset`, `.goal-row`, `.form-foot` (L270–289) | 2-col grid (1 col ≤560px); labels 13/600 muted above; sticky footer Cancel / primary | all forms |
| `.imports`, `.imp`, `.goal-item`, `.prio`, `.bars`, `.bar-row` (L292–310) | tiles; goal rows; HIGH badge hot tint; bar chart | Goals tab, Events "Where your network gathers" |
| `.status`, `.src-badge`, `.sources`, `.dot`, `.conn`, `.notice`, `.chk`, `.gsteps`, `.conflicts`, `.fill` (L313–348) | status pill mono 12; live badge good tint with dot; connection rows; notice accent-soft; import checkbox cards; Google step cards; conflicts warn tint | header pill, dossier, import review, connections |
| `.toast` (L349–351) | ink bg, bg text, radius 12, bottom 84px (28px desktop) | `ui/toast.tsx` |
| `.skel` (L352–354) | shimmer skeleton, height 64, `--r` | `LoadingRows` |

### 7.4 Icons

Inline 24px stroke icons, `stroke-width:1.7`, 22px (L55, L405–411): today (sun), people, discover (magnifier with plus), events (calendar), me (target). Use these SVGs for the tabs; Lucide is fine elsewhere if the stroke is set to 1.7. The brand mark is the two-stroke "road" SVG at L360; `features/shell/logo.tsx` already uses the same paths (prototype draws it at 26px with stroke 2.6, the app at 20px with 2.2).

### 7.5 Copy tone

The prototype uses the coined copy the brief banned: "Decode", "Decode the room", "Radar", "Rooms that matter", "Know the room before you walk in", "One tap pulls together…", "Claude". Use the prototype copy, replacing only "Claude" with "Inroads" where it names the AI ("Give Claude more to work with" → "Give Inroads more to work with"; "Extract with Claude" → "Read the chat"), since the app doesn't run on the user's Claude account. `DESIGN_SYSTEM.md` §4 copy rules need rewriting to match.

---

## 8. Downloads

| | Prototype | App | Change |
|---|---|---|---|
| **Download backup** | Settings-equivalent → Backup → **Download backup**: instantly saves `inroads-backup-YYYY-MM-DD.json` = `{app:"inroads", version:1, exportedAt, profile, meta, contacts, events}` (L2458–2463); toast "Backup saved." Also suggested by the out-of-storage toast (L462) and the "Saved on this device only" row (L1019) | Settings → Export → **Export your data** → background job → link "Download inroads-export-….zip · 2 MB · made …, available until …" (7 days); zip has `inroads.json` (every table) + CSVs of people, touches, promises, rooms (`server/account/export.ts`, `features/settings/export-panel.tsx`, `app/api/v1/exports/[id]/route.ts`) | Rename section to **Backup**, copy "Download everything as one file, or restore from a backup.", button **Download backup**. Keep the zip (it's a superset). Make it feel instant: start the job on click and auto-download when the job finishes (the `JobStatus onDone` callback can set `location.href` to the export URL) |
| **Restore from backup** | File picker (.json), checks `app === "inroads"`, upserts contacts and events by id, sets the profile only if yours is empty; toast "Restored n people and n events." (L2464–2476) | **Missing** (decision #128 lists it for later) | Add **Restore from backup**: upload the app's `.zip` or `inroads.json` (and accept the prototype's JSON, mapping contacts → people + person_spaces in the default Space, events → events, interactions, commitments, dossiers). Server: new `server/account/restore.ts` + `POST /api/v1/restore` (or an import type `backup` through the existing staging/review flow so the user sees "n new, n updated" before saving and can undo) |
| Other downloads | None (the draft is copied, not downloaded) | The export CSVs inside the zip | Keep |

---

## 9. Data behaviours that drive the UI (prototype rules the screens depend on)

- Warmth bands (L577–585): no touches = "No touches yet" (fresh); ≤14 days Hot; ≤45 Warm; ≤90 Cooling; else Cold. App's `domain/relationship.ts` `warmth()` uses different keys/labels (recent/warm/cooling/cold); align labels and thresholds for the ring and legend.
- "Going cold" (L587–588): cadence 30 days if starred or fit ≥70, 60 if ≥40, else 120. App uses Space/circle cadence. Keep the app's cadence (it's configurable) but show the prototype's sentence.
- Fit score (`scoreOf`, L586) is visible in the people list, person header, warm paths and priority sort. The app stores `scores` but shows none.
- Priority sort (L597): starred, then fit score, then name.
- Needs context (L589): no where-met or no interests.

---

## 10. Things the app has that the prototype doesn't (keep, but don't let them lead)

| App-only | Keep? | Where it should live |
|---|---|---|
| Real Google/Outlook OAuth sync, ICS link, phone contact picker | Yes (core integrations) | Behind the prototype's "Import from Google" / "Other sources" entry points and the Connections sheet |
| Spaces (Work / Personal / Dating), Space switcher, per-Space briefs | Yes (privacy model) | Hide the switcher while there's one Space; otherwise a small select in the brand bar. Space fields in forms go in a "More" fold |
| Circles, per-person reminder cadence | Yes | Person form "More" fold; Account page for circle editing |
| Goal pipelines (stages, steps, recent moves, `/goals/[id]`) | Yes | Drill-in from each Goals-tab goal row; "Steps due" folds into Today's weekly view |
| Import triage (Sort n new people), duplicates review, suggestions review | Yes | A single `.notice` strip on People and as Today nudges; not the People header |
| Ask your network (`/people/ask`) | Yes | A link in People's action row overflow, or a Discover type |
| Quick capture (AI one-liner), voice capture, `c` shortcut, ⌘K palette | Yes | Desktop shortcuts; on phones, quick capture as the first item of "+ Add person"/"Log a touch" sheets. Remove the central FAB |
| Room debrief "Who did you meet?", "What it's led to" | Yes | Event sheet, after People |
| Introductions (intro asks) | Yes | Person sheet, after Timeline |
| AI usage & limits page | Yes | Account page |
| Share target (`/share`), offline outbox, PWA | Yes | Invisible |
| Delete account, sign out | Yes | Account page |
| Undo toasts, archive | Yes | Unchanged |

---

## 11. Implementation plan (smallest risk first)

Each milestone ships on its own and keeps tests green. Update Playwright selectors as labels change (`tests/e2e/*` use names such as "Capture", "Add room", "Search people", "Expand sidebar", "Set your goals"). Read `node_modules/next/dist/docs/` before touching layouts, fonts or routing (AGENTS.md).

**M1 — Tokens, fonts and primitives (visual only, no flow change).**
- `src/app/globals.css`: port §7.1 tokens (keep the old names as aliases), `@theme` additions, base type (§7.2), `.stamp`/`.lede`/`.empty`/`.skel` utilities.
- `src/app/layout.tsx`: Bricolage Grotesque + Geist + Geist Mono via `next/font/google`; theme colours in `viewport.themeColor` (`#EDEFF5` / `#0D1017`).
- `src/ui/button.tsx` (pill, sizes, `quiet`, `link`), `src/ui/field.tsx` (44px inputs, radius 11, `Segmented` → `.seg`), `src/ui/list-row.tsx` (`Avatar` with warmth ring, `.list`/`.row`), `src/ui/warmth.tsx` (ring colours + legend), `src/ui/layout.tsx` (`Hero` with stamp/h1/lede, `Block` with count pill, `EmptyState` dashed), `src/ui/meter.tsx`, `src/ui/toast.tsx`, `src/features/shell/page-frame.tsx` (960px).
- `src/domain/relationship.ts`: warmth labels Hot/Warm/Cooling/Cold/No touches yet (keep keys stable for callers).
- `docs/DESIGN_SYSTEM.md`: rewrite §1–4 from this report; `docs/DECISIONS.md`: new entry superseding #3 and the design direction.

**M2 — Shell and navigation.**
- `src/features/shell/nav-items.ts` (Today, People, Discover, Events, Goals + prototype SVG icons), new `top-bar.tsx` (brand + status pill), `bottom-nav.tsx` (5 tabs, no FAB), `sidebar.tsx` → 88px rail, `src/app/(app)/layout.tsx`.
- New `src/app/(app)/discover/page.tsx` (initially re-using `LookupForm` and the recent list); redirect `/rooms/lookup` → `/discover`.
- Status pill data: `server/repos/connections.ts` (latest sync) + `isAiConfigured()`; opens `/settings/connections` until M4's sheet exists.

**M3 — Today.**
- `src/app/(app)/today/page.tsx`: hero with greeting + summary + Today/This week `seg`; onboarding card (§4.1) and "Set up" goal card; daily = Today's rooms (`.ag`/`.prep-p`, "+ Event", "Decode this room") + brief block; weekly = `wk-grid` (Rooms to be in, Going cold, New openings, Goal progress) + weekly brief; Nudges grid last.
- `src/features/today/nudge-feed.tsx` (card grid, kind colours, primary first action), `src/domain/nudges.ts` (labels/titles per §3.1 table), `src/features/ai/briefs.tsx` (one inline block per mode, "Written … · Rewrite"), `src/features/today/this-week.tsx` → weekly grid, `src/domain/greeting.ts` (h1 greeting only; summary line separate).

**M4 — Sheet system and the record sheets.**
- `src/ui/sheet.tsx` rebuilt to the prototype panel (bottom on phones, right 620px on desktop, back/close, stack); a `SheetStack` provider in `features/shell/app-providers.tsx` with `?sheet=person:id` URL state.
- Person sheet from the existing data loaders (`server/repos/people.ts getPerson`, `features/ai/person-ai.tsx`) in prototype order (§3.3); event sheet from `server/repos/rooms.ts getRoom` (§3.6). Keep `/people/[id]` and `/rooms/[id]` routes rendering the same component full-page for deep links.
- Forms as sheets: `features/people/person-forms.tsx` (prototype labels/order, goals checklist, priority), `features/people/capture-forms.tsx` (touch + optional promise, "Log it"), `features/rooms/room-form.tsx` (prototype labels/order, people checklist with filter), `features/ai/draft-sheet.tsx` (auto-start, "Copy message", "Try another", "Log as sent").
- `features/shell/capture-sheet.tsx`: becomes the provider for these sheets; remove the menu-first FAB flow.

**M5 — People and Events lists.**
- `features/people/people-list.tsx` + `app/(app)/people/layout.tsx`: drop `ListDetailShell`; hero "Your network", five action buttons, search + sort (Priority default), chips, `.list` rows with fit pill and "{n}d", legend, prototype empty copy. `server/repos/people.ts` + `contracts/people.ts`: add `score` to list items, `priority` sort, `no_dossier` filter.
- `features/rooms/rooms-list.tsx` + `app/(app)/rooms/layout.tsx`: one page — hero "Rooms that matter", actions, Next 30 days (date tiles, ≤2 per series), Radar section (move `rooms/suggested` content in; `features/ai/room-ideas.tsx` restyled to `.mini` cards with "+ My events", "Decode"), Recurring, Where your network gathers (new query in `server/repos/rooms.ts` or `people.ts`), Past (folded).

**M6 — Goals tab = Profile & goals (the prototype's settings) + Backup.**
- `src/app/(app)/goals/page.tsx`: hero, Goals rows (→ `/goals/[id]`), About you, Goal-fit scores ("Score n people", `features/ai/ai-job-button.tsx` with `kind:"score"`), Import from Google (Connect Google + file steps fold), Other sources tiles, **Backup**, Example network, Connections status rows, and a final link "Account and Spaces" → `/settings`.
- New `features/settings/profile-goals-sheet.tsx` + server action in `features/settings/actions.ts` (profile fields incl. `emails` + goal rows upsert via `server/repos/goals.ts`).
- `features/settings/export-panel.tsx` → "Download backup" (auto-download on job done). New restore: `server/account/restore.ts`, `app/api/v1/restore/route.ts` (or an import `type:'backup'` through `server/import/imports.ts` so review + undo come for free), `features/settings/restore-backup.tsx`; accepts the app zip/JSON and the prototype JSON. Tests in `tests/db/account.test.ts`.
- `src/app/(app)/settings/page.tsx`: trim to Account (time zone, region, brief time, Spaces, AI usage, sign out, delete).

**M7 — Onboarding.**
- `src/app/(app)/onboarding/page.tsx`: redirect to `/today`; remove `features/connections/about-you-form.tsx`, `finish-onboarding.tsx`, `features/goals/goals-step.tsx` from the flow (keep files until tests move).
- On first sign-in (`app/auth/callback/route.ts` or `server/repos/account.ts`), set time zone/region from the browser (pass via a hidden form on Today or a client effect calling `saveAboutYouAction`).
- `completedAt` set when the user first has people or goals.

**M8 — Discover, import review and chat import parity.**
- Discover page full parity (§3.4): inline result rendering (`features/ai/plan.tsx` → prototype sections), Person/Place/Event `seg`, "Add what you already know", Recent rooms list; "Decode their world" on the person sheet links here pre-filled.
- Import review as a sheet with per-calendar checkboxes, "Skip n entries with no name", "Also add upcoming events with no other guests", "Your email address in these calendars" (`server/import/files.ts`, `server/import/imports.ts`, `features/connections/import-review-actions.tsx`); "Import complete" summary sheet with "People from your calendar you haven't saved" → triage.
- Chat import 3-step sheet (§6): parse participants client-side (port `parseChat`, L1829–1863, into `src/importers/chat.ts` with tests), Telegram JSON, target select with "New person", review step that accepts the resulting suggestions in one tap (`features/ai/chat-import.tsx`, `server/ai/prompts/capture.ts`).
- Dossier card parity: source badge, "Missing from their profile — Add these n" (accept-all over pending suggestions), "Look them up yourself" links (`features/ai/person-ai.tsx`, `features/ai/suggestion-list.tsx`).

**M9 — Clean-up.**
- Remove `ListDetailShell`, `detail-marker.tsx`, unused Newsreader/Inter references, old copy; update `README.md`, `CHANGELOG.md`, e2e tests and axe runs in both themes.
