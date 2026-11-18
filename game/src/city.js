// SOLMAR city: streets, districts, beach and sea, landmarks, pathfinding.
// The city is a road grid; the south edge is sand and sea, the west is docks.

import { WORLD, DISTRICTS } from './config.js';
import { clamp, mulberry32 } from './random.js';

export const LANDMARKS = [
  { id: 'safehouse', name: 'Marco\u2019s Safehouse', x: 1500, y: 1150 },
  { id: 'garage', name: 'Benny\u2019s Garage', x: 2100, y: 1250 },
  { id: 'casino', name: 'Coral Casino', x: 1800, y: 1850 },
  { id: 'docks', name: 'Marina Docks', x: 420, y: 420 },
  { id: 'beach', name: 'Palmline Beach', x: 1800, y: 2320 },
  { id: 'hospital', name: 'Solmar General', x: 2600, y: 500 },
  { id: 'neon', name: 'Neon Row', x: 3000, y: 1200 },
  { id: 'pier', name: 'Sunset Pier', x: 900, y: 2380 },
  { id: 'airport', name: 'Solmar Airfield', x: 3200, y: 300 },
  { id: 'market', name: 'Old Market', x: 1500, y: 700 },
];

export function landmark(id) {
  return LANDMARKS.find((l) => l.id === id) || LANDMARKS[0];
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[3];
}

export function isSea(x, y) {
  return y > WORLD.height - 260;
}

export function isSand(x, y) {
  return y > WORLD.height - 420 && y <= WORLD.height - 260;
}

export function isRoad(x, y) {
  const gx = x % WORLD.roadGap;
  const gy = y % WORLD.roadGap;
  return gx < 120 || gx > WORLD.roadGap - 120 || gy < 120 || gy > WORLD.roadGap - 120;
}

export function nearestRoadPoint(x, y) {
  const gx = Math.round(x / WORLD.roadGap) * WORLD.roadGap;
  const gy = Math.round(y / WORLD.roadGap) * WORLD.roadGap;
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  if (dx < dy) return { x: gx, y };
  return { x, y: gy };
}

export function roadGridPoints() {
  const pts = [];
  for (let x = 0; x <= WORLD.width; x += WORLD.roadGap) {
    for (let y = 0; y <= WORLD.height; y += WORLD.roadGap) {
      pts.push({ x, y });
    }
  }
  return pts;
}

// Breadth-first path over the road grid; always returns at least one point.
export function findPath(sx, sy, tx, ty) {
  const cols = Math.floor(WORLD.width / WORLD.roadGap) + 1;
  const rows = Math.floor(WORLD.height / WORLD.roadGap) + 1;
  const sc = clamp(Math.round(sx / WORLD.roadGap), 0, cols - 1);
  const sr = clamp(Math.round(sy / WORLD.roadGap), 0, rows - 1);
  const tc = clamp(Math.round(tx / WORLD.roadGap), 0, cols - 1);
  const tr = clamp(Math.round(ty / WORLD.roadGap), 0, rows - 1);
  const key = (c, r) => r * cols + c;
  const prev = new Map();
  const seen = new Set([key(sc, sr)]);
  const queue = [[sc, sr]];
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === tc && r === tr) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const k = key(nc, nr);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(c, r));
      queue.push([nc, nr]);
    }
  }
  const path = [];
  let k = key(tc, tr);
  if (!prev.has(k) && !(tc === sc && tr === sr)) {
    return [{ x: tx, y: ty }];
  }
  while (k !== key(sc, sr)) {
    const c = k % cols, r = Math.floor(k / cols);
    path.unshift({ x: c * WORLD.roadGap, y: r * WORLD.roadGap });
    k = prev.get(k);
    if (k === undefined) break;
  }
  path.push({ x: tx, y: ty });
  return path.length ? path : [{ x: tx, y: ty }];
}

export function palmPositions(seed) {
  const rng = mulberry32(seed);
  const palms = [];
  for (let i = 0; i < 90; i++) {
    palms.push({
      x: rng() * WORLD.width,
      y: WORLD.height - 420 + rng() * 380,
      lean: (rng() - 0.5) * 0.6,
      size: 14 + rng() * 12,
    });
  }
  for (let i = 0; i < 40; i++) {
    palms.push({
      x: rng() * WORLD.width,
      y: rng() * (WORLD.height - 500),
      lean: (rng() - 0.5) * 0.4,
      size: 12 + rng() * 10,
    });
  }
  return palms;
}

export function buildingRects(seed) {
  const rng = mulberry32(seed + 7);
  const rects = [];
  for (let bx = 0; bx < 9; bx++) {
    for (let by = 0; by < 6; by++) {
      const x0 = bx * WORLD.roadGap + 140;
      const y0 = by * WORLD.roadGap + 140;
      if (y0 > WORLD.height - 500) continue;
      if (rng() < 0.25) continue;
      rects.push({
        x: x0 + rng() * 60, y: y0 + rng() * 60,
        w: 60 + rng() * 120, h: 50 + rng() * 110,
        color: ['#c9a06a', '#b98a5e', '#8fa3b8', '#d8c49a', '#a8b8a0'][Math.floor(rng() * 5)],
        roof: rng() < 0.3,
      });
    }
  }
  return rects;
}
