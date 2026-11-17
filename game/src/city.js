// SOLMAR, the city itself: a road grid, blocks with buildings, parks, the beach and the docks,
// landmarks the missions use, and the road graph cars and police pathfind on.
// Blocks are 260px, roads 90px, 11 columns x 7 rows. South of the last road is sand, then water.

import { BLOCK_H, BLOCK_W, COLS, districtAt, PALETTE, ROAD_W, ROWS, STREET_NAMES_H, STREET_NAMES_V, WORLD } from './config.js';
import { clamp } from './random.js';

export const WATER_Y = 2740; // south of here is the sea; nothing drives or walks in it
export const SAND_Y = 2540; // south of here is sand

export function buildCity(rng) {
  const vRoads = [];
  const hRoads = [];
  for (let i = 0; i <= COLS; i += 1) vRoads.push(i * (BLOCK_W + ROAD_W) + ROAD_W / 2);
  for (let j = 0; j <= ROWS; j += 1) hRoads.push(j * (BLOCK_H + ROAD_W) + ROAD_W / 2);

  const blocks = [];
  const buildings = [];
  const trees = [];
  const parks = new Set(['2,2', '8,5', '4,6']);
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const x0 = col * (BLOCK_W + ROAD_W) + ROAD_W;
      const y0 = row * (BLOCK_H + ROAD_W) + ROAD_W;
      const key = `${col},${row}`;
      const district = districtAt(col, row);
      let type = 'buildings';
      if (parks.has(key)) type = 'park';
      else if (col >= 10 && row >= 2 && row <= 4) type = 'docks';
      else if (district === 'Coral Heights') type = 'houses';
      const block = { col, row, x: x0, y: y0, w: BLOCK_W, h: BLOCK_H, type, district, buildings: [], trees: [] };
      if (type === 'park') {
        for (let t = 0; t < rng.int(7, 11); t += 1) {
          const tree = { x: x0 + rng.range(24, BLOCK_W - 24), y: y0 + rng.range(24, BLOCK_H - 24), r: rng.range(10, 16) };
          block.trees.push(tree);
          trees.push(tree);
        }
      } else {
        const downtown = district === 'Downtown';
        const count = type === 'houses' ? rng.int(1, 2) : type === 'docks' ? rng.int(2, 3) : rng.int(2, 4);
        const colorBase = rng.int(0, PALETTE.building.length);
        for (let b = 0; b < count; b += 1) {
          const bw = type === 'houses' ? rng.range(70, 110) : rng.range(60, 130);
          const bh = type === 'houses' ? rng.range(60, 100) : rng.range(60, 130);
          const bx = x0 + rng.range(14, BLOCK_W - 14 - bw);
          const by = y0 + rng.range(14, BLOCK_H - 14 - bh);
          const ci = (colorBase + b) % PALETTE.building.length;
          const building = {
            x: bx, y: by, w: bw, h: bh,
            height: downtown ? 3 : type === 'houses' ? 1 : rng.int(1, 2),
            color: type === 'docks' ? '#8a7a5e' : PALETTE.building[ci],
            roof: type === 'docks' ? '#6b5f49' : PALETTE.roof[ci],
          };
          block.buildings.push(building);
          buildings.push(building);
        }
        if (type === 'docks') {
          for (let t = 0; t < 3; t += 1) {
            block.trees.push({ x: x0 + rng.range(20, BLOCK_W - 20), y: y0 + rng.range(20, BLOCK_H - 20), r: 8, container: true });
          }
        }
      }
      blocks.push(block);
    }
  }

  // Palms along the sand.
  for (let x = 120; x < WORLD.width - 100; x += rng.range(90, 170)) {
    trees.push({ x, y: rng.range(SAND_Y + 30, WATER_Y - 40), r: rng.range(11, 15), palm: true });
  }

  // Landmarks: points on the road network the missions and the story use.
  const at = (i, j) => ({ x: vRoads[i], y: hRoads[j] });
  const landmarks = {
    garage: { ...at(5, 5), name: "Rico's Garage", kind: 'garage' },
    hotel: { ...at(6, 2), name: 'The Palmera Hotel', kind: 'hotel' },
    restaurant: { ...at(1, 7), name: 'Marina Restaurant', kind: 'restaurant' },
    safehouse: { ...at(1, 5), name: 'Safehouse', kind: 'safehouse' },
    docks: { ...at(10, 3), name: 'Dock 9', kind: 'docks' },
    warehouse: { ...at(9, 1), name: 'Warehouse 12', kind: 'warehouse' },
    casino: { ...at(6, 3), name: 'Coral Casino', kind: 'casino' },
    boat: { x: 745, y: 2690, name: 'The Boat', kind: 'boat' },
    hospital: { ...at(3, 2), name: 'Solmar General', kind: 'hospital' },
    police: { ...at(4, 2), name: 'Solmar PD', kind: 'police' },
    spawn: { ...at(5, 6), name: 'Start', kind: 'spawn' },
  };

  return { vRoads, hRoads, blocks, buildings, trees, landmarks, width: WORLD.width, height: WORLD.height };
}

/** The intersection nearest a point, as {i, j, x, y}. */
export function nearestIntersection(city, x, y) {
  let bi = 0;
  let bj = 0;
  let best = Infinity;
  for (let i = 0; i < city.vRoads.length; i += 1) {
    for (let j = 0; j < city.hRoads.length; j += 1) {
      const d = (city.vRoads[i] - x) ** 2 + (city.hRoads[j] - y) ** 2;
      if (d < best) {
        best = d;
        bi = i;
        bj = j;
      }
    }
  }
  return { i: bi, j: bj, x: city.vRoads[bi], y: city.hRoads[bj] };
}

/** Breadth-first path over intersections, from near (sx, sy) to near (tx, ty). */
export function findPath(city, sx, sy, tx, ty) {
  const from = nearestIntersection(city, sx, sy);
  const to = nearestIntersection(city, tx, ty);
  const cols = city.vRoads.length;
  const rows = city.hRoads.length;
  const key = (i, j) => j * cols + i;
  const prev = new Map();
  const queue = [key(from.i, from.j)];
  prev.set(key(from.i, from.j), -1);
  while (queue.length > 0) {
    const cur = queue.shift();
    const ci = cur % cols;
    const cj = Math.floor(cur / cols);
    if (ci === to.i && cj === to.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || ni >= cols || nj < 0 || nj >= rows) continue;
      const nk = key(ni, nj);
      if (!prev.has(nk)) {
        prev.set(nk, cur);
        queue.push(nk);
      }
    }
  }
  const path = [];
  let cur = key(to.i, to.j);
  if (!prev.has(cur)) return [{ x: to.x, y: to.y }];
  while (cur !== -1) {
    path.unshift({ x: city.vRoads[cur % cols], y: city.hRoads[Math.floor(cur / cols)] });
    cur = prev.get(cur);
  }
  return path;
}

/** Which road a point is on, if any: {axis: 'h'|'v', index, center, name}. */
export function roadAt(city, x, y) {
  for (let j = 0; j < city.hRoads.length; j += 1) {
    if (Math.abs(y - city.hRoads[j]) <= ROAD_W / 2) {
      return { axis: 'h', index: j, center: city.hRoads[j], name: STREET_NAMES_H[j] };
    }
  }
  for (let i = 0; i < city.vRoads.length; i += 1) {
    if (Math.abs(x - city.vRoads[i]) <= ROAD_W / 2) {
      return { axis: 'v', index: i, center: city.vRoads[i], name: STREET_NAMES_V[i] };
    }
  }
  return null;
}

/** The building a circle overlaps, or null. */
export function hitBuilding(city, x, y, r) {
  for (let index = 0; index < city.buildings.length; index += 1) {
    const b = city.buildings[index];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** True when a circle is inside the sea. */
export function inWater(x, y, r) {
  return y + r > WATER_Y;
}

/** Push a circle out of buildings and the sea; returns the building hit, if any. */
export function collideCircle(city, pos, r) {
  let hit = null;
  const b = hitBuilding(city, pos.x, pos.y, r);
  if (b) {
    hit = b;
    const left = pos.x + r - b.x;
    const right = b.x + b.w - (pos.x - r);
    const top = pos.y + r - b.y;
    const bottom = b.y + b.h - (pos.y - r);
    const min = Math.min(left, right, top, bottom);
    if (min === left) pos.x = b.x - r;
    else if (min === right) pos.x = b.x + b.w + r;
    else if (min === top) pos.y = b.y - r;
    else pos.y = b.y + b.h + r;
  }
  if (pos.y + r > WATER_Y) pos.y = WATER_Y - r;
  if (pos.y - r < 0) pos.y = r;
  if (pos.x - r < 0) pos.x = r;
  if (pos.x + r > city.width) pos.x = city.width - r;
  return hit;
}

/** A point on a road, away from intersections, good for spawning a parked car. */
export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    const j = rng.int(0, city.hRoads.length - 1);
    const i = rng.int(0, city.vRoads.length - 2);
    return { x: (city.vRoads[i] + city.vRoads[i + 1]) / 2, y: city.hRoads[j] + (rng.chance(0.5) ? 26 : -26), angle: rng.chance(0.5) ? 0 : Math.PI };
  }
  const i = rng.int(0, city.vRoads.length - 1);
  const j = rng.int(0, city.hRoads.length - 2);
  return { x: city.vRoads[i] + (rng.chance(0.5) ? 26 : -26), y: (city.hRoads[j] + city.hRoads[j + 1]) / 2, angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
}

export function blockAt(city, x, y) {
  for (let index = 0; index < city.blocks.length; index += 1) {
    const b = city.blocks[index];
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
  }
  return null;
}

export function clampToWorld(city, x, y) {
  return { x: clamp(x, 0, city.width), y: clamp(y, 0, city.height) };
}
