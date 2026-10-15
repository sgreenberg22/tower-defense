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
- **Keys**: `1`–`9` towers · `Q E Z X C V` castle arts · `Space` start wave · `U` upgrade · `S` sell · `R` repair · `W` war room · `A` auto-start waves · `M` buy max Mastery · `F` speed (1–4×) · `N` sound on or off · `P` pause · `Esc` cancel.

## Project layout

```
index.html, css/style.css     page shell + styles
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
