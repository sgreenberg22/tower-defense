// The Map of Aldermere, painted in code: parchment, coastlines with ripple lines, ink borders, terrain glyphs, labels,
// a compass rose and a cartouche. The static map is painted once and cached; the live layer (who holds what, the front
// line, the contested province, hover and selection) is redrawn over it.
import { PROVINCES, MAP_W as W, MAP_H as H, TERRAINS, MAX_PROVINCES, clampHeld, frontier } from '../game/realmmap.js';
import { mulberry32, hashStr } from '../core/rng.js';

const S = 2;                     // backing-store scale of the painted layers
const INK = '#4a3420', INK_SOFT = 'rgba(74,52,32,0.55)';
const REALM_BLUE = '#2f5d9a', HORDE = '#7a1f24', FRONT = '#b3262e';

// ---------- geometry (Voronoi provinces on a warped plane, a coast that hugs the outer ring) ----------
function valueNoise(seed, cell) {
  const rnd = mulberry32(hashStr(seed));
  const side = Math.max(W, H), gw = Math.ceil(side / cell) + 3, gh = gw;   // square, so (y, x) lookups stay in range
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

let GEO = null;
export function geometry() {
  if (GEO) return GEO;
  const n1 = valueNoise('warp-x', 85), n2 = valueNoise('warp-y', 85), n3 = valueNoise('coast', 38), n4 = valueNoise('fine', 11);
  const N = PROVINCES.length, sx = new Float32Array(N), sy = new Float32Array(N), reach = new Float32Array(N);
  PROVINCES.forEach((p, i) => { sx[i] = p.x; sy[i] = p.y; reach[i] = p.ring <= 2 ? 1e9 : p.ring === 3 ? 118 : 88; });
  const cell = new Int8Array(W * H), fine = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const wx = x + (n1(x, y) - 0.5) * 70 + (n3(x, y) - 0.5) * 14, wy = y + (n2(x, y) - 0.5) * 70 + (n3(y, x) - 0.5) * 14;
    let best = 0, bd = Infinity;
    for (let k = 0; k < N; k++) { const dx = wx - sx[k], dy = wy - sy[k], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
    const edgeFade = Math.min(x, y, W - 1 - x, H - 1 - y);
    const land = Math.sqrt(bd) < reach[best] + (n3(x, y) - 0.5) * 46 && edgeFade > 26;
    cell[i] = land ? best : -1;
    fine[i] = n4(x, y);
  }
  // Distance from the coast, for the sea's ripple lines (two-pass chamfer, capped).
  const dist = new Uint8Array(W * H).fill(255);
  for (let i = 0; i < W * H; i++) if (cell[i] >= 0) dist[i] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!dist[i]) continue; let d = dist[i]; if (x) d = Math.min(d, dist[i - 1] + 1); if (y) d = Math.min(d, dist[i - W] + 1); dist[i] = d; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!dist[i]) continue; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) d = Math.min(d, dist[i + W] + 1); dist[i] = d; }
  // Per-province facts: area, centroid, outline pixels, interior samples for glyphs.
  const cells = PROVINCES.map(() => ({ n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: 0, y1: 0, outline: [], inner: [] }));
  const rnd = mulberry32(hashStr('samples'));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, c = cell[i];
    if (c < 0) continue;
    const C = cells[c];
    C.n++; C.sx += x; C.sy += y; if (x < C.x0) C.x0 = x; if (y < C.y0) C.y0 = y; if (x > C.x1) C.x1 = x; if (y > C.y1) C.y1 = y;
    if (cell[i - 1] !== c || cell[i + 1] !== c || cell[i - W] !== c || cell[i + W] !== c) C.outline.push(x, y);
    else if (rnd() < 0.012 && cell[i - 6] === c && cell[i + 6] === c && cell[i - 6 * W] === c && cell[i + 6 * W] === c) C.inner.push(x, y);
  }
  cells.forEach((C, k) => {
    const p = PROVINCES[k];
    const cx = Math.round(C.sx / Math.max(1, C.n)), cy = Math.round(C.sy / Math.max(1, C.n));
    // Labels sit on the centroid when it is inside the province, otherwise on its seed point.
    C.lx = cell[cy * W + cx] === k ? cx : p.x; C.ly = cell[cy * W + cx] === k ? cy : p.y;
  });
  GEO = { cell, dist, fine, cells };
  return GEO;
}

export function provinceAt(x, y) {
  const g = geometry(), xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
  const c = g.cell[yi * W + xi];
  return c >= 0 ? PROVINCES[c] : null;
}

// ---------- the static painting ----------
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
let BASE = null;
export function basePainting() {
  if (BASE) return BASE;
  const g = geometry();
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d'), img = tctx.createImageData(W, H), d = img.data;
  const wash = PROVINCES.map((p, k) => { const c = hex(TERRAINS[p.terrain].wash), v = 0.93 + (mulberry32(k + 7)() * 0.12); return c.map((x) => Math.min(255, x * v)); });
  const SEA = hex('#9dbbb4'), SHALLOW = hex('#bcd3c8'), RIPPLE = hex('#6f908d'), BORDER = hex('#6a4a2c'), COAST = hex('#3b2a1a');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, c = g.cell[i], f = g.fine[i];
    let r, gg, b;
    if (c < 0) {
      const t = Math.min(1, g.dist[i] / 34);
      [r, gg, b] = SHALLOW.map((v, j) => v + (SEA[j] - v) * t);
      const dd = g.dist[i];
      if (dd === 5 || dd === 11 || dd === 19) [r, gg, b] = [r, gg, b].map((v, j) => v * 0.55 + RIPPLE[j] * 0.45);
    } else {
      [r, gg, b] = wash[c];
      const n = (x > 0 && g.cell[i - 1] !== c) || (y > 0 && g.cell[i - W] !== c);
      const coast = g.cell[i - 1] < 0 || g.cell[i + 1] < 0 || g.cell[i - W] < 0 || g.cell[i + W] < 0;
      if (coast) [r, gg, b] = COAST;
      else if (n) [r, gg, b] = [r, gg, b].map((v, j) => v * 0.35 + BORDER[j] * 0.65);
    }
    const grain = 0.92 + f * 0.14;
    d[o] = r * grain; d[o + 1] = gg * grain; d[o + 2] = b * grain; d[o + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, W * S, H * S);
  ctx.scale(S, S);
  // Aged paper: vignette and a few stains.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(120,80,40,0)'); vg.addColorStop(1, 'rgba(92,58,26,0.42)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(hashStr('paper'));
  for (let i = 0; i < 7; i++) { const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 60; const st = ctx.createRadialGradient(x, y, 0, x, y, r); st.addColorStop(0, 'rgba(120,80,30,0.08)'); st.addColorStop(1, 'rgba(120,80,30,0)'); ctx.fillStyle = st; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  seaMarks(ctx, g, rnd);
  for (let k = 0; k < PROVINCES.length; k++) glyphs(ctx, k, g.cells[k]);
  compass(ctx, 92, H - 96);
  cartouche(ctx);
  frame(ctx);
  BASE = cv;
  return cv;
}

function seaMarks(ctx, g, rnd) {
  ctx.strokeStyle = 'rgba(60,90,90,0.55)'; ctx.lineWidth = 1;
  for (let t = 0; t < 900; t++) {
    const x = 30 + rnd() * (W - 60), y = 30 + rnd() * (H - 60), i = Math.floor(y) * W + Math.floor(x);
    if (g.cell[i] >= 0 || g.dist[i] < 16 || (x < 200 && y > H - 210) || (x < 330 && y < 110)) continue;
    if (rnd() > 0.12) continue;
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x - 3, y - 3, x, y); ctx.quadraticCurveTo(x + 3, y - 3, x + 6, y); ctx.stroke();
  }
  // A ship off the western shore and a sea serpent in the east, where there is open water.
  const spot = (x0, x1, y0, y1) => { for (let t = 0; t < 400; t++) { const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); if (g.dist[Math.floor(y) * W + Math.floor(x)] > 24 && g.dist[Math.floor(y) * W + Math.floor(x)] < 255) return { x, y }; } return null; };
  const s = spot(30, 160, 200, 520); if (s) ship(ctx, s.x, s.y);
  const z = spot(W - 170, W - 40, 420, H - 60); if (z) serpent(ctx, z.x, z.y);
}

function ship(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.fillStyle = '#8a5a32';
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(9, 7); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke();
  ctx.fillStyle = '#f3e7c9'; ctx.beginPath(); ctx.moveTo(1, -21); ctx.quadraticCurveTo(13, -12, 1, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = FRONT; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(7, -20); ctx.lineTo(0, -18); ctx.fill();
  ctx.restore();
}
function serpent(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.fillStyle = '#5f8a6a';
  for (const [dx, r] of [[-26, 6], [-10, 8], [6, 7]]) { ctx.beginPath(); ctx.arc(dx, 0, r, Math.PI, 0); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.quadraticCurveTo(20, -14, 26, -12); ctx.lineTo(31, -9); ctx.lineTo(25, -7); ctx.quadraticCurveTo(22, -6, 20, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(25, -10, 1, 0, 7); ctx.fill();
  ctx.restore();
}

// ---------- terrain glyphs ----------
function glyphs(ctx, k, C) {
  const p = PROVINCES[k];
  const rnd = mulberry32(hashStr('glyph' + k));
  const pts = [];
  for (let i = 0; i + 1 < C.inner.length; i += 2) pts.push([C.inner[i], C.inner[i + 1]]);
  const want = Math.max(2, Math.min(10, Math.round(C.n / 1600)));
  const placed = [];
  for (let t = 0; t < pts.length * 3 && placed.length < want; t++) {
    const [x, y] = pts[Math.floor(rnd() * pts.length)];
    if (Math.abs(x - C.lx) < 46 && Math.abs(y - C.ly) < 20) continue;     // keep the label clear
    if (Math.hypot(x - p.x, y - p.y) < 20) continue;                      // and the banner
    if (placed.some(([a, b]) => Math.hypot(a - x, b - y) < 21)) continue;
    placed.push([x, y]);
  }
  placed.sort((a, b) => a[1] - b[1]);
  ctx.lineWidth = 1.1; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [x, y] of placed) {
    const r = rnd();
    switch (p.terrain) {
      case 'forest': r < 0.75 ? trees(ctx, x, y, rnd) : hill(ctx, x, y); break;
      case 'coast': r < 0.2 ? lighthouse(ctx, x, y) : r < 0.6 ? trees(ctx, x, y, rnd) : grass(ctx, x, y); break;
      case 'hills': r < 0.6 ? hill(ctx, x, y) : mountain(ctx, x, y, false); break;
      case 'frost': r < 0.65 ? mountain(ctx, x, y, true) : pines(ctx, x, y); break;
      case 'ash': r < 0.3 ? volcano(ctx, x, y) : r < 0.75 ? mountain(ctx, x, y, false, '#6b5148') : crags(ctx, x, y); break;
      case 'dunes': r < 0.2 ? palm(ctx, x, y) : dunes(ctx, x, y); break;
      case 'fen': r < 0.6 ? reeds(ctx, x, y) : deadTree(ctx, x, y); break;
      default: r < 0.25 && !p.capital ? windmill(ctx, x, y) : r < 0.7 ? field(ctx, x, y, rnd) : trees(ctx, x, y, rnd);
    }
  }
}
function trees(ctx, x, y, rnd) {
  for (const [dx, dy] of [[-5, 1], [4, -1], [0, 4]]) {
    const tx = x + dx + (rnd() - 0.5) * 2, ty = y + dy;
    ctx.beginPath(); ctx.moveTo(tx, ty + 2); ctx.lineTo(tx, ty + 6); ctx.stroke();
    ctx.fillStyle = '#6f8f4e'; ctx.beginPath(); ctx.arc(tx, ty - 1, 4.2, 0, 7); ctx.fill(); ctx.stroke();
  }
}
function pines(ctx, x, y) {
  for (const dx of [-5, 3]) {
    ctx.fillStyle = '#4f6e55'; ctx.beginPath(); ctx.moveTo(x + dx, y - 9); ctx.lineTo(x + dx + 5, y + 3); ctx.lineTo(x + dx - 5, y + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function hill(ctx, x, y) {
  ctx.fillStyle = 'rgba(160,130,90,0.55)'; ctx.beginPath(); ctx.moveTo(x - 10, y + 4); ctx.quadraticCurveTo(x, y - 9, x + 10, y + 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(x + 2 + i * 2.5, y - 2 + i * 1.5); ctx.lineTo(x + 1 + i * 2.5, y + 3); } ctx.stroke();
}
function mountain(ctx, x, y, snow, fill = '#a79579') {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x - 11, y + 5); ctx.lineTo(x - 1, y - 11); ctx.lineTo(x + 11, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(60,40,25,0.35)'; ctx.beginPath(); ctx.moveTo(x - 1, y - 11); ctx.lineTo(x + 11, y + 5); ctx.lineTo(x + 2, y + 5); ctx.closePath(); ctx.fill();
  if (snow) { ctx.fillStyle = '#fbfbf5'; ctx.beginPath(); ctx.moveTo(x - 1, y - 11); ctx.lineTo(x - 5.5, y - 4); ctx.lineTo(x - 2, y - 5.5); ctx.lineTo(x + 1, y - 3.5); ctx.lineTo(x + 3.6, y - 5.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
}
function crags(ctx, x, y) { ctx.fillStyle = '#5a4640'; ctx.beginPath(); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 4, y - 5); ctx.lineTo(x, y + 1); ctx.lineTo(x + 3, y - 8); ctx.lineTo(x + 8, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
function volcano(ctx, x, y) {
  ctx.fillStyle = '#5c4038'; ctx.beginPath(); ctx.moveTo(x - 12, y + 6); ctx.lineTo(x - 4, y - 8); ctx.lineTo(x + 4, y - 8); ctx.lineTo(x + 12, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#d9532c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 2, y - 1); ctx.lineTo(x + 1, y + 5); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.fillStyle = 'rgba(110,100,95,0.65)';
  for (const [dx, dy, r] of [[1, -12, 3], [4, -16, 4], [1, -21, 4.5]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); }
}
function dunes(ctx, x, y) {
  ctx.strokeStyle = '#8a6a32';
  for (const dy of [-3, 3]) { ctx.beginPath(); ctx.moveTo(x - 11, y + dy); ctx.quadraticCurveTo(x - 4, y + dy - 6, x + 2, y + dy); ctx.quadraticCurveTo(x + 6, y + dy + 2, x + 11, y + dy - 1); ctx.stroke(); }
  ctx.strokeStyle = INK;
}
function palm(ctx, x, y) {
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x + 2, y - 2, x, y - 8); ctx.stroke();
  ctx.strokeStyle = '#4f7a3a'; ctx.lineWidth = 1.6;
  for (const a of [-2.6, -1.9, -1.2, -0.5]) { ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.quadraticCurveTo(x + Math.cos(a) * 5, y - 8 + Math.sin(a) * 5 - 2, x + Math.cos(a) * 8, y - 8 + Math.sin(a) * 3 + 3); ctx.stroke(); }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
}
function reeds(ctx, x, y) {
  ctx.strokeStyle = '#3f5a58'; ctx.beginPath(); ctx.moveTo(x - 9, y + 5); ctx.quadraticCurveTo(x - 4, y + 3, x, y + 5); ctx.quadraticCurveTo(x + 4, y + 7, x + 9, y + 5); ctx.stroke();
  ctx.strokeStyle = '#4b5a33';
  for (const dx of [-4, -1, 2, 5]) { ctx.beginPath(); ctx.moveTo(x + dx, y + 4); ctx.lineTo(x + dx + (dx % 2), y - 5 - Math.abs(dx)); ctx.stroke(); }
  ctx.strokeStyle = INK;
}
function deadTree(ctx, x, y) {
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 6); ctx.moveTo(x, y - 2); ctx.lineTo(x - 5, y - 7); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y - 9); ctx.moveTo(x + 2, y - 7); ctx.lineTo(x + 6, y - 6); ctx.stroke();
}
function grass(ctx, x, y) { ctx.beginPath(); for (const dx of [-6, -2, 2, 6]) { ctx.moveTo(x + dx, y + 3); ctx.lineTo(x + dx + 1, y - 2); } ctx.stroke(); }
function field(ctx, x, y, rnd) {
  ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.6);
  ctx.fillStyle = rnd() < 0.5 ? 'rgba(214,180,90,0.5)' : 'rgba(150,170,80,0.45)'; ctx.fillRect(-9, -5, 18, 10); ctx.strokeRect(-9, -5, 18, 10);
  ctx.beginPath(); for (let i = -6; i <= 6; i += 3) { ctx.moveTo(i, -5); ctx.lineTo(i, 5); } ctx.strokeStyle = INK_SOFT; ctx.stroke();
  ctx.restore(); ctx.strokeStyle = INK;
}
function windmill(ctx, x, y) {
  ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(x - 4, y + 6); ctx.lineTo(x - 2.5, y - 4); ctx.lineTo(x + 2.5, y - 4); ctx.lineTo(x + 4, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 7, y - 11); ctx.lineTo(x + 7, y + 3); ctx.moveTo(x + 7, y - 11); ctx.lineTo(x - 7, y + 3); ctx.stroke();
}
function lighthouse(ctx, x, y) {
  ctx.fillStyle = '#f3ead2'; ctx.beginPath(); ctx.moveTo(x - 3.5, y + 6); ctx.lineTo(x - 2, y - 7); ctx.lineTo(x + 2, y - 7); ctx.lineTo(x + 3.5, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = FRONT; ctx.fillRect(x - 2.5, y - 2, 5, 2.5); ctx.fillStyle = '#ffd25e'; ctx.beginPath(); ctx.arc(x, y - 9, 2.2, 0, 7); ctx.fill(); ctx.stroke();
}

function compass(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.stroke();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r0 = i % 2 ? 34 : 30; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); ctx.stroke(); }
  const point = (a, len, w, dark) => {
    const c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    for (const side of [1, -1]) {
      ctx.fillStyle = (side === 1) === dark ? '#3b2a1a' : '#efe1bf';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(c * len, s * len); ctx.lineTo(px * w * side, py * w * side); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  };
  for (let i = 0; i < 4; i++) point(i * Math.PI / 2 + Math.PI / 4, 24, 5, false);
  for (let i = 0; i < 4; i++) point(i * Math.PI / 2 - Math.PI / 2, 44, 7, true);
  ctx.fillStyle = FRONT; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '800 15px "Grenze Gotisch", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -54);
  ctx.restore();
}

function cartouche(ctx) {
  const x = 36, y = 26, w = 270, hgt = 62;
  ctx.save();
  ctx.fillStyle = '#efe0b9'; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + w - 14, y); ctx.quadraticCurveTo(x + w, y + hgt / 2, x + w - 14, y + hgt); ctx.lineTo(x + 14, y + hgt); ctx.quadraticCurveTo(x, y + hgt / 2, x + 14, y); ctx.closePath();
  ctx.shadowColor = 'rgba(60,40,20,0.35)'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 22, y + 6); ctx.lineTo(x + w - 22, y + 6); ctx.moveTo(x + 22, y + hgt - 6); ctx.lineTo(x + w - 22, y + hgt - 6); ctx.strokeStyle = INK_SOFT; ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 27px "Grenze Gotisch", Georgia, serif'; ctx.fillText('The Realm of Aldermere', x + w / 2, y + hgt / 2 - 5);
  ctx.font = 'italic 11px Georgia, serif'; ctx.fillText('as surveyed by the Royal Cartographers', x + w / 2, y + hgt / 2 + 17);
  ctx.restore();
}
function frame(ctx) {
  ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(8, 8, W - 16, H - 16); ctx.lineWidth = 1; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = INK; for (const [x, y] of [[11, 11], [W - 11, 11], [11, H - 11], [W - 11, H - 11]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
  ctx.restore();
}

// ---------- the live layer ----------
const fogCache = new Map();
function fogLayer(held) {
  if (fogCache.has(held)) return fogCache.get(held);
  const g = geometry();
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d'), img = tctx.createImageData(W, H), d = img.data;
  const fr = hex(FRONT);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, c = g.cell[i];
    if (c < 0) continue;
    const o = i * 4;
    if (c >= held) { d[o] = 40; d[o + 1] = 28; d[o + 2] = 24; d[o + 3] = 112; continue; }
    // The front line: held land that touches horde land within two pixels.
    let front = false;
    for (let dy = -2; dy <= 2 && !front; dy++) for (let dx = -2; dx <= 2; dx++) { const n = g.cell[i + dy * W + dx]; if (n >= held) { front = true; break; } }
    if (front) { d[o] = fr[0]; d[o + 1] = fr[1]; d[o + 2] = fr[2]; d[o + 3] = 215; }
  }
  tctx.putImageData(img, 0, 0);
  // Hatching over horde land only.
  const hatch = document.createElement('canvas'); hatch.width = W * S; hatch.height = H * S;
  const hc = hatch.getContext('2d');
  hc.drawImage(tmp, 0, 0, W * S, H * S);
  const lines = document.createElement('canvas'); lines.width = W * S; lines.height = H * S;
  const lc = lines.getContext('2d');
  lc.strokeStyle = 'rgba(40,24,18,0.38)'; lc.lineWidth = 1.2;
  lc.beginPath(); for (let k = -H * S; k < W * S; k += 9) { lc.moveTo(k, 0); lc.lineTo(k + H * S, H * S); } lc.stroke();
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  const mctx = mask.getContext('2d'), mimg = mctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) if (g.cell[i] >= held) mimg.data[i * 4 + 3] = 255;
  mctx.putImageData(mimg, 0, 0);
  lc.globalCompositeOperation = 'destination-in'; lc.drawImage(mask, 0, 0, W * S, H * S);
  hc.drawImage(lines, 0, 0);
  if (fogCache.size > 6) fogCache.delete(fogCache.keys().next().value);
  fogCache.set(held, hatch);
  return hatch;
}

const outlineCache = new Map();
function outline(k) {
  if (outlineCache.has(k)) return outlineCache.get(k);
  const C = geometry().cells[k];
  const cv = document.createElement('canvas'); cv.width = (C.x1 - C.x0 + 3) * S; cv.height = (C.y1 - C.y0 + 3) * S;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff';
  for (let i = 0; i < C.outline.length; i += 2) ctx.fillRect((C.outline[i] - C.x0) * S, (C.outline[i + 1] - C.y0) * S, S * 1.6, S * 1.6);
  const out = { cv, x: C.x0 - 0.3, y: C.y0 - 0.3 };
  outlineCache.set(k, out);
  return out;
}
function tinted(k, color) {
  const o = outline(k), key = k + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const cv = document.createElement('canvas'); cv.width = o.cv.width; cv.height = o.cv.height;
  const ctx = cv.getContext('2d'); ctx.drawImage(o.cv, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, cv.width, cv.height);
  const t = { cv, x: o.x, y: o.y }; outlineCache.set(key, t); return t;
}

function banner(ctx, x, y, held, capital) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  if (capital) {
    ctx.fillStyle = '#e9dcc0';
    ctx.fillRect(-13, -12, 26, 16); ctx.strokeRect(-13, -12, 26, 16);
    for (const tx of [-13, 7]) { ctx.fillRect(tx, -22, 6, 26); ctx.strokeRect(tx, -22, 6, 26); }
    ctx.fillRect(-4, -26, 8, 30); ctx.strokeRect(-4, -26, 8, 30);
    ctx.fillStyle = INK; ctx.fillRect(-2, -4, 4, 8);
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, -38); ctx.stroke();
    ctx.fillStyle = REALM_BLUE; ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(13, -35); ctx.lineTo(0, -31); ctx.fill(); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -18); ctx.stroke();
  if (held) {
    ctx.fillStyle = REALM_BLUE; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(12, -18); ctx.lineTo(12, -8); ctx.lineTo(6, -11); ctx.lineTo(0, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(6, -14.5, 2, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = HORDE; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(11, -17); ctx.lineTo(9, -13); ctx.lineTo(12, -9); ctx.lineTo(0, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(5.5, -14, 2.2, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function swords(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round';
  for (const dir of [1, -1]) {
    ctx.save(); ctx.rotate(dir * Math.PI / 4);
    ctx.strokeStyle = '#2a1d12'; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 9); ctx.stroke();
    ctx.strokeStyle = '#f2ead6'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 6); ctx.stroke();
    ctx.strokeStyle = '#c98a1b'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.moveTo(0, 6); ctx.lineTo(0, 11); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function label(ctx, text, x, y, size, bold, color = INK) {
  ctx.font = `${bold ? '800' : 'italic 600'} ${size}px ${bold ? '"Grenze Gotisch", ' : ''}Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(241,228,195,0.88)'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// ---------- the widget ----------
// opts: { held, onSelect(province), selected (id), flash: {gained:[idx], lost:[idx]} }
export function mapWidget(opts) {
  const cv = document.createElement('canvas');
  cv.className = 'realm-map';
  cv.setAttribute('role', 'img');
  const state = { held: clampHeld(opts.held), hover: -1, sel: opts.selected ?? -1, t0: performance.now(), flash: opts.flash || null, raf: 0 };
  cv.setAttribute('aria-label', `Map of the Realm: ${state.held} of ${MAX_PROVINCES} provinces held`);
  const g = geometry();
  const fit = () => {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round((r.width || 900) * dpr));
    if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * H / W); }
  };
  const toMap = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  cv.addEventListener('pointermove', (e) => { const p = provinceAt(toMap(e).x, toMap(e).y); state.hover = p ? p.idx : -1; cv.style.cursor = p ? 'pointer' : 'default'; });
  cv.addEventListener('pointerleave', () => { state.hover = -1; });
  cv.addEventListener('click', (e) => { const m = toMap(e), p = provinceAt(m.x, m.y); if (p) { state.sel = p.idx; opts.onSelect?.(p); } });
  const draw = (now) => {
    if (!cv.isConnected) { if (now - state.t0 > 3000) return; }   // not mounted yet: keep trying briefly
    fit();
    const ctx = cv.getContext('2d'), k = cv.width / W;
    const t = (now - state.t0) / 1000, held = state.held, f = frontier(held);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(basePainting(), 0, 0, cv.width, cv.height);
    ctx.drawImage(fogLayer(held), 0, 0, cv.width, cv.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const blit = (o, alpha) => { ctx.globalAlpha = alpha; ctx.drawImage(o.cv, o.x, o.y, o.cv.width / S, o.cv.height / S); ctx.globalAlpha = 1; };
    // Recent changes glow for a few seconds when you open the map.
    if (state.flash && t < 6) {
      const a = 0.5 + 0.5 * Math.sin(t * 5);
      for (const i of state.flash.gained || []) blit(tinted(i, '#ffd666'), a * (1 - t / 6) + 0.15);
      for (const i of state.flash.lost || []) blit(tinted(i, '#ff4d4d'), a * (1 - t / 6) + 0.15);
    }
    if (f.next) blit(tinted(f.next.idx, '#ff5a3c'), 0.45 + 0.4 * Math.sin(t * 3.2));
    if (state.hover >= 0 && state.hover !== state.sel) blit(tinted(state.hover, '#fff6d8'), 0.85);
    if (state.sel >= 0) { blit(tinted(state.sel, '#2a1d12'), 1); blit(tinted(state.sel, '#f2b33d'), 0.95); }
    // Banners, then names.
    for (const p of PROVINCES) banner(ctx, p.x, p.y, p.idx < held, p.capital);
    if (f.next) swords(ctx, f.next.x, f.next.y - 30, 1 + 0.06 * Math.sin(t * 3.2));
    for (const p of PROVINCES) {
      const C = g.cells[p.idx];
      if (p.capital) label(ctx, 'Aldermere', p.x, p.y + 17, 21, true);
      else label(ctx, p.name, C.lx, C.ly + (Math.abs(C.ly - p.y) < 14 && Math.abs(C.lx - p.x) < 40 ? 18 : 0), 12.5, false, p.idx < held ? INK : '#3a2420');
    }
    if (f.next) label(ctx, 'CONTESTED', f.next.x, f.next.y - 50, 11, true, FRONT);
    // Hover tag on desktop.
    if (state.hover >= 0) {
      const p = PROVINCES[state.hover];
      const tag = `${p.name} · ${p.idx < held ? 'Held' : p.idx === held ? 'Contested' : 'Horde land'}`;
      ctx.font = '600 13px Georgia, serif'; const tw = ctx.measureText(tag).width + 16;
      const tx = Math.min(W - tw - 20, Math.max(20, p.x - tw / 2)), ty = Math.max(24, p.y - 66);
      ctx.fillStyle = 'rgba(42,29,18,0.9)'; ctx.fillRect(tx, ty, tw, 22); ctx.fillStyle = '#f7eedb'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tag, tx + 8, ty + 11);
    }
    state.raf = requestAnimationFrame(draw);
  };
  state.raf = requestAnimationFrame(draw);
  return {
    el: cv,
    select(idx) { state.sel = idx; },
    setHeld(n) { state.held = clampHeld(n); },
    destroy() { cancelAnimationFrame(state.raf); },
  };
}

// A small still picture of the map for the home screen.
export function mapThumb(held, width = 150) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(width * dpr); cv.height = Math.round(width * dpr * H / W);
  cv.style.width = width + 'px'; cv.style.height = Math.round(width * H / W) + 'px';
  cv.className = 'realm-thumb';
  const paint = () => {
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(basePainting(), 0, 0, cv.width, cv.height);
    ctx.drawImage(fogLayer(clampHeld(held)), 0, 0, cv.width, cv.height);
    const f = frontier(held);
    if (f.next) { const k = cv.width / W; ctx.fillStyle = FRONT; ctx.beginPath(); ctx.arc(f.next.x * k, f.next.y * k, 4 * dpr, 0, 7); ctx.fill(); }
  };
  // The first paint builds the map (a moment of work), so let the page show first.
  if (BASE) paint(); else setTimeout(paint, 60);
  return cv;
}
