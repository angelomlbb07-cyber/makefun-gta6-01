// world.js — SOLMAR city generation, collision, and day/night lighting.
// One job: the map. Deterministic from a fixed seed, so two runs of the
// game build the same city every time.
import { TUNING } from './tuning.js';

// mulberry32 — small deterministic PRNG, seeded once per city.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY_SEED = 20261120;

// District of a world point: 'beach' | 'marina' | 'downtown' | 'plaza' | 'suburb'.
export function districtAt(x, y) {
  if (x < TUNING.beachX) return 'beach';
  if (x < 900 && y > TUNING.marinaY - 320 && y < TUNING.marinaY + 320) return 'marina';
  if (x > 3000 && x < 4300 && y > 900 && y < 2400) return 'downtown';
  if (x > 2100 && x < 3000 && y > 1400 && y < 2100) return 'plaza';
  return 'suburb';
}

export function generateCity(seed = CITY_SEED) {
  const rng = makeRng(seed);
  const roadsV = [];
  const roadsH = [];
  for (let x = TUNING.beachX + 140; x < TUNING.worldWidth; x += TUNING.roadSpacing) roadsV.push(x);
  for (let y = 140; y < TUNING.worldHeight; y += TUNING.roadSpacing) roadsH.push(y);

  const buildings = [];
  const roofs = TUNING.colours.buildingRoof;
  // One building per city block, skipping the plaza block and the marina strip.
  for (let bx = 0; bx < roadsV.length - 1; bx++) {
    for (let by = 0; by < roadsH.length - 1; by++) {
      const x0 = roadsV[bx] + TUNING.roadWidth / 2 + 12;
      const y0 = roadsH[by] + TUNING.roadWidth / 2 + 12;
      const cx = x0 + TUNING.blockSize / 2;
      const cy = y0 + TUNING.blockSize / 2;
      const district = districtAt(cx, cy);
      if (district === 'plaza') continue;               // plaza stays open
      if (district === 'marina' && rng() < 0.55) continue; // docks stay open
      const tall = district === 'downtown';
      const w = tall ? 96 + rng() * 70 : 64 + rng() * 62;
      const h = tall ? 96 + rng() * 70 : 60 + rng() * 58;
      buildings.push({
        x: cx - w / 2, y: cy - h / 2, w, h,
        roof: roofs[Math.floor(rng() * roofs.length)],
        tall,
        district,
        windows: tall ? 5 : 3,
      });
    }
  }

  // Marina piers jutting into the water.
  const piers = [];
  for (let i = 0; i < 4; i++) {
    piers.push({ x: 40, y: TUNING.marinaY - 240 + i * 170, w: 190, h: 26 });
  }

  // Benny's Garage — repair zone, downtown edge.
  const garage = { x: 3350, y: 2520, w: 170, h: 120, label: "BENNY'S GARAGE" };
  // Plaza fountain.
  const fountain = { x: 2550, y: 1750, r: 52 };
  // Landmarks for missions.
  const landmarks = {
    beachStart: { x: 480, y: 700, label: 'Solmar Beach' },
    plaza: { x: 2550, y: 1750, label: 'Marina Plaza' },
    downtown: { x: 3650, y: 1650, label: 'Downtown' },
    marina: { x: 520, y: TUNING.marinaY, label: 'Marina' },
    garage: { x: garage.x + garage.w / 2, y: garage.y + garage.h / 2, label: "Benny's Garage" },
    northGate: { x: 2600, y: 300, label: 'North Gate' },
    southDocks: { x: 700, y: 3200, label: 'South Docks' },
    airport: { x: 4600, y: 3000, label: 'Solmar Airfield' },
  };

  return { seed, roadsV, roadsH, buildings, piers, garage, fountain, landmarks };
}

// --- Collision ------------------------------------------------------------
// True when the point is inside a building, a pier edge, or the deep water.
export function solidAt(world, x, y) {
  if (x < 0 || y < 0 || x > TUNING.worldWidth || y > TUNING.worldHeight) return true;
  if (x < TUNING.waterX) return true; // deep water blocks everyone
  for (const b of world.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of any building it overlaps. Returns true if it hit.
export function resolveCircleCollision(world, body, radius) {
  let hit = false;
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx, dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x = nx + (dx / d) * radius;
        body.y = ny + (dy / d) * radius;
      } else {
        body.y = b.y - radius; // centre inside the block: shove out the top
      }
    }
  }
  return hit;
}

export function inGarageZone(world, x, y) {
  const g = world.garage;
  return x > g.x - 30 && x < g.x + g.w + 30 && y > g.y - 30 && y < g.y + g.h + 30;
}

// --- Lighting -------------------------------------------------------------
// Returns { ambient: 0..1, tint } for a clock hour. Golden hour glows warm,
// night goes dark blue, midday is bright.
export function lightingForHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  const golden = h >= TUNING.goldenHourStart && h <= TUNING.goldenHourEnd;
  const night = h >= TUNING.nightStart || h < TUNING.nightEnd;
  if (golden) {
    const t = (h - TUNING.goldenHourStart) / (TUNING.goldenHourEnd - TUNING.goldenHourStart);
    return { ambient: 0.82 - t * 0.14, tint: 'rgba(255,166,66,0.20)', golden: true, night: false };
  }
  if (night) return { ambient: 0.42, tint: 'rgba(24,44,110,0.34)', golden: false, night: true };
  if (h >= 6 && h <= 8) return { ambient: 0.72, tint: 'rgba(255,190,120,0.10)', golden: false, night: false };
  return { ambient: 1.0, tint: 'rgba(255,244,214,0.04)', golden: false, night: false };
}

// --- Rendering ------------------------------------------------------------
// Draws the ground, water, roads, districts, buildings and landmarks for the
// visible camera window only.
export function drawWorld(ctx, world, cam, viewW, viewH, clockHours) {
  const light = lightingForHour(clockHours);
  const x0 = Math.max(0, cam.x - 40), y0 = Math.max(0, cam.y - 40);
  const x1 = Math.min(TUNING.worldWidth, cam.x + viewW + 40);
  const y1 = Math.min(TUNING.worldHeight, cam.y + viewH + 40);

  // Base ground.
  ctx.fillStyle = TUNING.colours.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Beach sand + water on the west edge.
  ctx.fillStyle = TUNING.colours.sand;
  ctx.fillRect(x0, y0, Math.max(0, Math.min(x1, TUNING.beachX) - x0), y1 - y0);
  ctx.fillStyle = TUNING.colours.water;
  ctx.fillRect(x0, y0, Math.max(0, Math.min(x1, TUNING.waterX) - x0), y1 - y0);
  ctx.fillStyle = TUNING.colours.waterDeep;
  for (let wy = Math.floor(y0 / 90) * 90; wy < y1; wy += 90) {
    ctx.fillRect(x0, wy, Math.max(0, Math.min(x1, 60) - x0), 4);
  }
  // Shoreline foam.
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(TUNING.waterX + 6, y0);
  ctx.lineTo(TUNING.waterX + 6, y1);
  ctx.stroke();

  // Marina piers.
  ctx.fillStyle = '#8a6f4d';
  for (const p of world.piers) ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#e8e8e8';
  for (let i = 0; i < 5; i++) {
    const py = TUNING.marinaY - 250 + i * 130;
    ctx.fillRect(150, py, 66, 20); // moored boats
    ctx.fillStyle = '#c94f3d';
    ctx.fillRect(150, py, 14, 20);
    ctx.fillStyle = '#e8e8e8';
  }

  // Roads.
  ctx.fillStyle = TUNING.colours.road;
  for (const rx of world.roadsV) if (rx > x0 - 80 && rx < x1 + 80) ctx.fillRect(rx - TUNING.roadWidth / 2, y0, TUNING.roadWidth, y1 - y0);
  for (const ry of world.roadsH) if (ry > y0 - 80 && ry < y1 + 80) ctx.fillRect(x0, ry - TUNING.roadWidth / 2, x1 - x0, TUNING.roadWidth);
  // Centre dashes.
  ctx.fillStyle = TUNING.colours.roadLine;
  for (const rx of world.roadsV) {
    if (rx < x0 - 80 || rx > x1 + 80) continue;
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(rx - 2, y, 4, 22);
  }
  for (const ry of world.roadsH) {
    if (ry < y0 - 80 || ry > y1 + 80) continue;
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, ry - 2, 22, 4);
  }

  // Plaza paving + fountain.
  ctx.fillStyle = TUNING.colours.plaza;
  ctx.fillRect(2140, 1440, 820, 620);
  ctx.fillStyle = '#7fb6d9';
  ctx.beginPath(); ctx.arc(world.fountain.x, world.fountain.y, world.fountain.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9eefb';
  ctx.beginPath(); ctx.arc(world.fountain.x, world.fountain.y, world.fountain.r - 14, 0, Math.PI * 2); ctx.fill();

  // Benny's Garage.
  const g = world.garage;
  ctx.fillStyle = '#4d4a45';
  ctx.fillRect(g.x, g.y, g.w, g.h);
  ctx.fillStyle = '#e8b13c';
  ctx.fillRect(g.x, g.y, g.w, 10);
  ctx.fillStyle = '#f5f0e6';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("BENNY'S", g.x + g.w / 2, g.y + g.h / 2 - 4);
  ctx.fillText('GARAGE', g.x + g.w / 2, g.y + g.h / 2 + 14);

  // Buildings (only those on screen).
  for (const b of world.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x, b.y, b.w, 8);
    if (b.tall) {
      ctx.fillStyle = 'rgba(20,30,44,0.55)';
      for (let i = 0; i < b.windows; i++) {
        for (let j = 0; j < b.windows; j++) {
          ctx.fillRect(b.x + 10 + i * ((b.w - 20) / b.windows), b.y + 12 + j * ((b.h - 24) / b.windows), 8, 10);
        }
      }
    } else {
      ctx.fillStyle = 'rgba(20,30,44,0.5)';
      ctx.fillRect(b.x + b.w / 2 - 9, b.y + b.h - 16, 18, 16); // door
    }
  }

  // District labels.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  if (x0 < 900) ctx.fillText('SOLMAR BEACH', 480, 420);
  if (x0 < 4300 && x1 > 3000) ctx.fillText('DOWNTOWN', 3650, 1000);
  if (x0 < 3000 && x1 > 2100) ctx.fillText('MARINA PLAZA', 2550, 1500);

  // Lighting overlay.
  ctx.fillStyle = light.tint;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (light.night) {
    ctx.fillStyle = 'rgba(8,12,34,0.25)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  return light;
}
