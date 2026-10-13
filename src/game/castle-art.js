// The player's castle: a walled keep with a gatehouse, round corner towers, banners and a courtyard.
// Drawn around (0,0) = the castle tile centre, in units of `s`. The hero stands on the gatehouse parapet at y = -0.36 s.
import { INK, TAU, roundRect, shade } from './draw-util.js';

const STONE_LINE = 'rgba(30,36,51,0.22)';

// Running-bond masonry inside a rectangle.
function masonry(ctx, x, y, w, h, rowH, brickW, phase = 0) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = STONE_LINE;
  let r = 0;
  for (let yy = y + rowH; yy < y + h; yy += rowH, r++) {
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
    const off = (r + phase) % 2 ? brickW / 2 : 0;
    ctx.beginPath();
    for (let xx = x + off + brickW; xx < x + w; xx += brickW) { ctx.moveTo(xx, yy - rowH); ctx.lineTo(xx, yy); }
    ctx.stroke();
  }
  ctx.restore();
}

// A row of square battlements (merlons) along y.
function merlons(ctx, x0, x1, y, mw, mh, fill) {
  const n = Math.max(2, Math.round((x1 - x0) / (mw * 1.9)));
  const step = (x1 - x0 - mw) / (n - 1);
  ctx.fillStyle = fill;
  for (let i = 0; i < n; i++) { const x = x0 + i * step; ctx.fillRect(x, y - mh, mw, mh + 1); ctx.strokeRect(x, y - mh, mw, mh + 1); }
}

function flag(ctx, ts, s, T, px, pt, size, col) {
  ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04; ctx.beginPath(); ctx.moveTo(px, pt + s * 0.3); ctx.lineTo(px, pt); ctx.stroke();
  const wv = (k) => Math.sin(T * 5 - k * 2.6 + px) * s * 0.035 * k;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px, pt);
  for (let i = 1; i <= 6; i++) { const k = i / 6; ctx.lineTo(px + k * size, pt + wv(k)); }
  ctx.lineTo(px + size * 0.82, pt + size * 0.3 + wv(1)); ctx.lineTo(px + size, pt + size * 0.55 + wv(1));
  for (let i = 6; i >= 0; i--) { const k = i / 6; ctx.lineTo(px + k * size * 0.95, pt + size * 0.55 + wv(k)); }
  ctx.closePath(); ctx.fill(); ctx.lineWidth = ts * 0.04; ctx.stroke();
}

// A heraldic banner hanging from a wall, with a swallow-tail and a gold device.
function banner(ctx, ts, s, T, x, y, w, h, col, gold, phase) {
  const sway = Math.sin(T * 1.7 + phase) * s * 0.012;
  ctx.fillStyle = INK; ctx.fillRect(x - w / 2 - s * 0.02, y - s * 0.015, w + s * 0.04, s * 0.03);
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 + sway, y + h); ctx.lineTo(x + sway * 1.4, y + h - w * 0.35); ctx.lineTo(x - w / 2 + sway, y + h); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = gold; ctx.fillRect(x - w / 2 + s * 0.012, y + s * 0.025, w - s * 0.024, s * 0.02);
  ctx.beginPath(); ctx.moveTo(x + sway * 0.4, y + h * 0.22); ctx.lineTo(x + w * 0.2 + sway * 0.4, y + h * 0.42); ctx.lineTo(x + sway * 0.5, y + h * 0.62); ctx.lineTo(x - w * 0.2 + sway * 0.4, y + h * 0.42); ctx.closePath(); ctx.fill();
}

function shield(ctx, s, x, y, w, col, gold) {
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x - w / 2, y - w * 0.5); ctx.lineTo(x + w / 2, y - w * 0.5); ctx.lineTo(x + w / 2, y + w * 0.1); ctx.quadraticCurveTo(x + w / 2, y + w * 0.55, x, y + w * 0.7); ctx.quadraticCurveTo(x - w / 2, y + w * 0.55, x - w / 2, y + w * 0.1); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = gold; ctx.fillRect(x - w * 0.09, y - w * 0.42, w * 0.18, w * 0.95);
  ctx.fillRect(x - w * 0.34, y - w * 0.12, w * 0.68, w * 0.16);
}

function tower(ctx, o, sx) {
  const { ts, s, sk, T } = o;
  const cx = sx * s * 0.64, hw = s * 0.17, top = -s * 0.74, bot = s * 0.42;
  // cylindrical shading: light on the left, shade on the right
  const gr = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
  gr.addColorStop(0, shade(sk.wall, 0.12)); gr.addColorStop(0.45, sk.wall); gr.addColorStop(1, sk.wall2);
  ctx.fillStyle = gr; roundRect(ctx, cx - hw, top, hw * 2, bot - top, s * 0.04); ctx.fill(); ctx.stroke();
  masonry(ctx, cx - hw, top, hw * 2, bot - top, s * 0.11, s * 0.1, sx > 0 ? 1 : 0);
  ctx.fillStyle = sk.wall2; ctx.fillRect(cx - hw + 1, s * 0.28, hw * 2 - 2, s * 0.13);              // plinth
  // overhanging parapet with battlements
  ctx.fillStyle = sk.wall2; roundRect(ctx, cx - hw - s * 0.05, top - s * 0.05, hw * 2 + s * 0.1, s * 0.1, s * 0.02); ctx.fill(); ctx.stroke();
  merlons(ctx, cx - hw - s * 0.04, cx + hw + s * 0.04 - s * 0.05, top - s * 0.05, s * 0.065, s * 0.075, sk.wall);
  // conical roof, with a highlight and shingle lines
  const ry = top - s * 0.12, ap = ry - s * 0.36, rw = hw + s * 0.07;
  ctx.fillStyle = sk.roof; ctx.beginPath(); ctx.moveTo(cx - rw, ry); ctx.lineTo(cx, ap); ctx.lineTo(cx + rw, ry); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(cx - rw * 0.8, ry - 1); ctx.lineTo(cx - s * 0.01, ap + s * 0.02); ctx.lineTo(cx - rw * 0.15, ry - 1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(30,36,51,0.28)'; ctx.lineWidth = ts * 0.02;
  for (let i = 1; i < 4; i++) { const k = i / 4, yy = ry - (ry - ap) * k, ww = rw * (1 - k); ctx.beginPath(); ctx.moveTo(cx - ww, yy); ctx.quadraticCurveTo(cx, yy + s * 0.025, cx + ww, yy); ctx.stroke(); }
  ctx.lineWidth = ts * 0.05; ctx.strokeStyle = INK;
  // arrow slits and a lit window
  ctx.fillStyle = INK; ctx.fillRect(cx - s * 0.014, -s * 0.5, s * 0.028, s * 0.15); ctx.fillRect(cx - s * 0.07, -s * 0.46, s * 0.14, s * 0.024);
  const lit = 0.7 + 0.2 * Math.sin(T * 3.1 + sx);
  ctx.fillStyle = `rgba(255,205,110,${lit})`; ctx.beginPath(); ctx.moveTo(cx - s * 0.04, -s * 0.02); ctx.lineTo(cx - s * 0.04, -s * 0.13); ctx.arc(cx, -s * 0.13, s * 0.04, Math.PI, 0); ctx.lineTo(cx + s * 0.04, -s * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  return { cx, apex: ap };
}

// o: { ts, s, sk, T, dmg, wf, flagCol, theme }
export function drawCastleBody(ctx, o) {
  const { ts, s, sk, T, dmg } = o;
  ctx.lineWidth = ts * 0.05; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  // ground shadow and the cobbled courtyard in front of the walls
  ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.beginPath(); ctx.ellipse(0, s * 0.46, s * 1.08, s * 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a79f8e'; roundRect(ctx, -s * 1.0, s * 0.34, s * 2.0, s * 0.16, s * 0.07); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c3bba8'; ctx.beginPath();
  for (let i = -9; i <= 9; i++) { const x = i * s * 0.1; ctx.moveTo(x + s * 0.04, s * 0.4); ctx.ellipse(x, s * 0.4 + (i % 2) * s * 0.035, s * 0.04, s * 0.022, 0, 0, TAU); }
  ctx.fill();

  // curtain walls on both sides, with battlements
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? s * 0.6 : -s * 1.0, w = s * 0.4;
    ctx.fillStyle = sk.wall; ctx.fillRect(x0, -s * 0.2, w, s * 0.62); ctx.strokeRect(x0, -s * 0.2, w, s * 0.62);
    masonry(ctx, x0, -s * 0.2, w, s * 0.62, s * 0.11, s * 0.1, 0);
    ctx.fillStyle = sk.wall2; ctx.fillRect(x0 + 1, s * 0.3, w - 2, s * 0.11);
    merlons(ctx, x0, x0 + w, -s * 0.2, s * 0.07, s * 0.09, sk.wall);
  }
  // gatehouse
  const gw = s * 0.44;
  ctx.fillStyle = sk.wall; roundRect(ctx, -gw, -s * 0.34, gw * 2, s * 0.76, s * 0.03); ctx.fill(); ctx.stroke();
  masonry(ctx, -gw, -s * 0.34, gw * 2, s * 0.76, s * 0.11, s * 0.11, 1);
  ctx.fillStyle = sk.wall2; ctx.fillRect(-gw + 1, s * 0.3, gw * 2 - 2, s * 0.11);
  ctx.fillStyle = sk.wall2; roundRect(ctx, -gw - s * 0.03, -s * 0.37, gw * 2 + s * 0.06, s * 0.07, s * 0.02); ctx.fill(); ctx.stroke();
  merlons(ctx, -gw - s * 0.02, gw + s * 0.02, -s * 0.37, s * 0.08, s * 0.09, sk.wall);

  // the gate: stone arch, oak doors and a raised portcullis
  const gx = s * 0.15, gy = s * 0.41;
  ctx.fillStyle = shade(sk.wall2, -0.1); ctx.beginPath(); ctx.moveTo(-gx - s * 0.05, gy); ctx.lineTo(-gx - s * 0.05, s * 0.06); ctx.arc(0, s * 0.06, gx + s * 0.05, Math.PI, 0); ctx.lineTo(gx + s * 0.05, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5b3a24'; ctx.beginPath(); ctx.moveTo(-gx, gy); ctx.lineTo(-gx, s * 0.06); ctx.arc(0, s * 0.06, gx, Math.PI, 0); ctx.lineTo(gx, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(20,14,10,0.6)'; ctx.lineWidth = ts * 0.022;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * gx * 0.55, -s * 0.06); ctx.lineTo(i * gx * 0.55, gy); ctx.stroke(); }
  ctx.strokeStyle = '#2a2420'; ctx.lineWidth = ts * 0.035; ctx.beginPath(); ctx.moveTo(-gx, s * 0.2); ctx.lineTo(gx, s * 0.2); ctx.moveTo(-gx, s * 0.33); ctx.lineTo(gx, s * 0.33); ctx.stroke();
  ctx.fillStyle = '#c9a24b'; for (const yy of [0.2, 0.33]) for (const xx of [-0.1, 0.1]) { ctx.beginPath(); ctx.arc(xx * s, yy * s, ts * 0.018, 0, TAU); ctx.fill(); }
  ctx.lineWidth = ts * 0.05; ctx.strokeStyle = INK;
  // heraldic shield over the arch
  shield(ctx, s, 0, -s * 0.14, s * 0.2, sk.roof, sk.flag);

  // torches either side of the gate
  for (const sxn of [-1, 1]) {
    const tx = sxn * s * 0.31, ty = s * 0.1, fk = Math.sin(T * 13 + sxn * 2) * 0.5 + 0.5;
    ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.045; ctx.beginPath(); ctx.moveTo(tx, ty + s * 0.12); ctx.lineTo(tx, ty); ctx.stroke();
    const g = ctx.createRadialGradient(tx, ty - s * 0.05, 0, tx, ty - s * 0.05, s * 0.26);
    g.addColorStop(0, 'rgba(255,190,90,0.5)'); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tx, ty - s * 0.05, s * 0.26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.moveTo(tx - s * 0.04, ty); ctx.quadraticCurveTo(tx - s * 0.06, ty - s * 0.08, tx, ty - s * (0.15 + 0.05 * fk)); ctx.quadraticCurveTo(tx + s * 0.06, ty - s * 0.08, tx + s * 0.04, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.moveTo(tx - s * 0.02, ty); ctx.quadraticCurveTo(tx - s * 0.03, ty - s * 0.05, tx, ty - s * (0.09 + 0.03 * fk)); ctx.quadraticCurveTo(tx + s * 0.03, ty - s * 0.05, tx + s * 0.02, ty); ctx.closePath(); ctx.fill();
  }
  ctx.lineWidth = ts * 0.05; ctx.strokeStyle = INK;

  // corner towers, then banners over the curtain walls
  const tl = tower(ctx, o, -1), tr = tower(ctx, o, 1);
  banner(ctx, ts, s, T, -s * 0.84, -s * 0.12, s * 0.15, s * 0.36, sk.roof, sk.flag, 0);
  banner(ctx, ts, s, T, s * 0.84, -s * 0.12, s * 0.15, s * 0.36, sk.roof, sk.flag, 2);
  // flags on the tower tips: the royal standard (or your clan's banner) on the right
  flag(ctx, ts, s, T, tr.cx, tr.apex - s * 0.26, s * 0.3, o.flagCol || sk.flag);
  flag(ctx, ts, s, T, tl.cx, tl.apex - s * 0.2, s * 0.22, sk.roof);

  // battle damage: cracks, then a broken parapet and rubble
  if (dmg > 0.3) {
    ctx.strokeStyle = 'rgba(30,36,51,0.7)'; ctx.lineWidth = ts * 0.025;
    ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.18); ctx.lineTo(-s * 0.22, -s * 0.04); ctx.lineTo(-s * 0.28, s * 0.1); ctx.stroke();
    if (dmg > 0.6) {
      ctx.beginPath(); ctx.moveTo(s * 0.26, -s * 0.2); ctx.lineTo(s * 0.18, -s * 0.06); ctx.lineTo(s * 0.28, s * 0.06); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.76, s * 0.0); ctx.lineTo(-s * 0.7, s * 0.14); ctx.lineTo(-s * 0.78, s * 0.24); ctx.stroke();
      ctx.fillStyle = '#8f8878'; ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.03;
      for (const [dx, dy, r] of [[-0.55, 0.45, 0.05], [0.5, 0.46, 0.045], [-0.15, 0.5, 0.035], [0.72, 0.45, 0.05]]) { ctx.beginPath(); ctx.ellipse(dx * s, dy * s, r * s, r * s * 0.7, 0.3, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
  }
}

// The wooden palisade in front of the gate. Each stake is one slice of the wall's health; broken stakes are short and red-stained.
export function drawPalisade(ctx, o, wf) {
  const { ts, s } = o;
  const n = 15, cy = s * 0.34, rx = s * 1.18, ry = s * 0.5;
  const alive = Math.ceil(n * Math.max(0, wf));
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    // stakes fill from the middle outward, so the gate side holds longest
    const order = i, k = (n - 1) / 2, d = Math.abs(i - k), intact = d <= (alive - 1) / 2 + 0.01 && alive > 0;
    const a = Math.PI * (0.1 + 0.8 * (i / (n - 1)));
    const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    const h = intact ? s * 0.2 : s * 0.07, w = s * 0.062;
    ctx.fillStyle = intact ? (i % 2 ? '#9a7b55' : '#b08d62') : '#7a4a3a';
    ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.03;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h * 0.82); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2, y - h * 0.82); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    void order;
  }
  // a rope along the stakes
  ctx.strokeStyle = 'rgba(60,40,24,0.7)'; ctx.lineWidth = ts * 0.02;
  ctx.beginPath(); for (let i = 0; i < n; i++) { const a = Math.PI * (0.1 + 0.8 * (i / (n - 1))); const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry - s * 0.07; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
}
