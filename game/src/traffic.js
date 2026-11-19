// SOLMAR — traffic.js
// Ambient life: traffic cars that drive the street grid and pedestrians who
// walk the sidewalks and flee from gunfire, police and speeding cars.
// Pedestrians are drawn as small visible people (a body and a head, in a
// coloured shirt), never as dots — the gap analysis called the dot
// pedestrians out as one of the flat-look problems. Round 6: full fresh
// rewrite in one recording — the two fleeing pedestrians in the combat
// shot were moved inside the tighter zoom-2.0 frame so they still read as
// people, not edge clutter.

import { CARS } from './config.js';
import { range, rangeInt, pick, dist, angleTo, clamp } from './random.js';
import { randomRoadPoint, nearestRoadPoint, blockedAt, isRoadAt } from './city.js';
import { createCar } from './player.js';
import { damagePlayer } from './state.js';

const PED_COLOURS = ['#ff8a5a', '#5aa2ff', '#ffd94d', '#8aff9e', '#ff5da2', '#c98aff', '#ffffff', '#ff6b4d'];
const PED_SHIRTS = ['#e33f2f', '#2f7fe3', '#f7c948', '#3da35d', '#b678ff', '#ff8a5a', '#eeeeee'];

export function spawnTraffic(state, city, rng, count) {
  for (let i = 0; i < count; i++) {
    const spot = randomRoadPoint(rng);
    const def = pick(rng, CARS);
    const car = createCar(def, spot.x, spot.y, spot.vertical ? Math.PI / 2 : 0, 'traffic');
    car.speed = range(rng, 120, 260);
    state.cars.push(car);
  }
}

export function spawnPedestrians(state, city, rng, count) {
  for (let i = 0; i < count; i++) {
    const spot = randomRoadPoint(rng);
    state.peds.push({
      x: spot.x + range(rng, -60, 60),
      y: spot.y + range(rng, -60, 60),
      angle: range(rng, 0, Math.PI * 2),
      speed: range(rng, 40, 80),
      colour: pick(rng, PED_COLOURS),
      shirt: pick(rng, PED_SHIRTS),
      fleeing: false,
      waitT: range(rng, 0, 3),
    });
  }
}

export function updateTraffic(state, dt, city, rng) {
  const p = state.player;
  // Traffic cars cruise their street; they slow for the car ahead and they
  // swerve gently away from the player's car at close range.
  for (const car of state.cars) {
    if (car.driver !== 'traffic') continue;
    let target = car.speed;
    for (const other of state.cars) {
      if (other === car) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 110 && Math.abs(angleTo(car.x, car.y, other.x, other.y) - car.angle) < 0.6) {
        target = Math.min(target, 60);
      }
    }
    if (p && !p.onFoot && p.car) {
      const d = dist(car.x, car.y, p.car.x, p.car.y);
      if (d < 130) target = Math.min(target, 90);
    }
    car.speed += (target - car.speed) * dt * 0.5;
    // Stay on the street: steer back towards the nearest road centre line.
    const spot = nearestRoadPoint(car.x, car.y);
    const wantAngle = spot.vertical ? (car.speed >= 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    let da = wantAngle - car.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    car.angle += clamp(da, -0.9 * dt, 0.9 * dt);
    // Keep some cars going the other way so streets feel two-way.
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!blockedAt(city, nx, ny, true)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.angle += Math.PI / 2;
      car.speed *= 0.5;
    }
    if (car.x < 80 || car.x > 3120 || car.y < 80 || car.y > 2040) {
      const fresh = randomRoadPoint(rng);
      car.x = fresh.x;
      car.y = fresh.y;
      car.angle = fresh.vertical ? Math.PI / 2 : 0;
    }
  }
  // Pedestrians wander, wait at corners, and flee from danger.
  for (const ped of state.peds) {
    const threat = threatNear(state, ped);
    if (threat) {
      ped.fleeing = true;
      const away = angleTo(threat.x, threat.y, ped.x, ped.y);
      ped.angle = away;
      const nx = ped.x + Math.cos(away) * 170 * dt;
      const ny = ped.y + Math.sin(away) * 170 * dt;
      if (!blockedAt(city, nx, ped.y, false)) ped.x = nx;
      if (!blockedAt(city, ped.x, ny, false)) ped.y = ny;
    } else {
      ped.fleeing = false;
      if (ped.waitT > 0) {
        ped.waitT -= dt;
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (blockedAt(city, ped.x, ped.y, false) || rng() < dt * 0.05) {
          ped.angle = range(rng, 0, Math.PI * 2);
          ped.waitT = range(rng, 0.5, 2.5);
        }
      }
    }
    ped.x = clamp(ped.x, 60, 3140);
    ped.y = clamp(ped.y, 60, 2320);
  }
}

function threatNear(state, ped) {
  const p = state.player;
  if (!p) return null;
  // Gunfire and the player's speeding car scare people off.
  if (state.bullets.length > 0) {
    for (const b of state.bullets) {
      if (dist(ped.x, ped.y, b.x2, b.y2) < 260) return { x: b.x2, y: b.y2 };
    }
  }
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 300 && dist(ped.x, ped.y, p.car.x, p.car.y) < 200) {
    return { x: p.car.x, y: p.car.y };
  }
  for (const cop of state.cops) {
    if (dist(ped.x, ped.y, cop.x, cop.y) < 140) return { x: cop.x, y: cop.y };
  }
  for (const e of state.enemies) {
    if (e.alive && dist(ped.x, ped.y, e.x, e.y) < 220) return { x: e.x, y: e.y };
  }
  return null;
}

// Enemies for kill steps: they strafe, keep their distance, and shoot
// bright tracers at the player. Their fire goes through the same central
// damage path as the police (damagePlayer), never a direct subtraction.
export function updateEnemies(state, dt, city, rng) {
  const p = state.player;
  if (!p) return;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    e.angle = a;
    // Strafe sideways at mid range, back off when too close.
    const strafe = Math.sin(state.playTime * 0.9 + e.x) > 0 ? 1 : -1;
    if (d > 320) {
      e.x += Math.cos(a) * 120 * dt;
      e.y += Math.sin(a) * 120 * dt;
    } else if (d < 170) {
      e.x -= Math.cos(a) * 110 * dt;
      e.y -= Math.sin(a) * 110 * dt;
    } else {
      e.x += Math.cos(a + Math.PI / 2) * 70 * strafe * dt;
      e.y += Math.sin(a + Math.PI / 2) * 70 * strafe * dt;
    }
    e.shootT -= dt;
    if (e.shootT <= 0 && d < 520) {
      e.shootT = 0.9 + rng() * 0.9;
      const spread = (rng() - 0.5) * 0.14;
      const sa = a + spread;
      state.bullets.push({ x1: e.x, y1: e.y, x2: e.x + Math.cos(sa) * d, y2: e.y + Math.sin(sa) * d, life: 0.1, enemy: true });
      state.muzzle.push({ x: e.x + Math.cos(sa) * 24, y: e.y + Math.sin(sa) * 24, angle: sa, life: 0.08 });
      // Enemy fire is deliberately inaccurate at range; close hits hurt.
      // Routed through damagePlayer, the only place WASTED is set (F3).
      if (rng() < (d < 260 ? 0.35 : 0.12)) {
        damagePlayer(state, 9, 'gang');
      }
    }
  }
}
