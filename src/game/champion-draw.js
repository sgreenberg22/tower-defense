// How your warrior (champion.js) shows on the field, shared by the classic 2D renderer and the 3D view's ground layer.
// Everything here draws in tile space: (x, y) on the map times `ts` pixels per tile, on whatever canvas the caller hands in.
import { TAU } from './draw-util.js';

const GOLD = '#ffd666';

// Ground art: the ring under your feet, the swing arcs, the frost and slam rings, the meteor warnings and the lock on a foe.
export function drawChampGround(ctx, ts, game, time) {
  const c = game.champ;
  if (!c) return;
  ctx.save();
  ctx.lineCap = 'round';
  // the foe your next blow goes for
  const L = !c.dead && c.lock;
  if (L) {
    const x = (L.cx ?? L.x) * ts, y = (L.cy ?? L.y) * ts, r = (L.cx !== undefined ? 0.55 : L === game.fortress ? 0.8 : Math.max(0.25, (L.size || 0.3) * 0.95)) * ts;
    const lx = L === game.fortress ? game.gates.reduce((a, b) => (Math.hypot(a.x - c.x, a.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? a : b)) : null;
    const px = lx ? lx.x * ts : x, py = lx ? lx.y * ts : y;
    ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = ts * 0.05;
    for (let i = 0; i < 3; i++) { const a = time * 2.4 + i * TAU / 3; ctx.beginPath(); ctx.arc(px, py, r, a, a + 1.4); ctx.stroke(); }
  }
  // meteors on their way down: a ring that closes on the spot
  for (const m of c.meteors) {
    const k = 1 - Math.max(0, m.t) / (m.max || 1);
    ctx.fillStyle = `rgba(255,90,30,${0.12 + 0.25 * k})`; ctx.beginPath(); ctx.arc(m.x * ts, m.y * ts, m.r * ts * k, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,140,60,${0.6 + 0.3 * Math.sin(time * 16)})`; ctx.lineWidth = ts * 0.05; ctx.beginPath(); ctx.arc(m.x * ts, m.y * ts, m.r * ts, 0, TAU); ctx.stroke();
  }
  // spoils: glowing orbs that fade out (green heals, orange fills the fury, blue shields); walk over one
  for (const o of c.orbs || []) {
    const x = o.x * ts, y = o.y * ts, k = Math.min(1, o.t / 3), bob = 0.5 + 0.5 * Math.sin(time * 5 + o.x * 3), r = ts * (o.big ? 0.2 : 0.14) * (0.9 + 0.2 * bob);
    const col = o.kind === 'heal' ? '110,230,120' : o.kind === 'fury' ? '255,150,50' : '120,190,255';
    ctx.fillStyle = `rgba(${col},${0.22 * k})`; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${col},${0.95 * k})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * k})`; ctx.lineWidth = ts * 0.03; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  // swings, spins, novas and bursts fading out
  for (const tr of c.trails) {
    const k = tr.t / tr.max, x = tr.x * ts, y = tr.y * ts;
    if (tr.kind === 'slash' || tr.kind === 'spin') {
      const r = tr.r * ts, a0 = tr.ang - tr.arc / 2, a1 = tr.ang + tr.arc / 2, grow = 1 - k * 0.3;
      ctx.strokeStyle = tr.big ? `rgba(255,214,102,${0.85 * k})` : `rgba(255,255,255,${0.75 * k})`;
      ctx.lineWidth = ts * (tr.big ? 0.2 : 0.13) * k + ts * 0.02;
      ctx.beginPath(); if (tr.arc >= 6.2) ctx.arc(x, y, r * grow, 0, TAU); else ctx.arc(x, y, r * grow, tr.flip ? a1 : a0, tr.flip ? a0 : a1, !!tr.flip); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`; ctx.lineWidth = ts * 0.04;
      ctx.beginPath(); if (tr.arc >= 6.2) ctx.arc(x, y, r * grow * 0.72, 0, TAU); else ctx.arc(x, y, r * grow * 0.72, a0, a1); ctx.stroke();
    } else if (tr.kind === 'nova' || tr.kind === 'burst') {
      const r = tr.r * ts * (1.05 - k * 0.6);
      ctx.fillStyle = tr.fire ? `rgba(255,130,40,${0.32 * k})` : tr.kind === 'burst' ? `rgba(255,170,80,${0.35 * k})` : `rgba(170,225,255,${0.35 * k})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = tr.fire ? `rgba(255,200,90,${0.9 * k})` : tr.kind === 'burst' ? `rgba(255,220,140,${0.8 * k})` : `rgba(225,245,255,${0.95 * k})`; ctx.lineWidth = ts * 0.07 * k + ts * 0.02;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    } else if (tr.kind === 'arrowfall') {
      ctx.fillStyle = `rgba(80,60,40,${0.5 * k})`; ctx.beginPath(); ctx.arc(x, y, ts * 0.06, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,200,${0.7 * k})`; ctx.lineWidth = ts * 0.03; ctx.beginPath(); ctx.arc(x, y, ts * 0.18 * (1.3 - k), 0, TAU); ctx.stroke();
    }
  }
  // the ring under your feet and a little wedge for where you face
  if (!c.dead) {
    const x = c.x * ts, y = c.y * ts, pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const hot = c.furyT > 0, ready = c.furyReady;
    ctx.fillStyle = hot ? 'rgba(255,120,60,0.28)' : 'rgba(255,214,102,0.18)'; ctx.beginPath(); ctx.arc(x, y, ts * 0.42, 0, TAU); ctx.fill();
    ctx.strokeStyle = hot ? '#ff7a3a' : ready ? `rgba(255,214,102,${0.6 + 0.4 * pulse})` : GOLD; ctx.lineWidth = ts * (ready ? 0.07 : 0.05);
    ctx.beginPath(); ctx.arc(x, y, ts * 0.42, 0, TAU); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.beginPath();
    ctx.moveTo(x + Math.cos(c.ang) * ts * 0.62, y + Math.sin(c.ang) * ts * 0.62);
    ctx.lineTo(x + Math.cos(c.ang + 0.35) * ts * 0.46, y + Math.sin(c.ang + 0.35) * ts * 0.46);
    ctx.lineTo(x + Math.cos(c.ang - 0.35) * ts * 0.46, y + Math.sin(c.ang - 0.35) * ts * 0.46);
    ctx.closePath(); ctx.fill();
    if (c.shieldT > 0) { ctx.strokeStyle = `rgba(170,225,255,${0.5 + 0.4 * Math.sin(time * 18)})`; ctx.lineWidth = ts * 0.04; ctx.beginPath(); ctx.arc(x, y, ts * 0.55, 0, TAU); ctx.stroke(); }
  } else {
    // where you will rise again
    const s = c.spawnPoint(), k = 1 - c.respawnT / 12;
    ctx.strokeStyle = `rgba(255,214,102,${0.4 + 0.3 * Math.sin(time * 5)})`; ctx.setLineDash([ts * 0.12, ts * 0.1]); ctx.lineWidth = ts * 0.05;
    ctx.beginPath(); ctx.arc(s.x * ts, s.y * ts, ts * (0.4 + 0.15 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// Arrows and fire bolts in flight, for the classic view (the 3D view draws them in screen space with its camera).
export function drawChampShots2D(ctx, ts, c) {
  if (!c) return;
  ctx.save(); ctx.lineCap = 'round';
  for (const s of c.shots) {
    const x = s.x * ts, y = (s.y - 0.25) * ts;
    if (s.kind === 'bolt') {
      ctx.fillStyle = 'rgba(255,140,40,0.35)'; ctx.beginPath(); ctx.arc(x, y, ts * 0.16, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(x, y, ts * 0.08, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = ts * 0.04;
      ctx.beginPath(); ctx.moveTo(x - s.dx * ts * 0.32, y - s.dy * ts * 0.32); ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = '#e8ecf4'; ctx.lineWidth = ts * 0.025; ctx.beginPath(); ctx.moveTo(x - s.dx * ts * 0.08, y - s.dy * ts * 0.08); ctx.lineTo(x + s.dx * ts * 0.04, y + s.dy * ts * 0.04); ctx.stroke();
    }
  }
  ctx.restore();
}
