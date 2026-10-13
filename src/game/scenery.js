// Battlefield scenery, painted once into the background cache: meadow, cobbled roads with stone curbs,
// enemy war-camps where the roads begin, and medieval props (haystacks, barrels, carts, banners, gravestones).
import { INK, TAU, roundRect, shade } from './draw-util.js';
import { T } from './maps.js';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
};
// Curb stones by land: meadow, dunes, frostlands, ashlands, shadowfen.
const CURB = ['#a39b8c', '#c4a574', '#9fb2c4', '#6f564c', '#6b6a8a'];

// ---------- ground ----------
export function paintGround(g, m, ts, B, bi, rnd, width = null) {
  const W = width || m.cols * ts, H = m.rows * ts;
  g.fillStyle = B.grass; g.fillRect(0, 0, W, H);
  // soft mottled patches instead of a chessboard
  const n = Math.round((W / ts) * m.rows * 0.7);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, r = ts * (0.7 + rnd() * 1.4), light = rnd() < 0.35;
    const col = light ? shade(B.grass, 0.07) : B.grass2;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, light ? 0.55 : 0.85)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // grass tufts
  g.strokeStyle = shade(B.grass, -0.2); g.lineWidth = Math.max(1, ts * 0.025); g.lineCap = 'round';
  for (let i = 0; i < (W / ts) * m.rows * 3.2; i++) {
    const x = rnd() * W, y = rnd() * H, k = ts * (0.05 + rnd() * 0.05);
    g.beginPath(); g.moveTo(x - k, y); g.lineTo(x - k * 0.4, y - k * 1.5); g.moveTo(x, y); g.lineTo(x, y - k * 1.9); g.moveTo(x + k, y); g.lineTo(x + k * 0.4, y - k * 1.5); g.stroke();
  }
  g.lineCap = 'butt';
  // wildflowers on the meadow
  if (bi === 0) {
    const cols = ['#ffffff', '#ffe27a', '#ff9ab8', '#c9a6ff'];
    for (let i = 0; i < (W / ts) * m.rows * 0.9; i++) {
      const x = rnd() * W, y = rnd() * H, c = cols[Math.floor(rnd() * cols.length)];
      g.fillStyle = c; g.beginPath(); g.arc(x, y, ts * 0.028, 0, TAU); g.fill();
      g.fillStyle = '#e8a82a'; g.beginPath(); g.arc(x, y, ts * 0.011, 0, TAU); g.fill();
    }
  }
}

// ---------- roads ----------
function eachPath(m, fn) { for (const p of m.paths) fn(p); }
function strokePaths(g, m, ts, w, style, dash = []) {
  g.lineCap = dash.length ? 'butt' : 'round'; g.lineJoin = 'round';
  g.strokeStyle = style; g.lineWidth = w; g.setLineDash(dash);
  eachPath(m, (p) => { g.beginPath(); p.forEach((pt, i) => (i ? g.lineTo(pt.x * ts, pt.y * ts) : g.moveTo(pt.x * ts, pt.y * ts))); g.stroke(); });
  g.setLineDash([]); g.lineCap = 'butt';
}

export function paintRoads(g, m, ts, B, bi, rnd) {
  const W = m.cols * ts, H = m.rows * ts;
  const curb = CURB[bi] || CURB[0];
  // verge shadow, then curb stones laid end to end
  strokePaths(g, m, ts, ts * 1.1, 'rgba(0,0,0,0.2)');
  strokePaths(g, m, ts, ts * 1.0, shade(curb, -0.4));
  strokePaths(g, m, ts, ts * 1.0, curb, [ts * 0.2, ts * 0.06]);
  strokePaths(g, m, ts, ts * 1.0, shade(curb, 0.15), [ts * 0.06, ts * 0.2]);
  // cobbled bed, built on its own layer so the stones stay inside the road
  const layer = document.createElement('canvas');
  layer.width = g.canvas.width; layer.height = g.canvas.height;
  const L = layer.getContext('2d'), k = g.getTransform().a;
  L.setTransform(k, 0, 0, k, 0, 0);
  strokePaths(L, m, ts, ts * 0.8, shade(B.path, -0.18));
  L.globalCompositeOperation = 'source-atop';
  const tones = [B.path, B.path2, shade(B.path, 0.07), shade(B.path, -0.07), shade(B.path2, 0.05)];
  L.lineWidth = Math.max(1, ts * 0.02);
  eachPath(m, (p) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      for (let row = -2; row <= 2; row++) {
        const off = (row + 5) % 2 ? 0.11 : 0;
        for (let u = -0.1 + off; u < len + 0.1; u += 0.22) {
          const cx = (a.x + ux * u + nx * row * 0.17) * ts + (rnd() - 0.5) * ts * 0.03, cy = (a.y + uy * u + ny * row * 0.17) * ts + (rnd() - 0.5) * ts * 0.03;
          const rw = ts * (0.085 + rnd() * 0.02), rh = ts * (0.07 + rnd() * 0.02);
          L.fillStyle = tones[Math.floor(rnd() * tones.length)];
          L.strokeStyle = 'rgba(60,42,24,0.38)';
          L.beginPath(); L.ellipse(cx, cy, rw, rh, Math.atan2(uy, ux) + (rnd() - 0.5) * 0.4, 0, TAU); L.fill(); L.stroke();
        }
      }
    }
  });
  L.globalCompositeOperation = 'source-over';
  g.drawImage(layer, 0, 0, layer.width / k, layer.height / k);
  // a touch of wear down the middle: two faint wheel ruts
  strokePaths(g, m, ts, ts * 0.06, 'rgba(60,42,24,0.12)', [ts * 0.5, ts * 0.35]);
}

// ---------- the enemy's war camp, behind every spawn ----------
export function paintCamps(g, m, ts, B, bi) {
  for (const sp of m.spawns) {
    const cx = sp.x * ts, cy = sp.y * ts;
    // trampled earth
    g.fillStyle = 'rgba(40,28,20,0.28)'; g.beginPath(); g.ellipse(cx, cy + ts * 0.1, ts * 0.62, ts * 0.34, 0, 0, TAU); g.fill();
    // a tent and a skull banner, set to whichever side has room and open grass
    const cand = [[0.15, -0.95], [0.15, 0.95], [0.95, -0.2], [-0.95, -0.2], [0.95, 0.6], [0.9, -0.7]];
    let pick = null;
    for (const [ox, oy] of cand) {
      const tx = Math.floor(sp.x + ox), ty = Math.floor(sp.y + oy);
      if (tx >= 0 && ty >= 0 && tx < m.cols && ty < m.rows && m.tileAt(tx, ty) === T.GRASS && !m.plotSet?.has(ty * m.cols + tx)) { pick = [ox, oy]; break; }
    }
    if (pick) {
      const tx = cx + pick[0] * ts, ty = cy + pick[1] * ts;
      tent(g, tx, ty, ts, bi);
      banner(g, tx + (pick[0] >= 0 ? ts * 0.42 : -ts * 0.42), ty + ts * 0.08, ts);
    }
    // sharpened stakes either side of the road mouth
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const ox = sp.x < 1 ? ts * (0.05 + i * 0.16) : 0, oy = sp.x < 1 ? sgn * ts * 0.58 : 0;
        const sx = cx + ox + (sp.x < 1 ? 0 : sgn * ts * (0.5 + i * 0.16)), sy = cy + oy + (sp.x < 1 ? 0 : ts * 0.05 + i * ts * 0.02);
        stake(g, sx, sy, ts);
      }
    }
  }
}
function stake(g, x, y, ts) {
  g.fillStyle = '#6b4a2e'; g.strokeStyle = INK; g.lineWidth = ts * 0.03;
  g.beginPath(); g.moveTo(x - ts * 0.04, y + ts * 0.1); g.lineTo(x - ts * 0.04, y - ts * 0.16); g.lineTo(x, y - ts * 0.24); g.lineTo(x + ts * 0.04, y - ts * 0.16); g.lineTo(x + ts * 0.04, y + ts * 0.1); g.closePath(); g.fill(); g.stroke();
}
function tent(g, x, y, ts, bi) {
  const col = ['#5b3a3a', '#7a5a3a', '#4a5a6a', '#3a2a2a', '#3a3350'][bi] || '#5b3a3a';
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x, y + ts * 0.2, ts * 0.42, ts * 0.12, 0, 0, TAU); g.fill();
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = ts * 0.04; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x - ts * 0.4, y + ts * 0.2); g.lineTo(x, y - ts * 0.36); g.lineTo(x + ts * 0.4, y + ts * 0.2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = shade(col, -0.35); g.beginPath(); g.moveTo(x - ts * 0.09, y + ts * 0.2); g.lineTo(x, y - ts * 0.04); g.lineTo(x + ts * 0.09, y + ts * 0.2); g.closePath(); g.fill();
  g.fillStyle = '#b8233a'; g.beginPath(); g.moveTo(x - ts * 0.2, y + ts * 0.0); g.lineTo(x, y - ts * 0.36); g.lineTo(x + ts * 0.02, y - ts * 0.3); g.lineTo(x - ts * 0.12, y + ts * 0.02); g.closePath(); g.fill();
  g.strokeStyle = INK; g.beginPath(); g.moveTo(x, y - ts * 0.36); g.lineTo(x, y - ts * 0.5); g.stroke();
}
function banner(g, x, y, ts) {
  g.strokeStyle = INK; g.lineWidth = ts * 0.04; g.beginPath(); g.moveTo(x, y + ts * 0.18); g.lineTo(x, y - ts * 0.55); g.stroke();
  g.fillStyle = '#2a1a22'; g.beginPath(); g.moveTo(x, y - ts * 0.55); g.lineTo(x + ts * 0.3, y - ts * 0.5); g.lineTo(x + ts * 0.24, y - ts * 0.4); g.lineTo(x + ts * 0.3, y - ts * 0.28); g.lineTo(x, y - ts * 0.3); g.closePath(); g.fill(); g.lineWidth = ts * 0.03; g.stroke();
  g.fillStyle = '#e9e1cf'; g.beginPath(); g.arc(x + ts * 0.11, y - ts * 0.43, ts * 0.05, 0, TAU); g.fill();
  g.fillStyle = '#2a1a22'; for (const dx of [-0.02, 0.02]) { g.beginPath(); g.arc(x + ts * (0.11 + dx), y - ts * 0.44, ts * 0.012, 0, TAU); g.fill(); }
}

// ---------- props ----------
function haystack(g, x, y, ts) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x, y + ts * 0.18, ts * 0.3, ts * 0.09, 0, 0, TAU); g.fill();
  g.fillStyle = '#d9b95a'; g.strokeStyle = INK; g.lineWidth = ts * 0.035; g.beginPath(); g.moveTo(x - ts * 0.26, y + ts * 0.18); g.quadraticCurveTo(x - ts * 0.26, y - ts * 0.2, x, y - ts * 0.24); g.quadraticCurveTo(x + ts * 0.26, y - ts * 0.2, x + ts * 0.26, y + ts * 0.18); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(120,80,20,0.55)'; g.lineWidth = ts * 0.02;
  for (const dx of [-0.12, 0, 0.12]) { g.beginPath(); g.moveTo(x + dx * ts, y - ts * 0.12); g.lineTo(x + dx * ts * 1.3, y + ts * 0.16); g.stroke(); }
}
function barrels(g, x, y, ts) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x, y + ts * 0.18, ts * 0.3, ts * 0.08, 0, 0, TAU); g.fill();
  for (const [dx, dy, k] of [[-0.12, 0.02, 1], [0.14, 0.06, 0.85]]) {
    const bx = x + dx * ts, by = y + dy * ts, w = ts * 0.15 * k, hh = ts * 0.2 * k;
    g.fillStyle = '#8a5a2c'; g.strokeStyle = INK; g.lineWidth = ts * 0.032;
    g.beginPath(); g.moveTo(bx - w * 0.85, by - hh); g.quadraticCurveTo(bx - w * 1.25, by, bx - w * 0.85, by + hh); g.lineTo(bx + w * 0.85, by + hh); g.quadraticCurveTo(bx + w * 1.25, by, bx + w * 0.85, by - hh); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#3a2a1a'; g.lineWidth = ts * 0.028; g.beginPath(); g.moveTo(bx - w * 1.1, by - hh * 0.45); g.lineTo(bx + w * 1.1, by - hh * 0.45); g.moveTo(bx - w * 1.1, by + hh * 0.45); g.lineTo(bx + w * 1.1, by + hh * 0.45); g.stroke();
    g.fillStyle = '#a97a44'; g.beginPath(); g.ellipse(bx, by - hh, w * 0.85, hh * 0.28, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = ts * 0.028; g.stroke();
  }
}
function fence(g, x, y, ts) {
  g.strokeStyle = INK; g.lineWidth = ts * 0.035;
  g.fillStyle = '#9a7449';
  g.fillRect(x - ts * 0.34, y - ts * 0.04, ts * 0.68, ts * 0.05); g.strokeRect(x - ts * 0.34, y - ts * 0.04, ts * 0.68, ts * 0.05);
  g.fillRect(x - ts * 0.34, y + ts * 0.07, ts * 0.68, ts * 0.05); g.strokeRect(x - ts * 0.34, y + ts * 0.07, ts * 0.68, ts * 0.05);
  for (const dx of [-0.3, 0, 0.3]) { g.fillStyle = '#7a5a36'; g.fillRect(x + dx * ts - ts * 0.03, y - ts * 0.14, ts * 0.06, ts * 0.3); g.strokeRect(x + dx * ts - ts * 0.03, y - ts * 0.14, ts * 0.06, ts * 0.3); }
}
function cart(g, x, y, ts) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x, y + ts * 0.2, ts * 0.36, ts * 0.08, 0, 0, TAU); g.fill();
  g.fillStyle = '#8a5a2c'; g.strokeStyle = INK; g.lineWidth = ts * 0.035;
  g.beginPath(); g.moveTo(x - ts * 0.3, y - ts * 0.1); g.lineTo(x + ts * 0.3, y - ts * 0.1); g.lineTo(x + ts * 0.24, y + ts * 0.1); g.lineTo(x - ts * 0.24, y + ts * 0.1); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#d9b95a'; g.beginPath(); g.ellipse(x, y - ts * 0.12, ts * 0.24, ts * 0.08, 0, Math.PI, 0); g.fill(); g.stroke();
  g.fillStyle = '#5b3a1a'; g.beginPath(); g.arc(x - ts * 0.12, y + ts * 0.14, ts * 0.1, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x + ts * 0.3, y); g.lineTo(x + ts * 0.5, y + ts * 0.12); g.stroke();
}
function postBanner(g, x, y, ts, col) {
  g.strokeStyle = INK; g.lineWidth = ts * 0.04; g.beginPath(); g.moveTo(x, y + ts * 0.22); g.lineTo(x, y - ts * 0.36); g.stroke();
  g.fillStyle = col; g.lineWidth = ts * 0.03; g.beginPath(); g.moveTo(x, y - ts * 0.36); g.lineTo(x + ts * 0.22, y - ts * 0.3); g.lineTo(x + ts * 0.17, y - ts * 0.2); g.lineTo(x + ts * 0.22, y - ts * 0.1); g.lineTo(x, y - ts * 0.14); g.closePath(); g.fill(); g.stroke();
}
function gravestone(g, x, y, ts) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x, y + ts * 0.16, ts * 0.2, ts * 0.06, 0, 0, TAU); g.fill();
  g.fillStyle = '#9a9aa8'; g.strokeStyle = INK; g.lineWidth = ts * 0.035;
  g.beginPath(); g.moveTo(x - ts * 0.13, y + ts * 0.16); g.lineTo(x - ts * 0.13, y - ts * 0.06); g.arc(x, y - ts * 0.06, ts * 0.13, Math.PI, 0); g.lineTo(x + ts * 0.13, y + ts * 0.16); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(30,36,51,0.5)'; g.lineWidth = ts * 0.025; g.beginPath(); g.moveTo(x, y - ts * 0.12); g.lineTo(x, y + ts * 0.04); g.moveTo(x - ts * 0.05, y - ts * 0.06); g.lineTo(x + ts * 0.05, y - ts * 0.06); g.stroke();
}
function deadTree(g, x, y, ts) {
  g.strokeStyle = INK; g.lineCap = 'round';
  g.lineWidth = ts * 0.1; g.beginPath(); g.moveTo(x, y + ts * 0.2); g.lineTo(x, y - ts * 0.15); g.stroke();
  g.strokeStyle = '#5a4838'; g.lineWidth = ts * 0.06; g.beginPath(); g.moveTo(x, y + ts * 0.2); g.lineTo(x, y - ts * 0.15); g.moveTo(x, y - ts * 0.05); g.lineTo(x + ts * 0.16, y - ts * 0.24); g.moveTo(x, y - ts * 0.1); g.lineTo(x - ts * 0.15, y - ts * 0.26); g.stroke();
  g.lineCap = 'butt';
}
function crate(g, x, y, ts) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x, y + ts * 0.18, ts * 0.26, ts * 0.07, 0, 0, TAU); g.fill();
  g.fillStyle = '#a97a44'; g.strokeStyle = INK; g.lineWidth = ts * 0.035;
  g.fillRect(x - ts * 0.2, y - ts * 0.06, ts * 0.26, ts * 0.24); g.strokeRect(x - ts * 0.2, y - ts * 0.06, ts * 0.26, ts * 0.24);
  g.fillRect(x + ts * 0.03, y - ts * 0.16, ts * 0.2, ts * 0.2); g.strokeRect(x + ts * 0.03, y - ts * 0.16, ts * 0.2, ts * 0.2);
  g.strokeStyle = 'rgba(30,36,51,0.45)'; g.lineWidth = ts * 0.02; g.beginPath(); g.moveTo(x - ts * 0.2, y - ts * 0.06); g.lineTo(x + ts * 0.06, y + ts * 0.18); g.stroke();
}

const PROPS = [
  [haystack, 3, [0, 1]], [barrels, 3, [0, 1, 2, 3]], [fence, 3, [0, 1, 2]], [cart, 1, [0, 1, 3]], [crate, 2, [0, 1, 2, 3, 4]],
  [(g, x, y, ts) => postBanner(g, x, y, ts, '#b8233a'), 2, [0, 1, 2]], [(g, x, y, ts) => postBanner(g, x, y, ts, '#3a2a3a'), 2, [3, 4]],
  [gravestone, 3, [3, 4]], [deadTree, 3, [1, 3, 4]],
];

export function paintProps(g, m, ts, B, bi, rnd) {
  const cx = m.castle.x, cy = m.castle.y;
  const wide = (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 2.6;
  const bag = [];
  for (const [fn, w, lands] of PROPS) if (lands.includes(bi)) for (let i = 0; i < w; i++) bag.push(fn);
  if (!bag.length) return;
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
    if (m.tileAt(x, y) !== T.GRASS || m.plotSet?.has(y * m.cols + x) || wide(x, y)) continue;
    if (rnd() > 0.055) continue;
    // keep a tile of breathing room from the road so plots and traps read clearly
    let nearRoad = false;
    for (let dy = -1; dy <= 1 && !nearRoad; dy++) for (let dx = -1; dx <= 1; dx++) if (m.tileAt(x + dx, y + dy) === T.PATH) { nearRoad = true; break; }
    if (nearRoad && rnd() < 0.7) continue;
    const fn = bag[Math.floor(rnd() * bag.length)];
    fn(g, (x + 0.5 + (rnd() - 0.5) * 0.3) * ts, (y + 0.55 + (rnd() - 0.5) * 0.2) * ts, ts);
  }
}

// ---------- trees ----------
export function drawTreeV2(g, cx, cy, ts, bi, r) {
  const k = 0.85 + r * 0.3;
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(cx + ts * 0.05, cy + ts * 0.3, ts * 0.34 * k, ts * 0.12, 0, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = ts * 0.04; g.lineJoin = 'round';
  if (bi === 1) {            // cactus
    g.fillStyle = '#5f9a3a'; roundRect(g, cx - ts * 0.1, cy - ts * 0.35, ts * 0.2, ts * 0.6, ts * 0.1); g.fill(); g.stroke();
    roundRect(g, cx + ts * 0.08, cy - ts * 0.15, ts * 0.16, ts * 0.08, ts * 0.04); g.fill(); g.stroke();
    return;
  }
  const pine = bi === 2 || bi === 4 || (bi === 0 && r > 0.55);
  g.fillStyle = '#6b4526'; g.fillRect(cx - ts * 0.05, cy + ts * 0.02, ts * 0.1, ts * 0.28); g.strokeRect(cx - ts * 0.05, cy + ts * 0.02, ts * 0.1, ts * 0.28);
  if (pine) {
    const col = bi === 2 ? '#3f7a5a' : bi === 4 ? '#4a3d6b' : '#2f6b3a', hi = bi === 2 ? '#5f9a7a' : bi === 4 ? '#6a5a8f' : '#438a4c';
    for (let i = 0; i < 3; i++) {
      const w = ts * (0.36 - i * 0.08) * k, yy = cy - ts * (0.0 + i * 0.17) * k;
      g.fillStyle = col; g.beginPath(); g.moveTo(cx - w, yy + ts * 0.1); g.lineTo(cx, yy - ts * 0.24); g.lineTo(cx + w, yy + ts * 0.1); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = hi; g.beginPath(); g.moveTo(cx - w * 0.7, yy + ts * 0.06); g.lineTo(cx - ts * 0.01, yy - ts * 0.2); g.lineTo(cx - w * 0.2, yy + ts * 0.06); g.closePath(); g.fill();
    }
    if (bi === 2) { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx - ts * 0.12, cy - ts * 0.32); g.lineTo(cx, cy - ts * 0.5); g.lineTo(cx + ts * 0.12, cy - ts * 0.32); g.fill(); }
    return;
  }
  const leaf = ['#4f8f3a', '#4f8f3a', '#e8f3f8', '#5a4a48', '#4a3d6b'][bi] || '#4f8f3a';
  const leaf2 = ['#68a84a', '#68a84a', '#ffffff', '#7a6a62', '#6a5a8f'][bi] || '#68a84a';
  // broad oak crown from three overlapping lobes
  g.fillStyle = leaf;
  for (const [dx, dy, rr] of [[-0.16, -0.06, 0.2], [0.16, -0.06, 0.2], [0, -0.2, 0.24]]) { g.beginPath(); g.arc(cx + dx * ts * k, cy + dy * ts * k, rr * ts * k, 0, TAU); g.fill(); g.stroke(); }
  g.beginPath(); g.arc(cx - ts * 0.16 * k, cy - ts * 0.06 * k, 0.17 * ts * k, 0, TAU); g.arc(cx + ts * 0.16 * k, cy - ts * 0.06 * k, 0.17 * ts * k, 0, TAU); g.arc(cx, cy - ts * 0.2 * k, 0.21 * ts * k, 0, TAU); g.fill();
  g.fillStyle = leaf2; g.beginPath(); g.arc(cx - ts * 0.08, cy - ts * 0.26 * k, ts * 0.12 * k, 0, TAU); g.fill();
  g.beginPath(); g.arc(cx - ts * 0.2 * k, cy - ts * 0.1 * k, ts * 0.07 * k, 0, TAU); g.fill();
}
