// SOLMAR world — the city of Solmar itself: a seeded procedural map
// (beach west, marina south-east, plaza centre), its collision shapes,
// and all ground-level drawing.

import { WORLD_W, WORLD_H, clamp, mulberry32, pick } from './core.js';
import { PALETTE } from './tuning.js';

export const AVENUES = [600, 1200, 1800, 2400, 3000];
export const STREETS = [500, 1000, 1500, 2000];
export const ROAD_W = 96;

export function buildCity(seed = 1337) {
  const rng = mulberry32(seed);
  const buildings = [];
  const roofs = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];

  // City blocks sit between the avenues and streets. The plaza block at
  // the centre (avenue 1800 / street 1000) stays open, as does the beach
  // strip on the west edge and the marina basin in the south-east.
  const xs = [300, ...AVENUES, WORLD_W - 60];
  const ys = [60, ...STREETS, WORLD_H - 60];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + ROAD_W / 2 + 14;
      const x1 = xs[bi + 1] - ROAD_W / 2 - 14;
      const y0 = ys[bj] + ROAD_W / 2 + 14;
      const y1 = ys[bj + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // Plaza block: keep open for the fountain square.
      if (Math.abs(cx - 1800) < 320 && Math.abs(cy - 1000) < 280) continue;
      // Marina block: keep open for the docks.
      if (cx > 2700 && cy > 2000) continue;
      // Beach strip: nothing built west of x = 300.
      if (x1 < 320) continue;
      const count = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const w = 90 + rng() * 130;
        const h = 80 + rng() * 110;
        const bx = x0 + rng() * Math.max(1, x1 - x0 - w);
        const by = y0 + rng() * Math.max(1, y1 - y0 - h);
        buildings.push({
          x: bx, y: by, w, h,
          color: pick(rng, roofs),
          tall: rng() < 0.22,
        });
      }
    }
  }

  // Palm trees along the beach promenade and the plaza edges.
  const palms = [];
  for (let y = 120; y < WORLD_H - 100; y += 130) {
    palms.push({ x: 268 + rng() * 20, y });
  }
  for (let i = 0; i < 10; i++) {
    palms.push({ x: 1560 + rng() * 480, y: 760 + (i % 2) * 480 });
  }

  // Parked cars, benches and crates scattered as decoration.
  const props = [];
  for (let i = 0; i < 26; i++) {
    props.push({
      x: 340 + rng() * (WORLD_W - 500),
      y: 120 + rng() * (WORLD_H - 260),
      kind: pick(rng, ['bench', 'crate', 'planter']),
    });
  }

  return {
    buildings,
    palms,
    props,
    plaza: { x: 1800, y: 1000, r: 190 },
    fountain: { x: 1800, y: 1000, r: 34 },
    marina: { x: 2960, y: 2260, w: 420, h: 260 },
    beach: { x: 0, w: 280 },
    water: { x: 0, w: 150 },
  };
}

export function isOnRoad(x, y) {
  for (const ax of AVENUES) {
    if (Math.abs(x - ax) < ROAD_W / 2) return true;
  }
  for (const sy of STREETS) {
    if (Math.abs(y - sy) < ROAD_W / 2) return true;
  }
  return false;
}

export function isWater(x, y, city) {
  if (x < city.water.w) return true;
  const m = city.marina;
  return x > m.x - m.w / 2 && x < m.x + m.w / 2 && y > m.y - m.h / 2 && y < m.y + m.h / 2;
}

export function isInPlaza(x, y, city) {
  const dx = x - city.plaza.x;
  const dy = y - city.plaza.y;
  return dx * dx + dy * dy < city.plaza.r * city.plaza.r;
}

// Collision against buildings lives with the movers (they import
// pushOutOfRect from core.js); this file only owns the map data.

export function roadPointNear(x, y) {
  // Snap a point onto the nearest road centreline (used for spawns).
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  }
  return best;
}

export function drawGround(ctx, G, city, cam, view) {
  const { x: cx, y: cy, w: vw, h: vh } = view;
  // Grass base.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(cx, cy, vw, vh);
  // Mown stripes for a cheap sense of scale.
  ctx.fillStyle = PALETTE.grassDark;
  const stripe = 240;
  const startY = Math.floor(cy / stripe) * stripe;
  for (let y = startY; y < cy + vh; y += stripe * 2) {
    ctx.fillRect(cx, y, vw, stripe);
  }

  // Sea + sand on the west edge.
  const seaX = city.water.w;
  if (cx < seaX + 40) {
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(cx, cy, Math.max(0, seaX - cx), vh);
    ctx.fillStyle = PALETTE.water;
    const wave = Math.sin(G.time * 1.4) * 4;
    ctx.fillRect(cx, cy, Math.max(0, seaX - 26 + wave - cx), vh);
  }
  if (cx < city.beach.w + 40) {
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(Math.max(cx, seaX), cy, Math.max(0, city.beach.w - Math.max(cx, seaX)), vh);
  }

  // Marina basin.
  const m = city.marina;
  if (cx < m.x + m.w / 2 && cx + vw > m.x - m.w / 2 && cy < m.y + m.h / 2 && cy + vh > m.y - m.h / 2) {
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(m.x - m.w / 2 + 8, m.y - m.h / 2 + 8, m.w - 16, m.h - 16);
    // Dock piers.
    ctx.fillStyle = '#8a6b45';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(m.x - m.w / 2 + 60 + i * 130, m.y - m.h / 2 + 30, 16, m.h - 90);
    }
    // Moored boats.
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.ellipse(m.x - 90, m.y - 40, 34, 12, 0.3, 0, Math.PI * 2);
    ctx.ellipse(m.x + 70, m.y + 60, 34, 12, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Plaza paving + fountain.
  const p = city.plaza;
  if (cx < p.x + p.r && cx + vw > p.x - p.r && cy < p.y + p.r && cy + vh > p.y - p.r) {
    ctx.fillStyle = PALETTE.plaza;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8d7c5c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r - 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.water;
    ctx.beginPath();
    ctx.arc(city.fountain.x, city.fountain.y, city.fountain.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8e8f0';
    ctx.beginPath();
    ctx.arc(city.fountain.x, city.fountain.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Roads: asphalt strips with centre dashes and sidewalks.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const ax of AVENUES) {
    ctx.fillRect(ax - ROAD_W / 2 - 10, cy, ROAD_W + 20, vh);
  }
  for (const sy of STREETS) {
    ctx.fillRect(cx, sy - ROAD_W / 2 - 10, vw, ROAD_W + 20);
  }
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of AVENUES) {
    ctx.fillRect(ax - ROAD_W / 2, cy, ROAD_W, vh);
  }
  for (const sy of STREETS) {
    ctx.fillRect(cx, sy - ROAD_W / 2, vw, ROAD_W);
  }
  ctx.fillStyle = PALETTE.asphaltLine;
  for (const ax of AVENUES) {
    const startY2 = Math.floor(cy / 64) * 64;
    for (let y = startY2; y < cy + vh; y += 64) {
      ctx.fillRect(ax - 2, y, 4, 30);
    }
  }
  for (const sy of STREETS) {
    const startX = Math.floor(cx / 64) * 64;
    for (let x = startX; x < cx + vw; x += 64) {
      ctx.fillRect(x, sy - 2, 30, 4);
    }
  }

  // Props: benches, crates, planters.
  for (const pr of city.props) {
    if (pr.x < cx - 40 || pr.x > cx + vw + 40 || pr.y < cy - 40 || pr.y > cy + vh + 40) continue;
    if (pr.kind === 'bench') {
      ctx.fillStyle = '#7a5a38';
      ctx.fillRect(pr.x - 16, pr.y - 5, 32, 10);
    } else if (pr.kind === 'crate') {
      ctx.fillStyle = '#a87c4a';
      ctx.fillRect(pr.x - 10, pr.y - 10, 20, 20);
      ctx.strokeStyle = '#6e4f2a';
      ctx.strokeRect(pr.x - 10, pr.y - 10, 20, 20);
    } else {
      ctx.fillStyle = '#3f7d5a';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Palm trees.
  for (const palm of city.palms) {
    if (palm.x < cx - 40 || palm.x > cx + vw + 40 || palm.y < cy - 40 || palm.y > cy + vh + 40) continue;
    ctx.strokeStyle = '#6e4f2a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 4, palm.y - 22);
    ctx.stroke();
    ctx.fillStyle = '#2f7d3a';
    ctx.beginPath();
    ctx.arc(palm.x + 4, palm.y - 26, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings, with a fake shadow and a lit roof edge at night.
  for (const b of city.buildings) {
    if (b.x > cx + vw || b.x + b.w < cx || b.y > cy + vh || b.y + b.h < cy) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = PALETTE.buildingEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, 10);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.6, b.h * 0.5);
    }
    if (G.mood === 'night') {
      ctx.fillStyle = 'rgba(255, 214, 120, 0.75)';
      const lit = Math.floor((b.x + b.y) % 3) + 1;
      for (let i = 0; i < lit; i++) {
        ctx.fillRect(b.x + 10 + i * 26, b.y + 12, 12, 14);
      }
    }
  }

  // Beach label and street names, painted on the ground.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'left';
  if (cx < 300) ctx.fillText('SOLMAR BEACH', 30, 300);
  ctx.font = 'bold 15px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  if (cy < 520 && cy + vh > 480) ctx.fillText('PALM AVE', 640, 492);
  if (cy < 1020 && cy + vh > 980) ctx.fillText('OCEAN BLVD', 1240, 992);
  ctx.textAlign = 'left';
}
