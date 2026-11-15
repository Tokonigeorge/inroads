# Motion and personality

Inroads should feel like a calm friend who's quick on their feet: unhurried when nothing's happening, lively when something is. Paint gives the calm; bounce gives the life.

## Principles

1. **Arrive with a little bounce, leave calmly.** New things (bubbles, cards, the banner, toasts) rise 14px and settle with `ease-arrive` over `dur-arrive`. Leaving things use `ease-calm` over `dur-exit`.
2. **Paint is always slow.** Washes drift over `dur-drift` (24 seconds each way). Blooms spread over `dur-bloom`. Nothing painted ever snaps.
3. **Show Inroads working.** The mark breathes with a soft halo (`dur-breathe`) and work appears as live steps or typing dots. Never a frozen screen or a bare spinner.
4. **Reward real outcomes only.** Pigment drops and a rising Scene for an intro made, a weekly goal hit, the Inbox cleared. Never for routine taps.
5. **Move with the hand.** Swipes and presses respond on the same frame; a released card settles with `ease-arrive`.
6. **One moment at a time.** Stagger arrivals 80ms apart; let lesser things simply appear.
7. **Reduced motion:** every animation becomes a 120ms fade; drifts, breathing, blooms and drops stop.

## The moments

| Moment | What moves | Timing |
| --- | --- | --- |
| Brief opens | The wash fades up and starts its slow drift; the greeting appears; Inroads' bubble rises; the ready banner rises and its number pops in with a small turn | `dur-arrive`, number after 320ms |
| Inroads replies | Typing dots hop in turn (at least 400ms) while the mark breathes; then the bubble rises | `dur-arrive` |
| Approve a card | Mint ink blooms out from your finger; the card flies right with a 2° turn; a mint "Sent" line appears and its check draws itself; Undo toast | `dur-bloom`, `dur-exit`, 420ms draw |
| Skip a card | The card flies left with a −2° turn | `dur-exit` |
| Swipe on phone | Card follows the finger, tilting slightly, with `shadow-lift`; past a third of the width it completes | `ease-arrive` on release |
| Inbox cleared | A Scene paints in: hills rise one after another, the sun comes up; pigment drops scatter | 80ms per hill, 1200ms sun |
| Research or planning | Live steps rise in; done steps get a leaf dot; the current one spins | `dur-arrive` per step |
| Loading | Skeleton shapes with a sky wash moving across like wet paint | 1800ms loop |
| Press | Primary presses 2px into its shadow; others squish to 0.96 | `dur-tap` |
| Voice note | Mic turns blue with two soft ripples; the field becomes a moving wave | 1600ms ripple, 900ms wave |
| Strength | Bars fill from zero the first time they're seen | `dur-fill` |
| Toast | Rises from below, fades after 6 seconds | `dur-arrive` |

## Don'ts

- No motion tied to scrolling, no parallax.
- No glow, no neon, no flashing.
- Lists don't bounce when sorting or filtering.
- Washes stay behind headers; never animate paint behind text you're reading.
- Never make anyone wait for an animation to finish before the next tap.
