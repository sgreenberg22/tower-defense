# IMPROVEMENTS

Progress on the improvement list. `[x]` shipped, `[=]` already in the game (checked in the code), `[ ]` not done yet (with the reason where there is one).
**Shipped: 64 · already present: 27 · open: 286**



## CL · Classic (endless run, Infinite, Daily)

- [x] CL-01 Build undo: a 5-second "Undo" toast after placing, selling or upgrading a tower (full refund inside the window). Only `refund` and `sell` exist today; there is no undo. — Ctrl+Z and an Undo toast; engine undo()
- [=] CL-02 Show a tower's range ring while the build menu is hovered or tapped, before placing. — already there: the placement ghost draws the range ring
- [=] CL-03 Ghost preview when placing: shows range, coverage score and "covers N path tiles" for the chosen plot. — already there: ghost shows range including the hill bonus
- [=] CL-04 Tap-and-hold a tower for a compact stats card (DPS, damage by type, kills, damage dealt this run). — already there: hold or tap a tower for its card with damage, kills and dealt
- [=] CL-05 Per-tower kill and damage counters in the tower card (the engine already tracks `dmgByTower`; surface it). — already there: Kills and Dealt are on the tower card
- [=] CL-06 Confirm before selling a tier-4 or higher tower (skippable with a setting). — already there: a tier-4+ or 250-gold tower takes two taps to sell
- [x] CL-07 Upgrade-all button for one tower type ("Upgrade every Archer Tower"), spending only what is affordable, cheapest first. — Upgrade all of a type
- [=] CL-08 Target priority per tower: first, last, strongest, weakest, flyers first. Persist per tower. — already there: Targeting row on every tower
- [=] CL-09 Remember each tower's target priority when it is upgraded or moved. — already there: the mode stays on the tower through upgrades
- [=] CL-10 A "next wave" preview that lists the counts and types, not just icons: "12 Grunts, 4 Shieldbearers, 2 Wyverns (air)". — already there: the next-wave chip shows icon and count
- [x] CL-11 Flag air-heavy and armor-heavy waves in the preview so the player can answer before the wave starts (the defeat card already says when flyers did 40%+; do the same up front). — Armoured wave chip (flyers already warned)
- [=] CL-12 Boss preview with the boss's special ability from `BOSS_DESC` shown one wave early, not only on the banner. — already there: boss description is on the chip and the banner
- [x] CL-13 A wave timeline strip across the top showing the next 5 waves' threat colour (ground, air, armour, boss). — Wave strip of the next four waves, shape-coded
- [=] CL-14 "Call next wave early" bonus readout: show exactly how much gold it grants before the player taps. — already there: the build countdown shows +N early
- [x] CL-15 A "damage taken" log in the pause menu: last 5 breaches with the foe's name and damage (reuse `leakBy`). — Pause menu lists the last five breaches
- [x] CL-16 Pause menu: add current wave's kills, leaks, gold earned and time. — Pause menu shows this wave so far
- [ ] CL-17 In-run stats panel (a toggle): DPS, gold per minute, leaks per wave, tower efficiency. — in-run stats panel: not started
- [ ] CL-18 Auto-save indicator: a quiet "Saved" tick after each wave so players trust Resume. — a saved tick would crowd the phone HUD; needs a design
- [ ] CL-19 Resume mid-wave: save enough state to resume inside a wave, not just at the build phase. (S) — mid-wave resume changes the save format; needs its own release
- [ ] CL-20 Tower comparison: a "compare with" mode in the build menu listing two towers' DPS, range and cost side by side. — not started
- [ ] CL-21 Build menu sort/filter: by cost, by role (ground, air, support), and a "recommended for this wave" badge using `threatProfile`. — not started
- [ ] CL-22 "Why did my tower miss?" hint: show a small note when a Mortar/Cannon shot is dodged or a flyer is out of reach of ground-only towers. — not started
- [ ] CL-23 Tower synergy hints: a faint link line and a short tip when two adjacent towers interact (Frost + Tesla, Venom + Catapult, etc.). Calm line only, no pulse. — not started
- [ ] CL-24 Quick-build hotkeys with a rebind screen (keys are fixed today, no rebind). Store in the profile. — rebinding needs a keys screen; not started
- [ ] CL-25 Keyboard-only play: arrow keys move a plot cursor, Enter builds, U upgrades, S sells. — not started
- [ ] CL-26 Gamepad support (none today): D-pad plot cursor, A build, X upgrade, Y sell, Start pause. — not started
- [=] CL-27 Wave-speed control: add 4x and a "skip to wave end" for fully cleared fields; keep the speed timer test green. — already there: F cycles 1x to 4x
- [=] CL-28 Smart pause: auto-pause when the tab loses focus, with a calm banner. — already there: the run pauses when the tab is hidden
- [ ] CL-29 Modifier set presets: save and name a combination of `MODIFIERS` for one-tap replay. — not started
- [x] CL-30 Ascension ladder display: show the next 3 Ascension levels with their exact stat changes and unlock wave (`ASCENSION.unlockWave`). — Ascension ladder on setup
- [=] CL-31 Difficulty explanation on the setup screen: what the starting wave grants (gold, unlocked towers) from `HEADSTART`. — already there: setup explains the head start package
- [ ] CL-32 (B) Add a "Practice" run flag (no leaderboard, no Renown) with unlimited gold for testing builds. There is no sandbox mode today. — not started
- [x] CL-33 Seed display and copy button on every run, and a "Play this seed again" button on the summary. — Seed on the summary, Copy result, Play this seed again
- [x] CL-34 Run summary: wave-by-wave leak chart (a small bar chart, inline, no animation). — Where the gate leaked chart
- [x] CL-35 Run summary: "best moment" line (longest combo, biggest wave cleared with no leaks, boss killed fastest). — Best moment line
- [x] CL-36 Run summary: a share card (text) with seed, wave, map, difficulty and modifiers. — Copy result as text (the share image already existed)
- [x] CL-37 Run summary: compare to your previous best on this map and difficulty (delta in waves, kills, score). — Against your best here line
- [=] CL-38 Tutorial: a skippable 60-second first-wave coach for newcomers using the existing `tutorial.js`, with the first three towers highlighted in order. — already there: tutorial.js coaches the first run
- [x] CL-39 First-run goal chip: "Reach wave 5" and "Build 3 different towers" for the first three runs. — First-run goal chip
- [x] CL-40 Per-map notes: a one-line tip on each map card (best chokepoint, air route). — Computed map notes on every map card

## DS · Daily Siege, Siege Trials (puzzle modes)

- [x] DS-01 Show the exact par score for each Trial and your delta from par on the summary. — Par shown on each trial and on the result
- [ ] DS-02 Trial hints: a "Show a hint" button that reveals one tower position per use, with a small score penalty. — needs a solver to know a good tower position; not started
- [ ] DS-03 Replay your Daily Siege layout after the run (watch the wave play again at 4x). — replay: not started
- [x] DS-04 Save the layout as an image-like grid string so players can share a solution privately. — Copy layout on the result
- [x] DS-05 Daily Siege history: the last 14 days' results on one screen with streak. — Two-week strip
- [x] DS-06 Daily streak shield: one free "skip" per week so a missed day does not zero the streak. — One missed day is forgiven (once a week)
- [x] DS-07 Show the day's enemy composition before the player spends supply points. — What is coming: every foe added up
- [=] DS-08 Hill plots (count double) are visually marked on every Siege and Trial map with a quiet icon. — already there: hills are drawn as raised terraces and the rules say they count double
- [x] DS-09 A supply-point budget bar that fills as towers are placed and shows what each choice costs. — HUD shows points left of the total
- [x] DS-10 Undo/redo for the placement phase of puzzle modes (a larger buffer than Classic). — Undo stack of 40 in a siege
- [ ] DS-11 Compare to the Realm: after the run, show how your layout's efficiency ranks against the day's median (if the API has it). — needs a server endpoint
- [x] DS-12 Trials: a "next unsolved trial" button that jumps to the first trial without a medal. — Next unsolved trial button

## WF · Warfront (weekly warlord)

- [x] WF-01 Warlord card: show favoured foes, the doubled twist and the Champion schedule on the prep screen, with icons, not only prose. — Favoured foes now listed by name on the warlord card (twist and Champion lines were already there)
- [x] WF-02 Past warlords gallery: a history of the last 8 weeks' warlords and your best wave against each. — Past warlords box: the last six weeks and your best wave against each
- [=] WF-03 Warlord weakness hint: a one-line tip on how to counter this week's twist. — already there: the warlord card already has an "Answer" line
- [ ] WF-04 The Champion that marches every five waves gets its own health bar label and a line explaining what it does. — not checked in this batch
- [ ] WF-05 Squad selection (`setup.squad`) is explained on the prep screen: what a squad is and what it costs. — needs the squad picker UI; not started
- [x] WF-06 Show the time left in the week and a countdown to the next warlord. — Time left in the week on every weekly prep screen
- [x] WF-07 Practice-map warning: make it unmistakable that a non-weekly map is unranked (a coloured "Practice" label on the HUD). — Orange "Practice" tag on the HUD on any non-weekly map (the prep screen already said so)
- [ ] WF-08 Personal best per warlord in the Keep trophy shelf. — needs a Keep shelf screen change
- [ ] WF-09 Weekly rank change line ("You moved up 12 places") when the board is available. — needs the board API for last week's rank
- [x] WF-10 Warfront recap on the summary: which favoured foes did the most damage (reuse `leakBy`). — Summary line: how many of the foes that got through were the warlord's favoured kind
- [x] WF-11 Add a "rematch" button that restarts the same week's setup with the same seed after a loss. — "Retry this week" on the summary: same week, map and foes, same weapon and arts
- [ ] WF-12 (B) Optional "Warlord Hard" board with the twist tripled, behind the same week key, as a new board id. — new ranked board id and server validation; wants its own balance pass

## GA · Gauntlet

- [ ] GA-01 Stage map preview: show the next stage's map name and thumbnail on the stage-clear screen (`gauntletMap(stage+1)`). — needs a map thumbnail on a new stage-clear screen
- [ ] GA-02 Between-stage "carry-over" screen: show what comes with you (weapon, arts, castle heal) and what stays behind. — needs a new between-stage screen
- [x] GA-03 Stage timer split: record the time of each stage and show it on the summary. — Stage splits on the summary (clock per stage with its map)
- [=] GA-04 Show the stage grant gold calculation (`goldMult`) so the new-map shopping spree is planned. — already there: the stage banner and toast show the gold grant
- [ ] GA-05 Auto-suggest a build for the fresh map using `threatProfile` and `autobuild`, as an optional button. — needs autobuild wired to a button; separate pass
- [ ] GA-06 "Rebuild last stage layout" button that copies your previous stage's tower types onto similar plots. — needs plot matching between maps
- [x] GA-07 Stage banner on boss waves naming the boss and the map you are about to reach. — Boss banner names the map you reach next
- [ ] GA-08 Gauntlet leaderboard: show per-stage best, not only furthest wave. — needs server board changes
- [ ] GA-09 A "stage rank" badge (Bronze, Silver, Gold) for reaching stage 3, 5, 8. — cosmetic badges; not started
- [ ] GA-10 Add a short "intermission" tip line on the 12-second break (what to build, what is coming). — tip text not written
- [x] GA-11 Show the unlock lead (`unlockLead`): list the towers that just opened for this stage. — The stage toast lists the towers that newly open
- [ ] GA-12 Make the 12-second break skippable and extendable (+10 s once per stage, costs gold). (B) — ranked-play change; flagged for a balance decision
- [x] GA-13 The hard maps come last: show a "Hard map ahead" warning one stage early. — Stage toast warns when the stage after this one is a hard map
- [x] GA-14 Test: every `GAUNTLET.maps` entry is playable for a full stage with the stage grant, in a bot run. — Test: every Gauntlet map builds with plots, and a stage grant lands with towers left behind

## EN · Endurance

- [ ] EN-01 Setup screen: a live "power summary" (towers placed, plots left, total mastery stars) as you build. — not started
- [ ] EN-02 Save and name up to 5 Endurance layouts per map. — layout save and share is a larger feature (shared with LS-01); batch 3 candidate
- [ ] EN-03 Share a layout as a short code; import a code. — layout codes; same feature as EN-02
- [=] EN-04 Clock display shows the surge number and the foe level next to the time. — already there: the HUD shows Threat N, which steps up every beat
- [ ] EN-05 Surge preview: the next surge's composition and strength one beat ahead. — needs a stream preview in the HUD
- [x] EN-06 A "free repair" counter (kills to the next repair, from `repairKills`) on the HUD. — HUD clock shows the foes left to the next free repair
- [=] EN-07 Boss-fall heal toast with exactly what was restored. — already there: the "Everything restored" banner already says a boss fell; exact amounts not shown
- [ ] EN-08 Summary: timeline of surges survived with leaks marked. — surge timeline on the summary; the pace chart covers some of it
- [=] EN-09 Summary: show which tower dealt the most damage and which was destroyed first. — already there: the damage-by-source line is already on the summary
- [x] EN-10 Best time per map in the Keep, not just the weekly board. — Longest hold per map is stored and shown on the map cards
- [ ] EN-11 (B) A "Hardcore Endurance" variant: no free repairs, as a separate board id. — new ranked board id and server validation
- [x] EN-12 Prevent accidental Begin: a confirm showing unplaced plots ("3 plots still empty. Begin anyway?"). — Confirm before Begin when plots are still empty (also Last Stand)

## LS · Last Stand

- [ ] LS-01 Same layout-saving and sharing items as EN-02/03 (shared code). — layout save and share, see EN-02
- [ ] LS-02 Show the kills-per-wave counter (`killsPerWave`) so "waves cleared" is understood. — not started
- [x] LS-03 Kill-pace graph on the summary: kills per minute across the run. — Kill-pace chart on the Last Stand and Endurance summary
- [x] LS-04 "Where did we break?" on the summary: the first tower lost and the first leak, with timestamps. — "Where it broke": first tower lost and first foe through, with timestamps
- [ ] LS-05 Garrison slot picker explains each troop's role in the 30 free slots; add "auto-fill best mix". — auto-fill for the garrison; not started
- [=] LS-06 Tower tier-5 free build: show "Mastery 15 applied" with the star perks that implies. — already there: the garrison panel and prep text already say fully mastered
- [=] LS-07 Weekly map pool preview: which maps are in the pool and which one is ranked. — already there: every pool map is listed with the ranked one marked
- [ ] LS-08 Weekly best layout notes: a one-line note you can attach to your best run. — notes field on a best run; not started
- [x] LS-09 Display the starting enemy strength (`startWave` 55) as a ladder so players see it climbs one wave at a time. — Prep screen shows the strength ladder (55 → 56 → 57 …)
- [=] LS-10 Add the Mend-art exclusion explanation on the prep screen (why Mend is hidden). — already there: the Mend art is crossed out with the reason
- [ ] LS-11 Last Stand "survival percentile" line when the API provides the board size. — needs the board size from the API
- [x] LS-12 Test: a Last Stand run via `autoAssault`-style bot ends deterministically for a fixed seed. — Test: a Last Stand with a fixed seed ends the same way every time

## SP · Sprint

- [x] SP-01 Split times: record the clock at the end of each of the 15 waves, show them in the summary. — Splits recorded at every wave and shown on the summary (slowest leg called out)
- [x] SP-02 Ghost run: compare your split to your personal best split live (a small "+0:03" tag, no animation). — Wave-clear banner shows the split against your best clear ("-0:03 ahead of your best"); not a persistent HUD tag
- [ ] SP-03 Early-call tutorial: a one-time tip that calling the next wave early saves time (`sprintMinSeconds`). — one-time tip needs a tips store; not started
- [x] SP-04 Show the theoretical minimum time (`sprintMinSeconds(level)`) and how close you were as a percentage. — Summary shows the percentage of the fastest the waves allow
- [=] SP-05 Per-level personal bests visible on the level picker (Recruit, Standard, Veteran, Legend). — already there: each level card already shows your best time
- [x] SP-06 Level recommendation: suggest the level from your Keep level and best Sprint. — Level suggestion on the Sprint prep screen, from your cleared levels
- [ ] SP-07 Build-order notes: keep the last Sprint's tower order and show it as a checklist for a retry. — build-order checklist; not started
- [ ] SP-08 Auto "build timer" ring in the 6-second break that is calm (no pulse) and fills. — timer ring in the break; not started
- [ ] SP-09 Wave 10 boss banner shows the boss's HP scaled by `hpScale` so the player knows what they face. — boss HP banner; not started
- [ ] SP-10 Summary: damage by tower with "wasted gold" (towers that never fired). — wasted-gold line; not started
- [ ] SP-11 Per-level leaderboard tab shortcuts on the summary. — board shortcuts on the summary; not started
- [x] SP-12 Run restart in one tap ("Retry same seed") without leaving to the menu. — "Retry this week" on the Sprint summary
- [ ] SP-13 Sprint practice on non-weekly maps with a clear Practice tag (already unranked) and its own local best. — the Practice tag is there but a local best per practice map is not
- [x] SP-14 Test: `sprintBoardValue` and `sprintSecondsFrom` round-trip for every level. — Test: board value and seconds round-trip for every level

## CM · Commander (hero) mode

- [x] CM-01 Deck builder shows each command's damage-per-⚡ so the choice is data-grounded. — Deck builder shows shots of damage per ⚡ for Volley, Firebomb and Piercing Shot, and recharge for all
- [x] CM-02 Recommend a deck for the current doctrine and map. — A suggested deck per doctrine, with the reason and a one-tap "Use the suggested deck"
- [x] CM-03 Save up to 4 named decks with their doctrine and perk preferences. — Up to 4 named decks (doctrine and four commands), saved on the profile
- [x] CM-04 Command bar shows cooldown remaining as a number as well as a fill, for colour-blind players. — Cooldown seconds on every command button as a number
- [ ] CM-05 Aim assist option for phones: snap the aimed commands (Volley, Firebomb) to the densest foe cluster within the tap radius. — aim assist for aimed commands; needs phone testing
- [x] CM-06 Show ⚡ regeneration per second and time-to-next-command in the HUD. — ⚡ regeneration per second beside the ⚡ count
- [ ] CM-07 Reload window: a calm audio tick and a visible bracket for the perfect-reload window (`reload.width`) so it is learnable. — audio tick for the reload window; the window itself is already drawn
- [ ] CM-08 Perfect-reload practice: a 20-second drill on the setup screen. — reload drill; separate screen
- [ ] CM-09 Combo meter shows the Fever threshold (20, or 15 with the perk) as a tick mark. — fever tick mark; needs a combo meter that does not exist yet
- [ ] CM-10 Weak-point markers on bosses: show the spot with a still ring for the first weak-point window. — weak-point ring is shown as text only
- [x] CM-11 Perk choice screen shows a one-line recommendation per perk given your current stats. — One-line tip on every perk card
- [x] CM-12 Perk reroll: spend a small amount of gold or a Keep token to reroll the three offered perks once per level. — Perk reroll once per offer, paid in gold from the treasury (30 + 6 per wave)
- [x] CM-13 Show the perk build so far on a single panel with stack counts (`max`). — "Perks" chip opens a panel with every perk and its stack count
- [x] CM-14 Quest reroll: swap the wave's quest once per run. — Quest swap once per run (a ↻ Quest chip); the spent swap is saved
- [x] CM-15 New quests: "Clear a wave without using a command", "Kill 20 foes with Piercing Shot", "Hit 3 marked foes". — Two new quests: win a wave without a command (needs 3 hand kills, so idling earns nothing) and land 5 hits on a marked foe; the Piercing Shot quest is open
- [ ] CM-16 New commands: Rally (towers in a circle get +25% fire rate for 6 s), Decoy (a banner foes target first for 5 s), Snare (a slow trap you place). — new commands need per-tower area effects; Decoy and Snare need foe-targeting rules
- [x] CM-17 New perks: "Overwatch" (+10% damage to foes in the last third of the path), "Spotter" (marked foes take 15% more), "Reserve Fund" (+1 start ⚡). — Spotter (Mark takes 15% more) and Reserve Fund (+1 ⚡ at each wave); Overwatch is open
- [ ] CM-18 A fourth doctrine, "Quartermaster": gold on hand-kills and cheaper repairs, with its own Ultimate. Gate behind a Keep unlock. — a fourth doctrine needs a Keep unlock; balance decision
- [ ] CM-19 A fourth Ultimate for it: "Golden Hour" (every kill pays double for 8 s). (B) — (B) depends on CM-18
- [ ] CM-20 Engineers' build orders: show what they will build next and let the player override with a tap. — engineer queue display; not started
- [ ] CM-21 Engineers report ("Built Mage Tower on plot 4") as quiet log lines. — engineer log lines; not started
- [ ] CM-22 Add a fifth build order, "Counter", that reads the wave preview and builds towers that answer it. — fifth build order; not started
- [x] CM-23 Summary: command usage table (casts, damage done, ⚡ spent), and the most effective command. — Summary lists commands used with casts and ⚡ spent and names the most used; damage per command is not tracked
- [x] CM-24 Summary: headshot rate, perfect reload rate and best combo, with your best for each. — Summary shows perfect-reload %, headshot % and best combo, with your best for each
- [x] CM-25 Label-in-Name: give the four command buttons and the fire button an accessible name that begins with their visible text (open issue in AUDIT.md). — The cost, key and cooldown labels are hidden from the accessibility tree so the names match what is spoken
- [x] CM-26 Control size: a "Large controls" setting for the HUD (open issue in AUDIT.md). — Settings: Large controls makes in-run buttons 44px (the HUD grows 26px on a phone)

## WR · Warrior (on foot)

- [=] WR-01 Show each warrior's mastery star perks on the select screen and what the next star gives. — already there: the select screen already shows mastery stars, the bonus and progress to the next
- [ ] WR-02 Show the current combo step and its damage multiplier near the player. — not started
- [ ] WR-03 Dodge-roll cooldown ring around the player, calm and thin. — dodge ring; not started
- [ ] WR-04 Enemy telegraphs: a still ground marker where a boss slam or captain strike will land, shown 0.6 s early. — boss telegraphs; gameplay change, needs playtest
- [ ] WR-05 Captain (every 5th wave from 4) gets a name, a title and one signature move so each duel differs. — captain titles and signature moves; gameplay change
- [ ] WR-06 A captain-duel arena ring that keeps the fight readable and stops foes piling in. (B) — (B) arena ring; balance decision
- [ ] WR-07 Mini-map of the 32x20 field showing the camp spots, the keep and the camping penalty zone. — minimap; not started
- [x] WR-08 Camp penalty indicator: a quiet bar that fills as you stand still (`CHAMP.camp`, 7 s) before the horde closes in. — A quiet bar under the health bar fills as you stand still, before the horde closes in
- [ ] WR-09 Perk draft: show rarity colours and a recommendation, and add a reroll. — perk draft rarity and reroll; not started
- [x] WR-10 New common perks: "Second Wind" (heal on dodge), "Hunter" (+damage to foes below 30%), "Anchor" (resist knockback). — Two new common perks: Second Wind (dodge heals) and Hunter (+damage below 30% health); Anchor is open
- [ ] WR-11 New rare perks: "Chain Attack" (every 4th hit arcs to 2 foes), "Mirror Step" (dodge leaves a decoy), "Battle Cry" (skill use staggers nearby foes). — rare perks need new hit rules
- [ ] WR-12 Epic perk: "Last Bastion" (below 20% health, take 30% less for 5 s, once per wave). (B) — (B) epic perk; balance decision
- [ ] WR-13 Fifth warrior class, "Duelist": fast single-target combo with a parry, a counter skill and a Flurry fury. Bars per `CHAMP_CLASSES` conventions. — a fifth class needs art and a full playtest
- [ ] WR-14 Sixth class, "Priest/Warden": healer with a ward that protects towers. (B) — (B) healer class; balance decision
- [=] WR-15 Armory of Arms swap: show the 25 s rest as a ring on the ⇄ button. — already there: the swap button already counts down the seconds (a ring is not drawn)
- [ ] WR-16 Per-warrior leaderboard for waves held (kept off the wave board today). — needs a new board id and server work
- [ ] WR-17 Stick sensitivity and dead-zone sliders; left-handed layout toggle. — input settings; not started
- [ ] WR-18 Camera: a recenter button, a look-ahead toggle, and a "never inside the keep" test already exists, so add a high-camera option for wide fields. — camera options; not started
- [=] WR-19 Auto-attack toggle for accessibility (hold-to-attack remains the default). — already there: the Assist toggle already auto-attacks anything in reach
- [ ] WR-20 Keys: add a rebind screen; today WASD/arrows, J/Space, K, L/Shift, I, Q/E are fixed. — key rebinding; not started
- [ ] WR-21 Revive mechanic: tap to speed up the rise after a fall (`w_unbroken` stays). (B) — (B) revive mechanic; balance decision
- [x] WR-22 Summary: damage dealt vs. towers' damage share, deaths, best combo, perks taken (a "your build" line). — Summary line: your warrior vs the towers, falls and the perks taken
- [ ] WR-23 Warrior-only achievements: "Perfect Duel", "Hold the Camp", "No-Dodge Wave". — achievements; not started
- [ ] WR-24 Without-WebGL fallback: show a calm notice and the from-above controls tutorial once. — no-WebGL notice; not started

## AS · Assault (attack the stronghold)

- [ ] AS-01 Stage map preview and what the next fortress adds (`ASSAULT.scale` 1.16 per stage) on the stage-clear screen.
- [ ] AS-02 Unit card shows counters ("Rams: strong vs walls, weak vs oil") with a one-line "best against".
- [ ] AS-03 Army composition presets (3 saved) for the card deck.
- [ ] AS-04 A "recommended orders" badge based on the fortress's emplacement mix.
- [ ] AS-05 Show emplacement types and HP on a tap before the attack starts (scouting phase).
- [ ] AS-06 Supply income breakdown (`supply.regen`, razes, slain) in a small panel.
- [ ] AS-07 Unit cooldown bars on the card deck as numbers as well as fills.
- [ ] AS-08 Sally warning: a calm timer to the next horde sally (`sally.first/every`) so the player can plan.
- [ ] AS-09 Summary: damage by unit type, emplacements razed in order, supply spent on each unit.
- [ ] AS-10 Test: every `AUNITS` entry can be deployed in a bot run and affects the outcome.

## RD · Raid, CQ · Conquest, BZ · Blitz

- [ ] RD-01 Raid: show the day's seed, map and the score formula (`raidScore`) with the max (`RAID_MAX`) on the prep screen.
- [ ] RD-02 Raid: score breakdown on the summary (victory, clock, keep %, fort %, razed) with how each term moved your score.
- [ ] RD-03 Raid: yesterday's best layout of units (your own) as a "repeat" button.
- [ ] RD-04 Raid: a countdown to the next daily setup.
- [ ] RD-05 Raid: personal-best history for the last 14 days.
- [ ] RD-06 Raid: a "perfect run" checklist (no keep damage, all razed) to chase.
- [ ] RD-07 Raid: fixed 300 s limit (`RAID.limit`) shown as a ring on the clock.
- [ ] RD-08 Raid: a "par time" per map from the bot (`autoAssault`) for reference.
- [ ] CQ-01 Conquest: province map shows which provinces you hold, the next target and its difficulty (`conquestTarget`).
- [ ] CQ-02 Conquest: province bonuses (`assaultPerks(held)`) listed with the provinces that give them.
- [ ] CQ-03 Conquest: rewards for holding all provinces of a region; a calm banner on completion.
- [ ] CQ-04 Conquest: a retreat option that keeps partial supply (`carry`).
- [ ] CQ-05 Conquest: province notes (map, camps, boss) before committing.
- [ ] CQ-06 Conquest: show progress as "X of N provinces" on the home tile.
- [ ] CQ-07 Conquest: replay a conquered province for practice without changing progress.
- [ ] CQ-08 Conquest: new provinces added after the last one (late-game stretch) as an unlock gated by a flag. (B)
- [ ] BZ-01 Blitz: show the weekly seed's three camps (`BLITZ.camps`) and their order on the prep screen.
- [ ] BZ-02 Blitz: score breakdown (`blitzScore`) with taken camps and razed.
- [ ] BZ-03 Blitz: a weekly history strip.
- [ ] BZ-04 Blitz: a "route planner" to choose camp order, with the clock estimated by a bot.
- [ ] BZ-05 Blitz: share a result line.
- [ ] BZ-06 Blitz: a practice mode on a non-weekly seed with its own local best.

## WL · Warlord (RTS)

- [ ] WL-01 Command groups: ctrl/long-press to save a selection to 1-4 and recall with a tap on the chip.
- [ ] WL-02 Double-tap a unit to select all of its kind on screen (partly present, make it explicit in the tutorial).
- [ ] WL-03 Rally point for each barracks so trained footmen go where you choose (`builds.barracks`).
- [ ] WL-04 Show supply income per second near the supply counter (`WARLORD.income`, per-stage growth, depots).
- [ ] WL-05 Post status ring: capture progress and who holds it, with a number.
- [ ] WL-06 Warband warning: a calm line from the edge of the map showing where the next warband will come from (`warband.first/every`).
- [ ] WL-07 Marshal ability bar (cry cooldown `cry.cd`) and level display with next-level XP.
- [ ] WL-08 Marshal level-up choice: pick one of two bonuses at each level instead of a fixed `lvl` bonus. (B)
- [ ] WL-09 New post build: "Forge" (a post-bound smithy that gives +5% damage to units fighting within the post radius).
- [ ] WL-10 New post build: "Stables" (trains one cavalry every 30 s, cap 1).
- [ ] WL-11 New tech: "Healer's Tent" (+heal over time for units at the keep), "Scouts" (reveals the Warchief and camp 10 s early).
- [ ] WL-12 Tech tree panel shows next-level costs (`tech[x].cost[]`) and total spent.
- [ ] WL-13 Veterancy display: a small chevron count over veteran units (ranks `vet.at`).
- [ ] WL-14 Keep upgrade preview: show what level 2 and 3 add (walls, archers, range) before paying.
- [ ] WL-15 Palisade health bar on the keep with a repair cost tag (`keep.repair`).
- [ ] WL-16 Town Bell cooldown ring, calm.
- [ ] WL-17 Watchtower placement preview with range (`watch.range`) and the near-keep rule (`watch.near`).
- [ ] WL-18 Mercenary camp outcome: a toast naming the mercs you won (`camp.mercs`).
- [ ] WL-19 Warchief fight: a name and a one-line trait per stronghold (from stronghold 2).
- [ ] WL-20 Objectives list (`WARLORD_OBJECTIVES`) in a collapsible panel with progress per objective.
- [ ] WL-21 New objective types: "Win without losing a post", "Kill 30 raiders", "Reach keep level 3 by minute 3".
- [ ] WL-22 End-of-stronghold report: posts held percentage, supply earned, tech bought, army losses.
- [ ] WL-23 Idle-unit alert: a quiet marker on soldiers who have no order for 10 s.
- [ ] WL-24 Attack-move: tap-hold a destination so units fight whatever they meet on the way (confirm what exists first).
- [ ] WL-25 A pause-and-order mode (RTS pause) that only works in the offline Warlord, not ranked records.
- [ ] WL-26 AI difficulty settings for the horde (warband size, sally frequency). (B)
- [ ] WL-27 Fog-lite: the horde's sally spawn areas are visible only near your units. (B)
- [ ] WL-28 Test: every post build and tech level applies exactly once and persists across a save. (S)

## WA · Warrior on the attack (Storm the camps)

- [ ] WA-01 The captain's card plays are shown as a feed ("Captain sends Knights") so you understand the orders.
- [ ] WA-02 Let the player queue one card for the captain with a tap on the card.
- [ ] WA-03 Captain style presets: Aggressive, Balanced, Cautious. (B)
- [ ] WA-04 Camp objective markers on the minimap.
- [ ] WA-05 Column health bar (the army you fight with) next to your own.
- [ ] WA-06 Summary: your kills vs. the column's kills.
- [ ] WA-07 Show the camp's emplacement HP when your cursor is on it.
- [ ] WA-08 Test: `WARASSAULT.captain` pacing yields deterministic orders for a fixed seed.

## DM · Dominion (the campaign)

- [ ] DM-01 Turn summary: a dialog at the start of each turn listing income, upkeep, events, and rival moves since last turn.
- [ ] DM-02 Province tooltips: show yield breakdown (terrain, buildings, resources, focus, policy) on tap.
- [ ] DM-03 "Next best action" suggestions for newcomers (opt-in), e.g. "You have 2 unused orders".
- [ ] DM-04 End-turn warning if you still have unused orders, armies or unspent lore. Setting to turn it off.
- [ ] DM-05 Auto-resolve odds preview before attacking, with the breakdown (`autoBase`, strength, levies) shown as lines.
- [ ] DM-06 Battle-or-auto choice remembered per kind of attack.
- [ ] DM-07 Province filters: show only provinces with unrest over 40 or fewer than 2 buildings.
- [ ] DM-08 Unrest warning icons on provinces approaching `revolt` (80) with a one-tap fix list (temple, garrison, policy).
- [ ] DM-09 Building queue: queue a second building when a slot frees. (B)
- [ ] DM-10 Buildings: add "Granary" (food buffer to cut winter's levy halving), "Watchtower" (reveals neighbouring provinces and a defence bonus), "Docks" (extra harbor trade).
- [ ] DM-11 Buildings: add "Guild Hall" (trade agreement slots) and "Courthouse" (reduces conquest unrest). (B)
- [ ] DM-12 Techs: add tier-2 "Roads" (roads link provinces faster, `ROAD` bonus +1) and tier-3 "Diplomacy" (treaties last longer).
- [ ] DM-13 Tech tree viewer: draw the tree with dependencies (`needs`) and a "what unlocks this" tag.
- [ ] DM-14 Tech-path suggestions per victory type (science, prosperity, diplomacy, conquest).
- [ ] DM-15 Policies: add "Open Borders" (trade +, unrest +), "Levy Reform" (levy cap +, gold -), "Patronage" (wonder cost -15%). (B)
- [ ] DM-16 Policy swap preview: show net yield change before paying `POLICY_COST`.
- [ ] DM-17 Wonders: add "Great Wall" (defence +), "Oracle" (reveals rival capitals' strength), "Grand Market" (trade +). (B)
- [ ] DM-18 Wonder race tracker: show rival progress where visible and a quiet warning when a rival starts one.
- [ ] DM-19 Diplomacy panel: show every rival's attitude as a bar with the last 3 events that changed it.
- [ ] DM-20 Diplomacy actions: add "Gift gold", "Demand tribute", "Propose shared vision". (B)
- [ ] DM-21 Treaty reminders: a banner 2 turns before a treaty (`treatyTurns`) or alliance (`allyTurns`) expires.
- [ ] DM-22 Rival personalities visible: show the trait labels (`TRAITS`) on the rival card, with a tip on how to deal with each.
- [ ] DM-23 More barbarian camp variety (`CAMP`): different guards and rewards (gold, lore, general XP) with an icon.
- [ ] DM-24 Generals: rename a general, show their traits (`GENERAL_TRAITS`), and rank progress (`rankNeed`).
- [ ] DM-25 Seasons: show next season's effect and a calendar strip of the next 6 turns.
- [ ] DM-26 Events: add 10 new dilemmas (e.g. plague, bountiful harvest, merchant caravan, rebel envoy) with two choices each and clear costs.
- [ ] DM-27 Royal decrees (quests): add a "chain" decree that unlocks a follow-up on completion.
- [ ] DM-28 Glory and Golden Ages: show the Glory bar and what a Golden Age grants on the main HUD.
- [ ] DM-29 Map: terrain legend, resource icons, and a toggle to hide rival borders for readability.
- [ ] DM-30 Map: pinch to zoom on the Dominion map only (not in battles; the no-map-zoom rule is about tower fields, confirm with `docs`/README before enabling) and pan with momentum off. If the README forbids it, skip and replace.
- [ ] DM-31 Save slots: a second campaign slot, plus a "restart from turn N" using an autosave of every 10th turn. (S)
- [ ] DM-32 Scenario setups: preset worlds ("Island Realm", "Crowded Continent", "Last Kingdom") using `SIZES`, `DIFFICULTIES` and rival counts.
- [ ] DM-33 Custom game: pick victory types to enable and the turn limit (`TURN_LIMITS`), with the result stored in the save. (S)
- [ ] DM-34 Score breakdown screen at the end: provinces, wonders, techs, Glory, with a recorded best.
- [ ] DM-35 Statistics page: gold earned, battles won, rivals broken, turns per victory.
- [ ] DM-36 Dominion achievements: "Conquest by turn 40", "Win without a battle", "Three wonders", "Allied with all".
- [ ] DM-37 Tutorial campaign: a 6-turn scripted intro to orders, buildings, research and the first battle.
- [ ] DM-38 Battle speed and skip: let the player choose auto-resolve for neutral provinces after the first win.
- [ ] DM-39 Show the battle's enemy composition for a province before attacking (the provincial `waves` values and the foe types).
- [ ] DM-40 Test: save/load round-trip on a turn-50 campaign for each size and difficulty. (S)

## SS · Sea Siege

- [ ] SS-01 Ship preview in the wave preview: counts of longships, cogs, galleys and carracks per lane.
- [ ] SS-02 Lane indicators on the map: show each landing lane and its beach with a quiet label.
- [ ] SS-03 "Ship HP" bars show armour vs. hull type with the multiplier (`NAVAL.vs`) in the tower card ("Cannon: 1.5x vs ships").
- [ ] SS-04 Carrack shelling warning: a still marker on the tower or wall about to be targeted, shown 1 s early.
- [ ] SS-05 Fire galley warning: a line showing which plot it is aimed at.
- [ ] SS-06 Third map: a river-mouth field with two beaches and a lighthouse plot. Gate it with a flag so existing boards hold.
- [ ] SS-07 Fourth map: an island field that needs a bridge defence. (B)
- [ ] SS-08 New ship: "Ram ship" (fast, short range, high hull damage on beach walls), from wave 10. (B)
- [ ] SS-09 New ship: "Ghost ship" (reveals late, immune to fire until hit). (B)
- [ ] SS-10 Drowning counter on the HUD (crew drowned) and a Renown-style flavour line on the summary.
- [ ] SS-11 Tide: a calm, slow tide cycle that opens or closes a beach (a visual and a rule), off by default. (B)
- [ ] SS-12 Harbour defences: a "Chain" plot item that slows ships entering a lane.
- [ ] SS-13 More feats: "Sink 20 ships in one run", "No landing for 10 waves", "Sink a carrack with arrows only".
- [ ] SS-14 Sea Siege records: best wave per map, ships sunk and crew drowned in the Keep trophies.
- [ ] SS-15 Sea boss variants (a second boss after wave 40, e.g. "The Drowned Admiral"). (B)
- [ ] SS-16 3D: foam wake on moving hulls, still and low-contrast (no flicker), and a sinking animation that fades in 1.5 s.

## MT · Meta: Keep, quests, achievements, profile

- [ ] MT-01 Keep upgrade search and filter (by branch, affordable, unbought).
- [ ] MT-02 Keep: "what does this do for my run" preview for each node, showing the stat before and after.
- [ ] MT-03 Keep respec: refund one node per week for free. (B)
- [ ] MT-04 Keep: recommended next purchase based on your most-played mode.
- [ ] MT-05 Keep: show Renown income per hour of play and expected time to next node.
- [ ] MT-06 Weapon perk tree viewer (`WEAPON_PERK_NODES`) with a loadout save.
- [ ] MT-07 Armory presets for weapons plus arts (the repo has `loadout`; add named presets across modes).
- [ ] MT-08 Castle art slots: show cooldowns and per-art usage stats in the summary.
- [ ] MT-09 Achievements: add 20 new ones for the modes with few (Gauntlet, Sprint, Endurance, Dominion, Warlord, Sea Siege), each with a clear unlock condition and a Renown amount inside the existing caps.
- [ ] MT-10 Achievement progress bars on locked achievements.
- [ ] MT-11 Achievement "close to unlocking" shortlist on the home screen.
- [ ] MT-12 Daily quests: add 6 new quest types (use 3 different towers, survive without repair, kill 5 bosses...) in `QUEST_POOL`.
- [ ] MT-13 Overtime orders: show tomorrow's first order type.
- [ ] MT-14 Realm Works: a third track (e.g. "Quartermaster": +X% start gold in every run). Cap it. (B)
- [ ] MT-15 Supplies: show the daily supply chest preview and the streak.
- [ ] MT-16 Titles and banners: 10 new cosmetic titles earned by feats, with a profile display.
- [ ] MT-17 Profile page: show the best run in each mode in one grid.
- [ ] MT-18 Profile: a lifetime stats section (waves, kills, towers built, play time).
- [ ] MT-19 Save backup: a scheduled auto-export reminder and a "Download save as a file" button (only clipboard export exists today). (S)
- [ ] MT-20 Save integrity: store a checksum and warn on tampered imports without blocking. (S)
- [ ] MT-21 Cloud sync of the save to the Realm account if signed in. (S)
- [ ] MT-22 Codex: add a bestiary filter by type (ground, air, naval, boss) and a "seen" counter.
- [ ] MT-23 Codex: show counter towers for each foe with the damage multiplier.
- [ ] MT-24 Prestige: show the exact benefit table before prestiging and a "keep" list.
- [ ] MT-25 Adaptive difficulty (`adaptive.js`): expose a read-only "why this wave" line in a debug-ish panel for curious players.
- [ ] MT-26 Insights: a weekly "Your week" card with 3 findings from your runs (leaks by foe type, best mode, time played).

## SO · Realm, Together, social

- [ ] SO-01 Realm: a friends' activity feed (who ran what mode today).
- [ ] SO-02 Allied Towers: show how often yours were used and the gold they earned your friend.
- [ ] SO-03 Clan chat presets (the SALUTES list), expanded with 10 more phrases, with a profanity filter pass.
- [ ] SO-04 Clan weekly goal bar with each member's contribution.
- [ ] SO-05 Clan leaderboard by mode.
- [ ] SO-06 World Siege boss: damage meter and a countdown (`SIEGE.durationDays`).
- [ ] SO-07 World Siege: personal contribution rank and a post-siege reward screen.
- [ ] SO-08 Daily Rally goal: show tomorrow's goal estimate (`rallyGoal`) and the Realm map's progress.
- [ ] SO-09 Realm map: a legend and tap-to-inspect territories.
- [ ] SO-10 Friend challenges: send a seed and a mode to a friend with a message.
- [ ] SO-11 Seed-of-the-day for Classic: a shared seed with its own board.
- [ ] SO-12 Share a run summary as text (copy) and a short link if the server supports it. (S)
- [ ] SO-13 Report/block for clan and friend features, and a visible rule summary.
- [ ] SO-14 Offline mode notice that lists exactly which features are unavailable.
- [ ] SO-15 Heartbeat: show your online status toggle (invisible mode).
- [ ] SO-16 Boards: a "friends only" filter on every leaderboard.

## UX · Accessibility, onboarding, polish

- [ ] UX-01 Colour-blind palette setting: a safe palette for enemy types, damage text, wave preview and health bars (currently there are 10 files mentioning colourblind, check what exists and complete it).
- [ ] UX-02 Text size setting that scales the HUD, separate from `--ui-scale` for the canvas.
- [ ] UX-03 A "Large controls" setting for the in-run HUD (44 px targets) as an opt-in that trades board height.
- [ ] UX-04 Reduce-motion test: every new feature respects `prefers-reduced-motion`.
- [ ] UX-05 Screen reader announcements for wave start, wave clear, boss arrival and defeat, via one polite `aria-live` region.
- [ ] UX-06 Landmarks: wrap the HUD and board in labelled regions (open axe `region` warning).
- [ ] UX-07 High-contrast theme toggle for text and HUD.
- [ ] UX-08 One-handed layout: HUD controls reachable by thumb in portrait.
- [ ] UX-09 Haptics setting with intensity; today there is little (3 files).
- [ ] UX-10 Sound: per-category volume (music, effects, alerts), and a mono audio option.
- [ ] UX-11 Subtitles for boss lines (the boss banner text) in a larger size.
- [ ] UX-12 Tooltips on every icon-only control (only one file uses tooltips). Keyboard-focusable and touch-friendly (tap to show).
- [ ] UX-13 A glossary page in the Guide (armour, magic resist, splash, pierce, DoT, crit).
- [ ] UX-14 Guide search.
- [ ] UX-15 First-run flow: name, a one-screen "what is this game", then the first run, no more than 3 taps.
- [ ] UX-16 Newcomer home: a single "Continue" button, a single "New run" and a "More" chip (isNewcomer exists; test the flow on phone).
- [ ] UX-17 Error toasts for failed network calls with a retry (there is a 404 on `/api/health` in static mode, handle it silently and say "offline" once).
- [ ] UX-18 Loading skeletons for the Keep and the boards, calm and static.
- [ ] UX-19 Language: pull every user-visible string through one `t()` helper without translating yet, so a later i18n is cheap (no i18n today). Do not change visible text.
- [ ] UX-20 Screenshot/share image of the summary (canvas to PNG) with a download button (there is no screenshot feature today).
- [ ] UX-21 Update banner: when a new version is deployed, a calm "Reload for the new version" note, never reloading mid-run.
- [ ] UX-22 Offline: a service worker that caches the static shell and assets so the game opens without a network (the README says offline-first for progress; make the shell offline too). Test cache invalidation on VERSION bump.
- [ ] UX-23 Add `manifest.json` install prompts and a splash for "Add to home screen" if not present.
- [ ] UX-24 Standard "back" behaviour: the Android back gesture steps out of a screen instead of leaving the game.
- [ ] UX-25 Safe-area insets honoured on every fixed element (`viewport-fit=cover` is set; verify each).

## TX · Performance, tooling, tests, content integrity

- [ ] TX-01 A single `npm run check` that runs tests, a syntax check for every module and the balance-sanity script.
- [ ] TX-02 Balance report script: run `tools/sim.mjs` across all towers, bosses and modes and write a markdown table (extend the sweep harness beyond the 8-slot limit so Frost, Obelisk, Void Well and Trebuchet can be evaluated at waves 22-40; this was the main gap in the last audit).
- [ ] TX-03 Artillery check: measure the Artillery tower against control over more seeds and maps and report; propose a change only as a flagged constant. (B)
- [ ] TX-04 Frame-time budget test with a headless fps probe for Classic at wave 40 on a software renderer; record as a trend, not a gate.
- [ ] TX-05 Object pooling for projectiles and floating text; measure before and after.
- [ ] TX-06 Cap particles and floating text per frame with a tunable.
- [ ] TX-07 Cull off-screen draws on the 32x20 Warrior map.
- [ ] TX-08 Lazy-load 3D modules (`render3d.js`, `models3d.js`, `units3d.js`, `fx3d.js`) only when a 3D mode starts; check the home screen's load.
- [ ] TX-09 Preload critical fonts, and make the Google Fonts failure silent with a system-font fallback (already offline-safe; verify it does not flash).
- [ ] TX-10 Determinism test: every mode (`Game`, `AssaultGame`, `Champion`, `Commander`, Dominion battles) replays identically from a seed and an input log.
- [ ] TX-11 Save-schema version number with migration functions and tests for each prior version. (S)
- [ ] TX-12 Content integrity test: every id referenced in `balance.js` tables (towers, enemies, bosses, boons, perks, orders, techs, wonders, achievements) resolves, with a message naming the broken reference.
- [ ] TX-13 Source-contract tests for every new UI string that carries an aria-label.
- [ ] TX-14 Lint rule (a test) forbidding `Math.random` in engine code (determinism).
- [ ] TX-15 Error boundary: a global `error` and `unhandledrejection` handler that shows a calm "Something went wrong, your progress is safe" screen with a "copy debug info" button.
- [ ] TX-16 A tiny local telemetry-free "debug panel" (long-press the version) showing seed, wave, fps, and the last 20 events, to make bug reports reproducible.
- [ ] TX-17 Server: rate limits and validation for any new endpoint, tests in `api.smoke.mjs`.
- [ ] TX-18 Admin: a view of the new boards and counts (if the admin panel lists boards).
- [ ] TX-19 Docs: a `docs/MODES.md` listing every mode, its board id, its seed rule and its validation, kept in sync by a test that fails when a mode id has no entry.
- [ ] TX-20 Docs: a CONTRIBUTING-style note in README on adding a mode, a tower, a foe, with the file list.
