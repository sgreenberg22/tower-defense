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

Because `workers_dev` is `false` in `wrangler.jsonc`, the site is reachable only on a custom domain / route you have attached.
Set it to `true` if you want the `*.workers.dev` address.

Using Cloudflare Pages instead? `docs/wrangler.pages.toml.example` shows the Pages config; delete `wrangler.jsonc` first.

### Deployment checklist

- [ ] Build passes (`npx wrangler deploy` succeeds)
- [ ] `/api/health` returns `"db": true`
- [ ] Finish a run while online → summary shows your weekly rank and siege damage
- [ ] Allies → Friends shows your 6-character friend code
- [ ] Open a challenge link (`/#c=…`) in a private window → the challenge card appears on the home screen

## How it plays

- **Build** on grass (traps on the road). Upgrade to tier 4, choose one of two specializations, then buy Mastery stars forever.
- **Shoot**: tap or click enemies. Headshots ×2, hold to charge a piercing power shot, hits build a combo, misses break it.
  Your own kills pay +50% gold and double points.
- **Defend**: leaks hit the wall, then the keep. Flyers skip both the road and the wall. Archers and Sappers attack towers.
- **Between waves**: War Room for repairs and weapon upgrades, call the next wave early for gold, and a boon every 3 waves.
- **Keys**: `1`–`9` towers · `Space` start wave · `U` upgrade · `S` sell · `R` repair · `W` war room · `F` speed · `P` pause · `Esc` cancel.

## Project layout

```
index.html, css/style.css     page shell + styles
src/data/balance.js           every tunable number (towers, enemies, waves, boons, Keep, clans, siege)
src/game/                     engine (headless), waves, economy, rules (shared with server), maps, renderer, FX, audio
src/ui/                       screens, in-game HUD/panels/input, tutorial
src/meta/                     profile, achievements, cosmetics
src/net/api.js                API client (fails soft to offline)
functions/api/[[path]].js     the whole backend
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

About 4–9 D1 writes per finished run, so the free tier comfortably covers thousands of runs a day.

## Known limitations

- **Live real-time co-op isn't included.** It needs a Durable Object in a separate Worker. Co-op is asynchronous
  instead (Allied Towers, clans, siege). The plan is in `docs/FUTURE.md`.
- **Leaderboards are plausibility-checked, not replay-verified.** A determined cheater could submit a believable fake run.
- **Resume restarts the current wave.** Saves happen between waves; closing mid-wave resumes at that wave's build phase.
- **Clan donations trust the client's Renown count** (it's a single-player currency stored on your device).
- The name filter is a word list: it blocks the obvious, may miss creative spellings, and occasionally catches an innocent word.
- Google Fonts load from the web; offline you get system fonts.

## Name ideas

The working title is Bastion Siege. Alternatives worth checking at a registrar: **Rampartia**, **Siegeborne**, **Keepwatch**.

## Credits

All art is procedurally drawn on canvas. All sounds are synthesized with WebAudio. Fonts: Baloo 2 and Grenze Gotisch (SIL Open Font License) via Google Fonts.

## The Realm (co-op) — v1.1

Everyone plays for one country, **The Realm of Aldermere**. The Realm has a **weekly muster** and a **monthly campaign** goal (enemies defeated / waves cleared) that scales with how many citizens were active last period. Hitting the 25/50/75/100/150% tiers unlocks shared **blessings** for every player and claimable Renown. The roll of citizens ranks each player's contribution (per week, month or all-time).

- Server logic lives in `functions/api/[[path]].js` (`/api/realm`, `/api/realm/claim`, `/api/realm/board`); tables are created automatically and mirrored in `migrations/0001_init.sql`.
- Local full-stack test server: `node tools/devserver.mjs 8790` (static files + the real API on SQLite).
- Also new: animated rigged characters, tower upgrade flair, tap-to-collect loot, kill-streak call-outs, a daily play streak and daily/weekly orders.
