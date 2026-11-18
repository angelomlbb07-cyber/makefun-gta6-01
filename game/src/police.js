// SOLMAR — police.js
// The wanted system: heat, cop cars that pathfind and ram, foot cops that
// chase, punch and bust, roadblocks at 3+ stars, and the police helicopter
// with its searchlight at 2+ stars. Every hit on the player goes through
// damagePlayer in state.js (F3): that is the only place WASTED is set, so
// being killed on foot by the police can never silently fail again.
// Heat decays while the player stays quiet; committing crimes raises it.

import { POLICE_CAR, MAX_WANTED } from './config.js';
import { clamp, dist, angleDiff, angleTo, range } from './random.js';
import { nearestRoadPoint, isRoadAt } from './city.js';
import { damagePlayer, setWanted, showToast, addFloat } from './state.js';
import { createCar } from './player.js';

let copId = 1;

export function updatePolice(state, dt, city, rng) {
  const p = state.player;
  if (!p) return;
  // Heat decay: stay out of trouble and the stars fade, one at a time.
  if (state.wanted > 0) {
    state.wantedHeat -= dt * 0.02;
    if (state.wantedHeat <= 0) {
      state.wantedHeat = 0.45;
      setWanted(state, state.wanted - 1);
      if (state.wanted === 0) showToast(state, 'You lost the cops. Lay low.');
    }
  }
  // Helicopter at 2+ stars: follows the player, searchlight sweeping.
  if (state.wanted >= 2) {
    if (!state.heli) state.heli = { x: p.x - 300, y: p.y - 300, angle: 0 };
    const h = state.heli;
    const a = angleTo(h.x, h.y, p.x, p.y);
    h.angle += angleDiff(h.angle, a) * dt * 1.2;
    h.x += Math.cos(a) * 260 * dt;
    h.y += Math.sin(a) * 260 * dt;
    if (rng() < dt * 0.2) addFloat(state, p.x, p.y - 60, 'AIR SUPPORT OVERHEAD', '#9ec8ff');
  } else {
    state.heli = null;
  }
  // Cop cars: one per wanted star, up to 4, spawning on nearby roads.
  const wantCars = Math.min(state.wanted, 4);
  while (state.cops.length < wantCars) {
    const spot = nearestRoadPoint(p.x + range(rng, -500, 500), p.y + range(rng, -500, 500));
    const car = createCar(POLICE_CAR, spot.x, spot.y, 0, 'police');
    car.id = copId++;
    state.cops.push(car);
    state.cars.push(car);
  }
  while (state.cops.length > wantCars) {
    const gone = state.cops.pop();
    const i = state.cars.indexOf(gone);
    if (i >= 0) state.cars.splice(i, 1);
  }
  for (const cop of state.cops) updateCopCar(state, cop, dt, city);
  // Foot cops: one per two wanted stars, spawning near the player on foot.
  const wantFoot = state.wanted >= 1 ? Math.min(3, Math.floor(state.wanted / 2) + 1) : 0;
  while (state.footCops.length < wantFoot) {
    state.footCops.push({
      x: p.x + range(rng, -260, 260), y: p.y + range(rng, -260, 260),
      angle: 0, hp: 50, punchT: 0, down: false, bustT: 0,
    });
  }
  while (state.footCops.length > wantFoot) state.footCops.pop();
  for (const fc of state.footCops) updateFootCop(state, fc, dt, city);
  state.footCops = state.footCops.filter((fc) => !fc.down || fc.bustT < 8);
  // Roadblocks at 3+ stars: two cruisers parked across the road ahead.
  if (state.wanted >= 3 && state.roadblocks.length === 0) {
    const ahead = { x: p.x + Math.cos(p.angle) * 520, y: p.y + Math.sin(p.angle) * 520 };
    const spot = nearestRoadPoint(ahead.x, ahead.y);
    state.roadblocks = [
      { x: spot.x - 40, y: spot.y, angle: p.angle + Math.PI / 2 },
      { x: spot.x + 40, y: spot.y, angle: p.angle + Math.PI / 2 },
    ];
    showToast(state, 'Roadblock ahead! The Solmar PD is waiting for you.');
  }
  if (state.wanted < 3) state.roadblocks = [];
}

function updateCopCar(state, cop, dt, city) {
  const p = state.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  const target = angleTo(cop.x, cop.y, p.x, p.y);
  cop.angle += clamp(angleDiff(cop.angle, target), -2.4 * dt, 2.4 * dt);
  const wantSpeed = d > 700 ? 620 : d > 260 ? 560 : 480;
  cop.speed += (wantSpeed - cop.speed) * dt * 0.8;
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;
  cop.x = clamp(cop.x, 60, 3140);
  cop.y = clamp(cop.y, 60, 2340);
  // Ram: contact with the player damages through damagePlayer (F3).
  if (d < 62) {
    if (p.onFoot) {
      damagePlayer(state, 22, 'ram');
    } else if (p.car) {
      p.car.hp -= 6;
      cop.speed *= 0.4;
      if (p.car.hp <= 0) {
        state.mission.stats.carsDestroyed += 1;
        addFloat(state, p.car.x, p.car.y - 30, 'CAR WRECKED', '#ff5a5a');
      }
      damagePlayer(state, 6, 'ram');
    }
    // Shove the cop back so it does not sit on top of the player.
    cop.x -= Math.cos(cop.angle) * 70;
    cop.y -= Math.sin(cop.angle) * 70;
  }
}

function updateFootCop(state, fc, dt, city) {
  const p = state.player;
  if (fc.down) { fc.bustT += dt; return; }
  const d = dist(fc.x, fc.y, p.x, p.y);
  const a = angleTo(fc.x, fc.y, p.x, p.y);
  fc.angle = a;
  fc.punchT = Math.max(0, fc.punchT - dt);
  if (d > 34) {
    const speed = p.onFoot ? 205 : 150;
    fc.x += Math.cos(a) * speed * dt;
    fc.y += Math.sin(a) * speed * dt;
    fc.bustT = 0;
  } else if (p.onFoot) {
    // Punch: routed through damagePlayer (F3) with the invulnerability
    // window, so a beating can kill the player and trigger WASTED.
    if (fc.punchT <= 0) {
      fc.punchT = 0.9;
      damagePlayer(state, 14, 'punch');
    }
    // Bust: the player is cornered on foot, slow, and the cop is on top.
    fc.bustT += dt;
    if (fc.bustT > 2.5 && !state.events.wasted) {
      state.events.busted = true;
      state.mode = 'busted';
      state.wanted = 0;
      showToast(state, 'BUSTED — the Solmar PD has you.');
    }
  }
}

// Called when the player commits a loud crime in the open.
export function reportCrime(state, level, reason) {
  if (state.wanted < level) setWanted(state, level, reason);
  else state.wantedHeat = clamp(state.wantedHeat + 0.25, 0, 1);
}

// Clear all police pressure, for example when a mission ends cleanly.
export function clearPolice(state) {
  state.cops = [];
  state.footCops = [];
  state.roadblocks = [];
  state.heli = null;
  state.cars = state.cars.filter((c) => c.driver !== 'police');
  state.wanted = 0;
  state.wantedHeat = 0;
}
