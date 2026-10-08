// Map definitions + seeded procedural generator. Landscape grid is 16×10; portrait play transposes it.
import { Rng, seedFor } from '../core/rng.js';

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
};
export const MAP_ORDER = ['meadow', 'frontier', 'twin', 'cross'];

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
  const def = id === 'frontier' ? genFrontier(seed) : MAPS[id];
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
    for (const [x, y] of free) {
      if (hi > 0 && nearPath(x, y, 1)) { tiles[idx(x, y)] = T.HIGH; hi--; continue; }
      if (rk > 0 && !nearPath(x, y, 1)) { tiles[idx(x, y)] = T.ROCK; rk--; continue; }
      if (wt > 0 && !nearPath(x, y, 1)) { tiles[idx(x, y)] = T.WATER; wt--; continue; }
    }
  }
  // Trees on far-from-road tiles: decoration that blocks building, keeping maps readable.
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (tiles[idx(x, y)] === T.GRASS && !nearPath(x, y, 2) && rng.chance(0.45)) tiles[idx(x, y)] = T.TREE;
  }

  let map = {
    id, name: def.name, cols, rows, tiles,
    paths: def.paths.map((p) => p.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }))),
    castle: { x: last[0] + 0.5, y: last[1] + 0.5 },
  };
  if (portrait) map = transpose(map);
  finalize(map);
  return map;
}

function transpose(m) {
  const tiles = new Uint8Array(m.cols * m.rows);
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) tiles[x * m.rows + y] = m.tiles[y * m.cols + x];
  return {
    ...m, cols: m.rows, rows: m.cols, tiles,
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
}

export function isBuildable(map, x, y, trap = false) {
  const t = map.tileAt(x, y);
  return trap ? t === T.PATH : t === T.GRASS || t === T.HIGH;
}
