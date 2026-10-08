# Bastion Siege — Design Doc

Endless castle defense for the browser. Static front end + Cloudflare Pages Functions + D1, all on the free tier.
The single source of truth for every number below is `src/data/balance.js`; this doc explains the shape of the systems.

## 1. Systems overview

```
┌──────────── client (static, ES modules, no build) ────────────┐
│ src/game   engine.js  — fixed-step sim, no DOM (runs in Node) │
│            waves.js / economy.js / rules.js — pure formulas   │
│            maps.js    — handcrafted + seeded procedural maps  │
│            render.js / fx.js / audio.js — presentation only   │
│ src/ui     screens, HUD, build/armory/boon panels, tutorial   │
│ src/meta   profile, keep tree, achievements, cosmetics        │
│ src/net    api.js — online features, degrade to offline       │
└───────────────────────────┬───────────────────────────────────┘
                            │ fetch /api/*
┌───────────────────────────▼───────────────────────────────────┐
│ functions/api/[[path]].js — one router                        │
│ D1 (binding DB): players, runs, boards, friends, clans, inbox │
│ Shared formulas imported from src/game/rules.js (validation)  │
└───────────────────────────────────────────────────────────────┘
```

The engine emits events (`kill`, `hit`, `shoot`, `leak`, `waveStart`, …). Renderer, audio, achievements and the HUD subscribe;
the headless balance simulator subscribes to nothing. This keeps the sim deterministic and testable.

Game loop: fixed 1/60 s simulation steps, speed 1×/2×/3× = more steps per frame, rendering interpolates nothing (60 Hz steps
are smooth enough). Each step: spawn → enemies move/act → towers act → projectiles → effects → cleanup.

## 2. Run structure

1. **Build phase**: countdown (30 s, first wave untimed). Build, upgrade, sell, repair, buy weapon upgrades, pick boon.
   "Call wave early" pays bonus gold proportional to the time left.
2. **Wave phase**: enemies spawn in groups along 1–3 paths. Towers fire automatically; the player taps enemies to fire
   their personal weapon. Building/upgrading allowed; repairs are not.
3. Wave cleared → wave-clear gold + score, autosave, next build phase. Every 3rd wave and after each boss: pick 1 of 3 boons.
4. Castle HP hits 0 → run ends → summary → Renown banked → online submission.

Leaking enemies hit the **Wall** first (repairable cheaply), then the **Castle** (repairable expensively). Flyers skip
the wall. Rams deal 3× wall damage.

## 3. Wave scaling (src/game/waves.js)

```
rawCount(w)   = floor(6 + 1.5·w + 0.03·w²)
count(w)      = min(rawCount, 110)            (overflow folds into HP: hp × rawCount/110)
hpMult(w)     = (1 + 0.34·(w−1)) · 1.03^max(0, w−11) · (1 + 0.06·gearTier) · ascensionHp
speedMult(w)  = 1 + min(0.45, 0.004·(w−1))
armorAdd(w)   = min(25, 0.25·w)               (percentage points on armored types)
gearTier(w)   = floor((w−1)/10)               (new weapons on enemy minis every 10 waves)
boss          = every 10th wave (Warlord → Siege Titan → Dragon → Lich, then cycle +60% HP per cycle)
biome         = floor((w−1)/25) mod 5: Meadow, Dunes, Frostlands, Ashlands, Shadowfen
safety valve  = after 180 s a wave "enrages": stun immunity, slows weakened, +60% speed (no stalemates)
```

Enemy mix: each type has an unlock wave and a weight; a per-wave seeded RNG (`hash(seed, wave)`) draws the roster, so a
given seed always produces the same waves (daily challenge + friend challenges rely on this).

Finite and sane at wave 200 (count capped at 110, HP multiplier in the thousands): verified by `tests/waves.test.mjs`.
Newly unlocked types get a spotlight group the wave they debut (25% of the wave; 7% for heavy types like Rams).

## 4. Economy (src/game/economy.js)

| Source | Formula |
|---|---|
| Kill gold | `bounty · (1 + 0.02·(w−1)) · 1.03^(0.6·max(0, w−11))`, +50% if your weapon killed it (bounties keep pace with HP) |
| Wave clear | `15 + 3·w` |
| Early call | `ceil(secondsLeft · 0.8 · (1 + 0.05·w))` |
| Mint tower | `14 · tierMult` per wave cleared |
| Sell | 70% of invested (100% if built this build phase) |
| Wall repair | `(0.5 + 0.03·w)` gold / HP |
| Castle repair | `(3 + 0.15·w)` gold / HP |
| Tower repair | `invested · 0.4 · missingFraction` |
| Upgrade cost | base cost × [0.8, 1.2, 1.8, 2.6] for tiers 2–5 |
| Mastery ★n (after tier 5) | base × 2.2 × 1.32ⁿ; each star multiplies damage by 1.16 |

Score: kill `points · (1 + 0.05(w−1))`; player kill ×2 × combo multiplier; wave clear `25·w` (+50% flawless);
all × ascension and modifier multipliers. Renown at run end: `floor(score/200) + 2·wavesCleared`.

## 5. Towers (13)

| Tower | Cost | Role | Unlock (in-run wave / Keep) | Specs at tier 5 |
|---|---|---|---|---|
| Archer | 50 | fast single, air+ground | 1 / free | Sharpshooter · Volley |
| Cannon | 80 | splash, ground | 1 / free | Great Mortar · Shrapnel |
| Mage | 100 | magic chain, air+ground | 3 / free | Storm Caller · Arcane Lance |
| Flak | 85 | anti-air splash | 6 / free | Skyburst · AA Battery |
| Mint | 100 | gold per wave | 4 / Keep | Royal Treasury · Bounty Office |
| Fire Trap | 60 | on path, burn | 5 / Keep | Inferno · Tar Pit |
| Ballista | 120 | pierce line | 7 / Keep | Siege Breaker · Repeater |
| Barracks | 110 | blockers | 9 / Keep | Knights · Rangers |
| Catapult | 160 | long range, splash | 12 / Keep | Boulder · Firepot |
| War Banner | 120 | buff aura | 14 / Keep | War Drums · Rally Cry |
| Tesla | 220 | big chains | 18 / Keep | Overload · Arc Network |
| Frost Spire | 180 | slow pulse | 22 / Keep | Absolute Zero · Shatter |
| Sun Obelisk | 300 | ramping beam | 28 / Keep | Sunlance · Prism |

Tier multipliers: damage ×[1, 1.6, 2.5, 3.8, 5.8], rate ×[1, 1.1, 1.2, 1.32, 1.45], range +[0, .2, .4, .6, .8].
After tier 5, endless Mastery stars turn late-game gold into power (otherwise the board fills up and gold stops mattering).
Rally points (the best-covering tiles, marked with a gold ring) give +10% fire rate.
High-ground tiles: +0.6 range, +15% damage. Towers have HP (enemy archers, sappers, bosses damage/disable them).

## 6. Enemies (13 + 4 bosses)

| Enemy | Wave | HP | Speed | Armor/MR | Notes |
|---|---|---|---|---|---|
| Grunt | 1 | 30 | 1.0 | 0/0 | baseline |
| Runner | 3 | 18 | 1.9 | 0/0 | fast |
| Shieldbearer | 5 | 55 | 0.8 | 45/0 | armored |
| Archer | 7 | 28 | 0.95 | 0/0 | shoots towers |
| Wyvern | 8 | 35 | 1.2 | 0/10 | flying, ignores path & wall |
| Cavalry | 9 | 60 | 1.7 | 15/0 | fast + tough |
| Healer | 12 | 40 | 0.9 | 0/20 | heals nearby |
| Ram | 14 | 220 | 0.5 | 30/−20 | 3× wall damage |
| Sapper | 16 | 45 | 1.2 | 0/0 | disables towers |
| Warchief | 18 | 90 | 0.9 | 20/0 | speed/armor aura |
| Warlock | 22 | 70 | 0.85 | 0/50 | shields allies |
| Broodmother | 26 | 120 | 0.8 | 10/0 | splits into 3 spiderlings |
| Golem | 30 | 400 | 0.55 | 50/30 | tank |
| Bosses | 10s | 1400+ | — | — | Warlord summons, Titan stomps towers, Dragon flies along the road & burns towers, Lich raises dead |

Armor/MR are % reduction (cap 80%). Physical uses armor, magic uses MR, fire ignores half of armor.

## 7. Player weapon

Tap/click an enemy to fire. Ammo regenerates one round per reload. Hold to charge (up to 1 s) for ×3 damage + pierce.
Hitting the upper part of the sprite is a headshot (×2). Shots home gently toward the tapped enemy;
if a tower kills it first, the shot doesn't count as a miss. Each hit raises the combo (×1 → ×3 at 20); misses reset it,
2.5 s without a hit decays it. Weapon damage scales +6%/wave on its own so it stays relevant; Armory upgrades
(damage, reload, quiver, crit) are bought with gold in the build phase. Weapons: Longbow, Crossbow, Fire Javelin,
Arcane Wand, Hand Cannon (Keep unlocks).

## 8. Meta-progression ("The Keep")

Renown buys permanent nodes: Fortify (castle/wall HP), War Chest (start gold), Bounty Hunter (kill gold), Marksman,
Quick Hands, Deep Quiver, Architect (tower cost), Salvage (sell refund), Scholar (+1 boon choice), Second Wind,
tower unlocks, weapon unlocks, cosmetics. Plus 50 achievements (titles + cosmetics), bestiary, lifetime stats,
ascension 0–10 (unlock N+1 by reaching wave 20+5N at N; +12% enemy HP, +4% speed, +15% score per level).

## 9. Replayability

- Run modifiers (Fog of War, Double Time, Gold Rush, Glass Castle, Iron Horde, Swarm, No Repairs, Lone Hero) with score multipliers.
- 3 handcrafted maps + seeded procedural "Frontier" map.
- Daily Challenge: seed, map and modifiers derived from the UTC date. Same for everyone.
- Friend challenges: a share link encodes seed+map+mods+score; works even offline.
- Boons: 32 roguelike modifiers in three rarities.

## 10. Social (cooperative-first)

| Feature | How it works | Cost on free tier |
|---|---|---|
| Identity | anonymous id + token + recovery code | 1 write at signup |
| Leaderboards | global / friends / clan × wave / score / daily / hero kills; weekly season + all-time | read-cached 60 s |
| Seasons | ISO week; top 10 earn a title, claimable next week | lazy, on claim |
| Friends | 6-char friend code, online = seen < 5 min | 1 read per list |
| Gifts & Reinforcements | up to 5 sends/day: Gold Cache, Repair Kit, Allied Tower (ghost tower in friend's next run for 10 waves) | 1 write per gift |
| Clans | create/join by code or search; treasury of donated Renown; levels unlock perks; weekly collective kill goal pays chests | 2–3 writes per run |
| Siege Event | global boss with shared HP over 3 days; every run's kills+boss damage chip it; contributors share the chest | 1 write per run |
| Rival | the player directly above you on the weekly board, shown on the home screen | 0 (derived) |

**Live co-op tradeoff.** Real-time co-op needs a Durable Object, which a Pages project cannot define; it requires a
second Worker deployed by hand and an always-on WebSocket budget. I built **Allied Defense** instead: friends send
Allied Towers and supplies that appear in your next run, labelled with their name, and clans/sieges give a shared goal.
It's fully asynchronous, costs a few D1 writes, and works across time zones. `docs/FUTURE.md` sketches the DO version.

## 11. D1 schema

See `migrations/0001_init.sql` (the API also runs it idempotently on first request, so a manual migration is optional).
Tables: `players`, `runs`, `bests` (player × board × season), `friends`, `gifts`, `inbox`, `clans`, `clan_members`,
`clan_weekly`, `siege`, `siege_contrib`, `reports`, `blocks`, `rate`.

## 12. API

```
GET  /api/health
POST /api/register        {name}                    → {id, token, recovery, friendCode}
POST /api/recover         {recovery}                → {id, token, name, friendCode}
POST /api/rename          {name}
GET  /api/me                                        → profile, inbox count, clan, season claim
POST /api/runs            {run summary}             → {accepted, ranks, siege}
GET  /api/leaderboard     ?board=&scope=&period=    → {rows, me, rival}
GET  /api/friends / POST /api/friends/add {code} / POST /api/friends/remove {id}
POST /api/gifts           {to, kind}
GET  /api/inbox / POST /api/inbox/claim {id}
POST /api/clan/create {name, tag} / join {code} / leave / donate {amount}
GET  /api/clan / GET /api/clan/search?q=
GET  /api/siege
POST /api/report {id} / POST /api/block {id}
GET  /api/season/claim
```

Auth: `Authorization: Bearer <token>`; tokens are random 32-byte values, stored hashed (SHA-256).

## 13. Anti-abuse

- Run submissions validated against shared formulas: score ≤ `maxScore(wave, mult)`, duration ≥ `4 s × wave`,
  kills ≤ `maxKills(wave)`, hero kills ≤ kills, daily seed must equal today's.
- Rate limits per player (runs 1 / 20 s, gifts 5/day, friend adds 30/day, clan create 1/day) in a `rate` table.
- Name filter: leetspeak-normalized word list for display names and clan names/tags.
- Report & block: blocked players are hidden from your lists; 5 distinct reports hide a player's name on public boards.
- Honest limitation: a determined cheater can forge a plausible run. A full replay check would need re-simulation server-side.

## 14. Free-tier risks

- D1: 100k writes/day ≈ 25k runs/day at ~4 writes per run. Fine for a hobby launch.
- Functions: 100k requests/day. The client polls nothing; it fetches on screen open, so ~10–20 requests per session.
- Leaderboards: cached in-isolate for 30 s. KV is not used: its free tier allows only 1,000 writes a day.
- No Durable Objects needed.

## 15. Assumptions

- Plain ES modules instead of Vite, so the existing Pages project (no build command) keeps auto-deploying.
- Boons every 3 waves + after bosses (every wave felt too frequent and slowed the build phase).
- Building is allowed during waves; repairs are build-phase only.
- Portrait phones get the map transposed (tall board) so tiles stay tappable.

## 16. Name ideas

1. **Rampartia** (rampartia.com)
2. **Siegeborne** (siegeborne.com)
3. **Keepwatch Endless** (keepwatchgame.com)

Availability not verified; check a registrar before buying.
