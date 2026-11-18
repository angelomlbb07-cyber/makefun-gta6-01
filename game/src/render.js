// SOLMAR renderer: world, cars, people, helicopter, HUD, menus.
// HUD fixes baked in: F4 objective wraps/shrinks, F5 toast sits at y>=150,
// F7 waypoint arrow in logical coordinates, F9 vault bar uses step.hold,
// F10 speedometer denominator includes nitro.

import { VIEW, WORLD, RADIO_STATIONS, CAR_DEFS, WEAPONS } from './config.js';
import { clamp, formatMoney, formatTime, formatClock } from './random.js';
import { districtAt, isSea, isSand, palmPositions, buildingRects, LANDMARKS } from './city.js';
import { currentMission, currentStep, MISSIONS } from './missions.js';
import { ammoText } from './player.js';

let palms = null;
let buildings = null;
const ZOOM = 0.85;

function ensureScenery(seed) {
  if (!palms) palms = palmPositions(seed);
  if (!buildings) buildings = buildingRects(seed);
}

export function resize(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const scale = Math.min(w / VIEW.width, h / VIEW.height);
  return { scale, dpr, ox: (w - VIEW.width * scale) / 2, oy: (h - VIEW.height * scale) / 2 };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export function render(state, canvas, ctx, view) {
  ensureScenery(state.seed);
  const { scale, dpr, ox, oy } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  if (state.screen === 'title') { drawTitle(state, ctx); return; }
  if (state.screen === 'howto') { drawHowTo(ctx); return; }
  if (state.screen === 'missions') { drawMissionList(state, ctx); return; }
  drawWorld(state, ctx);
  drawEntities(state, ctx);
  drawHud(state, ctx);
  if (state.screen === 'pause') drawPause(state, ctx);
  if (state.screen === 'garage') drawGarage(state, ctx);
  if (state.screen === 'over') drawOver(state, ctx);
  if (state.missions.passed) drawPassed(state, ctx);
}

function drawWorld(state, ctx) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(VIEW.width / 2, VIEW.height / 2);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-cam.x, -cam.y);
  // Ground: grass blocks.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(-200, -200, WORLD.width + 400, WORLD.height + 400);
  // City blocks.
  ctx.fillStyle = '#9aa08a';
  for (let bx = 0; bx < 9; bx++) {
    for (let by = 0; by < 6; by++) {
      const x = bx * WORLD.roadGap + 120, y = by * WORLD.roadGap + 120;
      if (y > WORLD.height - 500) continue;
      ctx.fillRect(x, y, WORLD.roadGap - 240, WORLD.roadGap - 240);
    }
  }
  // Roads.
  ctx.fillStyle = '#3d4149';
  for (let x = 0; x <= WORLD.width; x += WORLD.roadGap) ctx.fillRect(x - 60, 0, 120, WORLD.height - 420);
  for (let y = 0; y <= WORLD.height; y += WORLD.roadGap) {
    if (y > WORLD.height - 420) continue;
    ctx.fillRect(0, y - 60, WORLD.width, 120);
  }
  ctx.strokeStyle = '#e8d44d';
  ctx.setLineDash([26, 22]);
  ctx.lineWidth = 3;
  for (let x = 0; x <= WORLD.width; x += WORLD.roadGap) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height - 420); ctx.stroke();
  }
  for (let y = 0; y <= WORLD.height; y += WORLD.roadGap) {
    if (y > WORLD.height - 420) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Sand and sea along the south edge.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, WORLD.height - 420, WORLD.width, 160);
  ctx.fillStyle = '#2f7fc2';
  ctx.fillRect(0, WORLD.height - 260, WORLD.width, 260);
  ctx.fillStyle = '#4aa8e0';
  for (let i = 0; i < 24; i++) {
    const wx = ((i * 317) % WORLD.width);
    const wy = WORLD.height - 240 + ((i * 53) % 200);
    ctx.fillRect(wx, wy, 90, 5);
  }
  // Buildings.
  for (const b of buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x, b.y, b.w, 8);
    if (b.roof) { ctx.fillStyle = '#7a4a3a'; ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16); }
  }
  // Palms.
  for (const palm of palms) {
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + palm.lean * 20, palm.y - palm.size); ctx.stroke();
    ctx.fillStyle = '#3f9e4d';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + palm.lean;
      ctx.beginPath();
      ctx.ellipse(palm.x + palm.lean * 20 + Math.cos(a) * 12, palm.y - palm.size + Math.sin(a) * 8, 14, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Landmark signs.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  for (const lm of LANDMARKS) {
    ctx.fillStyle = 'rgba(10,14,24,0.75)';
    const w = ctx.measureText(lm.name).width + 18;
    roundRect(ctx, lm.x - w / 2, lm.y - 34, w, 24, 6); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(lm.name, lm.x, lm.y - 17);
    ctx.fillStyle = '#ff5a3d';
    ctx.beginPath(); ctx.arc(lm.x, lm.y, 6, 0, Math.PI * 2); ctx.fill();
  }
  // Roadblocks.
  for (const rb of state.roadblocks) {
    ctx.save();
    ctx.translate(rb.x, rb.y); ctx.rotate(rb.angle);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-34, -14, 68, 28);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-34, -4, 68, 8);
    ctx.restore();
  }
  // Mission waypoint marker.
  const target = missionTarget(state);
  if (target) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.moveTo(target.x, target.y - 52); ctx.lineTo(target.x - 12, target.y - 28); ctx.lineTo(target.x + 12, target.y - 28); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function missionTarget(state) {
  const step = currentStep(state);
  if (!step || state.missions.passed || state.missions.finished) return null;
  return { x: step.x, y: step.y };
}

function drawCarShape(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-24, -12, 52, 30);
  ctx.fillStyle = car.color;
  roundRect(ctx, -26, -14, 52, 28, 7); ctx.fill();
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(-6, -11, 16, 22);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(24, -11, 3, 6); ctx.fillRect(24, 5, 3, 6);
  ctx.fillStyle = '#ff5a3d';
  ctx.fillRect(-27, -11, 3, 6); ctx.fillRect(-27, 5, 3, 6);
  if (car.hp < car.maxHp * 0.5) {
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(8, 0, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (isPlayer) {
    ctx.strokeStyle = '#7dff8a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(car.x, car.y, 36, 0, Math.PI * 2); ctx.stroke();
  }
  // Car HP bar for damaged cars.
  if (car.hp < car.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(car.x - 24, car.y - 30, 48, 6);
    ctx.fillStyle = car.hp > car.maxHp * 0.4 ? '#7dff8a' : '#ff5a3d';
    ctx.fillRect(car.x - 24, car.y - 30, 48 * clamp(car.hp / car.maxHp, 0, 1), 6);
  }
}

function drawEntities(state, ctx) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(VIEW.width / 2, VIEW.height / 2);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-cam.x, -cam.y);
  for (const car of state.cars) if (!car.dead) drawCarShape(ctx, car, state.player && state.player.car === car);
  for (const cop of state.copCars) {
    drawCarShape(ctx, cop, false);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.save(); ctx.translate(cop.x, cop.y); ctx.rotate(cop.angle);
    ctx.fillText('POLICE', 0, 4); ctx.restore();
  }
  // Helicopter + searchlight.
  if (state.heli.active) {
    const h = state.heli;
    ctx.fillStyle = 'rgba(255,240,170,0.16)';
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(state.player.x - 40, state.player.y); ctx.lineTo(state.player.x + 40, state.player.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.beginPath(); ctx.ellipse(h.x, h.y, 26, 12, h.angle, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(h.x - 30, h.y); ctx.lineTo(h.x + 30, h.y); ctx.stroke();
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POLICE HELI', h.x, h.y - 22);
  }
  // Pedestrians.
  for (const ped of state.peds) {
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(ped.x, ped.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.beginPath(); ctx.arc(ped.x, ped.y - 4, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Foot cops (red) and rivals (orange).
  for (const cop of state.footCops) {
    ctx.fillStyle = cop.rival ? '#ff8a2a' : '#c22a2a';
    ctx.beginPath(); ctx.arc(cop.x, cop.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(cop.rival ? 'RIVAL' : 'COP', cop.x, cop.y - 14);
    if (cop.hp < 50) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cop.x - 14, cop.y - 26, 28, 4);
      ctx.fillStyle = '#ff5a3d'; ctx.fillRect(cop.x - 14, cop.y - 26, 28 * clamp(cop.hp / 50, 0, 1), 4);
    }
  }
  // Bullets = tracers.
  for (const b of state.bullets) {
    ctx.strokeStyle = '#ffe95a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * clamp(pt.life / pt.max, 0.2, 1), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floaters.
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = clamp(f.timer, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  // Player on foot.
  const p = state.player;
  if (p && p.onFoot) {
    if (p.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#2a7de8';
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c230';
    ctx.beginPath(); ctx.arc(p.x, p.y - 5, 5, 0, Math.PI * 2); ctx.fill();
    // Gun direction.
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#7dff8a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawHud(state, ctx) {
  const p = state.player;
  const m = state.missions;
  // Cash panel (top-left).
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  roundRect(ctx, 14, 14, 300, 122, 10); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(formatMoney(state.cash), 28, 50);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('DAY ' + state.day + '  •  ' + formatClock(state.clockMinutes), 28, 76);
  ctx.fillStyle = '#ffd94a';
  ctx.font = '13px sans-serif';
  const district = districtAt(p.x, p.y);
  ctx.fillText(district.name, 28, 98);
  ctx.fillStyle = '#b8c4d8';
  ctx.font = '11px sans-serif';
  ctx.fillText(district.flavour, 28, 116);
  // Wanted stars.
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'left';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
  ctx.fillStyle = state.wanted > 0 ? '#ffb13d' : '#5a6a80';
  ctx.fillText(stars, 28, 132);
  // Health / armour / respect bars — right side, under the minimap, so they
  // never sit under the centred objective banner.
  bar(ctx, VIEW.width - 234, 172, 190, 16, p.health / 100, '#7dff8a', 'HP ' + Math.ceil(p.health));
  bar(ctx, VIEW.width - 234, 194, 190, 16, p.armour / 100, '#6db8ff', 'ARMOUR ' + Math.ceil(p.armour));
  bar(ctx, VIEW.width - 234, 216, 190, 16, p.respect / 250, '#c98aff', 'RESPECT LV ' + state.respectLevel);
  // Weapon + ammo.
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  roundRect(ctx, 330, 100, 190, 48, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText((WEAPONS[p.weapon] || {}).name || 'FISTS', 342, 122);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(ammoText(p), 342, 142);
  // Radio.
  const station = RADIO_STATIONS[state.radio.station];
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  roundRect(ctx, 14, 150, 300, 30, 8); ctx.fill();
  ctx.fillStyle = '#ff9ad8';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('♪ ' + station.name + '  ' + station.freq + '  •  ' + station.mood.toUpperCase(), 26, 170);
  // Objective banner (F4): wrap to two lines, shrink font when too wide.
  const mission = currentMission(state);
  if (mission && !m.passed) {
    let fontSize = 17;
    ctx.font = 'bold ' + fontSize + 'px sans-serif';
    while (fontSize > 12 && ctx.measureText(m.objective).width > 724) {
      fontSize--;
      ctx.font = 'bold ' + fontSize + 'px sans-serif';
    }
    const lines = wrapText(ctx, 'MISSION ' + (m.index + 1) + '/' + MISSIONS.length + ' — ' + mission.name + ': ' + m.objective, 724);
    const panelH = 34 + lines.length * (fontSize + 4);
    const panelW = Math.min(760, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36);
    const px = (VIEW.width - panelW) / 2;
    ctx.fillStyle = 'rgba(8,12,22,0.82)';
    roundRect(ctx, px, 14, panelW, panelH, 10); ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.textAlign = 'center';
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 14 + 26 + i * (fontSize + 4)));
    ctx.textAlign = 'left';
    // Mission timer + hold progress under the banner.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⏱ ' + formatTime(m.timer), VIEW.width / 2, 14 + panelH + 18);
    ctx.textAlign = 'left';
    const step = currentStep(state);
    if (step && step.kind === 'hold' && m.holdProgress > 0) {
      // F9: divide by this step's hold time, not a hardcoded 3.
      const frac = clamp(m.holdProgress / (step.hold || 3), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(VIEW.width / 2 - 110, 14 + panelH + 26, 220, 10);
      ctx.fillStyle = '#ffd94a';
      ctx.fillRect(VIEW.width / 2 - 110, 14 + panelH + 26, 220 * frac, 10);
    }
  }
  // Briefing toast (F5): drawn at y=190, well clear of the cash panel.
  if (m.toastTimer > 0 && m.toast) {
    ctx.font = '15px sans-serif';
    const lines = wrapText(ctx, m.toast, 700);
    const th = 16 + lines.length * 20;
    ctx.fillStyle = 'rgba(20,16,40,0.88)';
    roundRect(ctx, (VIEW.width - 740) / 2, 190, 740, th, 10); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 190 + 24 + i * 20));
    ctx.textAlign = 'left';
  }
  if (state.messageTimer > 0 && state.message) {
    ctx.fillStyle = 'rgba(8,12,22,0.8)';
    ctx.font = '14px sans-serif';
    const w = ctx.measureText(state.message).width + 24;
    roundRect(ctx, (VIEW.width - w) / 2, 250, w, 30, 8); ctx.fill();
    ctx.fillStyle = '#7dff8a';
    ctx.textAlign = 'center';
    ctx.fillText(state.message, VIEW.width / 2, 270);
    ctx.textAlign = 'left';
  }
  // Waypoint arrow (F7): computed in logical coordinates from VIEW size.
  const target = missionTarget(state);
  if (target) {
    const sx = VIEW.width / 2 + (target.x - state.camera.x) * ZOOM;
    const sy = VIEW.height / 2 + (target.y - state.camera.y) * ZOOM;
    const onScreen = sx > 60 && sx < VIEW.width - 60 && sy > 100 && sy < VIEW.height - 60;
    if (!onScreen) {
      const cx = VIEW.width / 2, cy = VIEW.height / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ax = cx + Math.cos(a) * 300, ay = cy + Math.sin(a) * 220;
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(Math.hypot(target.x - p.x, target.y - p.y)) + 'm', ax, ay + 30);
      ctx.textAlign = 'left';
    }
  }
  drawMinimap(state, ctx);
  drawSpeedo(state, ctx);
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4, 4); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 8, y + h - 4);
}

function drawMinimap(state, ctx) {
  const mw = 220, mh = 150, mx = VIEW.width - mw - 14, my = 14;
  ctx.fillStyle = 'rgba(8,12,22,0.8)';
  roundRect(ctx, mx, my, mw, mh, 10); ctx.fill();
  const sx = mw / WORLD.width, sy = mh / WORLD.height;
  // Land background first, then sea/sand bands, so the map is never black.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4);
  ctx.fillStyle = '#2f7fc2';
  ctx.fillRect(mx, my + mh - 26 * sy * 10, mw, 26 * sy * 10);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(mx, my + mh - 42 * sy * 10, mw, 16 * sy * 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += WORLD.roadGap) {
    ctx.beginPath(); ctx.moveTo(mx + x * sx, my); ctx.lineTo(mx + x * sx, my + mh); ctx.stroke();
  }
  for (let y = 0; y <= WORLD.height; y += WORLD.roadGap) {
    ctx.beginPath(); ctx.moveTo(mx, my + y * sy); ctx.lineTo(mx + mw, my + y * sy); ctx.stroke();
  }
  const target = missionTarget(state);
  if (target) {
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(mx + target.x * sx, my + target.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mx + state.player.x * sx, my + state.player.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7dff8a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(mx + state.player.x * sx, my + state.player.y * sy, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLMAR', mx + mw / 2, my + mh - 8);
  ctx.textAlign = 'left';
}

function drawSpeedo(state, ctx) {
  const p = state.player;
  if (!p.car) return;
  const def = CAR_DEFS[p.car.def];
  // F10: denominator includes the nitro x1.3 factor when nitro is on.
  const nitroOn = state.garage.nitro && p.car.nitro > 0;
  const top = def.topSpeed * (state.garage.turbo ? 1.18 : 1) * (nitroOn ? 1.3 : 1);
  const frac = clamp(Math.abs(p.car.speed) / top, 0, 1);
  const kmh = Math.round(Math.abs(p.car.speed) * 0.55);
  const cx = VIEW.width - 130, cy = VIEW.height - 90, r = 62;
  ctx.fillStyle = 'rgba(8,12,22,0.78)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  ctx.strokeStyle = '#ffd94a';
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + frac * Math.PI * 1.5); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(kmh, cx, cy + 4);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#b8c4d8';
  ctx.fillText('km/h  •  ' + p.car.name.toUpperCase(), cx, cy + 22);
  if (state.garage.nitro) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - 40, cy + 30, 80, 8);
    ctx.fillStyle = '#4aa8e0';
    ctx.fillRect(cx - 40, cy + 30, 80 * (p.car.nitro / 100), 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('NITRO', cx, cy + 50);
  }
  ctx.textAlign = 'left';
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,12,22,0.88)';
  roundRect(ctx, x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14); ctx.stroke();
}

function drawTitle(state, ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, '#ff9a5a');
  g.addColorStop(0.5, '#e86a8a');
  g.addColorStop(1, '#2a1a4a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Sun, sea, palms silhouette.
  ctx.fillStyle = '#fff3c8';
  ctx.beginPath(); ctx.arc(960, 210, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f7fc2';
  ctx.fillRect(0, 560, VIEW.width, 240);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, 520, VIEW.width, 40);
  ctx.fillStyle = '#1c2a1a';
  for (let i = 0; i < 12; i++) {
    const x = 60 + i * 108;
    ctx.fillRect(x, 470, 8, 60);
    ctx.beginPath(); ctx.ellipse(x + 4, 460, 34, 10, -0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 110px sans-serif';
  ctx.fillText('SOLMAR', VIEW.width / 2, 240);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('AN ORIGINAL OPEN-WORLD CRIME GAME  •  SUN, SAND AND BAD DECISIONS', VIEW.width / 2, 282);
  const items = ['New Game', 'Continue', 'How to Play', 'Missions'];
  const save = state.saveSlot;
  items.forEach((item, i) => {
    const y = 360 + i * 52;
    const sel = state.titleChoice === i;
    if (sel) {
      ctx.fillStyle = '#ffd94a';
      roundRect(ctx, VIEW.width / 2 - 190, y - 30, 380, 42, 8); ctx.fill();
      ctx.fillStyle = '#1a1420';
    } else {
      ctx.fillStyle = 'rgba(8,12,22,0.55)';
      roundRect(ctx, VIEW.width / 2 - 190, y - 30, 380, 42, 8); ctx.fill();
      ctx.fillStyle = '#fff';
    }
    ctx.font = 'bold 22px sans-serif';
    let label = item;
    if (item === 'Continue' && save) label += '  —  Day ' + save.day + ', ' + formatMoney(save.cash) + ', Mission ' + (save.missionIndex + 1) + '/12';
    if (item === 'Continue' && !save) label += '  —  no save yet';
    ctx.fillText(label, VIEW.width / 2, y);
  });
  ctx.fillStyle = '#fff';
  ctx.font = '15px sans-serif';
  ctx.fillText('WASD drive / walk  •  E enter car & hold to crack  •  F shoot / punch  •  Q weapon  •  R reload  •  C radio  •  P pause  •  M mute', VIEW.width / 2, 620);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '14px sans-serif';
  ctx.fillText('Play as Marco Solis. Work for fixer Marisol Vega. 12 story missions. Steal cars, outrun the police, own Solmar.', VIEW.width / 2, 650);
  ctx.textAlign = 'left';
}

function drawHowTo(ctx) {
  panel(ctx, 240, 90, 800, 620);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HOW TO PLAY', VIEW.width / 2, 140);
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  const lines = [
    'You are Marco Solis, fresh out of Solmar General with nothing but a',
    'phone number: Marisol Vega, fixer. She has 12 jobs for you.',
    '',
    'WASD / arrows — drive or walk. E — steal a car, hold E to crack safes.',
    'F — shoot or punch. Q — switch weapon. R — reload. Shift — nitro.',
    'Space — handbrake for drifts. C — change radio. P — pause. M — mute.',
    '',
    'Wanted stars bring the police: cars that ram, cops on foot, roadblocks',
    'at 3 stars and a helicopter with a searchlight at 2 stars. Lay low and',
    'the heat fades. Get busted and you pay a fine; get wasted and you pay more.',
    '',
    'Finish missions to earn cash and respect. Spend cash at Benny\u2019s Garage',
    '(turbo, armour, tyres, nitro). Your game autosaves after every mission.',
    '',
    'Press Enter or Esc to go back.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 190 + i * 30));
  ctx.textAlign = 'left';
}

function drawMissionList(state, ctx) {
  panel(ctx, 240, 90, 800, 620);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MISSIONS — MARISOL VEGA', VIEW.width / 2, 140);
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'left';
  MISSIONS.forEach((mission, i) => {
    const y = 180 + i * 40;
    const done = i < state.missions.index || state.missions.finished;
    const current = i === state.missions.index && !state.missions.finished;
    ctx.fillStyle = done ? '#7dff8a' : current ? '#ffd94a' : '#8a94a8';
    ctx.fillText((done ? '✓ ' : current ? '▶ ' : '· ') + (i + 1) + '. ' + mission.name + ' — ' + mission.giver + ' — $' + mission.payout, 280, y);
  });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('Press Enter or Esc to go back.', VIEW.width / 2, 680);
  ctx.textAlign = 'left';
}

function drawPause(state, ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(ctx, 440, 220, 400, 360);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW.width / 2, 270);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  const lines = ['Enter — Resume', 'G — Benny\u2019s Garage', 'R — Restart Mission', 'S — Save & Quit to Title'];
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 320 + i * 36));
  ctx.fillText('Cash ' + formatMoney(state.cash) + '  •  Day ' + state.day + '  •  Mission ' + (state.missions.index + 1) + '/12', VIEW.width / 2, 520);
  ctx.textAlign = 'left';
}

function drawGarage(state, ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(ctx, 340, 130, 600, 540);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BENNY\u2019S GARAGE', VIEW.width / 2, 180);
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(formatMoney(state.cash), VIEW.width / 2, 212);
  ctx.textAlign = 'left';
  ctx.font = '17px sans-serif';
  const upgrades = [
    { id: 'turbo', name: 'Turbo', cost: 800, desc: '+18% top speed' },
    { id: 'armour', name: 'Armour Plating', cost: 600, desc: '+60 car HP' },
    { id: 'tyres', name: 'Grip Tyres', cost: 500, desc: 'tighter handling' },
    { id: 'nitro', name: 'Nitro Kit', cost: 700, desc: 'Shift = nitro boost' },
  ];
  upgrades.forEach((u, i) => {
    const y = 260 + i * 70;
    const owned = state.garage[u.id];
    const sel = state.garageChoice === i;
    ctx.fillStyle = sel ? 'rgba(255,217,74,0.25)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, 380, y - 26, 520, 54, 8); ctx.fill();
    ctx.fillStyle = owned ? '#7dff8a' : '#fff';
    ctx.fillText((owned ? '✓ ' : '') + u.name + ' — $' + u.cost + '  •  ' + u.desc, 400, y + 4);
  });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '15px sans-serif';
  ctx.fillText('Up/Down to choose, Enter to buy, Esc to leave.', VIEW.width / 2, 580);
  ctx.fillText('Your car gains the upgrade at once. Upgrades stay for the whole story.', VIEW.width / 2, 610);
  ctx.textAlign = 'left';
}

function drawOver(state, ctx) {
  ctx.fillStyle = state.overKind === 'wasted' ? 'rgba(60,0,0,0.72)' : 'rgba(0,0,60,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText(state.overKind === 'wasted' ? 'WASTED' : 'BUSTED', VIEW.width / 2, 340);
  ctx.font = '20px sans-serif';
  const fine = state.overKind === 'wasted' ? 100 : 150;
  ctx.fillText(state.overKind === 'wasted'
    ? 'Marco went down. The hospital patched him up — for $' + fine + '.'
    : 'The Solmar PD took you in. Bail cost $' + fine + '.', VIEW.width / 2, 400);
  ctx.fillText('Press Enter to get back on the streets.', VIEW.width / 2, 450);
  ctx.textAlign = 'left';
}

function drawPassed(state, ctx) {
  const passed = state.missions.passed;
  if (!passed) return;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(ctx, 390, 170, 500, 460);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('MISSION PASSED', VIEW.width / 2, 225);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(passed.name, VIEW.width / 2, 262);
  ctx.fillStyle = '#fff';
  ctx.font = '19px sans-serif';
  const rows = [
    'PAYOUT  ' + formatMoney(passed.payout),
    'TIME  ' + passed.time,
    'ACCURACY  ' + passed.accuracy,
    'CARS DESTROYED  ' + passed.carsDestroyed,
    'CARS STOLEN  ' + passed.carsStolen,
    'RATING  ' + passed.rating,
    'RESPECT  +' + passed.respect,
  ];
  rows.forEach((row, i) => ctx.fillText(row, VIEW.width / 2, 305 + i * 32));
  if (passed.next) {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '16px sans-serif';
    ctx.fillText(passed.nextGiver + ': next job — ' + passed.next, VIEW.width / 2, 560);
  } else {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Marisol: Solmar is yours now, Marco. King of Solmar.', VIEW.width / 2, 560);
  }
  ctx.textAlign = 'left';
}
