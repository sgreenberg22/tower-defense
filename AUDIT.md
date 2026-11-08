# Bastion Siege: quality audit (v1.60.0 baseline)

Audit date: 2026-11-08. Baseline: `main` at v1.60.0, 440/440 tests passing.

## How this was measured (and what it cannot tell us)

- **Layout and tap targets:** headless Chrome through Playwright, against a local static copy, at phone portrait (375x812), phone landscape (812x375), tablet (768x1024) and desktop (1280x800). Every menu screen (home, Keep, Collection, Allies, Guide, run setup, What's new) plus the in-run HUD for Classic and Commander (`hero`) runs.
- **Accessibility:** the A11y Enforcer static scan, plus axe-core 4 run in the live page on each screen above, plus a read of the shared UI code.
- **Gameplay:** a bot-driven tower sweep using the repo's own `Game` engine (same map, seed, plots and total spend; two of eight slots swapped for each tower in turn; 4 maps x 4 seeds per variant).
- **Not measurable here:** real-device performance (this sandbox has no GPU, so 3D frame rates are meaningless; see below), the live Realm/API (no backend in the local copy), and real player behaviour (there is still no usage data).

Two console messages seen during the audit are **sandbox artifacts, not game bugs**: Google Fonts blocked by the sandbox proxy, and `/api/health` returning 404 on a plain static server.

## Findings, ranked by player impact

### P1: pinch-zoom is disabled on every screen (WCAG 1.4.4)
Phones cannot enlarge menu text. It is blocked in three places: the viewport meta (`maximum-scale=1, user-scalable=no`), a global `touch-action: pan-x pan-y`, and `lockZoom()` in `src/ui/nozoom.js`. The lock is deliberate (a stray pinch during a battle is bad), but it also applies to the Keep, the Guide and every other menu, where there is no reason for it.

### P1: the defeat screen never says why you lost
The summary shows score, records, kills, accuracy and rewards. Nothing says what broke the castle. The engine already emits a `leak` event per breach but records nothing about which foes did the damage, so there is nothing to show. For a game about learning from a loss, this is the biggest playability gap found.

### P1: every modal is a keyboard and screen-reader trap-door (`modal()` in `src/ui/dom.js`)
- The dialog has no accessible name (axe `aria-dialog-name`).
- There is no focus trap: Tab leaves the dialog into the page behind it.
- Closing the dialog does not return focus to the button that opened it.

### P2: tap targets under 44 px on phones
- In-run top bar: Pause 45x34, View 59x34, Hero 72x34, Sound 38x28, Speed 35x28 (CSS px). Foe-preview icons 44x26.
- `.btn.small` is 40 px tall, so most of the Keep (34 of 35 controls), Collection and Allies screens miss 44 px. (All pass WCAG 2.5.8's 24 px minimum.)

### P2: ARIA errors
- How-to tour: `role="tablist"` containing plain buttons with `aria-selected` (axe `aria-allowed-attr` x7, `aria-required-children`). The chips need `role="tab"`.
- Ammo gauge: `aria-label` on a `div` with no role (`aria-prohibited-attr`).
- **Label in Name (WCAG 2.5.3):** the accessible name does not contain the visible text on the mode tiles, the Play button, the tower bar (visible cost "50" is not in "Archer Tower"), the "Hero" view button, and the Commander command buttons. Voice-control users cannot say what they see.

### P2: low contrast on information that matters
- Locked towers show "Wave 3" / "Wave 6" (when they unlock) at **2.89:1** (needs 4.5:1).
- White text on the blue buttons (Garrison, War Room) is **4.41:1**.

### P3: very small text in the HUD
9.6-9.9 px labels ("Keep", "Wall", "Arrow Rain", "Boiling Oil") and 11 px cost labels on phones.

### P3: no landmarks
`#hud` and `#board` sit outside any landmark region (axe `region`). Low impact in a canvas game.

## Balance observations (flagged, deliberately NOT retuned)

Bot sweep from wave 20; control build (8 towers) survives 11.9 waves on average. 16 runs per variant, so differences under about 1 wave are probably noise.

| Swap in 2 of | Waves survived | Share of damage from that tower |
|---|---|---|
| artillery | **13.9** | 45% |
| mage | 12.3 | 31% |
| venom | 12.1 (worst run 6) | 26% |
| barracks | 12.0 | 16% |
| ballista | 11.6 | 38% |
| catapult | 11.6 | 24% |
| tesla | 11.6 | 42% |
| archer | 11.4 | 39% |
| cannon | 11.4 | 34% |
| gatling | 11.2 | 19% |
| flak | 10.9 | 4% (air only, expected) |

- **Artillery stands out** (+2.0 waves over control with two slots). Worth a closer look, but one bot and one layout rule is not enough evidence to nerf it.
- **No tower looks broken or useless** in this test.
- **Frost, Obelisk, Void Well and Trebuchet could not be tested.** They unlock at wave 22-30, so they were never built in a wave-20 run, and the 8-plot control build cannot survive past about wave 33 at any budget, so a wave-30 run is also meaningless. These need a better harness or real usage data.
- A first run of this sweep reported those four as identical "0% damage" towers. That was a harness error (never built), not a finding.

## Not problems

- Normal mode holds a steady 60 fps (worst frame 17 ms) at every size.
- Commander (Hero) mode measured 3-4 fps, but that is software WebGL in a GPU-less sandbox. It says nothing about real devices.
- No horizontal overflow on any screen at any size. The wide mode tiles on the phone home screen are the intended swipe carousel.
- No JavaScript errors on any screen or in either run type.
- Mobile layout generally is in good shape: large thumb buttons, a sensible landscape side panel. The fixes below are refinements, not a redesign.
- Reduced motion, calm visuals, quiet weather and the no-map-zoom rules are respected and untouched.

## Planned fixes (Phase 2)

1. Allow pinch-zoom on menus; keep it locked only during a run (P1).
2. Record which foes breached and add a "How the castle fell" block to the defeat screen (P1).
3. Accessible name, focus trap and focus restore in `modal()` (P1).
4. 44 px minimum tap targets on touch screens, including the in-run top bar (P2).
5. Fix the ARIA errors and Label-in-Name mismatches (P2).
6. Fix the two contrast failures (P2).
7. Raise the smallest HUD text to a readable size (P3).

## Known issues

_Filled in at the end of Phase 3._
