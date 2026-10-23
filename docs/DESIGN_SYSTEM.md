# Inroads design system

Status: **draft for review** (part of the Step 1 review alongside `TECH_PLAN.md`).
Direction: brief §5. Calm, editorial, dense where it matters. Linear, Things and Attio, not a dashboard template.

## 1. Principles

1. **Restraint is the style.** One accent colour, warm neutrals, few borders. Hierarchy comes from type, spacing and alignment, not boxes.
2. **Lists and text, not cards.** A card is used only for something you act on as a unit: a nudge, a suggestion, a capture sheet. Everything else is a row or a section.
3. **Every mark carries information.** No decorative icons, no emoji as UI, no gradient, no pills for things that aren't filters or toggles.
4. **Say what happens.** Buttons are verbs with objects: "Log meeting", "Open in WhatsApp", "Research Ada". No "magic", "one tap", "decode", "supercharge", no exclamation marks.
5. **Show why.** AI output always shows its reasons, the saved details it used, and its sources, and always offers Accept / Edit / Discard.
6. **Fast on a cheap phone.** System-light visuals, no blur or shadows on scroll, motion that is short and can be turned off.

## 2. Tokens

All tokens are CSS custom properties on `:root`, overridden under `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` (unless the user picked light). Tailwind v4 reads them via `@theme`.

### 2.1 Colour

Warm-grey neutrals plus a single accent: **Inroads green**. Contrast ratios were measured (WCAG 2.1).

| Token | Light | Dark | Use | Contrast |
|---|---|---|---|---|
| `--bg` | `#FAF9F7` | `#141311` | App background | — |
| `--surface` | `#FFFFFF` | `#1C1A18` | Panes, sheets, inputs | — |
| `--sunken` | `#F3F1EE` | `#100F0E` | Hover rows, code, selected list row | — |
| `--border` | `#E6E2DC` | `#2E2B27` | Hairline dividers (decorative) | — |
| `--border-strong` | `#8F887E` | `#6B655D` | Input outlines, focusable control edges | 3.3:1 / 3.0:1 (non-text ≥3) |
| `--text` | `#1C1A17` | `#EDEAE5` | Primary text | 16.5:1 / 15.5:1 |
| `--text-muted` | `#625C54` | `#A39C92` | Secondary text, metadata | 6.3:1 / 6.8:1 |
| `--text-faint` | `#736D64` | `#8A847B` | Placeholders, timestamps | 4.9:1 / 5.0:1 |
| `--accent` | `#1E6B52` | `#5FBF98` | Primary buttons, links, focus ring, selected nav, "recent" dot | 6.1:1 / 8.3:1 on bg |
| `--accent-hover` | `#175843` | `#7FD0AE` | Hover/pressed | — |
| `--on-accent` | `#FFFFFF` | `#0E1F18` | Text on accent | 6.4:1 / 7.7:1 |
| `--accent-soft` | `#E6F0EB` | `#1D2E27` | Selected row tint, suggestion card edge | accent on soft 5.5:1 / 6.4:1 |
| `--danger` | `#B42318` | `#F97066` | Destructive actions, errors only | 6.3:1 / 6.7:1 |
| `--focus` | `var(--accent)` | `var(--accent)` | 2px ring, 2px offset | — |

Rules:
- There is **no second brand colour**. Status uses text first ("Overdue", "Due in 2 days"); `--danger` is reserved for errors and destructive confirmations.
- **Warmth** is a 6px dot plus a text label ("2 weeks ago"). The dot's tone comes from one ramp: recent = `--accent` solid, warm = `--accent` at 55% opacity, cooling = `--text-faint` solid, cold = hollow `--border-strong` ring, no touches = no dot. Colour is never the only signal.
- Space identity has no colour. Spaces are named in text, and the switcher shows the name.

### 2.2 Typography

- **UI face:** Inter (variable, self-hosted via `next/font`, latin + latin-ext subset). `font-feature-settings: "cv11", "ss01"`. Tabular figures (`tnum`) only where numbers are compared: progress counts, times in the agenda, import counts.
- **Display face:** Newsreader (serif, weight 500 only), used for **page titles only** (Today's date line, a person's name in their detail header, a goal title). Nowhere else.
- No monospace anywhere in the UI. No uppercase labels; section headings are sentence case.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--type-display` | 28 / 34 (mobile 24 / 30) | Newsreader 500 | Page title |
| `--type-title` | 18 / 26 | 600 | Section heading, pane title |
| `--type-body` | 15 / 22 | 400 | Default text, list primary |
| `--type-body-strong` | 15 / 22 | 550 | Names in rows, button labels |
| `--type-small` | 13 / 18 | 400 | Metadata, secondary row line, hints |
| `--type-micro` | 12 / 16 | 500 | Keyboard hints, counts in nav. Never for sentences |

Mobile body stays 15px (16px for inputs, to stop iOS zoom). Measure is capped at 68ch for prose (briefs, dossiers).

### 2.3 Spacing

4px base. `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64.
- List row: 12px vertical / 16px horizontal padding; 44px minimum height (touch target), 36px in desktop "compact" density.
- Section rhythm: 32px between sections, 12px between a heading and its content.
- Page gutters: 16px mobile, 24px tablet, 32px desktop pane padding.

### 2.4 Radius, elevation and motion

- Radius: `--radius-sm` 4px (inputs, small buttons), `--radius-md` 6px (buttons, rows on hover), `--radius-lg` 10px (cards, sheets, popovers), `--radius-full` only for avatars and the warmth dot.
- Elevation: **none on surfaces at rest.** `--shadow-pop` (`0 4px 16px rgb(0 0 0 / .08), 0 0 0 1px var(--border)`) only for floating layers: menus, ⌘K, toasts, mobile sheets.
- Motion: 120ms for hover/press, 180ms for sheet and pane transitions, `cubic-bezier(.2,.8,.2,1)`. Under `prefers-reduced-motion: reduce`, transitions become instant opacity changes and nothing slides.

### 2.5 Layout

- Breakpoints: `sm` 640, `md` 900 (list/detail starts), `lg` 1200, `xl` 1500.
- Desktop shell: sidebar 232px (collapsible to 56px) · list pane 360–420px · detail pane fills the rest, max 760px content width.
- Mobile shell: 56px header, bottom nav 64px + safe-area inset, with the central Capture button 52px round in `--accent`.

### 2.6 Iconography

Lucide icons at 16px (desktop) / 20px (mobile nav), 1.5px stroke, `currentColor`. Icons sit next to a text label; an icon-only button is allowed only with an `aria-label` and a tooltip (desktop), and only for universal actions (close, more, back).

## 3. Core components

| Component | Notes |
|---|---|
| **Button** | Variants: `primary` (accent fill), `secondary` (surface + border-strong), `ghost` (text only), `danger`. Sizes `sm` 32px / `md` 40px / `lg` 48px (mobile primary). Label is a verb. Loading state keeps width and shows inline text ("Saving…"). |
| **Input / Textarea / Select / DateInput / TimeInput** | Label above, hint below in `--text-muted`, error in `--danger` with an icon and `aria-describedby`. 16px text on mobile. |
| **Field group** | Groups fields with a sentence-case legend. No boxed fieldsets. |
| **ListRow** | Primary line (name, `body-strong`), secondary line (role · company, `small` muted), trailing metadata (warmth label, due date), optional leading avatar (initials on `--sunken`, never coloured rings). Keyboard: roving focus, `j/k`, `enter`. |
| **VirtualList** | Wraps ListRow with @tanstack/react-virtual, keyset "load more" sentinel, preserves scroll per route. |
| **Pane** | Desktop detail container: sticky header (title + actions), scrollable body. Mobile: full-screen page with a back button. |
| **Section** | Heading (`type-title`), optional trailing action as a ghost button, content. No border, just spacing. |
| **Toolbar / FilterBar** | Search input + filter menu (Radix Dropdown) + sort. Active filters appear as removable tokens, the only place pill shapes are used. |
| **NudgeCard** | Title (what and who), one-line reason, at most two actions (primary verb + secondary), plus a "…" menu (Snooze 1 day / 1 week / Dismiss). One small text label for the kind (e.g. "Promise", "Birthday"), sentence case, muted. |
| **SuggestionCard** | For AI output. Shows the proposed change as a diff ("Company: *empty* → Paystack"), **Why** (one line), **Based on** (saved details used), **Sources** (favicon-free list: title + host), buttons **Accept**, **Edit**, **Discard**. A thin `--accent` left edge marks it as a suggestion. |
| **Sources** | Ordered list of title + host links, opening in a new tab with `rel="noopener noreferrer"`. A note on how it was produced ("From the web, 5 sources" / "From the model's knowledge only, verify before relying on it"). |
| **JobProgress** | Inline status for background work: current step text ("Reading linkedin.com…"), done/total if known, Cancel. Reads persisted state, so it survives reloads. |
| **Sheet** (mobile) / **Dialog** (desktop, rare) | Mobile bottom sheet for Capture and short forms. Desktop uses inline panes; Dialog only for confirmations and ⌘K. |
| **CommandPalette** | cmdk: people, rooms, goals, actions, Space switch; shows shortcuts. |
| **Toast** | Bottom-centre (mobile, above nav) / bottom-left (desktop). Text + optional Undo. `aria-live="polite"`. 6s, or 10s when it has Undo. |
| **EmptyState** | One sentence that teaches the next action + one button. No illustration. |
| **Avatar** | Initials, 24/32/40px, `--sunken` background, `--text-muted` initials. A photo if the user has added one. |
| **WarmthIndicator** | Dot + label (see 2.1). |
| **StageSelect** | Goal pipeline stage control: a menu on desktop, a sheet list on mobile, with keyboard `[` / `]` to move stages. |
| **KeyHint** | `type-micro` key labels in menus and tooltips (desktop only). |

## 4. Copy rules

- Sentence case everywhere. No "!" and no "Oops".
- Buttons: verb + object. "Log a touch", "Draft a message", "Open in WhatsApp", "Research Ada", "Look up this room", "Mark done", "Snooze for a week".
- Names for AI features: **Research** (Work), **Get to know** and **Check they're real** (Personal/Dating), **Look up** (people, companies, places, events: the old "Decode"), **Suggested rooms** (old "Radar"), **Draft**, **Brief**.
- Times are relative when recent ("3 weeks ago", "tomorrow"), absolute beyond 6 months ("12 Mar 2026"). Dates use `d MMM` (no leading zeros), with the year shown only when it isn't the current one.
- Errors say what happened and what to do: "Couldn't save. You're offline, so this is saved on your phone and will sync when you're back online."
- The signature word is **rooms**, used for events. Nowhere else gets a coined term.

## 5. Accessibility

- WCAG 2.1 AA: contrast per §2.1; focus is always visible (2px accent ring); every control is reachable and operable by keyboard; Radix handles focus traps in sheets and dialogs.
- Targets ≥44×44px on touch.
- Live regions for toasts and job progress. Form errors are linked with `aria-describedby`, and focus moves to the first error on submit.
- `prefers-reduced-motion` is respected. `prefers-color-scheme` is the default theme source, with a manual override in Settings.
- Playwright runs `@axe-core/playwright` on each main screen in both themes. A violation fails CI.

## 6. Three example screens

### 6.1 Today (desktop, 1440px)

The sidebar on the left shows the Space switcher ("All spaces ▾") at the top, then Today (selected: accent text with a `--accent-soft` background), People, Rooms and Goals, then Settings at the bottom with a faint "⌘K" hint. The main area has no list pane on this screen. Instead there are two columns inside a 1100px container.

At the top, the page title in Newsreader 28px reads "Thursday 23 October", with "4 rooms today · 6 things to follow up" beneath it in muted small text. To the right sit one secondary button, "Write today's brief", and a ghost "…" menu.

The left column (60%) is headed "Today's rooms" (title style, sentence case). Each room is a row: the time in tabular figures on the left ("9:30am"), then the title ("Coffee with Ada Okafor") and the location in muted small text. Beneath, indented, are prep lines for each person: "Last spoke 3 weeks ago about the Paystack partnership", "Ask about: her talk at Lagos Startup Week", "You owe her: the pitch deck". If a person has no research, a ghost link reads "Research Ada". Rows are separated by space, with no dividing boxes.

The right column (40%) is headed "Follow up". It holds a stack of NudgeCards with 12px between them. Example: a "Promise" kind label in muted micro text, the title "Send Tunde the deck", the reason "Due tomorrow · from your call on 14 Oct", and the buttons "Mark done" (primary, small) and "Open" (ghost), with a "…" menu for snoozing. A due-for-touch card reads "Bola Adeyemi: 5 weeks since you spoke. You aim for every 4." with "Draft a message" as its action. When the user has pending suggestions, the feed ends with a single summary card: "3 suggestions from research waiting for review", with the action "Review".

Below both columns, collapsed by default, sits "Brief: Work". Expanded, it shows prose capped at 68ch, then a line in muted small text: "Written at 7:30am · From your data and 2 web sources". The sources follow.

### 6.2 Person detail (desktop, list + detail)

The list pane (380px) shows a search box at the top ("Search people", with a `/` key hint), then a filter button and a sort menu. Rows show the name (strong), "Partnerships · Paystack" (muted), and a warmth dot with the label "3 weeks ago" on the right. The selected row has a `--accent-soft` background.

The detail pane opens with a header: an avatar with initials at 40px, the name "Ada Okafor" in Newsreader 28px, and "Head of partnerships at Paystack · Lagos" in muted body text. On the line beneath sit the warmth label and dot, "Every 4 weeks · Investors circle" as a ghost button that opens the cadence and circle menu, and the Space name in muted text. The actions on the right are "Log a touch" (primary), "Draft a message" (secondary) and "Research" (secondary), plus "…" (edit, archive, merge, delete).

Sections follow, each a plain heading with content beneath.
- **Promises:** two short lists, "You owe" and "Ada owes", with a checkbox per row, its due date on the right, and overdue items showing "Overdue" in text.
- **Timeline:** reverse-chronological touches. Each row shows date, type and summary, and a source label where it isn't manual ("From Google Calendar").
- **Goals:** each linked goal with a StageSelect showing its current stage ("Introduced"), and "Add to a goal" as a ghost button.
- **Research:** the latest dossier version shows a summary, talking points and openings, then "Version 3 · 12 Oct · 6 sources". A "Compare with version 2" link and the Sources list follow.
- **Suggestions:** appears only when there are any. SuggestionCards such as "Company: empty → Paystack. Why: her LinkedIn and the Paystack team page both list her. Based on: saved LinkedIn handle, work email domain." with Accept / Edit / Discard.
- **Details:** emails, phones (formatted for display, e.g. "+234 803 123 4567"), socials, where met, birthday, interests and notes, all editable inline with `e`.

### 6.3 Import triage (mobile, 390px, installed PWA)

The header reads "Sort your contacts" with "128 of 842" in tabular muted text and a "Done for now" ghost button. Under a thin progress bar in accent, one person fills the screen at a time. Their name ("Chidi Nwosu") is in 22px semibold, with whatever was imported beneath it in muted text: "Engineer · Flutterwave", "chidi@…", "+234 80…", and "In your Google Contacts since 2021 · 3 meetings in the last 6 months". If they're a possible duplicate, a quiet line reads "Might be the same as Chidi N. (Work)", with a "Compare" link.

At the bottom, within thumb reach, sit three full-width buttons stacked with 8px gaps: "Keep" (secondary), "Priority" (primary, accent) and "Archive" (ghost). Above them is a single row of segmented cadence choices that appears after Keep or Priority: "2 weeks · Monthly · Quarterly · Never". The choice is pre-selected from the Space default. A circle picker sits above the cadence row, defaulting to the last circle used.

Each choice saves immediately with an optimistic update, and works offline from the queue. The next person slides in (an instant swap under reduced motion). Under the buttons, a small "Undo" link reverts the last choice. When the queue empties, an empty state reads "All sorted. Inroads will remind you when it's time to get in touch.", with a "Go to Today" button.
