// Map definitions + seeded procedural generator. Landscape grid is 16×10; portrait play transposes it.
import { Rng, seedFor } from '../core/rng.js';
import { PLOTS } from '../data/balance.js';

export const T = { GRASS: 0, PATH: 1, ROCK: 2, WATER: 3, HIGH: 4, CASTLE: 5, TREE: 6 };
export const COLS = 16, ROWS = 10;

export const MAPS = {
  meadow: {
    name: 'Meadow Pass', desc: 'One winding road. A good place to learn.', unlock: null,
    paths: [[[0, 2], [4, 2], [4, 7], [9, 7], [9, 2], [13, 2], [13, 6], [15, 6]]],
    high: [[2, 4], [6, 4], [7, 4], [11, 4], [11, 5], [6, 9]],
    rocks: [[1, 8], [15, 0], [0, 9], [7, 0]],
    water: [[15, 9], [14, 9], [15, 8]],
  },
  wilds: {
    name: 'The Wilds', desc: 'A new open moor every run. The keep stands at the far end; the foes cross wherever the ground lets them. No roads, only scattered high ground to build on, and you learn the trails by watching.', unlock: { wave: 20, label: 'Reach wave 20 on any map' }, procedural: true,
    paths: [[[0, 5], [15, 5]]],
  },
  twin: {
    name: 'Twin Rivers', desc: 'Two roads converge on the bridge.', unlock: { wave: 15, label: 'Reach wave 15 on any map' },
    paths: [
      [[0, 1], [5, 1], [5, 4], [8, 4], [8, 5], [12, 5], [12, 7], [15, 7]],
      [[0, 8], [3, 8], [3, 6], [8, 6], [8, 5], [12, 5], [12, 7], [15, 7]],
    ],
    high: [[2, 3], [6, 2], [10, 3], [10, 7], [14, 5], [6, 8]],
    rocks: [[0, 4], [15, 0], [11, 9]],
    water: [[10, 0], [10, 1], [11, 0], [9, 9], [10, 9], [9, 8]],
  },
  cross: {
    name: 'Crossroads Keep', desc: 'Three fronts. Spread thin or fall.', unlock: { wave: 25, label: 'Reach wave 25 on any map' },
    paths: [
      [[0, 7], [3, 7], [3, 5], [7, 5], [9, 5], [9, 8], [13, 8], [13, 5], [15, 5]],
      [[7, 0], [7, 5], [9, 5], [9, 8], [13, 8], [13, 5], [15, 5]],
      [[11, 0], [11, 2], [13, 2], [13, 5], [15, 5]],
    ],
    high: [[5, 3], [5, 7], [11, 6], [15, 3], [1, 5]],
    rocks: [[0, 0], [15, 9], [4, 0]],
    water: [[0, 9], [1, 9], [6, 9]],
  },
  frontier: {
    name: 'The Frontier', desc: 'A new road every run, drawn by the dice.', unlock: { wave: 10, label: 'Reach wave 10 on any map' }, procedural: true,
  },
  // ---- v1.8 · The Wild Marches
  coil: {
    name: "Serpent's Coil", desc: 'The road coils around the keep. Towers inside see every loop, but flyers cut straight across.', unlock: { wave: 20, label: 'Reach wave 20 on any map' },
    paths: [[[0, 1], [14, 1], [14, 8], [2, 8], [2, 3], [11, 3], [11, 6], [6, 6]]],
    high: [[6, 4], [9, 5], [4, 5], [13, 4], [8, 9]],
    rocks: [[0, 9], [15, 9], [15, 0]],
    water: [[0, 4], [0, 5], [1, 5]],
  },
  bog: {
    name: 'Bogwater Ford', desc: 'Two roads wade through deep mud that slows every walker, but the ford holds few dry plots.', unlock: { wave: 30, label: 'Reach wave 30 on any map' },
    paths: [
      [[0, 2], [5, 2], [5, 6], [10, 6], [10, 2], [15, 2]],
      [[7, 9], [7, 6], [10, 6], [10, 2], [15, 2]],
    ],
    mud: [[5, 3], [5, 4], [5, 5], [10, 3], [10, 4], [10, 5], [7, 8], [7, 7]],
    high: [[3, 4], [8, 4], [12, 4], [2, 0]],
    rocks: [[15, 9], [0, 9]],
    water: [[0, 5], [1, 5], [0, 6], [1, 6], [2, 6], [12, 8], [13, 8], [13, 9], [14, 9], [14, 7], [7, 0], [8, 0]],
  },
  spine: {
    name: "Dragon's Spine", desc: 'Three roads, and a ridge of high ground between them that watches two at once.', unlock: { wave: 40, label: 'Reach wave 40 on any map' },
    paths: [
      [[0, 2], [12, 2], [12, 5], [15, 5]],
      [[0, 7], [12, 7], [12, 5], [15, 5]],
      [[7, 0], [7, 2], [12, 2], [12, 5], [15, 5]],
    ],
    high: [[2, 4], [4, 5], [6, 4], [8, 5], [10, 4], [14, 3], [14, 7]],
    rocks: [[0, 0], [0, 9], [15, 0], [15, 9]],
    water: [[4, 9], [5, 9], [9, 9], [10, 0]],
  },
  // ---- v1.24 · Hard ground: more mouths to feed, uneven roads
  hive: {
    name: 'The Hollow Hive', desc: 'HARD · Six roads from four edges squeeze into one gullet. Every group comes from somewhere new.', unlock: { wave: 35, label: 'Reach wave 35 on any map' }, hard: true,
    paths: [
      [[0, 1], [6, 1], [6, 4], [10, 4], [10, 5], [15, 5]],
      [[0, 8], [6, 8], [6, 6], [10, 6], [10, 5], [15, 5]],
      [[3, 0], [3, 3], [8, 3], [8, 5], [15, 5]],
      [[3, 9], [3, 7], [8, 7], [8, 5], [15, 5]],
      [[12, 0], [12, 5], [15, 5]],
      [[12, 9], [12, 5], [15, 5]],
    ],
    high: [[1, 5], [5, 5], [7, 2], [7, 8], [10, 2], [10, 8], [14, 3], [14, 7]],
    rocks: [[0, 4], [0, 6], [15, 0], [15, 9]],
    water: [[5, 0], [6, 0], [5, 9], [6, 9], [14, 1], [14, 8]],
  },
  fork: {
    name: 'Triple Fork', desc: 'HARD · Three roads of different lengths, all arriving at once on the same stretch. Foes pick the gap you left.', unlock: { wave: 45, label: 'Reach wave 45 on any map' }, hard: true,
    paths: [
      [[0, 5], [15, 5]],
      [[0, 0], [14, 0], [14, 3], [8, 3], [8, 5], [15, 5]],
      [[0, 9], [11, 9], [11, 7], [5, 7], [5, 5], [15, 5]],
      [[7, 0], [7, 3], [8, 3], [8, 5], [15, 5]],
    ],
    mud: [[14, 1], [14, 2], [11, 8]],
    high: [[3, 3], [6, 2], [10, 2], [3, 7], [13, 7], [8, 8], [12, 3], [2, 1]],
    rocks: [[0, 3], [0, 7], [15, 1], [15, 8]],
    water: [[1, 2], [2, 2], [1, 8], [2, 8], [13, 9], [14, 9]],
  },
  ravine: {
    name: 'Shattered Ravine', desc: 'HARD · A lake splits the field. Two long roads, and a short back road down the keep wall.', unlock: { wave: 55, label: 'Reach wave 55 on any map' }, hard: true,
    paths: [
      [[0, 0], [7, 0], [7, 4], [12, 4], [12, 8], [15, 8]],
      [[0, 9], [5, 9], [5, 6], [9, 6], [9, 8], [12, 8], [15, 8]],
      [[15, 0], [15, 8]],
    ],
    mud: [[7, 1], [7, 2], [7, 3], [5, 7], [5, 8]],
    high: [[9, 2], [3, 3], [10, 6], [13, 6], [3, 7], [13, 2]],
    rocks: [[0, 4], [0, 5], [14, 9], [15, 9]],
    water: [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [3, 4], [10, 0], [11, 0], [10, 1]],
  },
  // ---- v1.48 · Five new fields. `slick` road tiles (ice, wet stone, volcanic glass) hurry every walker along.
  hamlet: {
    name: 'Hamlet Hill', desc: 'A switchback road climbs past a hilltop hamlet, so most towers watch two stretches of it. A kind second field.', unlock: { wave: 5, label: 'Reach wave 5 on any map' },
    paths: [[[0, 1], [10, 1], [10, 4], [2, 4], [2, 8], [15, 8]]],
    high: [[5, 2], [8, 3], [6, 6], [11, 6], [13, 6], [12, 2], [4, 6]],
    rocks: [[15, 0], [0, 9], [14, 4]],
    water: [[0, 5], [0, 6], [1, 6]],
  },
  frostmere: {
    name: 'Frostmere', desc: 'Two roads meet beside a frozen mere. Foes slide fast over the ice, so the short road across the lake is the dangerous one.', unlock: { wave: 18, label: 'Reach wave 18 on any map' },
    paths: [
      [[0, 1], [11, 1], [11, 5], [15, 5]],
      [[0, 8], [6, 8], [6, 5], [11, 5], [15, 5]],
    ],
    slick: [[7, 5], [8, 5], [9, 5], [10, 5], [4, 1], [5, 1], [6, 1]],
    high: [[3, 3], [4, 6], [9, 4], [13, 3], [13, 7], [8, 2]],
    rocks: [[15, 0], [0, 4], [15, 9]],
    water: [[7, 6], [8, 6], [9, 6], [7, 7], [8, 7], [9, 7], [7, 3], [8, 3], [9, 3], [10, 7]],
  },
  bridge: {
    name: "King's Bridge", desc: 'Three roads from the west, one stone bridge over the river. Hold the bridge, but the far bank has little room to build.', unlock: { wave: 28, label: 'Reach wave 28 on any map' },
    paths: [
      [[0, 4], [12, 4], [12, 7], [15, 7]],
      [[0, 1], [5, 1], [5, 4], [12, 4], [12, 7], [15, 7]],
      [[0, 8], [5, 8], [5, 4], [12, 4], [12, 7], [15, 7]],
    ],
    high: [[3, 2], [3, 6], [7, 2], [10, 6], [14, 5], [10, 2], [7, 6]],
    rocks: [[15, 0], [0, 6], [14, 9]],
    water: [[8, 0], [8, 1], [8, 2], [8, 3], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [9, 9], [9, 0]],
  },
  mirror: {
    name: 'Mirror Vale', desc: 'The keep stands in the middle of the vale and the foes come at it from three sides at once. Nothing guards your back.', unlock: { wave: 38, label: 'Reach wave 38 on any map' },
    paths: [
      [[0, 2], [4, 2], [4, 5], [8, 5]],
      [[15, 7], [11, 7], [11, 5], [8, 5]],
      [[13, 0], [13, 3], [8, 3], [8, 5]],
    ],
    slick: [[13, 7], [14, 7]],
    high: [[2, 4], [6, 3], [6, 7], [10, 4], [13, 5], [10, 8], [2, 0], [10, 1]],
    rocks: [[0, 9], [15, 0], [15, 9]],
    water: [[0, 7], [1, 7], [1, 8], [14, 2], [15, 2]],
  },
  cinder: {
    name: 'The Cinder Road', desc: 'HARD · Five roads cross the ash fields. The straight road down the middle is volcanic glass and terribly fast; the long ones are slow but many.', unlock: { wave: 60, label: 'Reach wave 60 on any map' }, hard: true,
    paths: [
      [[0, 5], [15, 5]],
      [[0, 0], [3, 0], [3, 2], [10, 2], [10, 5], [15, 5]],
      [[0, 9], [3, 9], [3, 7], [10, 7], [10, 5], [15, 5]],
      [[7, 0], [7, 2], [10, 2], [10, 5], [15, 5]],
      [[7, 9], [7, 7], [10, 7], [10, 5], [15, 5]],
    ],
    slick: [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5]],
    mud: [[3, 1], [3, 8], [10, 3], [10, 6]],
    high: [[1, 3], [5, 3], [5, 6], [12, 3], [12, 7], [8, 4], [13, 4]],
    rocks: [[0, 2], [0, 7], [15, 0], [15, 9]],
    water: [[12, 0], [13, 0], [12, 9], [13, 9]],
  },
};
export const MAP_ORDER = ['meadow', 'hamlet', 'frontier', 'wilds', 'twin', 'frostmere', 'coil', 'cross', 'bridge', 'bog', 'mirror', 'spine', 'hive', 'fork', 'ravine', 'cinder'];
export const NEW_MAPS = ['hamlet', 'frostmere', 'bridge', 'mirror', 'cinder'];   // v1.48: they join the shared rotations from NEW_MAPS_FROM
export const MUD_SLOW = 0.6;
export const SLICK_FAST = 1.3;   // walkers on slick road (ice, wet stone, volcanic glass) move this much faster

function genFrontier(seed) {
  const rng = new Rng(seedFor(seed, 'frontier'));
  let y = rng.int(1, ROWS - 2);
  let x = 0;
  const pts = [[0, y]];
  while (x < COLS - 3) {
    x = Math.min(COLS - 3, x + rng.int(2, 4));
    pts.push([x, y]);
    if (x >= COLS - 3) break;
    let ny;
    do { ny = rng.int(1, ROWS - 2); } while (Math.abs(ny - y) < 2);
    pts.push([x, ny]);
    y = ny;
  }
  pts.push([COLS - 1, y]);
  const paths = [pts];
  // Sometimes a second road from the top or bottom joins a vertical segment.
  if (rng.chance(0.45) && pts.length > 4) {
    const joinIdx = 1 + 2 * rng.int(0, Math.floor((pts.length - 3) / 2));
    const j = pts[joinIdx];
    const nxt = pts[joinIdx + 1];
    if (nxt && nxt[0] === j[0] && j[0] > 1) {
      // Enter from the edge on the far side so the stub flows in the same direction as the road.
      const fromTop = nxt[1] > j[1];
      const sy = fromTop ? 0 : ROWS - 1;
      if (Math.abs(sy - j[1]) >= 2) paths.push([[j[0], sy], ...pts.slice(joinIdx)]);
    }
  }
  return { name: 'The Frontier', paths, high: [], rocks: [], water: [], random: true };
}

// The Wilds: the keep stands at the east end of an open moor and the foes cross it by routes nobody paved. Three to four trails
// wander in from the west edge (hidden: no road is drawn), the field is littered with boulders, ponds and thickets, and the
// build plots land wherever the ground favors them. Every run is a new field.
function genWilds(seed) {
  const rng = new Rng(seedFor(seed, 'wilds'));
  const cy = rng.int(3, ROWS - 4);
  const lanes = rng.chance(0.55) ? 3 : 4, paths = [];
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; rng.shuffle(rows);
  const starts = [];
  for (const r of rows) { if (starts.length < lanes && starts.every((q) => Math.abs(q - r) >= 2)) starts.push(r); }
  for (const y0 of starts) {
    const pts = [[0, y0]]; let x = 0, y = y0;
    while (x < COLS - 3) {
      x = Math.min(COLS - 3, x + rng.int(2, 4)); pts.push([x, y]);
      if (x >= COLS - 3) break;
      let ny; let guard = 0;
      do { ny = rng.int(0, ROWS - 1); guard++; } while (Math.abs(ny - y) < 2 && guard < 20);
      pts.push([x, ny]); y = ny;
    }
    pts.push([COLS - 3, cy]); pts.push([COLS - 1, cy]);
    // drop repeated points so rasterize never stalls on a zero-length leg
    const clean = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
    // the last leg may need a vertical jog: split it so every leg is straight
    const out = [clean[0]];
    for (let i = 1; i < clean.length; i++) {
      const a = out[out.length - 1], b = clean[i];
      if (a[0] !== b[0] && a[1] !== b[1]) out.push([b[0], a[1]]);
      out.push(b);
    }
    paths.push(out);
  }
  return { name: 'The Wilds', paths, high: [], rocks: [], water: [], random: true, hidden: true, scatter: true };
}

function rasterize(p) {
  const tiles = [];
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1];
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    tiles.push([x, y]);
    while (x !== x1 || y !== y1) { x += dx; y += dy; tiles.push([x, y]); }
  }
  return tiles;
}

export function buildMap(id, seed = 'x', portrait = false) {
  const def = id === 'frontier' ? genFrontier(seed) : id === 'wilds' ? genWilds(seed) : MAPS[id];
  const cols = COLS, rows = ROWS;
  const tiles = new Uint8Array(cols * rows);
  const idx = (x, y) => y * cols + x;
  const pathTileLists = def.paths.map(rasterize);
  for (const list of pathTileLists) for (const [x, y] of list) tiles[idx(x, y)] = T.PATH;
  const last = def.paths[0][def.paths[0].length - 1];
  tiles[idx(last[0], last[1])] = T.CASTLE;
  for (const [x, y] of def.high || []) if (tiles[idx(x, y)] === T.GRASS) tiles[idx(x, y)] = T.HIGH;
  for (const [x, y] of def.rocks || []) if (tiles[idx(x, y)] === T.GRASS) tiles[idx(x, y)] = T.ROCK;
  for (const [x, y] of def.water || []) if (tiles[idx(x, y)] === T.GRASS) tiles[idx(x, y)] = T.WATER;

  const rng = new Rng(seedFor(seed, id, 'decor'));
  const nearPath = (x, y, d) => {
    for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) {
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const t = tiles[idx(xx, yy)]; if (t === T.PATH || t === T.CASTLE) return true;
    }
    return false;
  };
  if (def.random) {
    const free = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (tiles[idx(x, y)] === T.GRASS) free.push([x, y]);
    rng.shuffle(free);
    let hi = rng.int(5, 8), rk = rng.int(4, 7), wt = rng.int(2, 4);
    if (def.scatter) { hi = rng.int(10, 14); rk = rng.int(9, 13); wt = rng.int(4, 8); }
    for (const [x, y] of free) {
      if (hi > 0 && nearPath(x, y, 1)) { tiles[idx(x, y)] = T.HIGH; hi--; continue; }
      if (rk > 0 && !nearPath(x, y, 1)) { tiles[idx(x, y)] = T.ROCK; rk--; continue; }
      if (wt > 0 && !nearPath(x, y, 1)) { tiles[idx(x, y)] = T.WATER; wt--; continue; }
    }
  }
  // Trees on far-from-road tiles: decoration that blocks building, keeping maps readable.
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (tiles[idx(x, y)] === T.GRASS && (def.scatter ? !nearPath(x, y, 0) && rng.chance(0.16) : !nearPath(x, y, 2) && rng.chance(0.45))) tiles[idx(x, y)] = T.TREE;
  }

  // Mud: road tiles that slow ground foes (engine) and are drawn as dark wet patches (renderer).
  const mud = new Uint8Array(cols * rows);
  for (const [x, y] of def.mud || []) if (tiles[idx(x, y)] === T.PATH) mud[idx(x, y)] = 1;
  // Slick road: the opposite of mud, ice or glass that hurries every walker along.
  const slick = new Uint8Array(cols * rows);
  for (const [x, y] of def.slick || []) if (tiles[idx(x, y)] === T.PATH) slick[idx(x, y)] = 1;
  let map = {
    id, name: def.name, cols, rows, tiles, mud: (def.mud || []).length ? mud : null, slick: (def.slick || []).length ? slick : null,
    paths: def.paths.map((p) => p.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }))),
    castle: { x: last[0] + 0.5, y: last[1] + 0.5 }, hidden: !!def.hidden,
  };
  if (portrait) map = transpose(map);
  finalize(map);
  return map;
}

function transpose(m) {
  const flip = (src) => { const out = new Uint8Array(m.cols * m.rows); for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) out[x * m.rows + y] = src[y * m.cols + x]; return out; };
  const tiles = flip(m.tiles);
  return {
    ...m, cols: m.rows, rows: m.cols, tiles, mud: m.mud ? flip(m.mud) : null, slick: m.slick ? flip(m.slick) : null,
    paths: m.paths.map((p) => p.map(({ x, y }) => ({ x: y, y: x }))),
    castle: { x: m.castle.y, y: m.castle.x }, transposed: true,
  };
}

function finalize(map) {
  // Cumulative distance along each path for progress-based targeting.
  map.pathLen = map.paths.map((p) => {
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
    return cum;
  });
  map.spawns = map.paths.map((p) => p[0]);
  map.tileAt = (x, y) => (x < 0 || y < 0 || x >= map.cols || y >= map.rows ? T.ROCK : map.tiles[y * map.cols + x]);
  // Rally points: buildable tiles covering the most road within 1.6 tiles (+10% fire rate).
  const scores = [];
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    const t = map.tileAt(x, y);
    if (t !== T.GRASS && t !== T.HIGH) continue;
    let c = 0;
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
      if (map.tileAt(xx, yy) === T.PATH && Math.hypot(xx - x, yy - y) <= 1.6) c++;
    }
    scores.push({ x, y, c });
  }
  scores.sort((a, b) => b.c - a.c);
  map.rally = new Set(scores.slice(0, 5).filter((s) => s.c >= 5).map((s) => s.y * map.cols + s.x));
  map.coverage = new Map(scores.map((s) => [s.y * map.cols + s.x, s.c]));
  // Build plots: stone foundations hugging the road, never touching each other.
  // High ground always earns a plot if it watches the road. Best plots come first (the first few start open).
  const reach = (x, y, r) => {
    let c = 0;
    for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (map.tileAt(xx, yy) === T.PATH && Math.hypot(xx - x, yy - y) <= r) c++;
    return c;
  };
  const cand = scores.map((s) => ({ ...s, r: reach(s.x, s.y, 2.5), hi: map.tileAt(s.x, s.y) === T.HIGH }))
    .filter((s) => s.c >= 2 || (s.hi && s.r >= 3))
    .map((s) => ({ ...s, score: s.c + s.r * 0.35 + (s.hi ? 3 : 0) }))
    .sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  const plots = [];
  for (const c of cand) {
    if (plots.length >= PLOTS.max) break;
    if (plots.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < 2)) continue;
    plots.push({ x: c.x, y: c.y, k: c.y * map.cols + c.x, high: map.tileAt(c.x, c.y) === T.HIGH });
  }
  // Open plots spread along the road: alternate between the spawn half and the castle half.
  const cx = map.castle.x, cy = map.castle.y;
  const byCastle = [...plots].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const open = [];
  const near = byCastle.slice(0, Math.ceil(plots.length / 2)), far = byCastle.slice(Math.ceil(plots.length / 2));
  const rank = (list) => list.sort((a, b) => plots.indexOf(a) - plots.indexOf(b));
  rank(near); rank(far);
  while (open.length < Math.min(PLOTS.open, plots.length)) {
    const n = near.shift(); if (n) open.push(n);
    if (open.length >= PLOTS.open) break;
    const f = far.shift(); if (f) open.push(f);
    if (!n && !f) break;
  }
  map.plots = plots;
  map.plotSet = new Set(plots.map((p) => p.k));
  // Raised ground that did not become a plot is just grass, so every platform you see is buildable.
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === T.HIGH && !map.plotSet.has(i)) map.tiles[i] = T.GRASS;
  map.startPlots = open.map((p) => p.k);
}

// Is (x,y) a place a tower could ever stand? Traps go on the road, towers on plots (open or ruined).
export function isBuildable(map, x, y, trap = false) {
  if (trap) return !map.hidden && map.tileAt(x, y) === T.PATH;   // no traps on trails nobody can see
  return !!map.plotSet && map.plotSet.has(y * map.cols + x);
}
