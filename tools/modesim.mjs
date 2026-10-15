// Balance simulator for the game modes: node tools/modesim.mjs <gauntlet|sprint|laststand> [runs=4] [--keep=N] [--map=id] [--start=N]
import { Game } from '../src/game/engine.js';
import { TOWERS, TROOPS, GAME } from '../src/data/balance.js';
import { botBuild, bonusFor, MIX } from './sim.mjs';
import { LASTSTAND, weeklySetup } from '../src/game/modes.js';

const args = process.argv.slice(2);
const mode = args.find((a) => /^[a-z]+$/.test(a)) || 'gauntlet';
const runs = Number(args.find((a) => /^\d+$/.test(a)) || 4);
const keep = Number((args.find((a) => a.startsWith('--keep=')) || '--keep=1').split('=')[1]);
const mapArg = (args.find((a) => a.startsWith('--map=')) || '').split('=')[1];

function hero(g, st) {
  st.t -= GAME.step;
  if (st.t > 0 || g.phase !== 'wave') return;
  st.t = 0.5;
  const e = g.enemies.filter((x) => !x.dead).sort((a, b) => (a.total - a.dist) - (b.total - b.dist))[0];
  if (e) g.heroFire(e.x, e.y - e.size * 0.3, 0);
  if (e && g.abilityReady('volley')) g.useAbility('volley', e.x, e.y);
}

export const LS_MIX = ['cannon', 'archer', 'mage', 'frost', 'ballista', 'tesla', 'gatling', 'catapult', 'venom', 'flak', 'banner', 'sanctum', 'obelisk', 'trebuchet', 'voidwell', 'firetrap'];
export const LS_SQUAD = ['knight', 'knight', 'footman', 'pikeman', 'bowman', 'crossbow', 'cleric', 'cavalry', 'griffon'];

export function setupLastStand(g, mix = LS_MIX, squad = LS_SQUAD) {
  const plots = [...g.map.plots].sort((a, b) => (g.map.coverage.get(b.k) || 0) - (g.map.coverage.get(a.k) || 0));
  let i = 0;
  for (const p of plots) {
    const id = mix[i++ % mix.length];
    if (TOWERS[id].trap) continue;
    const t = g.build(id, p.x, p.y);
    if (t) g.chooseSpec(t, Object.keys(TOWERS[id].specs)[0]);
  }
  let k = 0;
  while (k < 200 && g.trainTroop(squad[k++ % squad.length])) { /* fills the garrison */ }
  return g;
}

function playStand({ seed, mapId, startWave }) {
  if (startWave) LASTSTAND.startWave = startWave;
  const g = new Game({ seed, mapId, mode: 'laststand', bonus: bonusFor(2) });
  setupLastStand(g);
  const st = { t: 0 };
  let steps = 0;
  g.startWave();
  while (!g.over && steps < 60 * 60 * 120) { g.update(GAME.step); hero(g, st); steps++; }
  return g;
}

const out = [];
for (let i = 0; i < runs; i++) {
  const seed = 'ms' + i + mode;
  const t0 = Date.now();
  if (mode === 'laststand') {
    const ws = weeklySetup('laststand', '2026-W42');
    const g = playStand({ seed: ws.seed + i, mapId: mapArg || ws.map, startWave: Number((args.find((a) => a.startsWith('--start=')) || '--start=0').split('=')[1]) });
    const s = g.summary();
    out.push(`stand ${mapArg || ws.map}: clock ${Math.round(s.clock / 60 * 10) / 10}m wave ${s.wave} kills ${s.kills} cleared ${s.wavesCleared} troops ${g.garrison.units.length} (${Date.now() - t0}ms)`);
  } else {
    const g = new Game({ seed, mapId: mode === 'sprint' ? (mapArg || 'meadow') : 'meadow', mode, bonus: bonusFor(keep) });
    g.useTroops = true;
    const mixIdx = { v: 0 }, st = { t: 0 };
    let steps = 0, stages = 1;
    g.on('stageStart', () => stages++);
    while (!g.over && g.wave <= 400 && steps < 60 * 60 * 200) {
      if (g.phase === 'build') { botBuild(g, mixIdx, MIX); g.startWave(); }
      g.update(GAME.step); hero(g, st); steps++;
    }
    const s = g.summary();
    out.push(`${mode} keep${keep}: wave ${s.wave} cleared ${s.wavesCleared} stage ${s.stage} kills ${s.kills} clock ${Math.round(s.clock)}s victory ${s.victory} (${Date.now() - t0}ms)`);
  }
}
console.log(out.join('\n'));
