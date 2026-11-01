// Readability hints borrowed from the best mobile tower defence games, shared by the 2D and 3D views:
// - chevrons that flow along every road between waves, so you see at a glance which way the horde will come;
// - a bobbing gold arrow over every tower you can afford to upgrade right now.
// Everything draws in tile space (x, y on the map times `ts` pixels per tile) on whatever canvas the caller hands in.
import { TOWERS, TIER } from '../data/balance.js';
import { TAU } from './draw-util.js';

// Between waves (and for the first seconds of wave 1), arrows march along each road toward the keep.
export function drawPathFlow(ctx, ts, game, time) {
  const m = game.map;
  if (m.hidden || !m.paths || game.over || game.champ || game.assault) return;   // no trail marks on hidden trails, and a Warrior has bigger things to watch
  const build = game.phase === 'build', early = game.phase === 'wave' && game.wave <= 1 && (game.waveClock || 0) < 6;
  if (!build && !early) return;
  const a = build ? 0.8 : 0.8 * Math.max(0, 1 - (game.waveClock || 0) / 6);
  const gap = 1.25, speed = 1.1, off = (time * speed) % gap;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pi = 0; pi < m.paths.length; pi++) {
    const p = m.paths[pi], cum = m.pathLen?.[pi];
    if (!cum || p.length < 2) continue;
    const total = cum[cum.length - 1];
    let seg = 1;
    for (let d = off + 0.6; d < total - 0.6; d += gap) {
      while (seg < p.length - 1 && cum[seg] < d) seg++;
      const A = p[seg - 1], B = p[seg], L = Math.max(1e-6, cum[seg] - cum[seg - 1]), k = (d - cum[seg - 1]) / L;
      const x = (A.x + (B.x - A.x) * k) * ts, y = (A.y + (B.y - A.y) * k) * ts, ang = Math.atan2(B.y - A.y, B.x - A.x);
      // fade in from the spawn and out at the keep so the flow reads as a stream, not a dotted line
      const edge = Math.min(1, d / 1.5, (total - d) / 1.5);
      const s = ts * 0.19;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = `rgba(30,24,16,${0.35 * a * edge})`; ctx.lineWidth = ts * 0.11;
      ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(0, 0); ctx.lineTo(-s, s); ctx.stroke();
      ctx.strokeStyle = `rgba(255,236,170,${a * edge})`; ctx.lineWidth = ts * 0.06;
      ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(0, 0); ctx.lineTo(-s, s); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

// Can this tower be upgraded with the gold in hand right now? (Specialization tiers count; endless mastery stars do not.)
export function upgradeReady(game, t) {
  if (game.assault || typeof game.canUpgrade !== 'function') return false;   // an attack's towers are the enemy's
  if (!t || t.ruined || t.ally || t.ghost || game.auto || game.free || game.puzzle || game.over || TOWERS[t.type]?.trap) return false;
  if (t.tier >= TIER.max) return false;
  if (t.tier === TIER.max - 1) return game.gold >= game.upgradeCost(t) && Object.keys(TOWERS[t.type].specs || {}).length > 0;
  return game.canUpgrade(t);
}

// A small gold arrow bobbing over a tower at the origin (call with the context translated to the tower's foot).
export function drawUpgradeArrow(ctx, ts, time, phase = 0, y0 = -1.18) {
  const bob = Math.sin(time * 4.2 + phase) * ts * 0.06, y = ts * y0 + bob, s = Math.max(6, ts * 0.21);
  ctx.save();
  ctx.translate(0, y);
  ctx.fillStyle = 'rgba(30,24,16,0.55)'; ctx.beginPath(); ctx.arc(0, 0, s * 1.25, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd666'; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = Math.max(1.2, s * 0.18); ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.85); ctx.lineTo(s * 0.75, 0); ctx.lineTo(s * 0.3, 0); ctx.lineTo(s * 0.3, s * 0.75); ctx.lineTo(-s * 0.3, s * 0.75); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.75, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
