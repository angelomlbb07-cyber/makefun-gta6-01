// SOLMAR police: wanted level, cop cars that pathfind and ram, foot cops
// that chase, punch and bust, roadblocks at 3 stars, helicopter at 2+.
// F3 fix: ALL police damage goes through damagePlayer() — never direct
// health subtraction — so a kill on foot always triggers WASTED.

import { WANTED, WORLD } from './config.js';
import { clamp, dist, wrapAngle } from './random.js';
import { findPath, nearestRoadPoint } from './city.js';
import { damagePlayer } from './player.js';
import { startSiren, stopSiren } from './audio.js';

export function addWanted(state, stars) {
  state.wanted = clamp(state.wanted + stars, 0, 5);
  state.heat = state.wanted;
}

export function stepWanted(state, dt) {
  if (state.wanted > 0) {
    state.heat = Math.max(0, state.heat - WANTED.decayPerSecond * dt);
    if (state.heat < state.wanted - 0.99) state.wanted = Math.max(0, Math.floor(state.heat));
  }
  if (state.wanted >= 1) startSiren();
  else stopSiren();
}

export function spawnCopCar(state) {
  const p = state.player;
  const a = Math.random() * Math.PI * 2;
  const pt = nearestRoadPoint(
    clamp(p.x + Math.cos(a) * 700, 100, WORLD.width - 100),
    clamp(p.y + Math.sin(a) * 700, 100, WORLD.height - 500),
  );
  state.copCars.push({
    x: pt.x, y: pt.y, angle: 0, speed: 0, hp: 120, maxHp: 120,
    color: '#20242c', name: 'Interceptor', path: null, pathI: 0,
    ramCooldown: 0, dead: false, def: 1,
  });
}

export function spawnFootCop(state) {
  const p = state.player;
  const a = Math.random() * Math.PI * 2;
  state.footCops.push({
    x: clamp(p.x + Math.cos(a) * 320, 40, WORLD.width - 40),
    y: clamp(p.y + Math.sin(a) * 320, 40, WORLD.height - 460),
    angle: 0, hp: 50, punchCooldown: 0, bustTimer: 0,
  });
}

export function stepPolice(state, dt) {
  const p = state.player;
  if (!p) return;
  const wantCops = Math.min(4, state.wanted);
  while (state.copCars.length < wantCops) spawnCopCar(state);
  while (state.copCars.length > wantCops && state.wanted === 0) state.copCars.pop();
  if (state.wanted >= 2 && state.footCops.length < 2) spawnFootCop(state);
  if (state.wanted === 0) state.footCops.length = 0;

  // Cop cars: pathfind to the player, ram on contact (F3: via damagePlayer).
  for (const cop of state.copCars) {
    cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
    if (!cop.path || cop.pathI >= cop.path.length || Math.random() < dt * 0.25) {
      cop.path = findPath(cop.x, cop.y, p.x, p.y);
      cop.pathI = 0;
    }
    const target = cop.path[Math.min(cop.pathI, cop.path.length - 1)];
    const d = dist(cop.x, cop.y, target.x, target.y);
    if (d < 40) cop.pathI++;
    const want = Math.atan2(target.y - cop.y, target.x - cop.x);
    cop.angle += clamp(wrapAngle(want - cop.angle), -2.2 * dt, 2.2 * dt);
    const cruise = WANTED.copCarSpeed + state.wanted * 12;
    cop.speed += (cruise - cop.speed) * dt * 0.9;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    const pd = dist(cop.x, cop.y, p.x, p.y);
    if (pd < 46 && cop.ramCooldown <= 0) {
      cop.ramCooldown = 0.6;
      cop.speed *= 0.4;
      // F3: never subtract health directly — route through damagePlayer.
      damagePlayer(state, WANTED.ramDamage);
      if (p.car) {
        p.car.hp -= 12;
        if (p.car.hp <= 0) {
          state.missions.stats.carsDestroyed++;
          p.car.dead = true;
        }
      }
      state.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#ff5a3d', size: 12 });
    }
  }

  // Foot cops: chase, punch (F3: via damagePlayer), and bust a still player.
  for (const cop of state.footCops) {
    cop.punchCooldown = Math.max(0, cop.punchCooldown - dt);
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d > 34) {
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = a;
      cop.x += Math.cos(a) * 165 * dt;
      cop.y += Math.sin(a) * 165 * dt;
      cop.bustTimer = 0;
    } else {
      cop.bustTimer += dt;
      if (cop.punchCooldown <= 0 && p.health > 0) {
        cop.punchCooldown = 1.1;
        // F3: never subtract health directly — route through damagePlayer.
        damagePlayer(state, WANTED.punchDamage);
      }
      if (cop.bustTimer > 1.5 && p.onFoot && state.wanted >= 1 && !state.events.busted && !state.shotMode) {
        state.events.busted = true;
        state.overKind = 'busted';
        state.screen = 'over';
        state.overTimer = 0;
        state.cash = Math.max(0, state.cash - WANTED.bustFine);
      }
    }
  }

  // Helicopter with searchlight at 2+ stars.
  const heli = state.heli;
  heli.active = state.wanted >= WANTED.heliMinStars;
  if (heli.active) {
    const a = Math.atan2(p.y - heli.y, p.x - heli.x);
    heli.angle = a;
    const hd = dist(heli.x, heli.y, p.x, p.y);
    const sp = hd > 260 ? 240 : 120;
    heli.x += Math.cos(a) * sp * dt;
    heli.y += Math.sin(a) * sp * dt;
    if (hd < 40) { heli.x = p.x + 200; heli.y = p.y - 200; }
  }

  // Roadblocks at 3+ stars: two parked cop cars across the road ahead.
  if (state.wanted >= WANTED.roadblockMinStars && state.roadblocks.length === 0 && p.car) {
    const ahead = { x: p.x + Math.cos(p.angle) * 500, y: p.y + Math.sin(p.angle) * 500 };
    const pt = nearestRoadPoint(ahead.x, ahead.y);
    state.roadblocks = [
      { x: pt.x - 60, y: pt.y, angle: p.angle + Math.PI / 2 },
      { x: pt.x + 60, y: pt.y, angle: p.angle + Math.PI / 2 },
    ];
  }
  if (state.wanted < WANTED.roadblockMinStars) state.roadblocks = [];
}

export function clearPolice(state) {
  state.copCars = [];
  state.footCops = [];
  state.roadblocks = [];
  state.heli.active = false;
  state.wanted = 0;
  state.heat = 0;
  stopSiren();
}
