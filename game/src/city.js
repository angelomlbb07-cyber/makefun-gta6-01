// SOLMAR — city.js
// The city itself: streets, blocks, labelled buildings, the beach and sea,
// the pier, the plaza with its fountain, the park, the docks and the palms.
// buildCity is deterministic for a seed, so staged screenshots are stable.
// This module only answers questions about the city (is this a road? which
// district? is there a building here?) — drawing lives in render.js.

import { ROADS_V, ROADS_H, ROAD_W, WORLD_W, WORLD_H, SEA_Y, SAND_Y, DISTRICTS } from './config.js';
import { makeRng, range, rangeInt, pick, shuffle } from './random.js';

// Names painted on buildings, so the world reads as a city of places, not
// a grid of boxes. A few per shot are always in frame.
export const BUILDING_LABELS = [
  'MOTEL SOL', 'PALM MART', 'MARINA BAY BANK', 'CORAL CASINO', 'SOLMARINA GENERAL',
  'SUNSET INN', 'SURF SHOP', "BENNY'S GARAGE", 'DOCKSIDE DINER', 'PALM GROVE HOTEL',
  'CORAL COURT', 'VISTA APARTMENTS', 'LA PALMA CAFE', 'NEON MOTEL', 'HARBOUR OFFICE',
  'TACO SOL', 'PIER ARCADE', 'SOLMAR PHARMACY', 'MARISOL FLOWERS', 'OCEAN VIEW BAR',
];

const BUILDING_COLOURS = ['#d8b48f', '#c9a2a2', '#a2b8c9', '#c9b48a', '#b8a2c9', '#9ac2a2', '#d8c2a2', '#a2c9b8'];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const city = {
    seed,
    buildings: [],
    palms: [],
    benches: [],
    umbrellas: [],
    // Landmarks the camera frames in the staged shots.
    plaza: { x: 1520, y: 1520, r: 150 },
    pier: { x: 1600, y: 2240, w: 120, h: 260 },
    park: { x: 2320, y: 720, w: 300, h: 240 },
    casino: { x: 1520, y: 520, w: 260, h: 150 },
    garage: { x: 920, y: 1320, w: 180, h: 120 },
    docks: { x: 180, y: 1520, w: 220, h: 200 },
  };

  // Buildings fill the blocks between streets, skipping the landmark blocks
  // (plaza, park, casino forecourt, garage yard, docks) and the beach strip.
  const labels = shuffle(rng, BUILDING_LABELS);
  let labelIdx = 0;
  const landmarkBlocks = [
    { x0: 1320, y0: 1320, x1: 1720, y1: 1720 }, // plaza
    { x0: 2120, y0: 520, x1: 2520, y1: 920 }, // park
    { x0: 1320, y0: 320, x1: 1720, y1: 720 }, // casino
    { x0: 720, y0: 1120, x1: 1120, y1: 1520 }, // garage
    { x0: 0, y0: 1320, x1: 320, y1: 1720 }, // docks
  ];
  for (let bx = 0; bx < ROADS_V.length - 1; bx++) {
    for (let by = 0; by < ROADS_H.length - 1; by++) {
      const x0 = ROADS_V[bx] + ROAD_W / 2 + 16;
      const x1 = ROADS_V[bx + 1] - ROAD_W / 2 - 16;
      const y0 = ROADS_H[by] + ROAD_W / 2 + 16;
      const y1 = ROADS_H[by + 1] - ROAD_W / 2 - 16;
      if (y0 > SAND_Y - 220) continue; // beach strip stays open
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (landmarkBlocks.some((b) => cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1)) continue;
      const count = rangeInt(rng, 1, 2);
      for (let i = 0; i < count; i++) {
        const w = range(rng, 90, 170);
        const h = range(rng, 80, 150);
        const x = range(rng, x0 + w / 2, x1 - w / 2);
        const y = range(rng, y0 + h / 2, y1 - h / 2);
        city.buildings.push({
          x, y, w, h,
          label: labels[labelIdx++ % labels.length],
          colour: pick(rng, BUILDING_COLOURS),
          roof: pick(rng, ['#8a6f4d', '#5d6b7a', '#7a4d4d', '#4d6b5d']),
        });
      }
    }
  }
  // The casino and the garage get their own big labelled buildings.
  city.buildings.push({ x: 1520, y: 520, w: 260, h: 150, label: 'CORAL CASINO', colour: '#e8c96a', roof: '#a03d6e' });
  city.buildings.push({ x: 920, y: 1320, w: 180, h: 120, label: "BENNY'S GARAGE", colour: '#9ab8d8', roof: '#3d5a7a' });
  city.buildings.push({ x: 2520, y: 1520, w: 200, h: 130, label: 'MARINA BAY BANK', colour: '#d8d8c8', roof: '#5a6b3d' });
  city.buildings.push({ x: 520, y: 520, w: 170, h: 120, label: 'MOTEL SOL', colour: '#e8b48a', roof: '#7a4d3d' });

  // Palms line the beach road and ring the plaza.
  for (let x = 120; x < WORLD_W; x += 130) {
    city.palms.push({ x: x + range(rng, -20, 20), y: SAND_Y + 46 + range(rng, -12, 12) });
    if (chance(rng, 0.5)) city.palms.push({ x: x + 60, y: SAND_Y + 110 });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    city.palms.push({ x: city.plaza.x + Math.cos(a) * (city.plaza.r + 26), y: city.plaza.y + Math.sin(a) * (city.plaza.r + 26) });
  }
  // Benches and umbrellas make the plaza and the beach read as places.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    city.benches.push({ x: city.plaza.x + Math.cos(a) * 96, y: city.plaza.y + Math.sin(a) * 96, angle: a + Math.PI / 2 });
  }
  for (let i = 0; i < 6; i++) {
    city.umbrellas.push({ x: 300 + i * 420 + range(rng, -40, 40), y: SAND_Y + 130 + range(rng, -20, 30), colour: pick(rng, ['#ff5da2', '#ffb02e', '#2ec8ff', '#ff6b4d']) });
  }
  for (let i = 0; i < 4; i++) {
    city.benches.push({ x: 500 + i * 560, y: SAND_Y + 70, angle: 0 });
  }
  return city;
}

function chance(rng, p) {
  return rng() < p;
}

export function isRoadAt(x, y) {
  if (y > SAND_Y) return false;
  for (const rx of ROADS_V) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function isWaterAt(x, y) {
  return y > SEA_Y;
}

export function isSandAt(x, y) {
  return y > SAND_Y && y <= SEA_Y;
}

export function isOnPier(city, x, y) {
  return x > city.pier.x - city.pier.w / 2 && x < city.pier.x + city.pier.w / 2 &&
    y > city.pier.y - 40 && y < city.pier.y + city.pier.h;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function buildingAt(city, x, y) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) return b;
  }
  return null;
}

// Walkable ground for a person or a car: not inside a building, not in the
// sea (unless on the pier), and inside the world.
export function blockedAt(city, x, y, inCar) {
  if (x < 40 || y < 40 || x > WORLD_W - 40 || y > WORLD_H - 20) return true;
  if (isWaterAt(x, y) && !isOnPier(city, x, y)) return true;
  if (buildingAt(city, x, y)) return true;
  return false;
}

// Snap a point to the nearest street centre, for spawning traffic and cops.
export function nearestRoadPoint(x, y) {
  let bestV = ROADS_V[0];
  for (const rx of ROADS_V) if (Math.abs(x - rx) < Math.abs(x - bestV)) bestV = rx;
  let bestH = ROADS_H[0];
  for (const ry of ROADS_H) if (Math.abs(y - ry) < Math.abs(y - bestH)) bestH = ry;
  if (Math.abs(x - bestV) < Math.abs(y - bestH)) return { x: bestV, y, vertical: true };
  return { x, y: bestH, vertical: false };
}

// A random point on a street, for ambient traffic spawns.
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    return { x: pick(rng, ROADS_V), y: range(rng, 120, SAND_Y - 120), vertical: true };
  }
  return { x: range(rng, 120, WORLD_W - 120), y: pick(rng, ROADS_H), vertical: false };
}
