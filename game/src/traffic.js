// SOLMAR traffic: civilian cars cruising the grid and pedestrians on the
// sidewalks. Pedestrians flee gunfire, cops and explosions.

import { WORLD, CAR_DEFS } from './config.js';
import { clamp, dist, mulberry32, range, rangeInt, pick } from './random.js';
import { nearestRoadPoint, isSea } from './city.js';

export function makeCar(x, y, defIndex, driver) {
  const def = CAR_DEFS[defIndex % CAR_DEFS.length];
  return {
    x, y, angle: Math.random() * Math.PI * 2,
    speed: 0, def: defIndex % CAR_DEFS.length,
    color: def.color, name: def.name, hp: def.hp, maxHp: def.hp,
    driver: driver || 'traffic', dead: false, nitro: 100,
    isTaxi: defIndex === 4, path: null, pathI: 0, wait: 0,
  };
}

export function spawnTraffic(state, count) {
  const rng = mulberry32(state.seed + 31);
  for (let i = 0; i < count; i++) {
    const x = range(rng, 200, WORLD.width - 200);
    const y = range(rng, 200, WORLD.height - 600);
    const pt = nearestRoadPoint(x, y);
    const car = makeCar(pt.x, pt.y, rangeInt(rng, 0, CAR_DEFS.length - 1), 'traffic');
    car.angle = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    state.cars.push(car);
  }
}

export function spawnPeds(state, count) {
  const rng = mulberry32(state.seed + 77);
  for (let i = 0; i < count; i++) {
    state.peds.push({
      x: range(rng, 100, WORLD.width - 100),
      y: range(rng, 100, WORLD.height - 500),
      angle: rng() * Math.PI * 2,
      speed: 40 + rng() * 40,
      fleeing: 0,
      color: pick(rng, ['#e8e0d0', '#d8a0a0', '#a0c8d8', '#c8d8a0', '#e0c8e8']),
      tx: 0, ty: 0, wait: rng() * 2,
    });
  }
}

export function stepTraffic(state, dt) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.dead || car.driver === 'player') continue;
    if (!car.path || car.pathI >= car.path.length) {
      const tx = 200 + Math.random() * (WORLD.width - 400);
      const ty = 200 + Math.random() * (WORLD.height - 800);
      const pt = nearestRoadPoint(tx, ty);
      car.path = [{ x: pt.x, y: pt.y }];
      car.pathI = 0;
    }
    const target = car.path[car.pathI];
    const d = dist(car.x, car.y, target.x, target.y);
    if (d < 30) { car.pathI++; continue; }
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
    const cruise = 130 + (car.def * 17) % 60;
    car.speed += (cruise - car.speed) * dt * 0.8;
    // Slow down for the player right ahead.
    if (p && dist(car.x, car.y, p.x, p.y) < 90) car.speed *= Math.pow(0.2, dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (isSea(car.x, car.y)) { car.y = WORLD.height - 460; car.angle = -Math.PI / 2; }
  }
  state.cars = state.cars.filter((c) => !c.dead);
  // Keep the streets busy near the player.
  if (state.cars.filter((c) => c.driver !== 'player').length < 10) {
    const a = Math.random() * Math.PI * 2;
    const x = clamp(p.x + Math.cos(a) * 900, 200, WORLD.width - 200);
    const y = clamp(p.y + Math.sin(a) * 900, 200, WORLD.height - 600);
    const pt = nearestRoadPoint(x, y);
    state.cars.push(makeCar(pt.x, pt.y, rangeInt(mulberry32(Date.now() % 100000), 0, 4), 'traffic'));
  }
}

export function stepPeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.fleeing > 0) ped.fleeing -= dt;
    const danger = state.bullets.length > 0 || (state.wanted >= 2 && p && dist(ped.x, ped.y, p.x, p.y) < 260);
    if (danger) ped.fleeing = 1.5;
    if (ped.fleeing > 0) {
      const away = Math.atan2(ped.y - (p ? p.y : ped.y), ped.x - (p ? p.x : ped.x));
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
      ped.angle = away;
    } else if (ped.wait > 0) {
      ped.wait -= dt;
    } else {
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (Math.random() < dt * 0.2) { ped.angle = Math.random() * Math.PI * 2; ped.wait = 1 + Math.random() * 3; }
    }
    ped.x = clamp(ped.x, 40, WORLD.width - 40);
    ped.y = clamp(ped.y, 40, WORLD.height - 460);
  }
}

export function stepBullets(state, dt) {
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.fromPlayer) {
      // Hit foot cops.
      for (const cop of state.footCops) {
        if (dist(b.x, b.y, cop.x, cop.y) < 22) {
          cop.hp -= b.damage;
          state.missions.stats.hits++;
          b.life = 0;
          state.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, max: 0.2, color: '#ff6a5a', size: 8 });
        }
      }
      for (const car of state.cars) {
        if (car.driver === 'player') continue;
        if (dist(b.x, b.y, car.x, car.y) < 30) {
          car.hp -= b.damage;
          state.missions.stats.hits++;
          b.life = 0;
        }
      }
      for (const car of state.copCars) {
        if (dist(b.x, b.y, car.x, car.y) < 30) {
          car.hp -= b.damage;
          state.missions.stats.hits++;
          b.life = 0;
        }
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height);
  state.footCops = state.footCops.filter((c) => c.hp > 0);
  for (const car of state.copCars) if (car.hp <= 0) car.dead = true;
  state.copCars = state.copCars.filter((c) => !c.dead);
  for (const car of state.cars) {
    if (car.hp <= 0 && !car.dead) {
      car.dead = true;
      state.missions.stats.carsDestroyed++;
    }
  }
  state.cars = state.cars.filter((c) => !c.dead || c.driver === 'player');
}

export function stepParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= Math.pow(0.2, dt);
    pt.vy *= Math.pow(0.2, dt);
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const f of state.floaters) { f.timer -= dt; f.y -= 30 * dt; }
  state.floaters = state.floaters.filter((f) => f.timer > 0);
}
