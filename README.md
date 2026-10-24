# Bastion Siege

Endless castle defense in the browser. Build towers, tap enemies to shoot them yourself, and hold the keep against
waves that grow forever: new enemy types, new weapons every 10 waves, a boss every 10, and a new land every 25.
Between runs, spend Renown in The Keep. Play the Daily Challenge, send friends Allied Towers, join a clan, and hit
the World Siege boss together.

- **Static front end**: plain ES modules + Canvas 2D. No build step, no game engine, all art drawn in code.
- **Backend**: one Worker route (`functions/api/[[path]].js`) + one D1 database. Free tier.
- **Offline first**: everything except social features works with no server at all (progress in `localStorage`).

## Play locally

```bash
# Offline mode (no social features): any static server works
python3 -m http.server 8000          # then open http://localhost:8000

# Full stack with the API and a local D1 database
npm install
npm run dev                          # wrangler dev, http://localhost:8788
```

## Deploy (GitHub → Cloudflare)

Pushing to `main` deploys automatically. The repo is set up for a Cloudflare **Workers** project whose deploy command is
`npx wrangler deploy` (the default for a Git-connected Workers project).

- `wrangler.jsonc` declares the Worker (`worker.js`), the static assets, and the D1 binding `DB`.
- `.assetsignore` keeps `node_modules`, tests, docs and server code out of the public files.
  (Without it, wrangler tries to upload the 129 MiB `workerd` binary and the build fails.)
- `worker.js` serves `/api/*` from `functions/api/[[path]].js` and everything else straight from the static assets.
- Build command can stay empty; deploy command `npx wrangler deploy`.

**Online features** (leaderboards, friends, clans, siege) need the D1 database named in `wrangler.jsonc`
(`bastion-siege`, id already filled in). Tables are created automatically on the first API call. To create them by hand:
`npx wrangler d1 execute bastion-siege --remote --file migrations/0001_init.sql`

**Check it**: open `https://<your-site>/api/health`. You should see `{"ok":true,"db":true,...}`, and the home screen footer says **Online**.

`workers_dev` is `true` in `wrangler.jsonc` so every deploy keeps the `*.workers.dev` address on (a `false` here makes each deploy switch it off).
If a Cloudflare Access login appears, turn it off once: Workers & Pages → tower-defense → Settings → Domains & Routes → the workers.dev row → disable Cloudflare Access.

Using Cloudflare Pages instead? `docs/wrangler.pages.toml.example` shows the Pages config; delete `wrangler.jsonc` first.

### Deployment checklist

- [ ] Build passes (`npx wrangler deploy` succeeds)
- [ ] `/api/health` returns `"db": true`
- [ ] Finish a run while online → summary shows your weekly rank and siege damage
- [ ] Allies → Friends shows your 6-character friend code
- [ ] Open a challenge link (`/#c=…`) in a private window → the challenge card appears on the home screen

## How it plays

- **Build** on stone plots beside the road (up to 3 traps on the road). Each map has 18 plots: 6 open at the start, the rest are ruins you claim for rising gold, so every tower counts. Upgrade to tier 4, choose one of two specializations, then buy Mastery stars forever.
- **Read the threat**: most waves lean on a theme (Horde, Rush, Shield Wall, Air Raid, Warded Host, Siege Column), announced a wave ahead with a counter tip.
- **Castle Arts**: 15 unlockable abilities (Arrow Rain, Boiling Oil, Frost Nova, War Horn, Grapeshot, Field Repairs, Spike Field, Smite, Royal Tithe, Plague Flask, Meteor, Aegis, Thunderstorm, Hunter's Focus, Time Stop). Pick a loadout of 4 (up to 6 with the Keep's Arsenal) on the New run screen; slots are `Q E Z X C V` and recharge during waves.
- **Shoot**: tap or click enemies. Headshots ×2, hold to charge a piercing power shot, hits build a combo, misses break it.
  Your own kills pay +50% gold and double points.
- **Defend**: leaks hit the wall, then the keep. Flyers skip both the road and the wall. Archers and Sappers attack towers.
- **Between waves**: War Room for repairs and weapon upgrades, call the next wave early for gold, and a boon every 3 waves.
- **Keys**: `1`–`9` towers · `Q E Z X C V` castle arts · `Space` start wave · `U` upgrade · `S` sell · `R` repair · `W` war room · `A` auto-start waves · `M` buy max Mastery · `F` speed (1–4×) · `G` garrison · `D` deploy troops · `B` foe guide · `N` sound on or off · `P` pause · `Esc` cancel.

## Project layout

```
index.html, css/style.css     page shell + styles
css/polish.css                motion, the themed backdrop, the home bottom bar, Daily Supplies (loaded after style.css)
src/data/balance.js           every tunable number (towers, enemies, waves, boons, Keep, clans, siege)
src/game/                     engine (headless), waves, economy, rules (shared with server), maps, renderer, FX, audio
src/ui/                       screens, in-game HUD/panels/input, tutorial
src/meta/                     profile, achievements, cosmetics, events and themes, codex medals, Dynasty (prestige)
src/net/api.js                API client (fails soft to offline)
functions/api/[[path]].js     the player-facing backend
server/admin.js               the owner's admin API (/api/admin/*), kept out of the public files
admin/                        the admin page (/admin/): Keeper's desk
worker.js, wrangler.jsonc      Worker entry + deploy config (.assetsignore trims uploaded files)
migrations/0001_init.sql      D1 schema
tools/sim.mjs                 headless balance bot
tests/                        unit + balance tests, API smoke test
docs/DESIGN.md                design doc: systems, formulas, tables, schema, API, risks
docs/FUTURE.md                live co-op plan + content roadmap
```

## Tuning and testing

```bash
npm test                                   # wave scaling, economy, validation, determinism, schema drift, balance
node tools/sim.mjs 8 meadow --hero         # bot plays 8 runs; flags: --keep=0|1|2  --verbose  --max=N
npm run dev & node tests/api.smoke.mjs     # end-to-end API test against a local D1
```

Balance snapshot (Meadow Pass, 8 runs each, bot that places towers well but makes simple choices):

| Profile | Bot never shoots | Bot shoots every 0.5 s |
|---|---|---|
| Fresh (4 towers unlocked) | waves 23–30 | waves 45–59 |
| Fully upgraded Keep | waves 54–60 | waves 57–68 |
| Start on wave 30 (Champion), full Keep | not measured | waves 54–58 |

Expect a new human player to land around waves 10–20 on early runs. Pushing past wave 100 needs strong boon synergy,
heavy Mastery investment and active aiming. If the curve feels off, start with `WAVE.hpLin`, `WAVE.hpExpBase`
and `ECON.killGoldExp` in `balance.js`, then re-run the sim.

## Online features and their free-tier cost

| Feature | Notes |
|---|---|
| Accounts | Anonymous. A recovery code (Settings) restores the account on another device. |
| Leaderboards | Global / friends / clan × highest wave / score / today's daily / hero kills; weekly seasons plus all-time. Top 10 each week earn a title. |
| Friends & aid | Friend codes; up to 5 gifts a day: Gold Cache, Repair Kit, or an Allied Tower that fights in their next run for 10 waves. |
| Clans | Up to 30 members, shared Renown treasury, 7 perk levels, weekly kill goal with reward chests. |
| World Siege | A 3-day global boss; every run's kills chip its HP; contributors share the chest. |
| Rivals | The player just above you this week, on the home screen. |
| Challenges | Share links carry seed, map and modifiers, so they work even without the server. |
| Safety | Run plausibility checks, rate limits, name filter, report and block. |
| Admin panel | Owner-only page at `/admin/` (see v1.12 below). Reads and writes only when you use it, so it costs nothing while idle. |
| World Stats | A page of Realm-wide numbers (see v1.11 below). Folding is throttled to once every 5 minutes and costs about 25 writes however many runs it covers. |

About 4–9 D1 writes per finished run, plus two for World Stats (one usage record, deleted once it is folded into the counters), so the free tier comfortably covers thousands of runs a day.

## Known limitations

- **Live real-time co-op isn't included.** It needs a Durable Object in a separate Worker. Co-op is asynchronous
  instead (Allied Towers, clans, siege). The plan is in `docs/FUTURE.md`.
- **Leaderboards are plausibility-checked, not replay-verified.** A determined cheater could submit a believable fake run.
- **Resume restarts the current wave.** Saves happen between waves; closing mid-wave resumes at that wave's build phase.
- **World Stats are counted on trust, like the boards.** Every id and number is validated and bounded, and tallies that do not add up to the run's own kill count are dropped, but a determined cheater could still skew the Realm's percentages a little.
- **Clan donations trust the client's Renown count** (it's a single-player currency stored on your device).
- The name filter is a word list: it blocks the obvious, may miss creative spellings, and occasionally catches an innocent word.
- Google Fonts load from the web; offline you get system fonts.

## Name ideas

The working title is Bastion Siege. Alternatives worth checking at a registrar: **Rampartia**, **Siegeborne**, **Keepwatch**.

## Credits

All art is procedurally drawn on canvas. All sounds are synthesized with WebAudio. Fonts: Baloo 2 and Grenze Gotisch (SIL Open Font License) via Google Fonts.

## The Realm (co-op) — v1.1

Everyone plays for one country, **The Realm of Aldermere**. The Realm has a **weekly muster** and a **monthly campaign** goal (enemies defeated / waves cleared). Goals are set when each period opens from the previous one: the larger of turnout (active citizens × a per-citizen share) and output (what the Realm actually achieved × 0.85), rising at most 2.5× per period, never below a floor (see v1.8 below). Hitting the 25/50/75/100/150% tiers unlocks shared **blessings** for every player and claimable Renown. The roll of citizens ranks each player's contribution (per week, month or all-time).

- Server logic lives in `functions/api/[[path]].js` (`/api/realm`, `/api/realm/claim`, `/api/realm/board`); tables are created automatically and mirrored in `migrations/0001_init.sql`.
- Local full-stack test server: `node tools/devserver.mjs 8790` (static files + the real API on SQLite).
- Also new: animated rigged characters, tower upgrade flair, tap-to-collect loot, kill-streak call-outs, a daily play streak and daily/weekly orders.

## Together — v1.5

The game now leads with its co-op side: one Realm, one common enemy.

- **Common enemy card** on the home screen: the World Siege boss with a shared health bar, how many defenders are fighting, your damage and share, citizens online now and the latest deeds.
- **Daily Rally**: one shared enemy-count goal per UTC day (sized from yesterday's turnout). Win it together and every contributor (30+ enemies) gets ✦ 30 Renown in their Inbox.
- **Deeds of the Realm**: a feed of personal bests, wave milestones, boss kills and Realm tier unlocks. Anyone can 👏 cheer a deed; cheers received show in your stats.
- **Chronicle** (replaces Records): *You* (insights like "12 waves off a new record", rank progress, streak, event rewards in reach, your share of the Realm), *The Realm* (all-time totals, citizens, runs, deepest wave) and *Deeds*.
- **Team bonuses** are listed when you start a run (Realm blessings, weekday blessing, event bonus, clan).
- Server: `GET /api/front`, `GET /api/stats`, `GET /api/realm/feed`, `POST /api/realm/cheer`; tables `rally`, `rally_contrib`, `realm_feed`, `feed_cheers` are created automatically and mirrored in `migrations/0001_init.sql`.

## Supports — v1.6

- **Barracks** soldiers now scale with the wave, hold up to 3–5 foes, and every held enemy takes +30% damage from all towers. Select a barracks and tap the road to move its rally flag.
- **War Banner** has a wider, stronger aura, adds up to +8% weapon damage per banner to your own shots, and stacks with diminishing returns.
- **Flagged plots** give damage towers +20% fire rate; a flagged barracks gets an extra soldier and faster respawns; a flagged banner gets a wider, stronger aura.
- `tools/abtest.mjs` is a controlled A/B harness for balance changes.

## Arts, late emplacements and the level ceiling — v1.7

- **Castle Arts** grew from 4 to 15. Each is bought in the Keep (with its own cooldown and power upgrades) and chosen on the New run screen. The loadout has 4 slots, up to 6 with the two Arsenal upgrades. Damage arts are measured in "grunts" so they scale with the wave like towers do.
- **Five late emplacements**: Gatling Nest (wave 20), Venom Spire (16), Void Well (26), Sanctum (22), Trebuchet (30). Each is a Keep unlock (the four damage ones also get a Training node), and each fills a different job: sustained DPS, armor-ignoring poison, crowd control by pulling foes back, support healing, siege damage.
- **Mastery perks**: every tower has four perks unlocked at 3, 6, 10 and 15 Mastery stars (see the tower panel).
- **Purchase descriptions**: anything bought in the Keep opens a card saying what it does, with real numbers, before you spend Renown. Selecting a tower type for the first time in a run shows a one-line role description.
- **Ceilings**: waves are endless, Ascension tops out at 10, commander rank was capped at Grand Marshal (400,000 lifetime Renown) until v1.10, which adds six ranks above it and the Dynasty system; Mastery stars are unbounded. Competition boards: Highest wave, Score, and the new **Ascended** board (highest Ascension cleared). The Chronicle shows a "How far can you go?" card with your progress to each ceiling.
- `tools/abtest.mjs --new` compares each new tower against a control build (`--budget=N` sets the upgrade spend).


## The Wild Marches — v1.8

**Content**
- **Six new foes**: Powder Goblin (11, explodes and jams nearby towers when killed), Harpy (13, flying flocks), Gold Thief (15, steals gold instead of hitting the wall, drops a fortune when caught), Tunneler (20, burrows: towers and your bow can't target it, but traps, splash and slows still can), Bog Troll (34, regenerates unless burning or poisoned) and Phase Wraith (38, blinks forward along the road, slipping past soldiers).
- **New boss: the Bog Hydra** (wave 50 in the rotation): regenerates unless burning or poisoned, and spits acid that damages and jams towers.
- **Three new battlefields**: Serpent's Coil (wave 20, a spiral road around a central keep; flyers cut across), Bogwater Ford (wave 30, two roads through mud that slows walkers to 60%) and Dragon's Spine (wave 40, three roads with a high-ground ridge between them). They join the Daily Challenge rotation from 2026-10-14.
- **Three new threats**: Wild Hunt, Underground, Phantom March. **Two new boons**: Thief-Taker, Kindling.
- **Repeater** hero weapon (12-bolt drum).
- **Cosmetics**: a new Wardrobe category, **Hero outfits** (9, with hoods, a crown, a tricorn and a wizard hat), plus 4 castles, 3 trails, 4 defeat effects and 3 tower finishes. 12 new achievements reward most of them; the rest are in The Keep. The Wardrobe now shows a preview of every item.

**Quality of life**
- Auto-start waves (`A`, dock button), 4× speed, and the chosen speed is remembered.
- Upgrade preview in the tower panel (e.g. *Damage 46 → 74*), and **buy-max Mastery** (`M`).
- Selling an upgraded tower takes two taps (or two presses of `S`).
- War Room toggle: auto-repair the wall and keep after every wave.
- Tap any foe in the next-wave banner to see what it does; the first time you meet a new foe, a card explains it. The bestiary shows descriptions.
- **Quick run** on the home screen repeats your last setup in one tap.

**Home screen**
- Leads with a living diorama: the real engine and renderer run a never-ending parade (mostly the new foes) on a rotating map, with your equipped castle, outfit, tower finish and defeat effect. Tap foes to shoot them.
- One clear way to play (Continue / New run, then Quick run and Daily side by side), a compact **Today** list (orders, event, weekday blessing), and **The Realm** as a single strip. The big common-enemy card moved to Allies → The Realm.

**Realm goals scale with the Realm**
- Weekly and monthly goals: `max(floor, active × perActive, lastOutput × 0.85)`, capped at 2.5× the previous goal. More citizens *or* harder-playing citizens mean a tougher next period; a quieter Realm gets an easier one. Repeating last period's effort lands at about 118%, so Victory is in reach and Legend takes a push. The Daily Rally and the World Siege boss's HP follow the same idea. The Realm screen says what each goal was set from.


## The Royal Court — v1.10

**Themes** (Wardrobe → Themes tab, and a "Realm theme" line in Settings)
- Ten permanent **realm themes** recolor the meadow, the tint over the battlefield and the ambient drift of petals, embers or snow: Dawnstone, Crimson Banner, Emerald Marches, Stormwatch, Moonlit Keep, Ironclad, Dragonforge, Royal Court, Starforged Throne and Eternal Dynasty. Two are free; the rest unlock through play (wave 15 or 25, a 7-day streak, the ranks of Captain and Baron, or Prestige 1, 3 and 5), and each card says exactly how.
- **Follow the calendar** (the default) keeps the seasonal themes that switch themselves on during Hearts, Spring, Summer, Halloween, Harvest and Winter events. Pick any unlocked theme to override it, or pick the classic look to turn themes off.

**How to play, on the home page**
- A **50-second animated tour** runs on the real engine: a finger builds towers, calls the wave, shoots, upgrades to a specialization, casts a Castle Art and fells a boss. Step chips jump between the six steps; it can be paused, hidden, or replaced by a practice run. It is open by default for new players, is silent, and obeys reduced motion (static steps instead of animation).

**Castle and medieval art**
- A larger, hand-drawn **castle** (keep, curtain wall, gatehouse, corner towers, banners, damage states) with the hero on the parapet, stone-bordered **cobble roads**, **enemy camps** and scenery (mills, standing stones, palisades, wells, banners) replacing the earlier props, deeper trees, and a new heraldic home screen (crest, banners, gilded title). New app icon and favicon.

**The Codex** (home → The Codex)
- An encyclopedia of **every foe, boss, tower, weapon, Castle Art, boon, threat, modifier, land and rule**, with searchable cards that show real numbers and what to do about each. Cards for foes you have not met yet are marked "Not yet met".
- **Medals**: every foe, boss and tower has Bronze, Silver and Gold medals tied to your own history with it (kills, builds, damage). Each medal pays Renown once, and filling the Codex earns the titles Chronicler, Loremaster, Archivist and Grand Archivist (+1% Renown each).

**Ranks and Dynasties**
- **Six new ranks above Grand Marshal**: Lord Protector (600k lifetime Renown), Archduke, Prince Regent, High King, Emperor and Eternal Sovereign (3.5M). Each pays a Renown gift when reached.
- **The Dynasty** (prestige) opens once you have earned a Dynasty's worth of Renown (it grows with each ascension). Ascending resets the Keep's stat upgrades and unspent Renown (replaced by a royal endowment), and in return grants a permanent power ladder (+5% Renown, +2% tower damage, +2% castle HP and +12 starting gold per Dynasty), a **Legacy perk** of your choice from three offered (12 perks that stack up to five times), and a reward from the ten-step royal ladder: a title, a cosmetic and, at set Dynasties, a theme. Unlocks, cosmetics, titles, rank, achievements and stats are never lost. Dynasty is shown on the home screen with a "Ready to ascend" glow.
- The run summary now reports rank gifts, Codex medals and when your line is ready to ascend.
- 12 more achievements (100 in total) cover Dynasties, codex medals and the long road (200 waves, a million kills, 1,000 runs).

**Under the hood**
- Version 1.10.0. Everything new is client-side or profile-only: no D1 migration and no API change. Old saves load with the new fields filled in. New tests: `tests/royal.test.mjs` (themes, ranks, prestige, medals, codex) and `tests/howto.test.mjs` (the tour script plays out on the headless engine).


## World Stats and calmer controls — v1.11

**World Stats** (home → World Stats)
- A page of Realm-wide numbers, counted from every finished, accepted run: **who lands the killing blow** (each tower type and the player's own weapon), **towers** ranked by kills, damage, how often they are built, or kills per tower (with the specializations chosen for each and your own build mix beside the Realm's), **weapons**, **Castle Arts**, **boons**, **foes and bosses slain**, **battlefields**, **Ascension levels**, **modifiers**, **game modes**, and a histogram of how deep runs go. Switch between *All time* and *This week*.
- Each finished run sends a small `usage` record (towers built, kills and damage per tower, kills per foe, specializations, art casts, boons). The server validates every id and number (`cleanUsage` in `src/game/worldstats.js`), stores the record in `run_usage`, and the next person to open World Stats folds the waiting records into `world_stats` (one JSON counter blob per period and category). Folding runs at most once every 5 minutes behind a lock row, deletes what it folded in the same transaction, and costs about 25 writes however many runs it covers, so the free tier is not strained. Records are counted in the week they were played.
- Server: `GET /api/world?period=all|week`. Tables `run_usage` and `world_stats` are created automatically on the first API call and are mirrored in `migrations/0001_init.sql`. Pick rates only count runs that reported what they built, so older app versions never skew them.
- The engine now records kills per tower type and Castle Art casts (`stats.killsByTower`, `stats.artUses`).

**Calmer controls**
- **No accidental zoom.** `touch-action: pan-x pan-y` now applies to every element (a rule on `body` never reached buttons inside scrolling panels, which is why rapid taps could still zoom), the viewport pins the scale, iOS pinch gestures are cancelled (`src/ui/nozoom.js`), and text fields are at least 16px so iOS does not zoom on focus. Taps are never cancelled, so quick button taps still count. Desktop browser zoom is left alone.
- **The break between waves runs on real time.** The build countdown no longer follows the 2×–4× game speed (`Game.tickBuild`, driven by the play loop). Waves still fight at the chosen speed. Headless runs and tests keep the old simulation-time behavior.

## The Keeper's desk (admin panel) — v1.12

An owner-only page at **`/admin/`** for moderation and housekeeping. It is a plain static page that talks to `/api/admin/*`; there is nothing in the game that links to it.

**Switching it on** (one time). Admin access is off until the server has a secret key, so a fresh deploy exposes nothing.
1. Make a long random key (16 characters or more): `openssl rand -hex 24`.
2. Cloudflare dashboard → Workers & Pages → `tower-defense` → Settings → **Variables and Secrets** → Add → type **Secret**, name `ADMIN_KEY`, paste the key. (Or from a terminal: `npx wrangler secret put ADMIN_KEY`.) Choose *Secret*, not *Text*: secrets survive deploys.
3. Redeploy if the dashboard asks, then open `https://<your-site>/admin/` and sign in with the key.

Locally, put `ADMIN_KEY=...` in `.dev.vars` (already git-ignored) and run `npm run dev`. Never commit the key. To rotate it, set a new secret value; the old one stops working immediately.

**How it is protected**
- The key travels in an `x-admin-key` header (so no other website can make your browser call it) and is compared in constant time. Without a configured key every admin route answers 404.
- Eight wrong keys from one network address lock that address out for 15 minutes (*Upkeep → Clear admin lockouts* lifts it, from another network).
- Every sign-in and every change is written to `admin_log` (newest 1,000 kept) and shown under **Audit log**. It cannot be edited or cleared from the page.
- The page builds everything with `textContent` and a strict Content-Security-Policy, because player names and feed text are written by strangers. Keeping the key out of reach is the real safeguard, so keep it out of chat and screenshots; for a second lock you can also put Cloudflare Access in front of `/admin/*` and `/api/admin/*`.
- Dangerous actions (delete, wipe, reset) need you to type a word first, and the API refuses them without an explicit `confirm`.

**What it does**
- **Overview**: players, activity, review queue, the Realm's progress, latest changes.
- **Players**: search by name, friend code or id; filter (reported, hidden, suspended, new, away, never played); open a card to rename, clear a board title, send a message or a gift of Renown/title, hide from boards, **suspend** (every request refused with "This account has been suspended", data kept, reversible), dismiss reports, remove from clan, lift rate limits, wipe board entries or all progress, or **delete the account**. Deleting can also take the player's share back out of the weekly, monthly, rally, siege and clan totals ("undo"), and passes a clan to its next member.
- **Objectives**: reset the Weekly Muster or Monthly Campaign (progress, claimed spoils, and/or goals: keep, recalculate, or set your own), reset or re-open the Daily Rally, restore or restart the World Siege, reset every clan's weekly progress. Lifetime totals are never touched.
- **Leaderboards**: browse any board and week, remove one entry, reset a board or all boards.
- **Stats**: reset World Stats (this week, all-time, or everything), lifetime Realm totals, old run history, or a *Fresh start* that clears every statistic but keeps accounts, clans, friends and inboxes (handy for launch day).
- **Clans**: search, rename, retag, change XP/treasury/leader, reset weekly progress, remove members, disband.
- **Messages**: broadcast a note (with optional Renown) to everyone, the last 7 days or the last 24 hours, with a recipient count first; moderate the Realm feed.
- **Upkeep**: clear expired rate-limit rows and old claimed messages, find and delete long-inactive accounts (preview first, 25 per call), see how big every table is.

Suspended accounts use `players.hidden = 2`; five player reports still only hide someone (`hidden = 1`) and can no longer lift a suspension. New table `admin_log` is created automatically and mirrored in `migrations/0001_init.sql`. Tests: `tests/admin.test.mjs`.


## The Garrison (deployable troops) — v1.13

Train an army in your keep and send it out to hunt. Open it with the **⚔ Garrison** button or **G**; **D** deploys or recalls the whole squad.

**How it works** (`src/game/garrison.js`, data in `TROOPS` / `GARRISON` / `VALOR` in `src/data/balance.js`)
- **Training queue.** Each troop costs gold and training time (elites also cost **Valor**). The queue holds five; the cost rises 2.5% per wave so the army keeps pace with the foes. Troops occupy **slots** (4 to start, +1 per 5 waves, up to 30; knights take 2, cavalry 2, griffons 3).
- **Eight troop types.** Footman (cheap line-holder), Bowman (hits flyers), Pikeman (armor, double damage to fast foes), Crossbowman (ignores armor, hits flyers), Knight (heavy tank, hunts bosses), Cavalry (first strike ×3, hunts thieves, archers, healers and casters), Cleric (heals), Griffon Rider (flies, hits air and ground with splash). The first two are free; the rest are unlocked in the Keep's new **Garrison** branch.
- **Orders.** *Hunt* seeks the nearest threat on the road, *Guard* holds a ring around the castle. **Auto** marches out each wave, falls back at 22% health, and rejoins at 70%. Troops in the keep heal; *Tend wounds* pays gold to mend everyone.
- **Holding the line.** Melee troops use the same hold-and-pin mechanic as barracks soldiers, so a pinned foe is slowed for every tower. Bosses, rams and flyers hit back harder (`foeStrike`).
- **Valor** comes from kill points, cleared waves, flawless waves and bosses. **Muster** is a gauge that fills with kills and gives a free recruit.
- **Ranks.** Troops earn XP and become Veteran, Elite and Legend (+12% health and damage each). Fallen troops are gone for good, unless the Keep's Stretcher Bearers or the Immortal Guard boon saves them.
- **Scaling.** Troop health and damage grow with the same plan curve as the foes (exponents in `GARRISON`), so a wave-40 footman is not a wave-1 footman.
- **Dismiss** refunds 40%. Garrison state is saved with the run.

**Counter-pressure.** New foes arrive to match: Skirmishers (wave 10, throw javelins at troops), Ogres (24, cleave groups), Gargoyles (28, armored flyers), Dread Knights (36, crush troops). Three new threats announce them (Raiding Party, Brute Force, Stone Flight), and waves are about 10% bigger.

**Balance.** `node tools/sim.mjs 12 meadow --hero --keep=1` runs the bot with a garrison; add `--no-troops` to compare. At the current tuning troops add roughly 5–10% more waves for the bot on top of a harder roster; a human micro-managing them gains more.

**Tests.** `tests/garrison.test.mjs` covers training, costs, slots, valor, muster, deploy and recall, holding, anti-air, ranks and death, saves, boon gating, Keep bonuses and the world-stats consistency check (troop kills are not credited to towers).

**Announcing it.** The home page leads with a "NEW · The Garrison" card (troop icons, *Watch it in action* jumps the tour to its new **Train troops** step; dismiss with ✕). The tour is now step 6 of 7 and about a minute long. Players who haven't opened the Garrison yet get a one-time toast four seconds into their next run, and the Garrison button pulses until opened.

## Weather — v1.13.1

The land's weather (sandstorm, blizzard, meteors, shadows; from wave 25) was easy to miss on desktop, where its small chip sat behind the Castle Art buttons. It now has a banner when it hits, a "rolling in…" warning 2.5s before, and a chip with a countdown at the top of the board. It also bites harder (`WEATHER` in `src/data/balance.js`): sandstorms cut tower range 28% and rate 8%; blizzards slow foes 28% but cut tower rate 20% and range 10%; meteors fall every second, hit harder, and scorch troops and nearby towers; shadows hide 60% of foes for 4.5s, including ones that spawn mid-spell. Spells are longer and come more often, and troops are affected too (slower in blizzards, shorter bow range in sandstorms).

## Rebalance: the game should not play itself — v1.13.2

Measured with the sim bot (`tools/sim.mjs`, with and without `--hero`): with a strong Keep, waves 1–40 almost never leaked, and troops landed over half the kills. Changes:
- **Foes learn your Keep** (`GAME.adapt`, `Game.metaPower`). Foe health is multiplied by your upgrade power^0.6 (cap ×2.2), ramping in from wave 5 to full strength around wave 25. A fresh keep is untouched; a maxed one meets foes about twice as tough. Upgrades still help, but the middle waves keep their bite. Gold and troop strength do not scale with it.
- **Steeper mid-game** (`hpExpBase` 1.03 → 1.036).
- **Troops need tending**: damage ×0.62 (was 0.8), cost +3.5%/wave (was 2.5%), end-of-wave healing 18% (was 30%).
- **Marked foes**: a foe you shoot yourself is Marked for 5s. Troops focus it and everything hits it 20% harder, so hands-on play steers the garrison.

Bot results (average wave, 12 runs, hero off = hands-off, hero on = engaged): fresh keep 24 / 41, mid keep 24 / 42, maxed keep 36 / 53. Before: 26 / 44, 26 / 45, 63 / 70.

## Sound and music — v1.14

`src/game/audio.js` is now a small adaptive score plus medieval effects, still fully synthesized (no audio files).
- **Music** is composed per land, each in its own mode: Meadow (Dorian), Dunes (Phrygian dominant, with hand drums), Frostlands (Aeolian, bells), Ashlands (low Phrygian, horn lead), Shadowfen (a dark mode, bells). Layers: drone pad, lute arpeggios, a flute/bell/horn melody that repeats like a written phrase, taiko and snare, marching strings, brass and a thin tension layer. A quiet menu theme plays on the home screen.
- **It follows the fight.** `PlaySession.updateMood` feeds the engine phase, how full the field is, bosses and keep danger a few times a second. The build phase is calm and melodic; waves bring drums and strings that grow with the crowd, brass for bosses, and tension when the keep is near falling. Tempo rises with intensity, and pausing muffles the music.
- **Effects** were redone with steel, shields, hooves, horns, anvils and bells: sword clangs and shield thuds for the Garrison, bow twangs, gallops, griffon screeches, healing chimes, a rally drum-and-horn call, boss roars, a coin jingle, fanfares for clearing a wave, a funeral toll for defeat.
- **Weather has ambience**: a sandstorm roar, blizzard howl, meteor rumble with falling whistles, and a whispering drone for Shadows, plus a warning horn as a spell rolls in.
- Everything is scheduled on the audio clock and rate-limited, run through a compressor and a small hall reverb. The volume sliders in Settings still control master, effects and music.

**v1.14.1: crowded fights.** Dozens of arrows, hits and kills per second used to be played one by one, which smeared into noise and used up the browser's voices (so even important sounds could be dropped). Busy combat sounds (arrows, bolts, kills, clangs, thuds, orbs, zaps, cannons, booms, coins) are now merged every 90 ms into one voice per kind, or two in a real crowd, a little louder the more there were and with slight pitch variation. When the mix is very busy the lesser sounds (twangs, zaps, orbs, coins, frost) drop first. A hot-fight stress test went from about 70 simultaneous voices to under 50 with a cleaner peak. Boss, horn, fanfare and Garrison call sounds are never merged.

## Bug fixes and balance — v1.14.2

**Bugs**
- **Armored-foe bonuses only worked on Ballista bolts.** Gatling *Armor Piercer* (×1.6 vs armored), Cannon *Siege Shells*, the *Giant Slayer* boon and the *Armor-Piercing Tips* Keep upgrade did nothing on arrows, orbs, splash, chains, beams or pulses. Every shot type now passes them on (`armoredMult`), and beams and pulses get boss bonuses too.
- **Arcane Lance ignored its own "ignores magic resist".** Single-target homing hits dropped `pierceMr`; Lance (and the Mage *Spell Surge* perk) now pierce MR as described.
- **Sharpshooter overrode your targeting.** It was hard-wired to "Strong", so the Targeting buttons silently did nothing. The spec now sets "Strong" once when you pick it and then obeys whatever you choose.
- **Partial wall/keep patches wasted most of your gold.** The patch amount was worked out from a per-HP price rounded up to 1 gold, so early on (about 0.5 gold per wall HP) a patch bought half the wall it should. It now uses the real rate.
- **Repairing a wrecked Banner, Sanctum or Mint didn't count until something else changed.** Its aura or healing stayed off for the whole next wave; repairing now refreshes tower stats at once.
- **The early-call bonus on the Start button was wrong** with the *Eager Quartermasters* Keep upgrade or Gold Rush. It now shows exactly what you'll get (`Game.earlyCallValue`).
- **Five towers had no hotkey** (Venom, Sanctum, Gatling, Void Well, Trebuchet). They're now `]` `;` `'` `,` `.`.
- Loot picked up by hand now counts toward peak gold, and the How to play list of threats is built from the real list (it was missing three).

**Balance** (measured with a single-tower-type arena: equal gold, 4–8 plots, waves 22 and 32)
- **Sharpshooter**: ×2 damage and 30% crits (was ×1 and 25%). It stopped about a third as much as Volley; now it's a real single-target pick.
- **Venom Spire**: poison 14/s per stack (was 9), fires 1.2/s (was 0.9), lasts 5s (was 4). It was the weakest tower in every test.
- **Gatling Nest**: 6.5 damage per shot (was 5).
- **Sunlance**: ramps to ×8 (was ×7) and twice as fast, so it pays off before the target dies.

Bot results (8 runs, Meadow): fresh keep, hands-off: waves 17–43, avg 26.6 (was 17–28, avg 24.6). Maxed keep, hero on: 51–67.

## The Map of Aldermere — v1.15

The Realm is now a place, not a progress bar. **Allies → The Realm** opens with a painted map of forty provinces around the capital; the home screen's Realm strip shows a thumbnail of it.

**The border follows the Realm's tasks.** When a task closes, the server settles it once (`resolveMap` in `functions/api/[[path]].js`, run lazily by whoever opens the Realm first):

| Task | Won | Middling | Missed |
|---|---|---|---|
| Daily Rally | +1 province | | −1 |
| Weekly Muster | +2 (Victory), +3 (Legend) | 50–99%: holds | under 50%: −2 |
| Monthly Campaign | +4 (Victory), +6 (Legend) | 50–99%: holds | under 50%: −4 |

The Realm starts with its capital and heartland (6). The capital and its two nearest provinces never fall. Gains past the 40th province become **Bulwark** (up to 6), which absorbs later losses. Periods missed long ago are skipped rather than piled on (14 days, 4 weeks, 2 months at most). Every change is written to a border chronicle and posted to the Deeds feed.

**Every province has a focus.** Eight lands, each with its own look, battlefield, weather and foes: Heartland, Greenwood, Coast, Highlands, Frostlands, Ashlands, Dunes and Shadowfen. Each province gives every run a gift while it is held, usually tied to a unit (*Ballistas +5% damage*, *Knights +8% health and damage*), sometimes gold, walls or the hero's bow. Lose the province and the gift goes with it. Each province also has a **native foe**.

**March on the frontier.** The next province to take is *Contested*. March on it from its card: you fight on its battlefield, under its land's sky and weather (from wave 6), and its native foe joins every wave from wave 4 (8 for heavy foes) instead of waiting for its usual unlock. Every kill in a March counts **2×** toward today's Daily Rally (`mode: 'march'`, capped per player as before).

**Code**
- `src/game/realmmap.js`: provinces, conquest order, border rules (`deltaFor`, `applyDelta`), gifts (`mapPerks`), March setup. Shared by the client and the server.
- `src/ui/mapview.js`: the painted map (warped Voronoi provinces, coastline ripples, terrain glyphs, cartouche, compass), the live layer (horde-land hatching, the red front line, the pulsing contested province, banners, hover and selection) and the home thumbnail.
- `src/ui/realm.js`: map section, province card, "How the border moves", border chronicle, March dialog, run-summary line.
- Engine: `opts.march` (biome override, weather from wave 6, foe boost via `planWave(..., { marchFoe })`), `bonus.troopTrain` for per-troop gifts. `profile.runBonus` accepts `train_<tower>` / `troop_<kind>` and any numeric bonus field from the Realm.
- Tables `realm_map` (one row) and `realm_map_log`, created automatically and mirrored in `migrations/0001_init.sql`. `GET /api/realm` now includes `map`.
- Admin panel → Objectives: a **Map of Aldermere** card to set provinces held and Bulwark (audited and chronicled). A Fresh start resets the map.

## Sound switch — v1.15.1
A 🔊/🔇 button now sits in the battle HUD and on the home screen. It mutes every sound effect and the music at once, remembers your choice, and stays in sync with the Settings volume sliders. In battle, press **N**.

## Adaptive play — v1.16
**New run → Difficulty → 🎯 Adaptive** starts you on the wave that should feel tense for *you*. It reads your recent runs on that map (or all maps until you have three there), takes about 60% of the wave you usually reach, rounds down to a step of five, and nudges it a step when your last head-start runs were over in a few waves or a walk. Before three runs it starts on wave 1. Quick run remembers it and recalculates each time.

It is never forced. Every manual difficulty still works, and every mode and leaderboard rule is unchanged.

**Vanguard runs** are runs that began at or above your adaptive wave, whether Adaptive picked it or you chose a tier by hand. They are the prerequisite for a few things that used to reward grinding easy waves:
- a fourth **Daily order**, "Clear N waves in an Adaptive-level run" (30 Renown);
- the **last two rewards of each seasonal event**, which also need 40% of their wave count held in Vanguard runs (the other rewards count every wave, as before);
- two achievements, **Vanguard** and **Spear of the Realm** (25 Vanguard runs).

New players, and anyone the game cannot yet measure, always qualify. The server accepts every fifth wave from 5 to 70 as a start wave. Head-start rules (50% rank credit, no score, hero or daily boards) are unchanged.

## Sound off by default, and the Realm tour — v1.16.1
- New players start with sound **off**. The 🔇 button on the home screen says "Sound off · tap to turn on", and the same button and the N key work in battle. Players who already chose a setting keep it.
- **▶ How it works** (Realm tab, and the Full guide) plays a short animated tour over the real map: everyone fills the same goals, won goals take provinces, missed ones lose them (down to the floor), each land has a gift and a horde, and a March counts double toward the Rally. It opens once, on a first visit to the Realm. The scenes come from `src/ui/realm-tour-script.js`, which reads the real territory rules, so the tour cannot drift from the game. With reduced motion on, each scene shows finished and you step through it.

## Polish pass — v1.16.2
- Labels: two Keep upgrades were both called "Tax Collectors" (the Royal Tithe one is now "Gilded Hours"); the Cartographer achievement says "the four original maps" (the newer maps have their own medals); the What's new page, its home tile and the Full guide now cover Adaptive play and the sound switch; American spelling throughout (Favorite, neighbors, Harbors, gray).
- New players get a lower default effects volume (55%, was 80%) for when they do switch sound on.
- The game re-checks the server every 30 seconds after a failed first check, so a phone that starts in a tunnel gets Online features back without a reload.

## Map events — v1.16.3
- A forest province is now **Greenberg** (it was Greenhollow).
- **Map events** spotlight one province for a few days (`MAP_EVENTS` in `src/data/events.js`, one entry each: province id, UTC dates, text). While one runs, every run earns bonus Renown if the Realm holds that province, or a larger bonus for a March on it. It shows on the province card and in the Today card. The first is the **Witchwood Vigil** (Oct 20 to Nov 2), for the Haunted Siege.

## Event explainers — v1.16.4

- Tapping an event on the home screen's Today card (the active event, the next one, or a map event) now opens a short explainer: what it is, its dates, how it works, and every reward with progress.
- Map events link straight to the Realm map.

## Phone taps — v1.16.5

- Panel buttons (buy, upgrade, mastery, repair) no longer lose taps on phones. The side panel used to rebuild every fraction of a second as gold ticked up, and a rebuild between finger-down and finger-up swallowed the tap. Rebuilds now wait while a finger is on the panel.
- Tapping near a Fire Trap mid-wave on a touch screen fires at the nearby foe instead of opening its Mastery panel. Traps sit on the road, so they get a wider "foe nearby" radius than towers.

## Weather on phones — v1.16.6

- On phones the big weather pennant is gone; the small chip at the top (name and countdown) does the job, and its description line is hidden so it takes up less room. Desktop keeps the full banner.
- Banners, chips and toasts can no longer be text-selected, so Safari stops offering to copy them when you tap.

## Heavy weapons — v1.17.0

Four slow, hard-hitting hero weapons, unlocked in The Keep (Weapons group):

| Weapon | Renown | Quiver / reload | What it does |
|---|---|---|---|
| Siege Mortar | 260 | 1 / 4.4s | 95 damage with a 2.1-tile blast |
| Thunder Lance | 340 | 2 / 3.4s | Magic bolt that arcs through six more foes |
| Meteor Staff | 420 | 1 / 5.2s | 2.7-tile fire blast and a long burn |
| Titan Ballista | 520 | 1 / 9s | Pierces five foes and takes 60% of a boss's max health (84% fully charged), ignoring armor |

The boss slice is a percentage of max health, so it stays a "one good shot" weapon at any wave. Mark and other damage buffs still apply to it. Armory upgrades, Keep bonuses and boons apply as usual.

## Feedback fixes — v1.17.1

- **Daily orders now actually progress.** Two bugs: the "Collect gems" order never counted (gems were missing from the run summary), and every order was only credited when a run *ended*, so closing the tab or saving and quitting lost it. Orders and event waves are now paid at each cleared wave (with a toast when one completes); the final summary pays only the difference.
- **Weekday blessing, orders and streak use your own calendar day** (they used UTC, so Wednesday evening in Chicago showed Thursday's blessing). The shared daily challenge, rally and leaderboards stay on UTC so everyone plays the same day.
- **Tower bars stack:** the green health bar sits above the tier pips / mastery stars instead of covering them.
- **Portrait phones:** the wave banner is smaller and sits low on the map, away from where foes enter.
- **Flak Battery** is now a real anti-air specialist: 22 damage (was 13), faster, longer range, 1.0 blast radius.

## v1.17.2

- Switching orders and streaks to the local day could have wiped a day's progress or reset a streak on the first load (the saved day was a UTC date, one ahead of the local one in the evening). A saved day one ahead of today is now treated as today.

## Calmer screens — v1.17.3

Feedback was that the game feels dense, especially on a phone.
- **Tower bar:** towers you haven't bought in The Keep no longer appear as greyed-out "🔒 Keep" slots, and only the next two wave-locked towers are teased. A fresh account sees 4 buttons instead of 16.
- **Landscape phones:** the action buttons (Start wave, Garrison, War Room, Auto) used to run off the right edge of the screen. They now wrap, with Start wave on top at full width.
- **Home screen on phones:** four main tiles (Keep, Allies, Achievements, Settings) with the rest behind a "More" button; the new-feature card is a single line; the animated how-to-play tour stays open only for the first two runs (was eight).

## v1.17.4

- During a run, the weather chip and all notices now sit at the bottom of the map (above the ability buttons and the dock) instead of the top, so they never cover where foes enter. Outside a run, toasts are unchanged.

## Game modes — v1.18.0

Three new ways to play, from **Game modes** on the home screen. Every kill, wave and order in them counts toward the Realm (weekly and monthly goals, the Daily Rally), Renown, the siege and your clan, just like a normal run. They keep their own records and leaderboards and stay off the main wave board, because their waves are not the main game's waves.

- **Gauntlet:** the boss on wave 10, 20, 30… closes a stage. You then start over on a new map (Meadow, Twin Rivers, Serpent's Coil, Crossroads, Bogwater, Dragon's Spine, a Frontier road, then round again) with a grant of gold, extra open plots, free boon picks and the next towers unlocked. Your towers stay behind; your Keep, boons and troops come along. Each fight counts as two waves of toughening (the counter goes 2, 4, 6…), and the break between fights is 12 seconds. Ranked by the furthest wave. In the headless bot, a mid Keep falls around wave 28 and a maxed one around 66 to 72.
- **Last Stand:** timed survival on a weekly map that is the same for everyone. No Keep, Realm or clan bonuses, every tower and troop available. Before the first wave you raise any number of towers on every plot, each free, at tier 5 with ★15 mastery (change its specialization for free), and fill a 30-slot garrison free. Then the doors close: nothing can be built, upgraded, repaired, sold or trained, and no boons come. Waves start at strength 55 and roll on three seconds apart. Ranked by time on the clock; every 100 foes defeated counts as a cleared wave for the Realm.
- **Sprint:** waves 1 to 15 on a weekly map, with far tougher foes (14x health, 1.8x numbers) pouring in twice as fast, 6-second breaks and 120 extra starting gold. The clock stops when wave 15 falls; early calls save time. Ranked by the fastest clear. A failed Sprint still counts for the Realm.

The clock counts wave time at game speed (so 4× does not change it) plus the real-time breaks, so speeding up is no help and no penalty.

Under the hood: `src/game/modes.js` holds the rules shared by the engine, client and server; `validateRun` has mode-aware plausibility checks (even waves in Gauntlet, a pace floor in Last Stand, a minimum clear time in Sprint); three new leaderboard boards (`gauntlet`, `laststand`, `sprint`; Sprint stores a number that grows as the time shrinks); personal bests live in `profile.best.modes`; six new achievements. `tools/modesim.mjs` is the balance bot for the three modes.

## Endurance — v1.19.0

A fourth game mode, and the classic run now shows on the **Game modes** screen as **Infinite**, so every way to play is in one place (it still starts from New run and keeps its own save).

- **Endurance:** no gold and no waves. Every tower is unlocked, free and fully mastered, every plot is open, the garrison is free, the hero's weapon comes fully trained and you pick any weapon and up to six castle arts on a loadout screen before the run (remembered between runs). Keep bonuses, boons and the War Room are off, so it comes down to where you place things and what you carry. It runs on a weekly map shared by everyone. Setup is untimed; press Begin and the doors close: nothing can be built, changed or sold after that. Then foes simply keep coming: every 12 seconds the stream steps up one level of strength (level n is wave n's roster, so new foes and a boss every tenth level, about every two minutes, arrive on the usual schedule), whether or not the last surge is dead. When a boss falls, and every 150 foes defeated, **every tower is rebuilt to full health** (ruined ones included), the wall and garrison are mended and a share of the keep is restored. Ranked by time held on its own board (`endurance`); every 100 foes counts as a wave for the Realm. A simple headless bot (a fixed tower mix, no hero play) falls at about level 70 to 80, 13 to 16 minutes in. A run begun cannot be saved and resumed (the setup can).
- Plausibility: the level cannot outrun the clock (one per 12 seconds), a cap on kills per second, and waves cleared must follow the kill count.
- New achievement: Iron Will (30 minutes in Endurance).

## Pick your battle — v1.20.0

A tidier home screen that leads with the game modes, plus a phone pass built from player feedback.

- **Home screen:** every way to play is now a card right under the battlefield: Infinite, the Daily challenge, Gauntlet, Endurance, Last Stand and Sprint, each with its map, your best and a one-tap Play (or Continue when that mode has a paused run). A 3-by-2 grid on desktop, 2 across on tablets and a swipeable rail on phones. Any paused run also gets a Continue button at the top. "Rules & boards" opens the full Game modes screen; Quick run sits under the cards.
- **Less clutter:** the old Play card is gone (its buttons became the cards). The animated tour and the news card share one slot instead of stacking: newcomers get the tour, returning players get the news until they dismiss it. The sound button moved into the footer line. The news card now announces this release instead of the v1.13 Garrison.
- **Phones, taps:** during a wave a quick tap always shoots (the nearest foe within about two tiles of the fingertip) and never opens a menu, so a finger near a tower, a ruin or the road no longer pops up a panel. To open a tower's menu in the middle of a wave, hold it for about a third of a second. Between waves, tapping selects as before; the mouse is unchanged. A first swallowed tap shows a one-line hint.
- **Phones, a bug behind that:** a press started a charged shot up to 1.3 tiles from a foe, but the release only looked 0.85 tiles around, so a near miss fell through and opened the tower menu. Both now use the same fingertip radius.
- **Phones, weather:** on phones the weather chip lives in the top bar (its own slim row in portrait, inline in landscape) instead of over the battlefield, and the warning toast at the bottom now says what the weather does. Desktop and tablets keep the banner and chip as before.
- **Wave progress bar:** a thin strip along the bottom of the top bar shows how much of the current wave is beaten (foes defeated out of every foe the wave sends, summoned ones included). It turns red on boss waves and is hidden between waves and in Endurance, which has no waves.
- **Bug sweep:** every run added another set of pointer, right-click and panel listeners to the shared board and panel elements and never removed them, so after a few runs taps and right-clicks also reached finished runs (a right-click could try to pause a dead one) and the old runs could never be freed. Each run's listeners are now tied to one AbortController and removed when it ends. Modal key listeners now retire themselves when their modal is removed without `close()`, so Escape can no longer fire a closed modal's `onClose`. Fixed an undefined variable in `tools/sim.mjs`.

Tests: `tests/phone.test.mjs` covers the wave progress numbers and the wider fingertip pick.

## v1.20.1

- Phones: the castle art buttons no longer cover the castle and its plots. They are hidden while you place towers in Last Stand and Endurance setup (they cannot be used yet), and between waves on touch screens taps now pass through the disabled buttons, and the gaps between them, to whatever is underneath.


## Balance & progression — v1.21.0

- **Everything is earned.** Endurance and Last Stand still switch off Keep *stat* bonuses, but they now only offer what you have unlocked in the Keep: towers, troops, weapons, castle arts and art slots. Endurance's setup screen lists only your unlocked weapons and arts.
- **Endurance Renown scaled down** (×0.3, Last Stand ×0.75; `ECON.renownModeMult`) so both pay about what Infinite does per minute instead of up to 4× more.
- **Early Keep tiers hit harder:** Fortify +15%, War Chest +45, Bounty Hunter +9%, Marksman +15%, Siegecraft +9%, Architect 6%, Forged Mail / Whetstones +12%, Tax Collectors +12%. Buying a Keep upgrade now shows what it does.
- **Sprint is a real test:** foes have 14x health and come 1.8x as many, spawning twice as fast. In the bot sim a fresh Keep falls around wave 11–13, a mid Keep around 13, and only a near-maxed Keep reaches the end.

## Phone usability — v1.22.0

- **Header halved on portrait phones:** one steady row (pause, wave, keep/wall, gold, sound, speed) plus a fixed-height status line that holds the next-wave preview, foes left, the Sprint/Last Stand clock and any weather notice. Nothing floats over the map any more, and the bar never changes height between build and wave.
- **Footer tidied:** the tower row is shorter, and Garrison / War Room / Auto / Start wave are four fixed-size buttons on one line, so the countdown no longer resizes them.
- **Quieter pop-ups:** one notice at a time, the build-tip toast clears when the tower sheet opens, the tower sheet and tutorial card are slimmer.

## Overtime Orders & Realm Works — v1.23.0

Daily orders were finishing too fast, so there is now something to work toward past them.

- **Overtime Orders:** once every daily order is done, the Quartermaster issues a ladder of bonus orders, up to eight a day, each about 55% tougher than the last. Each pays Renown and 📦 Supply (every third one pays double). It shows on the home screen's Today card under the daily orders.
- **Realm Works** (Realm tab, or tap the Overtime row): Supply buys two permanent tracks.
  - 🚩 **Warbanner** (5 levels, conquer): your kills count +10% per level toward the shared Daily Rally, which is what wins the Realm land. The server clamps the level it is sent and still applies the per-citizen Rally cap.
  - 🛡 **Wardens** (6 levels, defend): +4% castle and wall health and 1% less castle damage per level in every run (not in Last Stand or Endurance, which ignore Keep stat bonuses).
- Overtime orders don't count toward the "orders completed" achievements.

## Calmer visuals — v1.23.1

- **Less flashing.** Nothing pulses or blinks on a loop any more (ready abilities, tutorial rings, "new" badges, buttons are a steady glow); hit flashes on foes are a soft tint instead of pure white; blast flashes are dimmer and always fade over at least 0.3s; screen shake is gentler; the castle-hit pulse fades slowly.
- **Weather is quieter.** The moving sand/snow specks are gone and the tint is a faint steady wash. On phones there is no tint, no pop-up and no banner over the map: the weather chip in the top bar names it and counts it down.
- **Map zoom removed.** The board always shows whole; pinch, wheel, Z and the 🔍 button are gone.

## Phone header polish — v1.23.3

- **Weather as icons.** On a portrait phone the weather chip (top left of the status line) shows the spell, its countdown and an icon per thing it changes with a green ▲/▼ (good for you) or red ▲/▼ (bad for you). No pop-ups, banners or "has passed" toasts on phones; press and hold the chip for the full text.
- **Wave bar.** Thicker, with the number of foes left overlaid on its left end.
- **Shooting taps on unclaimed land** no longer open its menu: mid-wave it takes a 0.9s press, and never when a foe is in reach.

## Stronger towers, harder maps, no more spawn camping — v1.24.0

- **Mage Tower** hits harder (24 dmg, 3 chains, 2.8 range) and **Hexes** whatever its bolts touch: +18% damage from every source for 3.5s, so it boosts the rest of your defence. Arcane Lance hexes harder (+12%).
- **Venom Spire** is faster and its poison now also eats 0.6% of max health per second per stack (a third as much on bosses), stacking to 4. It keeps up with late-wave health scaling instead of falling off.
- **Artillery replaces the War Banner** (same Keep unlock; your training level carries over). A long-range howitzer: each salvo drops 3 shells on 3 different ground foes with their own blasts, and it cannot hit anything close. Specs: Rolling Barrage (5 shells) and Heavy Shells (×1.8, stun).
- **Breakthrough.** From wave 5/6, a growing share of ground foes (up to about 20%) either **ambush**, appearing part-way down the road behind your forward towers, or run as **vanguard** (marked »): they sprint through the first 45% of the road behind a shield. Stacking everything at the spawn point no longer stops a wave; keep depth along the road. Flyers and bosses are unchanged.
- **Three hard maps** (unlocked by reaching wave 35 / 45 / 55 on any map): The Hollow Hive (six roads from four edges), Triple Fork (four roads of different lengths converging on one stretch) and Shattered Ravine (a lake, two long roads and a back road down the keep wall).

## Engineers and a bigger map pool — v1.25.0

- **Engineer (Garrison).** A new troop, unlocked in the Keep (Garrison) for ✦180, trainable from wave 12 (⛁100, ⚜6, one slot). During a wave it walks to the most damaged or ruined tower (preferring ruins, then the worst hurt, then the closest and safest) and mends it, raising ruins once they are back to 25%. It earns experience from the health it restores and ranks up: **Veteran** +35% repair speed and +12% walking pace per rank, **Elite** also patches the wall when no tower needs mending, **Legend** mends a second tower at 60% rate at the same time and switches sabotaged towers back on. It does not fight, and retreats like any troop when hurt.
- **Hard maps in the rotations.** The Hollow Hive, Triple Fork and Shattered Ravine join the Daily Challenge pool (from 18 Oct 2026), the weekly Endurance, Last Stand and Sprint pools (from week 43) and the end of the Gauntlet's map order. Earlier days and weeks keep their old pools, and rotation maps are the same for everyone whether or not they have unlocked the map for ordinary play.

## Daily Rally fixes and a Realm sweep — v1.25.1

- **Kills reach the Rally reliably.** The mid-run sync used to allow one call every 6 seconds, so a Save and quit soon after a wave clear was silently dropped and its kills only counted when the run next ended. The limit is now a burst of 6 per 30 seconds, a call that is still refused retries by itself a few seconds later, and only one sync is ever in flight (no double counting).
- **Rally bars refresh.** The Home and Together Rally bars read the "front" data, which was only reloaded on launch and after a run; every Realm sync now reloads it too.
- **The personal cap is visible.** Each citizen can add up to 1,500 kills a day to the Rally (Warbanner kills count toward it too). That cap was invisible, so long runs seemed to stop registering. The Rally lines now say when you have given your full share, and that further kills still count toward the Week and Month.
- **Run submits wait out the pace limit.** Finishing two runs inside 20 seconds used to fail with "could not reach the leaderboards" and lose the unsynced kills; the game now waits and sends the run once more.
- **Wording.** "Trains Cavalrys" and similar slips are fixed through a shared plural helper (Harpies, Gold Thieves, Cavalry).
- Audit: lint for undefined names, bot playthroughs of every map and mode, all 40 March provinces and a save/load round trip found no other defects.

## Runs can no longer be lost — v1.25.2

- **Outbox.** When a run ends it is stored on the device until the server confirms it. If the connection drops, the phone sleeps, the tab closes or the pace limit bites, the run (score, kills, waves, daily and board entry, Realm credit) is sent automatically next time the game is online, with a small "earlier run was sent" notice. Before this, a failed send meant the run never reached the daily, the boards or the Realm's final tally.
- **Duplicate guard.** The server recognises a run it already has (for example when the reply was lost) and does not count it twice.

## Open Realm, living goals and a Valor that matters — v1.26.0

- **Contribution caps lifted.** Everything you defeat now counts toward the Daily Rally, the Weekly Muster and the Monthly Campaign. The old limits (1,500 a day, 40,000 a week, 120,000 a month) are replaced by sanity ceilings (25,000, 250,000 and 1,000,000) that normal play never reaches.
- **Smoother, living goals.** A new period's goal is built from the last three periods (50% newest, 30%, 20%) of citizens, kills and waves, instead of only the last one, so one quiet or huge day no longer whips the next goal around. Periods that never opened don't count as zeros. The existing floor and the "no more than 2.5x last goal" rise limit still apply. Goals use kills, waves and turnout; score is a per-run board stat and is not a Realm meter.
- **Valor now matters.** An audit of every currency found Valor was almost entirely unspent (a 45-wave run earned about 5,000 and spent under 50). Income is cut tenfold, and Valor now also buys **promotions**: a ★ button in the Garrison roster promotes a troop straight to Veteran, Elite or Legend for ⚜6, ⚜14 or ⚜28 (more for 2-slot and Griffon troops). Elite troops still cost Valor to train.
- **Audit result.** Renown (Keep, Wardrobe, Dynasty), Supply (Realm Works), Muster (free recruits), Medals (Renown), Gold and Score (boards, Renown, Valor) all have real sources and sinks. Unused config entries (banner power, particle cap, siege HP per day) were removed.

## Boon review — v1.27.0

- **Highlander is replaced by Witchcraft.** (High ground does exist, marked with a gold ▲ on a few plots, but too few plots and too little to see made the boon feel empty.) Witchcraft makes the Mage's Hex hit 8% harder and last 1s longer, and Venom Spire poison 40% stronger, per stack (3 stacks). Old saves swap Highlander for Witchcraft, and any retired boon in a save is dropped safely.
- **Every boon was tested** by giving a bot each one at the start of a run over 12 runs: all had an effect. Fire boons (Kindling, Pyromania) are only offered with a Fire Trap unlocked and Frostbite needs the Frost Spire, like the other tower-specific boons.
- **Gold boons skip Endurance and Last Stand,** where nothing costs gold (Royal Interest, Bloodlust, Bounty Posters, Thrifty Builders, Taxman, Golden Arrows, War Fund, Gilded Crits).
- **Weak boons buffed:** Gunpowder Surplus (splash +30%, damage +20%), Long Bolts (+25% damage), Concussive Shells (0.5s stun), Master Masons (+35% wall HP), War Fund (150 + 12 gold per wave, so it still matters late).

## Clear castle on phones — v1.27.1

- **Portrait phones get a tool row.** The castle abilities, the ammo gauge and the combo counter no longer float over the bottom of the map (where the castle is). They sit in their own slim row between the map and the build bar, and the map scales to fit the space left. Five or six abilities shrink to fit, and wrap onto a second line on very narrow phones. Landscape and desktop keep the old on-map layout.


## Tighter phone tool row — v1.27.2

- **No more dead space in the portrait tool row.** The ammo gauge and combo counter moved up into the empty right end of the wave-progress bar, and the castle abilities now share the whole row evenly (bigger tap targets, with names when there are four or fewer). The row is a little shorter, so the map gets more room.

## Central-time resets & wider phone map — v1.28.0

- **Everything shared now resets on US Central time** (Chicago, daylight saving included) instead of UTC: the Daily Rally and its Realm-map result, the daily challenge and its leaderboard, weekly seasons (Monday 12:00 am Central), monthly Realm goals, and map events. Screens that said "midnight UTC" now say Central.
- **The switch is seamless.** Oct 17, 2026 is a one-off 29-hour day (it began at UTC midnight and ends at Central midnight on Oct 18), so no day that was already settled is reopened and no kills are counted twice. Normal Central days start on Oct 18.
- **Wider map on portrait phones.** When the map left empty strips down the sides, it now stretches sideways up to 12% to use them (taps and the tutorial pointer account for it). Anything still left is filled with meadow rather than a dark gap.

## Phone fixes — v1.28.1

- **Fixed the pile of skinny buttons under the map.** On portrait phones every new run added another copy of the castle-ability bar to the tool row and never removed the old ones, so after a few runs the row held dozens of squeezed buttons. The row now holds only the current run's abilities, and a finished run's layout code is shut down so it can't re-add its bar when the phone rotates.
- **Notices no longer land on the castle.** On portrait phones, pop-up notices ("Towers wrecked…") now drop in at the top of the map, slightly see-through, and never block taps.

## A calmer home page — v1.29.0

The home page had about twenty things competing for attention. Related screens are now grouped behind four doors, and new players see a quieter page.

- **Four doors instead of twelve tiles.** The Keep (the Dynasty is now a banner at the top of it), **Collection**, **Allies**, and **Guide & news**. The "More" drawer is gone. Settings moved to the footer next to the sound button.
- **Collection** brings Achievements, Wardrobe, Themes, Bestiary, Codex and Chronicle together under one row of tabs that every one of those screens shows.
- **Allies** now has World Stats as a tab beside the Realm, Leaderboards, Friends, Clan, World Siege and Inbox.
- **Guide & news** holds the animated tour, a practice run, the full guide, game modes and leaderboards, the Realm tour and what's new.
- **Today** shows your daily orders and the running event; Overtime, other events and the day's blessing fold under "More today".
- **New players (fewer than 3 runs)** see Infinite and the Daily challenge with a "＋ 4 more ways to play" button, the how-to-play tour first, a one-line Realm card, and only the Keep and Guide doors. Everything unlocks on the page after the third run, and all of it stays reachable through Guide & news.

## Clearer foes, clearer wrecks — v1.30.0
- Long-pressing a tower mid-wave no longer raises the pause menu over the tower panel.
- Mastery star numbers are larger; the tower panel's Upgrade/Mastery, Repair and Sell buttons stay pinned so no scrolling is needed.
- A boss (or any foe) breaking through now shows what it hit and for how much, with a BREACH banner for bosses. Leaks are consumed and hit the wall first, then the castle.
- Bubble shields: magic damage pops them twice as fast; Warlock text and the Warded Host tip explain it.
- New 👁 Foes button (key F) opens a persistent guide for the current or next wave: tags, what to use, what to avoid, tips. The new-foe card lingers longer and carries a counter hint.
- Towers show floating damage with its source, and a wrecked tower says what wrecked it and how to avoid it.

## Harsher breaches, truer survival — v1.30.1
- A boss that breaks through smashes the wall for double damage, and a quarter of its blow reaches the keep even while the wall holds.
- Last Stand and Endurance now allow no mending at all: no Engineers (they can't be raised), no repair kits, no Field Repairs art, no Sanctum or wall regeneration. Endurance keeps only its own scheduled free repair (every 150 foes, or when a boss falls).

## 3D view (first version) — v1.31.0
- New **🌄 3D** button in the top bar (or press **V**) cycles the battlefield view: Classic → Horizon → Angled → High → Classic. The choice is remembered.
- A real perspective camera looks over the board, so the far end shrinks toward a hazy horizon of mountains and pine forest. Terraces are real raised blocks; trees and rocks stand up; towers, foes, troops, shots and effects stay upright and scale with distance.
- Built with Three.js (vendored in `vendor/`, loaded only when you first switch 3D on). The simulation is unchanged, so runs, saves and leaderboards are the same in either view. Where WebGL is missing the game stays in the classic view.
- How it works: `src/game/render3d.js` is a drop-in `Renderer` subclass. A WebGL canvas (`#board3d`) draws sky, scenery and the map as a ground texture; the existing 2D sprite art is drawn on `#board` on top, scaled at each foot point by the camera. Tapping converts screen points to the ground plane, so building and aiming work as before.
- Phones in portrait tip the camera further over automatically. The tutorial run always uses the classic view.

## 3D towers, castle and shadows — v1.32.0
- Every tower (all 17 non-trap types) is now a real low-poly 3D model that turns to aim, recoils when it fires, and shows its tier (pennant, gold ring, gems) and mastery aura. Wrecked towers collapse to rubble. Traps and plots stay flat on the ground.
- The castle is a 3D keep with two round towers, gate, waving flag and a palisade whose stakes break as the wall takes damage; the hero stands on the gatehouse.
- Real shadows (softer and smaller on phones, off on Low quality or reduced motion).
- Foes, troops and trees/rocks are now camera-facing billboards inside the 3D scene, so towers, hills and walkers hide each other correctly.
- Each land has its own sky, fog and light (golden dunes, cold frostlands, red-lit ashlands, dim shadowfen).
- Next up: 3D models for foes and bosses.

## Tower limits and a shorter Deeds list — v1.32.1
- In Gauntlet, Sprint, Last Stand and Endurance each tower type is capped (4 of most, 3 Sun Obelisks, Barracks and Void Wells, 2 Sanctums and Mints), so one tower can't carry every run. The tower bar shows `used/limit`, and a full type says so when tapped. The endless run is limited by rising prices as before.
- The Realm's "Deeds" list shows the latest 5, with a button to reveal more.

## Turnable 3D camera and The Wilds — v1.33.0

- **Rotate the 3D view around the field.** Left/Right arrow keys, the ⟲ ⟳ buttons in the top bar, middle-mouse drag, or two fingers dragged sideways on a touch screen. Up or Down resets the view. Picking, hover and placement follow the turn, and trees and rocks keep facing the camera.
- **The Wilds** (new map, unlocks at wave 20 on any map): the keep stands at the east end of an open moor and three or four unpaved trails cross it from the west edge. No road is drawn, the field is strewn with boulders, ponds and thickets, and build plots land wherever the ground favours them. Every run builds a fresh field from its seed. Traps cannot be placed on hidden trails.

## 3D foes, bosses and troops — v1.34.0

- In the 3D view every foe is now a low-poly model that walks, turns to its heading, swings and flinches: 24 foe types, the five bosses (Warlord, Titan, Dragon, Lich, Hydra), barracks soldiers and all nine garrison troops (cavalry ride horses, the Griffon Rider flies). They cast shadows, flash white when hit, fade when stealthed, rise from a dirt mound when a Tunneler surfaces, and topple over when they fall.
- Health bars, shield rings, status tints, stars and rank pips are still drawn over them, so nothing in play changed; only the look did. The classic view keeps its hand-drawn sprites.

## Fifteen new foes and bosses, Dominions and Grandeur — v1.35.0

- **10 new foes** drawn from fantasy and medieval warfare: Warg, Pavise Bearer, Plague Rat, Mangonel, Berserker, Escalade Crew, Siege Tower, Barrow Wight, Treant and Fell Rider. **5 new bosses:** the Pit Fiend, Wraith King, Beastmaster, Trebuchet and Elder Oak. They bring new mechanics (life drain, rage, wall-ignoring siege fire, frost slowdown, strikers) and three new wave themes: Warband, Engines and Undead. The Foes guide lists counters for each. All have 3D models; the classic view mostly reuses existing figure styles.
- **Dominions:** hold enough provinces of one terrain and its people join you, for permanent run bonuses (loot, starting gold, wall HP, interest, troop strength and more). Lose the ground and the gift goes with it.
- **Realm Grandeur:** the total size of the Realm unlocks bonuses at 12, 20, 30 and 40 provinces, and your Standing title (Border Hold, Barony, ...) shows on the Realm page.
- **Scouts:** from Sunscar, Cavalry test your walls in ordinary runs from wave 12. Take the province and the scouting stops.
- The Pause button is now the first button on the far left of the top bar.

## Weapon Mastery and a Foes button in the pause menu — v1.36.0

- **Weapon Mastery (The Keep › Hero):** every personal weapon now has four chained Keep unlocks, 40 in all. They add damage, blast radius, pierce, chain jumps, ammo, faster reloads, burn strength, and extra arrows that fan out at half damage, like the Multishot boon but permanent. Examples: the Longbow's Triple Shot, the Mortar's Wide Crater, the Thunder Lance's Longer Arc, the Titan Ballista's Giantslayer. The first unlock needs the weapon itself; each one after needs the one before. Like other Keep power upgrades they reset on a Dynasty, and they don't apply in Last Stand or Endurance.
- **Foes guide moved into the pause menu** (👁 Foes), so you can read it with the game stopped. Closing it returns to the pause menu. The F key still opens it, and the top bar has one less button.

## Speed key fixed — v1.36.1
- The F key cycles game speed again (1× to 4×). It had been shadowed by the Foes guide, which now has its own key, G (B since v1.37.0, so G opens the Garrison again), and a button in the pause menu.
- The countdown between waves runs on real time at every game speed; a new test locks that in.

## More castle arts, more boons, better figures — v1.40.0
**Six new castle arts** (Keep → Castle Arts; each has an unlock, a faster-recharge upgrade and a signature upgrade, built from the same `buy` price as the others):
- **Sky Chains** ⛓ (350): every flyer on the field is hurt and dragged to the ground for 5 seconds, where ground towers, troops and the wall can reach it.
- **Gale Force** 🌬 (400, aimed): blows every foe in the area 2.6 tiles back down the road (bosses half as far), flyers too.
- **Inferno** 🌋 (500, aimed): the road splits and burns for 7 seconds, scorching and igniting ground foes (fire boons apply).
- **Cannon Barrage** 💣 (600, aimed): eight shells drop across the area over a second and a half, each blasting the ground foes near it. Each shell's landing spot is marked first.
- **Earthquake** ⛰ (700, aimed): hurts and knocks ground foes flat, throws burrowing sappers to the surface and flattens barricades.
- **Battle Hymn** 🎶 (750): for 8 seconds towers, troops and your own shots deal 30% more damage.
- Each has its own effects in 3D (iron shells on a high arc, a glowing fissure, chains of light from the sky, rubble and dust rings, golden notes rising from the towers) and in the classic view.

**Twelve new boons**: Cold Snap (slowed/frozen foes take more), Opening Volley (full-health foes take more), Blood and Mortar (kills mend the wall), Prospectors (cheaper ruins), Ricochet (your killing shots bounce on), Soul Harvest (kills shorten art cooldowns), Royal Artificers (arts recharge faster and hit harder), Last Line (towers fire faster when the wall is low), Volatile Corpses (tower kills burst), Stormcaller (a bolt every 10 seconds of a wave), Echoing Arts (a quarter of casts recharge at once) and Warpath (towers hit harder on a combo of 10+).

**Better 3D figures** (`src/game/units3d.js`):
- People have knees and elbows that bend as they walk and strike, hands, a chest that narrows to the waist, a tunic skirt or mail, a neck, and a face with a jaw, nose, brow and eyes. Orcs and trolls have tusks, some foes have beards or hair, hoods frame the face, shields have a rim and boss, knights and Standard-Bearers wear tabards, and helmets get brims, nasal guards, crests and cheek plates as foes gear up.
- Horses, wargs and rats have a proper body (chest, barrel and haunches), a muzzle with a nose and jaw, ears, fangs where they belong, and legs that bend at the knee and hock. Riders sit astride in a saddle instead of standing on the horse.
- Wyverns, dragons, gargoyles, harpies and griffons have real wing membranes with a scalloped edge and finger bones; the outer wing folds a beat behind the inner as they flap. They also have segmented necks and tails, a spade tail-tip, plates down the spine and tucked claws.
- **Fewer draw calls** despite the extra detail: each foe's rigid parts are now merged into one vertex-coloured mesh per moving piece. A full gallery of the 40 foe types went from 881 meshes to 488, so big waves are lighter on phones than before.

## New foes, weapons and modes — v1.39.0
**Foes** (`src/data/balance.js`, models in `units3d.js`, advice in `counters.js`):
- **Siege Engineer** (from wave 24): throws up wooden barricades on the road ahead. Barricades never move or leak and fall apart after 12 seconds, but towers aiming at the front of the line waste shots on them.
- **Phalanx** (wave 26, in threes): while two or more stand shield to shield, single arrows, bolts and shot do half damage. Splash, fire and hero shots break the formation for 3 seconds.
- **Mirror Mage** (wave 30): turns the first magic hit back on the tower that cast it, which is jammed and damaged, then needs 6 seconds to raise the mirror again.
- **Tunnel Sapper** (wave 34): burrows most of the way. If it reaches the keep it goes under the wall and blows a charge worth six breaches.
- **Standard-Bearer** (wave 38): foes near the banner take 25% less damage and march 10% faster.
- **The Frost Giant**, a new boss at wave 60: its breath freezes every tower near it for a few seconds. The later bosses each move back ten waves (Pit Fiend 70 … Elder Oak 110).

**Hero weapons** (each is a Keep unlock with four Weapon Mastery perks):
- **Chain Whip** (150): lashes the target and the four foes nearest it.
- **Grapple Crossbow** (200): yanks the foe it hits 1.4 tiles back down the road.
- **Alchemist's Flasks** (240): splash flasks that cycle fire → acid (shreds armour) → frost (slows). The FIRE button shows which flask is next.
- **Harpoon Gun** (280): double damage to flyers, and it drags them down to the ground for 4 seconds where every tower can hit them.
- **Bell of Thunder** (380): one slow toll that strikes and stuns everything in a cone in front of the wall.

**Modes** (under "🎲 More modes" on the home screen, all played locally with their own save slot):
- **Boss Rush**: every fight is a boss wave with a light escort, starting at wave 10 and going up ten waves at a time, with short breaks and a big purse between fights. The score is bosses felled, and it has its own weekly board.
- **Draft**: towers cost nothing but come only from cards. Before each wave you pick one card from three, and you start with two.
- **Night Siege**: darkness. Towers only see foes inside the light of the castle, their own torches and the glowing towers (mage, tesla, frost, obelisk…). Burning and marked foes give themselves away, and bosses are always seen. Scores ×1.4.
- **Duo Siege**: two players on one device. The builder plays between waves; for each wave the phone goes to the hero on the wall, with 30-second breaks for the hand-over.
- **Siege Trials**: ten hand-made puzzles on the Daily Siege rules, with a fixed map, roster and supply. Earn 1–3 stars by how much of the keep and wall you save.
- New achievements: Boss Rush 3 and 8, Draft wave 25, Night wave 20, Duo wave 15, and 5 or 30 Trial stars.

## Hero Mode Adaptive, and foes stuck in place — v1.38.7
- **Hero Mode difficulty**, with **Adaptive** as the default: like the classic run's Adaptive start, it picks the wave to begin on from how far your recent *Hero* runs got (classic runs don't count), and nudges up or down if the last ones were too easy or too rough. The fixed starts (Recruit to Mythic) are there too. Your commander gets the head start's gold and plots and builds with it at once. Head-start waves count toward your Hero best at the same discount as in a classic run, Hero runs never count as Vanguard runs, and the server accepts Hero head starts.
- **Fixed: foes stuck in place doing no damage.** Two causes, both found by simulating hundreds of waves on every map:
  - *Endless holds*: barracks soldiers and troops (often at the castle gate) could hold a foe they could never kill while it could never kill them (respawning soldiers, armour, healing), so it stood there forever and the wave could not end. Now a foe shoves free after 7 seconds in one hold ("Breaks free!") and cannot be held again for 3 seconds; enraged foes cannot be held.
  - *Stun-lock*: freezes and stun hits that arrived faster than they wore off kept a foe frozen for the rest of the wave. Stuns now chain to at most 3 seconds before the foe's usual moment of immunity.
  - After the fix the same simulations found no stuck foes (287 before).
- Fixed: the "Five-Minute Siege" achievement could not be earned (Standard and harder Sprints cannot be cleared in under five minutes); a fast enough Recruit clear now counts.
- Wall-view loot pick-up pays double only in Hero Mode (switching an ordinary run to the wall view no longer doubles loot).

## Steadier 3D on phones — v1.38.6
A Hero Mode run could die on a phone deep into a run, when big waves pile up 3D work and graphics memory. This release makes the 3D view lighter and makes it survive the worst case:
- **No more freeze if the phone takes the GPU back**: when the browser loses the 3D context (memory pressure, switching apps), the run is saved and the battle carries on in the classic view with a short note. A 3D view that keeps erroring falls back the same way instead of freezing.
- **Automatic low-power mode**: if the device can't keep up for several seconds, the 3D view drops shadow maps, renders at 1x and hides grass tufts and extra weather particles, and says so once.
- **Lighter big waves**: foes, soldiers and troops no longer cast real shadows (their soft contact shadows stay), which roughly halves the draw calls of a crowded wave. Phones render the 3D frame at up to 1.5x instead of 2x.
- **Less GPU memory churn**: the health-bar atlas only ever grows (it used to be re-created each time the number of bars changed) and is half the size on phones, and the 3D canvases are no longer re-allocated on layout changes that don't change their size (the iPhone address bar, toasts).
- Fixed: when the land changed while a storm was blowing, the old weather kept showing; now it fades out and the new one takes over.

## 3D weather — v1.38.5
- The weather spells now play out in the 3D world (`src/game/weather3d.js`), easing in during the warning, peaking while active and fading after. The simulation is unchanged.
  - **Blizzard** (Frostlands): thick snow driving sideways in the wind, gusts of spindrift low over the ground, the fog closing in white and the light dimming.
  - **Sandstorm** (Dunes): sheets of sand streaming across the field, ochre haze, and two or three dust twisters (tornadoes) that wander over the board kicking up dust at their feet.
  - **Meteor shower** (Ashlands): glowing embers and flakes of ash drifting down, a reddened haze, and a burning streak from the sky down to every meteor that lands (on top of its explosion).
  - **Shadows** (Shadowfen): a low violet mist creeping over the ground, drifting wisps of light, and the land growing dark.
- The flat screen tint during weather is lighter now that the 3D effects carry it. Phones and Light graphics get fewer particles, and it shows on phones too (where the flat tint is skipped); Reduced motion turns it off.

## Hero Mode plays like a mobile shooter — v1.38.4
- **FIRE button** under your right thumb (`src/ui/herocontrols.js`): tap to shoot, hold to keep firing as fast as the weapon allows. A gold ring round it shows ammo coming back while you reload, with the count (∞ during Hunter's Focus).
- **Aim assist**: the foe nearest the crosshair (or, failing that, the closest threat on screen) is locked with a turning gold ring and the crosshair turns gold; FIRE always hits the lock. A tap on empty field shoots the lock too, and taps near a foe have a wider reach.
- **Auto-look** (on by default, toggle on screen): when you leave the view alone for a moment it glides to keep the closest threat in sight, so you can play one-thumbed.
- **Smoother looking**: the same swipe turns the view by the same angle on any screen, and a flick carries on with a little momentum.
- **Feedback**: hit markers on the crosshair (bigger for crits and headshots, red for kills), a short buzz on phones that support it, and a shake when nothing can fire.
- **Castle arts land where you aim** in the wall view: one tap casts Meteor, Plague, Arrow Rain, Spike Field and Grapeshot on the locked foe (or the ground under the crosshair), with no second tap on the field.
- **Coins and gems fly to you** in the wall view (no tapping tiny loot in first person), at the tapped value.
- First Hero runs show two small coach bubbles ("Drag anywhere to look", "Hold to fire") that vanish once you have done each.

## 3D castle arts and a clear wall view — v1.38.3
- **Hero Mode** now puts you right at the edge of the wall, just behind the merlons, so none of your own battlements block the field; look down to see them, the wall face and the ground below.
- **Castle arts in 3D** (`Fx3D.arts`, `art`, `lightning`, `volleyHit`):
  - *Meteor*: a glowing warning stain where it will land, then a burning rock falling at a slant with a fiery smoke trail, a big blast, burning patches, a crater scorch with a rim of stones.
  - *Plague Flask*: a rolling, swirling green cloud that keeps boiling for as long as it lasts, a sickly glow on the ground and rising spores.
  - *Arrow Rain*: three volleys of real arrows dropping out of the sky at a slant, with dust where they land and arrows left standing in the ground.
  - *Smite* and *Thunderstorm*: forked bolts of lightning from the sky with a blue flash, sparks, a shock ring and a scorch; the storm also rolls a dark cloud deck over the field.
  - *Frost Nova*: rings of frost racing out from the castle, ice shards bursting up across the field behind them, a chill spreading over the ground and frost motes on every foe.
  - *Boiling Oil*: oil sheeting off the walls and splashing, then flames and smoke across the gate.
  - *Spike Field*: real steel spikes in the ground for as long as it lasts. *Aegis*: a shimmering dome over the castle. *Time Stop*: frozen motes hanging round the foes. *Grapeshot*: a cone of shot with a muzzle blast and smoke. *Field Repairs*, *War Horn* and *Royal Tithe*: green motes, golden rings and a shower of coins.

## 3D shots, explosions, battlements and terrain — v1.38.2
- **Heavy shot is 3D** (`src/game/fx3d.js`): cannonballs, catapult and trebuchet boulders (flaming ones glow), ballista bolts and the hero's mortar, hand cannon, meteor and titan bolts fly as lit models that cast shadows, ride their real arc and leave smoke trails. Cannons and catapults puff smoke (and a muzzle flash) when they fire.
- **Explosions**: a fireball with flame licks, rolling smoke that rises and thins, clods and stones thrown out that bounce to rest, sparks, a shockwave ring, a scorch mark that fades over a few seconds and a brief flash of light on everything nearby. Bigger guns make bigger blasts. Foes leave a puff of dust when they fall. All pooled in a few instanced meshes.
- **Foes**: every foe, soldier and troop has a soft contact shadow; foes are drawn a little larger; armoured foes wear breastplates, pauldrons, bracers and (better armed) mail, and everyone has a belt buckle.
- **Terrain**: a fine grain of blades, pebbles and soil is laid over the painted board, and 3D grass tufts grow on the open grass (not on plots, roads or water; off on Light graphics).
- **Hero Mode battlements**: look down from the wall and you stand on your castle: flagstones, the parapet with merlons and arrow loops, the wall face dropping to the ground with buttresses, side parapets, a brazier and two round corner towers with banners, all in your chosen castle's colours and stonework. The parapet sits low enough to frame the bottom of the view without hiding the battlefield.

## Richer 3D world — v1.38.1
- **Surfaces**: towers and the castle now have dressed-stone brickwork, wooden planks and shingled roofs (small canvas textures drawn once and tinted by each part's colour); plinths stay smooth so they do not look busy. Merged meshes keep their UVs, so battlements and slits are textured too.
- **Light**: a sky-and-grass hemisphere light joins the sun, with less flat ambient light, so tops catch the light and sides fall into shade. Every tower and the castle sit on a soft contact shadow.
- **The land**: the board has a dressed-stone curb and a band of trodden earth round it, with bushes and boulders along the far and side edges (the near side stays clear). The open country has a grass (sand, snow, ash) texture instead of one flat colour, and hill terraces have stone sides and grassy tops.
- **Trees and rocks on the board are real 3D models** now (instanced, a few draw calls for all of them): broadleaves and pines in the meadow and dunes, snow-capped pines in the frost, bare dead trees in the ash lands and dark violet pines in the shadow lands. Rocks are clusters of boulders.
- **Water** has a glossy, rippling sheet that catches the sun (lava glows in the ash lands).
- **Hero Mode** stands you much higher (eye height 3.7 tiles, a step behind the keep, looking further down), so you see over your towers and across the whole battlefield; you can tilt further down too.

## Hero Mode, the Daily Siege and new 3D models — v1.38.0
- **Hero Mode is now its own game mode** (its own tile, set-up screen, save slot, records and achievements). The computer is your commander: before every wave it reads what is coming (flyers, heavy armor, magic-proof foes, runners, swarms, bosses) and builds, upgrades, specializes and repairs towers to answer it, on the plots that cover the most road. It also puts part of the treasury into your weapon. You fight from the castle wall in first person; the tower bar is replaced by the commander's status line ("Built a Flak Battery", "Next: flyers, heavy armor"). Waves come by themselves 9 seconds apart. Towers hit 15% softer and your weapon 50% harder than in a classic run, so your aim matters. You still pick the boons. Hero runs feed the Realm but stay off the classic wave records and boards. Logic: `src/game/autobuild.js`.
- **The Daily Siege** (optional, its own tile): one small puzzle a day, the same for everyone. 12 supply points, a daily roster of six towers (each costs 1 to 4 points), every tower fixed at tier 3, no gold, no upgrades, no weapon and no arts. Hills give double the high-ground bonus, so where you build is the puzzle. Press Start and watch ten waves (9 to 18) roll in. Score: 100 per wave held, plus up to 500 for the keep, 200 for the wall and 40 per unspent point on a full hold (best possible 2,180). Your best each day is kept, with a streak counter, a daily server board (`board=siege`, today's seed only) and three achievements. It opens in the angled 3D view and gives your own view back afterwards.
- **New 3D models**: every tower has more detail (battlements, arrow slits, lit windows, wheeled carriages, sandbags, coils, vines, columns, orbiting shards and rocks) and the castle gained a donjon, back towers, crowned round towers, a portcullis gate, banners and torches. Small repeated parts are merged into single meshes, so the extra detail costs few draw calls.
- The wall camera sits higher and a step back for a better view, hides the hero figure in front of the lens, and the claim-price tags no longer grow huge next to the camera.

## Hero Mode — v1.37.8
- **Hero Mode** (new tile on the home screen): fight from the castle wall in first person. The 3D view gains a "Castle wall" camera (also in the V cycle). Drag to look around, tap a foe to shoot it, hold on a foe to charge a shot; arrow keys look on desktop. A crosshair marks the centre. Towers and troops fight on their own at 35% less damage while your weapon hits 60% harder (the Lone Hero modifier). Building and arts work as usual, so place towers from any view between waves.
- Aiming is judged where foes are drawn on screen, so flying and tall foes are hit where they appear.
- Five Hero Mode achievements (a run, wave 15, wave 30, 500 hero kills, 100 headshots). Quick run ignores Hero Mode runs.

## Sprint levels — v1.37.7
- **Four Sprint levels**: Recruit (softer foes, wider gaps, 220 gold), Standard (the original), Veteran and Legend (much tougher, denser waves, less gold and shorter breaks). Pick one on the Sprint screen. Each level has its own weekly and all-time leaderboard, its own best time, and Veteran and Legend clears have achievements. A Recruit clear never sets your headline fastest time.
- **Clearer timing**: the Sprint clock starts when you call the first wave, so time spent setting up is free. The summary now shows "On the clock" (the time the board uses) instead of a separate total play time, which had read as a much longer number in the game modes. Game speed does not change the clock: fights count in game time and the breaks in real time.

## Maxed free modes and map choice — v1.37.6
- **Last Stand and Endurance** now give the weapon at its best: every Armory stat at its cap (damage 12, reload 8, ammo 8, crit 10, up from a partly trained Endurance weapon and an untrained Last Stand one), all four Mastery perks for the chosen weapon, and every castle art at full power.
- **Field Repairs is crossed out** of the art list in the modes where nothing can be repaired, so nobody starts a run with a dead slot.
- **Pick your map** for Last Stand, Endurance and Sprint. Every map in the mode's pool is shown, locked ones too (greyed, with what unlocks them), and this week's map leads the list and always plays. Only the weekly map is ranked: other maps are practice runs (the server only ranks the weekly seed). They still count for achievements and the Realm.

## Choose your arts every time — v1.37.5
- The mode screens no longer pre-fill castle arts: you choose them before every Gauntlet, Last Stand, Endurance and Sprint run, and the start button stays off until you pick one. Your weapon is still remembered per mode. Continuing a saved run skips the screen.

## A loadout for every mode — v1.37.4
- **Pick your weapon and castle arts before each Gauntlet, Last Stand, Endurance or Sprint run** (Play again on the summary screen opens the same screen). Each mode remembers its own picks, so changing your arts in Infinite no longer carries into the other modes. The first time in a mode it starts from your Infinite choice.
- **21 new achievements for the game modes**: Gauntlet stages and waves, Last Stand and Endurance hours, Sprint times and wins, run counts for each mode, "Four Fronts" for playing all four, and 1,000 foes in a single mode run.

## Blank patches on iPhone Safari — v1.37.3
- Fixed pages (New run, Realm and others) showing blank patches while scrolling on iPhone Safari. Three causes, all from v1.37.0: a fixed vignette layer inside the scrolling screen (now part of the page background), the particle canvas being rebuilt every time Safari's address bar moved (now sized once on touch screens, at 1× resolution), and endlessly repainting glows and shimmers (touch screens now keep only transform and opacity motion). Entrance animations also no longer start at zero opacity, so a stalled animation can never leave content invisible.

## Clearer bonuses, more to chase — v1.37.2
- **Short "wrecked" notices**: one line ("Barracks wrecked by Archer arrows."), with the first sentence of the tip only the first time each kind of attack does it in a run. They no longer cover the battlefield on phones.
- **Trap counts are right**: the Fire Trap shows its real limit (3 on the board, in every mode). In the endless run it shows the price and the count together.
- **34 new achievements**: waves 40, 125, 300, 400, 500, 750 and 1,000 (200 was already there), bigger kill, boss, gold and Renown totals, 30 and 50 wave flawless streaks, 100 and 365 day streaks, and Daily Supplies chests.
- **Bonuses you can see**: the War Room lists every boon in full (what it does and how many times it stacks) and a new "Blessings on this run" list for Keep, Dynasty, Realm and clan bonuses. A run opens with a note of what is active, and picking a boon shows a banner saying what it does.
- **Stronger Realm gifts**: the weakest province gifts were too small to notice (+1.5% cheaper towers, +20 starting gold). They are now about 1.5 to 2 times bigger.
- Bloodlust now grows with the wave (+1 gold per 10 waves, per stack).

## A fresh coat of paint, Daily Supplies and the record chase — v1.37.0
**Feels like a game, especially on phones**
- **Bottom bar on the home screen**: the Keep, Collection, Allies and the Guide, with a big Play button in the thumb zone. Play continues a paused run, otherwise starts the same setup as last time, otherwise opens New run. Sound, Realm themes and Settings sit as round buttons on the battlefield up top.
- **A living backdrop** behind every menu that follows the Realm theme (embers for Oak & Gold, bats for the Haunted Siege, snow, petals, leaves, fireflies, stars, rain). It idles at ~30 fps, stops during a run or when the tab is hidden, and is off with Reduced motion or Light graphics (`src/ui/ambient.js`).
- **Motion everywhere** (`css/polish.css`, loaded after `style.css`): screens rise in card by card (once, not on every re-render), buttons squash when pressed, gold buttons catch the light, modals pop, toasts bounce, the title shimmers, the gold purse hops when coin comes in. Reduced motion (setting or OS) turns it all off.
- **Phone battle header is a row shorter**: row one is pause, view, wave, Keep/Wall and gold; row two is the next-wave line between waves and the wave's progress bar during one, with sound and speed at its end.
- **New run is shorter**: maps and difficulties swipe sideways on phones, locked weapons and castle arts sum up in one line that links to the Keep, and modifiers and Ascension fold away until you open them. The page keeps its scroll and swipe positions when you tap an option.
- **Run summary**: the headline counts up, records land with a stamp, a new battlefield unlock is announced, an **Up next** card names the closest goals (beat your best here, the next map unlock, daily orders left, Keep upgrades in reach), and Play again stays pinned at the bottom of the screen.
- **Vibration** on phones that support it (Android): bosses, breaches, wave clears, records, rewards and the keep falling. Settings → Vibration.
- The Daily challenge card shows today's real date (the 📅 emoji always reads "July 17").

**Come back tomorrow**
- **Daily Supplies** (`src/meta/supplies.js`, `src/ui/supplies.js`): the daily-streak Renown now comes in a chest you open by hand once a day, on a seven-day track (Supply Crate, Iron Coffer on days 3 and 5, Royal Chest on day 7: +0/+10/+25/+15/+40/+25/+120 on top of the streak bonus). 12% of chests are lucky and double the streak bonus. Missing a day restarts the track with the streak. The chest pops up the first time the game opens each day and waits on the Today card until midnight. Players who already got today's streak Renown before updating have nothing extra to open today.
- **The record chase**: the next-wave line shows your best wave on this map (🏆 18). Matching it brings a nudge; beating it brings a gold "New record!" pennant, star bursts and a buzz, once per run.

**Fixes**
- Tapping the live event on the home screen (the Haunted Siege row) threw an error and opened nothing: `EVENT_RENOWN_BONUS` was never imported in `home.js`.
- Tapping **Daily orders** on the home screen opened nothing you could see: the list sat inside the folded "More today" block. It now unfolds right under its row.
- **G** opened the Foes guide instead of the Garrison (v1.36.1 bound G twice; the Garrison case was dead code). G is the Garrison again, as every guide says; the Foes guide moved to **B**.
- The Realm map test failed on any day after the switch to the Central-time clock: its `dayAgo` helper turned UTC midnight into the previous Central evening. It now uses calendar arithmetic.
- Text: "+X% more" doubled-up wording on several boons and Mastery perks, the Gatling spin-up perks, and the Stone Golem's description.
- Unused imports cleaned out of eight modules; dead code in the weather warning removed.
