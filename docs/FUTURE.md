# Future work

## Live co-op (Durable Objects)

Bastion Siege ships with asynchronous co-op (Allied Towers, clans, world sieges). Real-time 2–4 player co-op is
sketched here because it needs pieces a Pages project can't define on its own.

**Shape**
- A separate Worker (`coop-worker/`) exporting a `CoopRoom` Durable Object class, deployed once with `wrangler deploy`.
- The Pages project binds it as `COOP` (Settings → Bindings → Durable Object, pointing at that Worker's class).
- `GET /api/coop/:code` upgrades to a WebSocket and forwards to `env.COOP.idFromName(code)`.

**Netcode (keep it simple)**
- The room runs the same `Game` engine from `src/game/engine.js` server-side at 20 Hz; it owns spawning, enemies and the shared castle.
- Clients send intents only: `build`, `upgrade`, `sell`, `fire {x,y,charge}`, `gift {to, gold}`, `ready`.
- Server broadcasts compact snapshots (enemy id, x, y, hp%) every 100 ms; clients interpolate and run local-only FX.
- Each player has their own gold purse and personal weapon; towers record an `owner`. Support towers (Banner) buff allies' towers.
- WebSocket hibernation keeps idle rooms free; rooms die after 10 minutes empty.

**Cost check**: Durable Objects requests and duration count against the Workers Free plan's daily limits.
A 20-minute four-player session at 10 snapshots per second is roughly 48k outgoing messages.
Fine for friends, but rate-limit room creation.

## Content ideas

- **New biomes** after Shadowfen: Sky Islands (flyers dominate), Clockwork Foundry (enemies gain shields between waves), Sunken City (paths flood and change every 5 waves).
- **New towers**: Alchemist (debuff cloud that converts kills into gold), Lighthouse (reveals stealth, extends Fog vision), Siege Golem (a mobile tower you reposition between waves), Bell Tower (global slow pulse once per wave).
- **Enemy factions** with their own rosters per biome (Undead, Beastmen, Clockwork) and faction bosses.
- **Seasonal events**: Harvest Siege (pumpkin-headed grunts, candy currency), Winter Watch (snowball weapon, frozen paths), Midsummer Tourney (weekly hero-kills-only event board).
- **Hero classes** with active abilities on a cooldown: Ranger (volley), Engineer (instant repair), Mage (meteor).
- **Tower skins and castle themes** sold for Renown in a rotating weekly shop.
- **Clan wars**: two clans race the same seed for a weekend; the summed best scores win a banner.
- **Replay validation**: record build/fire actions per wave and re-simulate server-side for verified leaderboards.
