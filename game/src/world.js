// world.js — the city of Solmar: generation, districts, roads, buildings,
// beach, pier, plaza and fountain. One job: the place. It answers "what is
// at (x, y)?" and draws the ground, sea, roads and buildings under the
// current time of day. Nothing here knows about missions or the player.

import { WORLD, clamp, mulberry32 } from './tuning.js';

// Road grid: vertical and horizontal roads every ROAD_STEP px, offset so the
// beach strip and the plaza sit on real blocks.
export const ROAD_STEP = 320;
export const ROAD_HALF = 26;

export const DISTRICTS = [
  { id: 'beach', name: 'PALMLINE BEACH', flavour: 'SUN, SAND AND BAD DECISIONS', x0: 0, y0: 0, x1: 520, y1: 2600 },
  { id: 'marina', name: 'MARINA BAY', flavour: 'BOATS, MONEY, LOOSE ENDS', x0: 520, y0: 1980, x1: 3600, y1: 2600 },
  // Plaza BEFORE downtown: downtown's box contains the plaza, and the
  // first match wins — the fountain square must read CORAL PLAZA.
  { id: 'plaza', name: 'CORAL PLAZA', flavour: 'THE FOUNTAIN NEVER SLEEPS', x0: 1560, y0: 1020, x1: 2060, y1: 1520 },
  { id: 'downtown', name: 'DOWNTOWN SOLMAR', flavour: 'GLASS, NEON AND OLD MONEY', x0: 1300, y0: 640, x1: 2500, y1: 1980 },
  { id: 'suburbs', name: 'PALM GROVE', flavour: 'QUIET STREETS, LOUD SECRETS', x0: 2500, y0: 0, x1: 3600, y1: 1980 },
  { id: 'oldtown', name: 'OLD SOLMAR', flavour: 'NARROW STREETS, OLD MONEY', x0: 520, y0: 0, x1: 2500, y1: 640 },
];

const LABELLED = [
  // [x, y, w, h, label, colour] — hand-placed landmarks the camera frames.
  [620, 780, 150, 110, 'MOTEL SOL', '#e8b04b'],
  [980, 420, 170, 120, 'PALM MART', '#7ec8a9'],
  [2180, 700, 210, 130, 'Marina Bay Bank', '#c9a86a'],
  [2360, 1560, 190, 130, 'CORAL CASINO', '#e06a7a'],
  [700, 1700, 160, 110, 'SUNSET INN', '#e8b04b'],
  [2900, 500, 180, 120, 'SURF SHOP', '#7ec8a9'],
  [1080, 2100, 200, 130, "BENNY'S GARAGE", '#8fb8d8'],
  [1500, 300, 170, 110, "DOTTIE'S OFFICE", '#c9a86a'],
  [2700, 1750, 200, 120, 'SOLMAR GENERAL', '#a9b8c8'],
  [3300, 900, 150, 110, 'PALM MOTEL', '#e8b04b'],
];

export function createWorld(seed = 20261120) {
  const rng = mulberry32(seed);
  const buildings = [];
  // Fill every city block with a building; the plaza block stays open with
  // a fountain, the beach strip stays sand.
  for (let bx = 520; bx < WORLD.width - 120; bx += ROAD_STEP) {
    for (let by = 120; by < WORLD.height - 120; by += ROAD_STEP) {
      const x = bx + ROAD_HALF + 14;
      const y = by + ROAD_HALF + 14;
      const w = ROAD_STEP - ROAD_HALF * 2 - 28;
      const h = ROAD_STEP - ROAD_HALF * 2 - 28;
      if (x > 1560 && x < 2060 && y > 1020 && y < 1520) continue; // plaza
      if (y > 1980 && x < 900) continue; // marina car park stays open
      const r = rng();
      const palette = ['#b98d5f', '#8fa8b8', '#c2a878', '#9a8fa8', '#7a9a8a', '#b87a6a'];
      buildings.push({
        x, y, w, h,
        color: palette[Math.floor(r * palette.length)],
        roof: r > 0.5,
        label: null,
      });
    }
  }
  for (const [x, y, w, h, label, color] of LABELLED) {
    buildings.push({ x, y, w, h, color, roof: true, label });
  }
  // Palms: clusters along the beach, the plaza and random street corners.
  const palms = [];
  for (let i = 0; i < 90; i++) {
    const beach = i < 46;
    palms.push({
      x: beach ? 300 + rng() * 130 : 560 + rng() * 2900,
      y: beach ? 120 + rng() * 2360 : 120 + rng() * 2360,
      lean: (rng() - 0.5) * 0.5,
      size: 14 + rng() * 10,
    });
  }
  return {
    seed, buildings, palms,
    pier: { x: 120, y: 1450, w: 150, h: 46 }, // juts out into the sea
    fountain: { x: 1810, y: 1270, r: 52 },
    safehouse: { x: 1585, y: 355 },
    garage: { x: 1180, y: 2165 },
    hospital: { x: 2780, y: 1810 },
  };
}

export function districtAt(world, x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[2];
}

export function isWater(world, x, y) { return x < WORLD.seaEdge; }
export function isBeach(world, x, y) { return x >= WORLD.seaEdge && x < WORLD.beachEdge; }

export function isRoad(world, x, y) {
  if (x < WORLD.beachEdge) return false;
  const vx = ((x - 520) % ROAD_STEP + ROAD_STEP) % ROAD_STEP;
  const vy = ((y - 120) % ROAD_STEP + ROAD_STEP) % ROAD_STEP;
  return vx < ROAD_HALF * 2 || vy < ROAD_HALF * 2 || vx > ROAD_STEP - ROAD_HALF * 2 || vy > ROAD_STEP - ROAD_HALF * 2;
}

// A point on a road, for spawns and mission targets.
export function roadPoint(world, rng, margin = 80) {
  const col = 520 + Math.floor(rng() * 9) * ROAD_STEP + ROAD_HALF;
  const row = 120 + Math.floor(rng() * 7) * ROAD_STEP + ROAD_HALF;
  if (rng() < 0.5) return { x: clamp(col, margin, WORLD.width - margin), y: clamp(140 + rng() * 2300, margin, WORLD.height - margin) };
  return { x: clamp(560 + rng() * 2900, margin, WORLD.width - margin), y: clamp(row, margin, WORLD.height - margin) };
}

export function nearestRoadPoint(world, x, y) {
  const cx = Math.round((x - 520) / ROAD_STEP) * ROAD_STEP + 520 + ROAD_HALF;
  const cy = Math.round((y - 120) / ROAD_STEP) * ROAD_STEP + 120 + ROAD_HALF;
  return { x: clamp(cx, 560, WORLD.width - 60), y: clamp(cy, 160, WORLD.height - 60) };
}

// Time of day: label + lighting the renderer uses for the sky overlay.
export function skyFor(hour) {
  if (hour >= 6 && hour < 9) return { label: 'MORNING', tint: 'rgba(255,214,150,0.10)', sun: '#ffd98a' };
  if (hour >= 9 && hour < 17) return { label: 'DAY', tint: 'rgba(255,255,255,0.0)', sun: '#fff3c0' };
  if (hour >= 17 && hour < 19.5) return { label: 'GOLDEN HOUR', tint: 'rgba(255,150,60,0.20)', sun: '#ff9a3c' };
  if (hour >= 19.5 && hour < 21) return { label: 'SUNSET', tint: 'rgba(255,110,120,0.22)', sun: '#ff6a5e' };
  return { label: 'NIGHT', tint: 'rgba(10,20,60,0.42)', sun: '#dfe8ff' };
}

function drawPalm(ctx, x, y, size, lean, night) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean * 0.4);
  ctx.strokeStyle = night ? '#3a2f22' : '#6a4a28';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -size * 0.7, 8, -size); ctx.stroke();
  ctx.fillStyle = night ? '#1d4a2a' : '#2f7a44';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(8, -size);
    ctx.quadraticCurveTo(8 + Math.cos(a) * size * 0.9, -size + Math.sin(a) * size * 0.7, 8 + Math.cos(a) * size * 1.25, -size + Math.sin(a) * size * 0.9 + 6);
    ctx.quadraticCurveTo(8 + Math.cos(a) * size * 0.6, -size + Math.sin(a) * size * 0.5, 8, -size);
    ctx.fill();
  }
  ctx.restore();
}

export function drawWorld(ctx, world, cam, hour) {
  const sky = skyFor(hour);
  const night = hour >= 21 || hour < 6;
  const x0 = Math.max(0, cam.x - 40), y0 = Math.max(0, cam.y - 40);
  const x1 = Math.min(WORLD.width, cam.x + 1320), y1 = Math.min(WORLD.height, cam.y + 840);
  // Ground: grass base, sand on the beach strip, sea to the west.
  ctx.fillStyle = night ? '#2c3a26' : '#6fae5e';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = night ? '#1c4a66' : '#2f7fb8';
  ctx.fillRect(x0, y0, Math.min(WORLD.seaEdge, x1) - x0, y1 - y0);
  // Sea shimmer lines.
  ctx.strokeStyle = night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
    ctx.beginPath(); ctx.moveTo(x0 + 20, y + 30); ctx.lineTo(Math.min(WORLD.seaEdge - 30, x1), y + 30); ctx.stroke();
  }
  ctx.fillStyle = night ? '#8a7a55' : '#e8cf96';
  ctx.fillRect(Math.max(x0, WORLD.seaEdge), y0, Math.min(WORLD.beachEdge, x1) - Math.max(x0, WORLD.seaEdge), y1 - y0);
  // Pier.
  const p = world.pier;
  ctx.fillStyle = night ? '#5a4630' : '#8a6a42';
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 3;
  ctx.strokeRect(p.x, p.y, p.w, p.h);
  // Roads.
  ctx.fillStyle = night ? '#2e2e34' : '#4a4a52';
  for (let x = 520; x < WORLD.width; x += ROAD_STEP) ctx.fillRect(x, y0, ROAD_HALF * 2, y1 - y0);
  for (let y = 120; y < WORLD.height; y += ROAD_STEP) ctx.fillRect(x0, y, x1 - x0, ROAD_HALF * 2);
  // Road centre dashes.
  ctx.strokeStyle = night ? 'rgba(255,220,120,0.25)' : 'rgba(255,220,120,0.7)';
  ctx.lineWidth = 3; ctx.setLineDash([18, 22]);
  for (let x = 520 + ROAD_HALF; x < WORLD.width; x += ROAD_STEP) {
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  }
  for (let y = 120 + ROAD_HALF; y < WORLD.height; y += ROAD_STEP) {
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Plaza: paved circle + fountain.
  const f = world.fountain;
  ctx.fillStyle = night ? '#5a5a60' : '#c8b898';
  ctx.beginPath(); ctx.arc(f.x, f.y, 190, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = night ? '#2a6a8a' : '#4aa8d8';
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = night ? '#3a8ab8' : '#7ec8ee';
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r - 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, Math.PI * 2); ctx.fill();
  // Benches + umbrellas around the plaza.
  ctx.fillStyle = '#8a6a42';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.fillRect(f.x + Math.cos(a) * 120 - 18, f.y + Math.sin(a) * 120 - 5, 36, 10);
  }
  // Buildings.
  for (const b of world.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    }
    // Lit windows at night.
    if (night) {
      ctx.fillStyle = 'rgba(255,220,120,0.85)';
      for (let wx = b.x + 14; wx < b.x + b.w - 14; wx += 30) {
        for (let wy = b.y + 14; wy < b.y + b.h - 14; wy += 30) {
          if (((wx * 7 + wy * 13) % 5) < 2) ctx.fillRect(wx, wy, 12, 14);
        }
      }
    }
    if (b.label) {
      ctx.font = 'bold 15px Arial, sans-serif';
      const tw = ctx.measureText(b.label).width;
      ctx.fillStyle = 'rgba(20,20,30,0.85)';
      ctx.fillRect(b.x + b.w / 2 - tw / 2 - 8, b.y + b.h / 2 - 13, tw + 16, 24);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  }
  // Palms.
  for (const palm of world.palms) {
    if (palm.x < x0 - 40 || palm.x > x1 + 40 || palm.y < y0 - 40 || palm.y > y1 + 40) continue;
    drawPalm(ctx, palm.x, palm.y, palm.size, palm.lean, night);
  }
  // Golden-hour / night tint over the whole view.
  if (sky.tint !== 'rgba(255,255,255,0.0)') {
    ctx.fillStyle = sky.tint;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}
