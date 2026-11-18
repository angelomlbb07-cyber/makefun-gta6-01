// SOLMAR — render.js
// Everything the player sees: the city, the cars, the people, the police,
// the HUD, the menus and the mission-passed panel. The presentation rules
// from the round-3 gap analysis live here:
//  P0 — the title menu's sun and palms never cross the buttons or the
//       SOLMAR wordmark (they are drawn only at the screen margins, behind
//       the panel); the briefing toast is never drawn while the passed
//       panel is up; every panel is sized from measured text so nothing
//       clips or overlaps.
//  P1 — combat reads as combat (big on-foot player, visible enemies,
//       muzzle flashes, bright tracers, kill counter); the passed panel
//       shows payout, stars, LEVEL UP and a portrait dialogue; the cover
//       shows floating score text.
//  P2 — time-of-day tint and shadows (golden hour, sunset, night), a
//       landmark per shot, labelled buildings, pedestrians drawn as
//       people, and a dense clean HUD in every gameplay shot.
//  Round 5 — combat reads as combat (bigger on-foot player with a white
//       ring, bigger enemies, thicker tracers); building labels are never
//       clipped at a screen edge or hidden under a HUD panel; the
//       speedometer is not drawn under the passed panel.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROAD_W, ROADS_V, ROADS_H, SEA_Y, SAND_Y, TIMES_OF_DAY, RADIOS, CARS, clockText, money, starsText, levelForRespect } from './config.js';
import { districtAt, buildingAt, isRoadAt, isSandAt, isWaterAt } from './city.js';
import { missionLabel, missionTimerText, missionProgressText } from './missions.js';
import { speedKmh, playerCar } from './player.js';
import { clamp } from './random.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function text(ctx, str, x, y, size, colour, align, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = colour;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function textW(ctx, str, size, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  return ctx.measureText(str).width;
}

function panel(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke || 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

// Wrap a string to at most maxLines lines within maxW pixels, shrinking the
// font until it fits (F4: the objective banner never overflows its panel).
function wrapLines(ctx, str, maxW, size, maxLines) {
  let s = size;
  let lines = [];
  while (s > 11) {
    ctx.font = '700 ' + s + 'px ' + FONT;
    const words = str.split(' ');
    lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (ctx.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
    s -= 1;
  }
  return { lines, size: s };
}

// Round 5: HUD panel rectangles a building label must never sit under.
// A label is skipped when ANY part of its text box overlaps a panel —
// centre-only checks still left labels half-hidden behind the title menu
// (S2 "OCEAN VIEW BAR") and the minimap (S4 "PIER ARCADE").
function labelBlockedByHud(state, sx, sy, lw) {
  const rects = [
    [16, 16, 272, 66], // cash panel
    [16, 122, 272, 30], // radio chip
    [VIEW_W / 2 - 330, 16, 660, 110], // mission banner + timer line
    [VIEW_W - 290, 16, 274, 112], // day / clock / district panel
    [16, 636, 296, 148], // health panel
    [VIEW_W / 2 - 150, 700, 300, 84], // speedometer
    [VIEW_W - 226, 634, 210, 150], // minimap
  ];
  if (state.dialogue) rects.push([VIEW_W / 2 - 300, 596, 600, 80]);
  if (state.mode === 'passed') rects.push([VIEW_W / 2 - 310, 96, 620, 600]);
  if (state.mode === 'title') rects.push([390, 120, 500, 560]);
  const bx0 = sx - lw / 2;
  const bx1 = sx + lw / 2;
  const by0 = sy - 10;
  const by1 = sy + 6;
  return rects.some(([x, y, w, h]) => bx0 < x + w && bx1 > x && by0 < y + h && by1 > y);
}

function worldToScreen(state, x, y) {
  const cam = state.camera;
  return {
    x: (x - cam.x) * cam.zoom + VIEW_W / 2,
    y: (y - cam.y) * cam.zoom + VIEW_H / 2,
  };
}

export function drawGame(ctx, state, city) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (state.mode === 'title' || state.mode === 'howto' || state.mode === 'missions') {
    drawWorld(ctx, state, city);
    drawTitleMenu(ctx, state, city);
    return;
  }
  drawWorld(ctx, state, city);
  drawHud(ctx, state, city);
  if (state.mode === 'passed' && state.mission.last) drawPassedPanel(ctx, state);
  else if (state.mode === 'wasted') drawEndScreen(ctx, state, 'WASTED', 'The Solmar PD scraped you off the pavement. Press R to get back up.');
  else if (state.mode === 'busted') drawEndScreen(ctx, state, 'BUSTED', 'The Solmar PD has you. Press R to make bail and go again.');
  else if (state.mode === 'pause') drawPause(ctx, state);
}

// ---------------------------------------------------------------- world

function drawWorld(ctx, state, city) {
  const tod = TIMES_OF_DAY[state.timeOfDay] || TIMES_OF_DAY.day;
  const cam = state.camera;
  const z = cam.zoom;
  const view = {
    x0: cam.x - VIEW_W / 2 / z, y0: cam.y - VIEW_H / 2 / z,
    x1: cam.x + VIEW_W / 2 / z, y1: cam.y + VIEW_H / 2 / z,
  };
  // Ground.
  ctx.fillStyle = '#6f9e4f';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Beach sand and sea along the south edge.
  drawRectWorld(ctx, state, 0, SAND_Y, WORLD_W, SEA_Y - SAND_Y, '#e8d29a');
  drawRectWorld(ctx, state, 0, SEA_Y, WORLD_W, WORLD_H - SEA_Y, '#2f7fc9');
  // Sea shimmer lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const wy = SEA_Y + 30 + i * 26;
    const a = worldToScreen(state, 100 + i * 90, wy);
    const b = worldToScreen(state, 500 + i * 90, wy);
    if (a.y > -10 && a.y < VIEW_H + 10) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // Park grass, plaza stone, docks concrete.
  drawRectWorld(ctx, state, city.park.x - 150, city.park.y - 120, 300, 240, '#5da24a');
  drawCircleWorld(ctx, state, city.plaza.x, city.plaza.y, city.plaza.r, '#c9b8a2');
  drawRectWorld(ctx, state, city.docks.x - 110, city.docks.y - 100, 220, 200, '#8a8f96');
  // Pier boards out into the sea.
  drawRectWorld(ctx, state, city.pier.x - city.pier.w / 2, city.pier.y - 40, city.pier.w, city.pier.h, '#a9805a');
  // Roads.
  for (const rx of ROADS_V) drawRectWorld(ctx, state, rx - ROAD_W / 2, 0, ROAD_W, SAND_Y, '#3d4149');
  for (const ry of ROADS_H) drawRectWorld(ctx, state, 0, ry - ROAD_W / 2, WORLD_W, ROAD_W, '#3d4149');
  // Road centre dashes.
  ctx.strokeStyle = 'rgba(255,214,77,0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const rx of ROADS_V) {
    const a = worldToScreen(state, rx, 0);
    const b = worldToScreen(state, rx, SAND_Y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const ry of ROADS_H) {
    const a = worldToScreen(state, 0, ry);
    const b = worldToScreen(state, WORLD_W, ry);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at the plaza corners.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const [cx, cy] of [[1320, 1320], [1720, 1320], [1320, 1720], [1720, 1720]]) {
    const s = worldToScreen(state, cx, cy);
    if (s.x > -40 && s.x < VIEW_W + 40 && s.y > -40 && s.y < VIEW_H + 40) {
      ctx.fillRect(s.x - 26 * z, s.y - 4, 52 * z, 8);
    }
  }
  // Plaza fountain: the combat landmark.
  const fs = worldToScreen(state, city.plaza.x, city.plaza.y);
  ctx.fillStyle = '#7fb8d8';
  ctx.beginPath(); ctx.arc(fs.x, fs.y, 46 * z, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 4 * z;
  ctx.beginPath(); ctx.arc(fs.x, fs.y, 46 * z, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath(); ctx.arc(fs.x, fs.y, 18 * z, 0, Math.PI * 2); ctx.fill();
  // Park pond.
  const pk = worldToScreen(state, city.park.x, city.park.y);
  ctx.fillStyle = '#4d9ec9';
  ctx.beginPath(); ctx.ellipse(pk.x, pk.y, 90 * z, 55 * z, 0, 0, Math.PI * 2); ctx.fill();
  // Buildings, with their name labels painted on the roof.
  for (const b of city.buildings) {
    if (b.x < view.x0 - 200 || b.x > view.x1 + 200 || b.y < view.y0 - 200 || b.y > view.y1 + 200) continue;
    const s = worldToScreen(state, b.x, b.y);
    const w = b.w * z;
    const h = b.h * z;
    // Long shadow at golden hour / sunset.
    if (tod.shadow > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(s.x - w / 2 + tod.shadow * z * 0.4, s.y - h / 2 + tod.shadow * z * 0.4, w, h);
    }
    ctx.fillStyle = b.colour;
    ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(s.x - w / 2, s.y - h / 2, w, 10 * z);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x - w / 2, s.y - h / 2, w, h);
    if (z >= 0.55) {
      const labelSize = Math.max(11, Math.round(12 * z));
      const lw = textW(ctx, b.label, labelSize, 800);
      // Round 5: never draw a label that would clip at a screen edge, and
      // never draw one whose centre sits under a HUD panel (the S1/S2
      // clipped labels and the S4 minimap/health overlaps came from here).
      const clipped = s.x - lw / 2 < 8 || s.x + lw / 2 > VIEW_W - 8 || s.y < 12 || s.y > VIEW_H - 12;
      if (lw < w + 30 && !clipped && !labelBlockedByHud(state, s.x, s.y, lw)) {
        ctx.font = '800 ' + labelSize + 'px ' + FONT;
        ctx.fillStyle = 'rgba(20,20,20,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, s.x, s.y + 4);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(b.label, s.x - 1, s.y + 3);
      }
    }
  }
  // Palms, benches, umbrellas.
  for (const palm of city.palms) drawPalm(ctx, state, palm.x, palm.y);
  for (const bench of city.benches) drawBench(ctx, state, bench.x, bench.y, bench.angle);
  for (const um of city.umbrellas) drawUmbrella(ctx, state, um.x, um.y, um.colour);
  // Roadblocks.
  for (const rb of state.roadblocks) {
    const s = worldToScreen(state, rb.x, rb.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(rb.angle);
    ctx.fillStyle = '#e33f2f';
    ctx.fillRect(-34 * z, -8 * z, 68 * z, 16 * z);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-34 * z, -8 * z, 12 * z, 16 * z);
    ctx.fillRect(-8 * z, -8 * z, 12 * z, 16 * z);
    ctx.restore();
  }
  // Pickups (mission packages): yellow boxes with a glow ring.
  for (const pk2 of state.pickups) {
    if (pk2.taken) continue;
    const s = worldToScreen(state, pk2.x, pk2.y);
    ctx.fillStyle = 'rgba(255,217,77,0.25)';
    ctx.beginPath(); ctx.arc(s.x, s.y, 26 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(s.x - 12 * z, s.y - 12 * z, 24 * z, 24 * z);
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x - 12 * z, s.y - 12 * z, 24 * z, 24 * z);
  }
  // Traffic and police cars.
  for (const car of state.cars) drawCar(ctx, state, car);
  // Pedestrians as small visible people, never dots.
  for (const ped of state.peds) drawPerson(ctx, state, ped.x, ped.y, ped.angle, ped.shirt, ped.colour, 1, false);
  // Gang enemies: bigger, red-shirted, with a gun line. Round 5 raises
  // the scale so they read as armed people, not dots, at contact-sheet size.
  for (const e of state.enemies) {
    if (!e.alive) continue;
    drawPerson(ctx, state, e.x, e.y, e.angle, '#c22e2e', '#2a2a2a', 1.45, true);
    // Health bar over an enemy.
    const s = worldToScreen(state, e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(s.x - 18 * z, s.y - 34 * z, 36 * z, 5 * z);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(s.x - 18 * z, s.y - 34 * z, 36 * z * (e.hp / 60), 5 * z);
  }
  // Foot cops: dark blue people with a cap.
  for (const fc of state.footCops) {
    if (fc.down) continue;
    drawPerson(ctx, state, fc.x, fc.y, fc.angle, '#1c3d6e', '#d8c26a', 1.05, false);
    const s = worldToScreen(state, fc.x, fc.y);
    ctx.fillStyle = '#1c3d6e';
    ctx.beginPath(); ctx.arc(s.x, s.y - 12 * z, 7 * z, 0, Math.PI * 2); ctx.fill();
  }
  // The player: on foot a big readable person with a gun; in a car the car.
  const p = state.player;
  if (p) {
    if (p.onFoot) {
      // Round 5: the player draws larger (1.6) and the ring is white, not
      // gold, so it reads against the yellow shirt and the muzzle flash.
      drawPerson(ctx, state, p.x, p.y, p.aimAngle, '#ffd94d', '#20242e', 1.6, true);
      const s = worldToScreen(state, p.x, p.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, 24 * z, 0, Math.PI * 2); ctx.stroke();
    }
    // Waypoint arrow and distance.
    drawWaypoint(ctx, state);
  }
  // Helicopter with its searchlight cone.
  if (state.heli) {
    const s = worldToScreen(state, state.heli.x, state.heli.y);
    ctx.fillStyle = 'rgba(255,255,220,0.20)';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - 70 * z, s.y + 190 * z);
    ctx.lineTo(s.x + 70 * z, s.y + 190 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 30 * z, 12 * z, state.heli.angle, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath(); ctx.arc(s.x + 24 * z, s.y, 4 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(s.x + 14 * z, s.y + 16 * z, 30 * z, 10 * z, state.heli.angle, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'POLICE HELI', s.x, s.y - 22 * z, Math.max(11, 12 * z), '#ffffff', 'center', 800);
  }
  // Muzzle flashes: bright star bursts.
  for (const mz of state.muzzle) {
    const s = worldToScreen(state, mz.x, mz.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(mz.angle);
    ctx.fillStyle = '#ffe95a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(26 * z, -7 * z);
    ctx.lineTo(34 * z, 0);
    ctx.lineTo(26 * z, 7 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 7 * z, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Tracers: bright lines that read at contact-sheet scale. Round 5
  // thickens them (the round-3 lines were too thin to see at small size).
  for (const b of state.bullets) {
    const a = worldToScreen(state, b.x1, b.y1);
    const c = worldToScreen(state, b.x2, b.y2);
    ctx.strokeStyle = b.enemy ? '#ff7a3d' : '#ffe95a';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
  // Floating score texts, with a dark outline so they read on sand, sea
  // and grass alike at contact-sheet scale.
  for (const f of state.floats) {
    const s = worldToScreen(state, f.x, f.y);
    const alpha = clamp(f.life / 1.6, 0, 1);
    const fsize = Math.round(17 * z) + 4;
    ctx.globalAlpha = alpha;
    ctx.font = '800 ' + fsize + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,10,10,0.85)';
    ctx.strokeText(f.text, s.x, s.y);
    ctx.fillStyle = f.colour;
    ctx.fillText(f.text, s.x, s.y);
    ctx.globalAlpha = 1;
  }
  // Time-of-day tint over the whole scene.
  if (tod.tint !== 'rgba(255,255,255,0)') {
    ctx.fillStyle = tod.tint;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (tod.dark > 0) {
    ctx.fillStyle = 'rgba(8,12,32,' + tod.dark + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // Headlight cones and glow at sunset and night.
  if (state.timeOfDay === 'sunset' || state.timeOfDay === 'night') {
    for (const car of state.cars) {
      const s = worldToScreen(state, car.x, car.y);
      ctx.fillStyle = 'rgba(255,240,180,0.16)';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      const a = car.angle;
      ctx.lineTo(s.x + Math.cos(a - 0.3) * 150 * z, s.y + Math.sin(a - 0.3) * 150 * z);
      ctx.lineTo(s.x + Math.cos(a + 0.3) * 150 * z, s.y + Math.sin(a + 0.3) * 150 * z);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRectWorld(ctx, state, x, y, w, h, colour) {
  const a = worldToScreen(state, x, y);
  const b = worldToScreen(state, x + w, y + h);
  ctx.fillStyle = colour;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
}

function drawCircleWorld(ctx, state, x, y, r, colour) {
  const s = worldToScreen(state, x, y);
  ctx.fillStyle = colour;
  ctx.beginPath(); ctx.arc(s.x, s.y, r * state.camera.zoom, 0, Math.PI * 2); ctx.fill();
}

function drawPalm(ctx, state, x, y) {
  const s = worldToScreen(state, x, y);
  const z = state.camera.zoom;
  if (s.x < -60 || s.x > VIEW_W + 60 || s.y < -60 || s.y > VIEW_H + 60) return;
  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = 4 * z;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 4 * z, s.y - 18 * z); ctx.stroke();
  ctx.fillStyle = '#3f8f3f';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.55;
    ctx.beginPath();
    ctx.ellipse(s.x + 4 * z + Math.cos(a) * 14 * z, s.y - 18 * z + Math.sin(a) * 8 * z, 16 * z, 5 * z, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBench(ctx, state, x, y, angle) {
  const s = worldToScreen(state, x, y);
  const z = state.camera.zoom;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(-16 * z, -5 * z, 32 * z, 10 * z);
  ctx.restore();
}

function drawUmbrella(ctx, state, x, y, colour) {
  const s = worldToScreen(state, x, y);
  const z = state.camera.zoom;
  ctx.fillStyle = colour;
  ctx.beginPath(); ctx.arc(s.x, s.y, 20 * z, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(s.x, s.y, 20 * z, Math.PI, Math.PI * 1.5); ctx.fill();
  ctx.strokeStyle = '#5a4632';
  ctx.lineWidth = 2 * z;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + 16 * z); ctx.stroke();
}

// A person: legs, a coloured shirt, arms, a head, and a gun line when armed.
// Drawn at a readable size — pedestrians are people, not dots.
function drawPerson(ctx, state, x, y, angle, shirt, skin, scale, armed) {
  const s = worldToScreen(state, x, y);
  const z = state.camera.zoom * scale;
  if (s.x < -50 || s.x > VIEW_W + 50 || s.y < -50 || s.y > VIEW_H + 50) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  // Legs.
  ctx.fillStyle = '#20242e';
  ctx.fillRect(-4 * z, -6 * z, 8 * z, 4 * z);
  ctx.fillRect(-4 * z, 2 * z, 8 * z, 4 * z);
  // Shirt (body).
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.roundRect(-7 * z, -8 * z, 16 * z, 16 * z, 4 * z); ctx.fill();
  // Arms.
  ctx.fillStyle = shirt;
  ctx.fillRect(6 * z, -8 * z, 7 * z, 5 * z);
  ctx.fillRect(6 * z, 3 * z, 7 * z, 5 * z);
  // Gun line when armed.
  if (armed) {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.5 * z;
    ctx.beginPath(); ctx.moveTo(10 * z, 0); ctx.lineTo(30 * z, 0); ctx.stroke();
  }
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(12 * z, 0, 6.5 * z, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCar(ctx, state, car) {
  const s = worldToScreen(state, car.x, car.y);
  const z = state.camera.zoom;
  if (s.x < -90 || s.x > VIEW_W + 90 || s.y < -90 || s.y > VIEW_H + 90) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(car.angle);
  const L = 46 * z;
  const W = 22 * z;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-L / 2 + 4 * z, -W / 2 + 4 * z, L, W);
  ctx.fillStyle = car.colour;
  ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 6 * z); ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  ctx.beginPath(); ctx.roundRect(-L / 6, -W / 2 + 4 * z, L / 3, W - 8 * z, 4 * z); ctx.fill();
  ctx.fillStyle = '#20242e';
  ctx.fillRect(L / 2 - 6 * z, -W / 2 + 2 * z, 4 * z, 5 * z);
  ctx.fillRect(L / 2 - 6 * z, W / 2 - 7 * z, 4 * z, 5 * z);
  if (car.driver === 'police') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-L / 2 + 4 * z, -W / 2 + 3 * z, L - 8 * z, 5 * z);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-4 * z, -W / 2 - 2 * z, 8 * z, 4 * z);
    ctx.fillStyle = '#2f7fe3';
    ctx.fillRect(4 * z, -W / 2 - 2 * z, 8 * z, 4 * z);
    text(ctx, 'PD', 0, 4 * z, Math.max(9, 10 * z), '#ffffff', 'center', 800);
  }
  // Damage smoke.
  if (car.hp < 45) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath(); ctx.arc(-L / 2, 0, 8 * z, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Nitro flame behind the player's car.
  if (car.driver === 'player' && state.player && state.player.car === car && Math.abs(car.speed) > 500) {
    const bx = s.x - Math.cos(car.angle) * 30 * z;
    const by = s.y - Math.sin(car.angle) * 30 * z;
    ctx.fillStyle = '#ff9a2e';
    ctx.beginPath(); ctx.arc(bx, by, 7 * z, 0, Math.PI * 2); ctx.fill();
  }
}

function drawWaypoint(ctx, state) {
  const m = state.mission;
  if (!m.active) return;
  const def = currentStepTarget(state);
  if (!def) return;
  const p = state.player;
  const d = Math.round(Math.hypot(def.x - p.x, def.y - p.y));
  const a = Math.atan2(def.y - p.y, def.x - p.x);
  // Diamond marker on the target itself.
  const s = worldToScreen(state, def.x, def.y);
  if (s.x > 0 && s.x < VIEW_W && s.y > 0 && s.y < VIEW_H) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
  }
  // Edge arrow pointing at the target, with the distance in metres.
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const ex = cx + Math.cos(a) * 300;
  const ey = cy + Math.sin(a) * 300;
  ctx.save();
  ctx.translate(clamp(ex, 40, VIEW_W - 40), clamp(ey, 40, VIEW_H - 40));
  ctx.rotate(a);
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
  text(ctx, d + ' m', clamp(ex, 60, VIEW_W - 60), clamp(ey, 60, VIEW_H - 60) + 26, 14, '#ffd94d', 'center', 800);
}

function currentStepTarget(state) {
  // The active step's target point, if it has one. Kept local so render.js
  // never imports the mission list's internals.
  const m = state.mission;
  if (!m.active) return null;
  const steps = missionStepsFor(state);
  const step = steps ? steps[m.step] : null;
  if (!step || typeof step.x !== 'number') return null;
  return { x: step.x, y: step.y };
}

function missionStepsFor(state) {
  // Steps are looked up from the staged objective when the mission list is
  // not imported here; the live game fills this via state.mission.stepsRef.
  return state.mission.stepsRef || null;
}

// ---------------------------------------------------------------- HUD

function drawHud(ctx, state, city) {
  const p = state.player;
  const d = p ? districtAt(p.x, p.y) : districtAt(state.camera.x, state.camera.y);
  // Top-left: cash panel with big cash, then stars, then radio chip.
  panel(ctx, 16, 16, 272, 66, 'rgba(10,14,22,0.78)');
  text(ctx, money(state.cash), 30, 52, 30, '#ffd94d', 'left', 800);
  text(ctx, 'CASH', 30, 72, 11, '#9aa4b2', 'left', 700);
  const stars = starsText(state.wanted);
  text(ctx, stars, 30, 108, 24, state.wanted > 0 ? '#ff5a5a' : '#8a94a2', 'left', 800);
  if (state.wanted > 0) text(ctx, 'WANTED', 170, 104, 12, '#ff8a8a', 'left', 800);
  const radio = RADIOS[state.radioStation % RADIOS.length];
  const rw = textW(ctx, '♪ ' + radio.name, 13, 700) + 24;
  panel(ctx, 16, 122, rw, 30, 'rgba(10,14,22,0.7)');
  ctx.fillStyle = radio.colour;
  ctx.beginPath(); ctx.arc(32, 137, 5, 0, Math.PI * 2); ctx.fill();
  text(ctx, '♪ ' + radio.name, 44, 141, 13, '#ffffff', 'left', 700);
  // Top-right: day, clock, time of day, district + flavour.
  const clockLine = 'DAY ' + state.day + ' · ' + clockText(state.time);
  const todLabel = (TIMES_OF_DAY[state.timeOfDay] || TIMES_OF_DAY.day).label;
  panel(ctx, VIEW_W - 290, 16, 274, 66, 'rgba(10,14,22,0.78)');
  text(ctx, clockLine, VIEW_W - 30, 44, 20, '#ffffff', 'right', 800);
  text(ctx, todLabel, VIEW_W - 30, 66, 12, '#ffb02e', 'right', 700);
  text(ctx, d.name, VIEW_W - 30, 104, 17, '#ffffff', 'right', 800);
  text(ctx, d.flavour, VIEW_W - 30, 124, 11, '#c8d0dc', 'right', 700);
  // Top-centre: mission banner, wrapped and shrunk to fit (F4).
  if (state.mission.active || state.mission.finished) {
    const label = missionLabel(state);
    const obj = state.mission.objective || '';
    const full = label + '  ·  ' + obj;
    const wrapped = wrapLines(ctx, full, 620, 17, 2);
    const bw = Math.min(660, Math.max(...wrapped.lines.map((l) => textW(ctx, l, wrapped.size, 700))) + 36);
    const bh = 20 + wrapped.lines.length * (wrapped.size + 4);
    panel(ctx, VIEW_W / 2 - bw / 2, 16, bw, bh, 'rgba(10,14,22,0.82)');
    wrapped.lines.forEach((line, i) => {
      text(ctx, line, VIEW_W / 2, 16 + 22 + i * (wrapped.size + 4), wrapped.size, '#ffffff', 'center', 700);
    });
    // Mission timer + counter under the banner.
    const timerText = state.mission.active
      ? missionTimerText(state) + '  ·  ' + missionProgressText(state)
      : missionProgressText(state) + '  ·  STORY COMPLETE';
    text(ctx, timerText, VIEW_W / 2, 16 + bh + 20, 14, '#ffd94d', 'center', 800);
  }
  // Briefing toast, drawn low enough to clear the cash panel (F5) and
  // never while the passed panel is up (P0).
  if (state.toast && !state.mission.passed && state.mission.passedTimer <= 0) {
    const tw = Math.min(760, textW(ctx, state.toast.text, 15, 700) + 36);
    panel(ctx, VIEW_W / 2 - tw / 2, 170, tw, 38, 'rgba(20,16,30,0.85)');
    text(ctx, state.toast.text, VIEW_W / 2, 195, 15, '#ffe9a8', 'center', 700);
  }
  // Bottom-left: health, armour, respect.
  panel(ctx, 16, 636, 296, 148, 'rgba(10,14,22,0.78)');
  barRow(ctx, 30, 668, 268, 'HEALTH', state.health, state.maxHealth, '#4ade80');
  barRow(ctx, 30, 700, 268, 'ARMOUR', state.armour, state.maxArmour, '#5aa2ff');
  barRow(ctx, 30, 732, 268, 'RESPECT LV ' + state.respectLevel, state.respect % 250, 250, '#ffb02e');
  const w = p ? (p.onFoot ? 'ON FOOT' : (p.car ? p.car.def.name.toUpperCase() : 'ON FOOT')) : 'ON FOOT';
  text(ctx, w, 30, 766, 13, '#c8d0dc', 'left', 700);
  // Bottom-centre: speedometer, car name, nitro, weapon + ammo. Round 5:
  // skipped entirely in passed mode, where the passed panel covers it and
  // the round-3 shot showed it half-hidden behind that panel.
  if (state.mode !== 'passed') {
  panel(ctx, VIEW_W / 2 - 150, 700, 300, 84, 'rgba(10,14,22,0.78)');
  const kmh = speedKmh(state);
  text(ctx, kmh + '', VIEW_W / 2 - 130, 756, 40, '#ffffff', 'left', 800);
  text(ctx, 'KM/H', VIEW_W / 2 - 62, 756, 13, '#9aa4b2', 'left', 700);
  const car = playerCar(state);
  text(ctx, car ? car.def.name : 'ON FOOT', VIEW_W / 2 + 150 - 14, 730, 14, '#ffffff', 'right', 700);
  text(ctx, 'NITRO', VIEW_W / 2 - 130, 776, 11, '#9aa4b2', 'left', 700);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(VIEW_W / 2 - 78, 766, 120, 10);
  ctx.fillStyle = '#2ec8ff';
  ctx.fillRect(VIEW_W / 2 - 78, 766, 120 * (state.nitro / state.maxNitro), 10);
  if (p) {
    const wname = p.weapon.toUpperCase();
    const slot = p.ammo[p.weapon];
    const ammoText = slot ? wname + '  ' + slot.mag + '/' + slot.reserve : wname;
    text(ctx, ammoText, VIEW_W / 2 + 150 - 14, 776, 14, '#ffd94d', 'right', 800);
  }
  }
  // Bottom-right: minimap with the SOLMAR label.
  drawMinimap(ctx, state, city);
  // Dialogue box with a portrait, above the speedometer.
  if (state.dialogue && !state.mission.passed && state.mission.passedTimer <= 0) {
    const dg = state.dialogue;
    const wrapped = wrapLines(ctx, dg.text, 470, 15, 2);
    const dh = 30 + wrapped.lines.length * 19;
    panel(ctx, VIEW_W / 2 - 300, 596, 600, dh, 'rgba(16,12,24,0.88)');
    ctx.fillStyle = dg.colour;
    ctx.beginPath(); ctx.arc(VIEW_W / 2 - 268, 596 + dh / 2, 22, 0, Math.PI * 2); ctx.fill();
    text(ctx, dg.name.charAt(0), VIEW_W / 2 - 268, 596 + dh / 2 + 8, 22, '#20242e', 'center', 800);
    text(ctx, dg.name.toUpperCase(), VIEW_W / 2 - 232, 596 + 26, 13, dg.colour, 'left', 800);
    wrapped.lines.forEach((line, i) => {
      text(ctx, line, VIEW_W / 2 - 232, 596 + 48 + i * 19, 15, '#ffffff', 'left', 700);
    });
  }
}

function barRow(ctx, x, y, w, label, value, max, colour) {
  text(ctx, label, x, y, 12, '#c8d0dc', 'left', 700);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y + 5, w, 9);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y + 5, w * clamp(value / Math.max(1, max), 0, 1), 9);
  text(ctx, String(Math.round(value)), x + w, y, 12, '#ffffff', 'right', 700);
}

function drawMinimap(ctx, state, city) {
  const mw = 210;
  const mh = 150;
  const mx = VIEW_W - mw - 16;
  const my = VIEW_H - mh - 16;
  panel(ctx, mx, my, mw, mh, 'rgba(10,14,22,0.85)');
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#2f7fc9';
  ctx.fillRect(mx, my + SAND_Y * sy, mw, mh - SAND_Y * sy);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(mx, my + SAND_Y * sy - 8, mw, 8);
  ctx.fillStyle = '#6f9e4f';
  ctx.fillRect(mx, my, mw, SAND_Y * sy);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const rx of ROADS_V) {
    ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + SAND_Y * sy); ctx.stroke();
  }
  for (const ry of ROADS_H) {
    ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
  }
  ctx.fillStyle = '#ffd94d';
  for (const pk2 of state.pickups) {
    if (!pk2.taken) ctx.fillRect(mx + pk2.x * sx - 2, my + pk2.y * sy - 2, 4, 4);
  }
  ctx.fillStyle = '#ff5a5a';
  for (const cop of state.cops) ctx.fillRect(mx + cop.x * sx - 2, my + cop.y * sy - 2, 4, 4);
  const tgt = currentStepTarget(state);
  if (tgt) {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.arc(mx + tgt.x * sx, my + tgt.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  }
  const p = state.player;
  if (p) {
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  text(ctx, 'SOLMAR', mx + 8, my + 16, 12, '#ffffff', 'left', 800);
  text(ctx, 'N', mx + mw - 8, my + 16, 12, '#ffd94d', 'right', 800);
}

// ---------------------------------------------------------------- menus

function drawTitleMenu(ctx, state, city) {
  // Sunset backdrop extras: a big sun disc and palm silhouettes, drawn
  // ONLY at the screen margins, behind the menu panel, so they can never
  // cross the buttons or the SOLMAR wordmark (P0).
  const sunX = 1150;
  const sunY = 108;
  const grad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 130);
  grad.addColorStop(0, 'rgba(255,190,90,0.95)');
  grad.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(sunX, sunY, 130, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffcf6e';
  ctx.beginPath(); ctx.arc(sunX, sunY, 52, 0, Math.PI * 2); ctx.fill();
  // Palm silhouettes at the left and right margins only.
  ctx.fillStyle = 'rgba(20,30,20,0.55)';
  for (const [px, py, s] of [[90, 640, 1.4], [150, 700, 1.1], [1190, 660, 1.3], [1130, 720, 1.0]]) {
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.fillRect(-3, -70, 6, 70);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 26, -70 + Math.sin(a) * 14, 30, 8, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Darken the world behind the panel a touch.
  ctx.fillStyle = 'rgba(8,10,20,0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // The menu panel: centred, with everything inside it.
  panel(ctx, 390, 120, 500, 560, 'rgba(10,14,24,0.92)', 'rgba(255,210,77,0.35)');
  text(ctx, 'SOLMAR', 640, 218, 84, '#ffd94d', 'center', 800);
  text(ctx, 'AN ORIGINAL OPEN-WORLD CRIME GAME', 640, 248, 15, '#ffffff', 'center', 700);
  text(ctx, 'SUN, SAND AND BAD DECISIONS', 640, 272, 13, '#ffb02e', 'center', 700);
  const buttons = [
    { label: 'New Game', key: 'Enter' },
    { label: state.saveInfo ? 'Continue — ' + state.saveInfo.text : 'Continue — No Save Yet', key: 'C' },
    { label: 'How to Play', key: 'H' },
    { label: 'Missions', key: 'M' },
  ];
  buttons.forEach((b, i) => {
    const y = 310 + i * 66;
    const hover = state.menuHover === i;
    ctx.fillStyle = hover ? 'rgba(255,217,77,0.25)' : 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(440, y, 400, 52, 10); ctx.fill();
    ctx.strokeStyle = hover ? '#ffd94d' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // The key hint rides in front of the label as one string, and a long
    // label (the Continue line with its save summary) shrinks until the
    // whole line fits inside the button instead of overflowing its edges.
    const full = '[' + b.key + ']  ' + b.label;
    let bsize = 19;
    while (bsize > 13 && textW(ctx, full, bsize, 700) > 376) bsize -= 1;
    text(ctx, full, 640, y + 33, bsize, '#ffffff', 'center', 700);
  });
  text(ctx, 'WASD drive / walk · E enter car · Mouse aim · Click shoot', 640, 606, 14, '#c8d0dc', 'center', 700);
  text(ctx, 'Shift nitro · Space handbrake / punch · T radio · Esc pause', 640, 628, 14, '#c8d0dc', 'center', 700);
  text(ctx, 'Marco Solis just got out. Marisol Vega has work for him.', 640, 660, 13, '#ff9ecf', 'center', 700);
  if (state.mode === 'howto') drawHowTo(ctx);
  if (state.mode === 'missions') drawMissionsList(ctx, state);
}

function drawHowTo(ctx) {
  panel(ctx, 240, 120, 800, 560, 'rgba(10,14,24,0.96)');
  text(ctx, 'HOW TO PLAY', 640, 180, 30, '#ffd94d', 'center', 800);
  const rows = [
    ['WASD / Arrows', 'Drive or walk'],
    ['Mouse + Click', 'Aim and shoot'],
    ['E', 'Enter / exit a car (steal it)'],
    ['Space', 'Handbrake drift (car) / punch (on foot)'],
    ['Shift', 'Nitro boost'],
    ['1 / 2', 'Pistol / SMG'],
    ['R', 'Reload weapon'],
    ['T', 'Next radio station'],
    ['M', 'Mute sound'],
    ['Esc', 'Pause'],
    ['F5 / F9', 'Quick save / quick load'],
  ];
  rows.forEach((r, i) => {
    text(ctx, r[0], 320, 230 + i * 38, 16, '#ffd94d', 'left', 700);
    text(ctx, r[1], 560, 230 + i * 38, 16, '#ffffff', 'left', 700);
  });
  text(ctx, 'Steal cars, outrun the police, finish all 12 missions for Marisol Vega.', 640, 620, 15, '#c8d0dc', 'center', 700);
  text(ctx, 'Press Esc to go back.', 640, 650, 14, '#9aa4b2', 'center', 700);
}

function drawMissionsList(ctx, state) {
  panel(ctx, 240, 120, 800, 560, 'rgba(10,14,24,0.96)');
  text(ctx, 'MISSIONS — 12 STORY JOBS', 640, 180, 28, '#ffd94d', 'center', 800);
  const names = ['First Wheels', 'Sunset Taxi', 'Dockside Drop', 'Repo Run', 'Palm Grove Pickup', 'Neon Courier', 'Sunset Heist', 'Midnight Run', 'The Big Score', 'Heatwave Getaway', 'Marina Standoff', 'Solmar Nights'];
  const rewards = [300, 450, 600, 700, 850, 950, 1800, 2400, 3200, 2800, 3600, 5000];
  names.forEach((n, i) => {
    const y = 224 + i * 34;
    const done = state.mission.finished || i < state.mission.index;
    const current = !state.mission.finished && i === state.mission.index;
    const mark = done ? '✓' : current ? '►' : '·';
    const colour = done ? '#4ade80' : current ? '#ffd94d' : '#9aa4b2';
    text(ctx, mark + '  ' + (i + 1) + '. ' + n, 320, y, 16, colour, 'left', 700);
    text(ctx, '$' + rewards[i].toLocaleString('en-US'), 960, y, 16, colour, 'right', 700);
  });
  text(ctx, 'Press Esc to go back.', 640, 650, 14, '#9aa4b2', 'center', 700);
}

function drawPassedPanel(ctx, state) {
  const last = state.mission.last;
  // Dim the world behind the panel, but leave the HUD edges visible.
  ctx.fillStyle = 'rgba(6,8,16,0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const pw = 620;
  const px = VIEW_W / 2 - pw / 2;
  const py = 96;
  const ph = 600;
  panel(ctx, px, py, pw, ph, 'rgba(12,16,28,0.96)', 'rgba(255,217,77,0.5)');
  text(ctx, 'MISSION PASSED', 640, py + 52, 34, '#ffd94d', 'center', 800);
  text(ctx, last.name.toUpperCase(), 640, py + 86, 22, '#ffffff', 'center', 700);
  // Star row.
  let starRow = '';
  for (let i = 0; i < 5; i++) starRow += i < last.stars ? '★' : '☆';
  text(ctx, starRow, 640, py + 130, 34, '#ffd94d', 'center', 800);
  // Payout.
  text(ctx, 'PAYOUT  +$' + last.payout.toLocaleString('en-US'), 640, py + 178, 30, '#4ade80', 'center', 800);
  // Stats grid: time, accuracy, cars destroyed, cars stolen, rating.
  const stats = [
    ['TIME', fmtTime(last.time)],
    ['ACCURACY', last.accuracy === null ? '—' : last.accuracy + '%'],
    ['CARS DESTROYED', String(last.carsDestroyed)],
    ['CARS STOLEN', String(last.carsStolen)],
    ['RATING', last.rating],
  ];
  stats.forEach((s, i) => {
    const y = py + 216 + i * 30;
    text(ctx, s[0], px + 70, y, 15, '#9aa4b2', 'left', 700);
    text(ctx, s[1], px + pw - 70, y, 15, '#ffffff', 'right', 800);
  });
  // Respect + LEVEL UP callout.
  const ry = py + 216 + stats.length * 30 + 12;
  text(ctx, 'RESPECT  +' + last.respectGain + '  →  LV ' + last.level, 640, ry, 18, '#ffb02e', 'center', 800);
  if (last.levelUp) {
    text(ctx, '★ LEVEL UP! ★', 640, ry + 30, 20, '#ffd94d', 'center', 800);
  }
  // Next-job dialogue box with a portrait, reward and wanted preview.
  const dy = ry + (last.levelUp ? 58 : 34);
  panel(ctx, px + 40, dy, pw - 80, 96, 'rgba(255,158,207,0.12)', 'rgba(255,158,207,0.4)');
  ctx.fillStyle = '#ff9ecf';
  ctx.beginPath(); ctx.arc(px + 82, dy + 48, 24, 0, Math.PI * 2); ctx.fill();
  text(ctx, 'M', px + 82, dy + 56, 24, '#20242e', 'center', 800);
  if (last.nextName) {
    text(ctx, 'MARISOL VEGA', px + 118, dy + 32, 13, '#ff9ecf', 'left', 800);
    text(ctx, 'Next: ' + last.nextName, px + 118, dy + 56, 16, '#ffffff', 'left', 700);
    text(ctx, 'Reward $' + last.nextReward.toLocaleString('en-US') + '  ·  Wanted ' + last.nextWanted + '★', px + 118, dy + 80, 14, '#ffd94d', 'left', 700);
  } else {
    text(ctx, 'MARISOL VEGA', px + 118, dy + 32, 13, '#ff9ecf', 'left', 800);
    text(ctx, 'That was the last job. Solmar is yours, Marco.', px + 118, dy + 56, 16, '#ffffff', 'left', 700);
    text(ctx, 'Story complete — free roam.', px + 118, dy + 80, 14, '#ffd94d', 'left', 700);
  }
  text(ctx, 'PRESS ENTER TO CONTINUE', 640, py + ph - 22, 15, '#ffffff', 'center', 800);
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function drawEndScreen(ctx, state, title, sub) {
  ctx.fillStyle = 'rgba(6,8,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, title, 640, 360, 72, title === 'WASTED' ? '#ff5a5a' : '#5aa2ff', 'center', 800);
  text(ctx, sub, 640, 410, 18, '#ffffff', 'center', 700);
  text(ctx, 'Cash kept: ' + money(state.cash) + '  ·  Mission ' + missionProgressText(state), 640, 450, 15, '#c8d0dc', 'center', 700);
}

function drawPause(ctx, state) {
  ctx.fillStyle = 'rgba(6,8,16,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 440, 280, 400, 240, 'rgba(10,14,24,0.95)');
  text(ctx, 'PAUSED', 640, 340, 36, '#ffffff', 'center', 800);
  text(ctx, 'Esc — resume', 640, 392, 16, '#c8d0dc', 'center', 700);
  text(ctx, 'R — restart mission', 640, 424, 16, '#c8d0dc', 'center', 700);
  text(ctx, 'M — mute sound', 640, 456, 16, '#c8d0dc', 'center', 700);
  text(ctx, 'F5 — quick save', 640, 488, 16, '#c8d0dc', 'center', 700);
}
