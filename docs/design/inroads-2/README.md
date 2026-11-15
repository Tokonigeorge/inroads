# Inroads 2 design system

The source of truth for Inroads 2's look (DECISIONS #215). Published copies: the design system and clickable prototype artifacts linked from the product map.

- `tokens.json`: colours (light and dark), type, spacing, radius, shadows, motion timing. Every text pair is checked for contrast in `src/features/v2/build-css.test.ts`.
- `components.css`: component styles and motion (watercolour wash, scenes, bubbles, cards, rows, input, toasts, loading, celebrate).
- `motion.md`: when and how things move.
- `prototype.html`, `product-map.html`: the clickable prototype and the full product map, as published.
- After changing `tokens.json` or `components.css`, run `pnpm build:v2-css` to regenerate `src/features/v2/v2.css`.

## Brand book

Inroads 2 is a relationship app that does the work with you: it notices, prepares and drafts, and you approve. The look is **Dex's calm and Boardy's confidence**: warm paper, room to breathe and soft watercolour washes, with one bright blue, big tight headlines and big friendly numbers. Soft tinted cards and a little bounce keep it fun without shouting.

## Content fundamentals

- Inroads speaks in the first person, to "you": "Two things matter today." "I drafted a note to Adaeze." Warm, specific, brief: one to three sentences per bubble.
- Name people. "Congratulate Adaeze", never "1 contact needs attention". First name after the first mention.
- Every suggestion says why, in a reason tag: "New role · 40 days since you spoke".
- Buttons are verbs that say what happens: "Send on WhatsApp", "Ask both", "Book it". Never "OK" or "Submit".
- Confirmations are past tense and specific: "Sent to Adaeze. Logged as a touch."
- Sentence case everywhere; uppercase only in `label` (mono) for section labels and the date line.
- No emoji in the interface. Lagos is home: times in your zone with theirs in brackets ("6pm (9pm Dubai)"); naira first where money appears; local names and places in examples.

## Visual foundations

**Colour.** Pages sit on `paper`; plain cards, bubbles and lists on `surface`; wells on `surface-sunk`. Text is `ink`, secondary text `ink-muted`. `blue` is the only strong colour: the main action, Inroads' mark, your own bubbles, links, the ready banner and focus. Everything else is a soft tint by kind of thing: `peach` for moments about people, `butter` for intros and your own notes, `mint` for done and sent, `lilac` for meetings and events, `blue-soft` for what Inroads is doing. Labels on a tint use its `on-` colour. Avatars use `violet`, `tomato`, `leaf`, `blue`, `sun`. `sun` is for celebration only. `danger` only for delete and errors, with the word.

**Watercolour.** Dex's calm comes from paint, in our own pigments (`wash-sky`, `wash-peach`, `wash-sage`, `wash-sand`): a Wash behind the top of the Brief, a person page and onboarding; a painted Scene (hills and a sun) for empty states and wins; a faint bloom in the corner of tinted cards; ink that blooms from your finger when you approve. Washes are mottled like real paper and carry a fine grain. Never behind running text, one wash per screen.

**Type.** Geist throughout, as Boardy does: `display-xl` (40px, very tight) once per screen for the greeting, with the name in `blue`; `count` (56px) for big friendly numbers; `display-l` for screen titles and a person's name; `title` for cards and rows. Read in `body`; reasons in `small`; the person story in `story`; reason tags in `tag`. Times and days in `time` and section labels in `label` (Geist Mono).

**Shape.** Generous rounding: `radius-lg` (24px) for cards, lists and the banner; `radius-md` (16px) for drafts, notes and inputs; `radius-bubble` for messages with the speaker's corner at `radius-sm`; `radius-pill` for buttons, chips, tags and avatars.

**Elevation.** Barely there: `shadow-card` (a 1px soft shadow) on plain surfaces; tinted cards have none. `shadow-float` for the one input and toasts. The primary button and the ready banner sit on a hard `blue-deep` shadow they press into: the one Owambe-style touch.

**Spacing and layout.** Phone gutter `space-4`; cards pad `space-4`; Inbox cards `space-5` apart; sections `space-6`; `space-12` of open paper above the greeting so the wash can breathe. Brief and Inbox are one column (max about 640px) on desktop too; People, Events and Goals use the width.

**States.** Hover tints rows to `paper`. Primary buttons press down 2px; others squish to 0.96. Focus is a 2px solid `blue` ring, offset 2px. Disabled is 50% with a working label ("Sending…"). Empty states are a Scene and one line from Inroads.

**Motion.** Things arrive with a gentle bounce, leave calmly, and Inroads visibly breathes while it works; paint drifts and blooms. Full rules in the Motion section.

## Surfaces

- **Brief:** a Wash, the date line, the greeting, Inroads' message, the ReadyBanner ("6 things ready for you"), then today's rows and this week's progress.
- **Inbox:** filter chips, then ActionCards tinted by kind; a Scene when it's clear.
- **People, Events, Goals:** calm row lists on `surface`, search and filters, the record in a sheet or panel.
- **Person page:** PersonStory over a Wash, actions, "What Inroads is doing" (`blue-soft`), then promises, timeline, intros, goals. Every action from today's app stays.
- **One input** floats on every screen. The forms stay one tap away.

## Iconography

Lucide icons, 1.75px stroke, 18px in buttons and 20px in navigation, in the colour of the text beside them. No emoji as icons. The only drawn brand shapes are the Inroads mark (blue disc, white ring) and the painted Scenes. No logo file yet: the name is set in `display-l`.

## Accessibility

Every text pair meets 4.5:1 in both themes (ratios are in each colour's note); controls and focus meet 3:1. Status never relies on colour alone: tags say why, due says "Today", strength shows a number and a word. Every motion has a reduced-motion version (120ms fade; drifting washes, breathing and blooms stop). Hit areas at least 40px; rows 44px.
