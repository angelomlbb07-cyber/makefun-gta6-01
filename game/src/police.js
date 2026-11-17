// The wanted level and the police who answer it: heat that rises with crimes and cools when
// no officer can see the player, patrol cars that pathfind the road graph to the player and ram
// them, foot cops who chase a player on foot and bust them, roadblocks at three stars, and a
// police helicopter with a searchlight that circles overhead at two stars and up.

import { LANE, WANTED } from './config.js';
import { angleLerp, angleTo, clamp, dist } from './random.js';
import { collideCircle, findPath, randomRoadPoint } from './city.js';
import { makeCar } from './traffic.js';

export const EVENT_BUSTED = 1;

export function createPolice() {
  return {
    heat: 0,
    stars: 0,
    copCars: [],
    footCops: [],
    roadblocks: [],
    spawnTimer: 0,
    roadblockTimer: 0,
    pathTimer: 0,
    heli: { active: false, x: 0, y: 0, angle: 0, orbit: 0 }, // police air unit, 2 stars and up
  };
}

export function addHeat(state, amount) {
  const police = state.police;
  police.heat = clamp(police.heat + amount, 0, 100);
  updateStars(police);
}

function updateStars(police) {
  let stars = 0;
  for (let index = 0; index < WANTED.starAt.length; index += 1) {
    if (police.heat >= WANTED.starAt[index]) stars = index + 1;
  }
  police.stars = stars;
}

function spawnCopCar(state, rng) {
  const { city, player } = state;
  for (let tries = 0; tries < 8; tries += 1) {
    const spot = randomRoadPoint(city, rng);
    const d = dist(spot.x, spot.y, player.x, player.y);
    if (d < 650 || d > 1100) continue;
    const car = makeCar(city, rng, { kind: 'police', x: spot.x, y: spot.y, angle: spot.angle });
    car.police = true;
    car.targetSpeed = 330;
    car.pathTimer = 0;
    car.ramCooldown = 0;
    state.traffic.cars.push(car);
    state.police.copCars.push(car);
    return;
  }
}

function spawnFootCop(state, rng) {
  const { city, player } = state;
  const a = rng.range(0, Math.PI * 2);
  const x = player.x + Math.cos(a) * rng.range(180, 260);
  const y = player.y + Math.sin(a) * rng.range(180, 260);
  const cop = {
    x: clamp(x, 30, city.width - 30),
    y: clamp(y, 30, city.height - 30),
    angle: angleTo(x, y, player.x, player.y),
    speed: 205,
    punchTimer: 0,
    bustTimer: 0,
    shirt: '#2c4a8a',
  };
  collideCircle(city, cop, 13);
  state.police.footCops.push(cop);
}

function spawnRoadblock(state, rng) {
  const { city, player } = state;
  const ahead = player.car ? player.car.angle : player.angle;
  const cx = player.x + Math.cos(ahead) * 520;
  const cy = player.y + Math.sin(ahead) * 520;
  if (cx < 80 || cx > city.width - 80 || cy < 80 || cy > city.height - 80) return;
  const perp = ahead + Math.PI / 2;
  const block = [];
  for (const side of [-1, 1]) {
    const car = makeCar(city, rng, {
      kind: 'police',
      x: cx + Math.cos(perp) * side * 34,
      y: cy + Math.sin(perp) * side * 34,
      angle: perp,
      parked: true,
    });
    car.police = true;
    car.roadblock = true;
    state.traffic.cars.push(car);
    block.push(car);
  }
  state.police.roadblocks.push({ cars: block, timer: 26, x: cx, y: cy });
}

function stepCopCar(state, car, dt, rng) {
  const { city, player } = state;
  car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
  const dPlayer = dist(car.x, car.y, player.x, player.y);
  car.pathTimer = (car.pathTimer || 0) - dt;
  if (dPlayer < 340) {
    // Close in: drive straight at the player and ram.
    const want = angleTo(car.x, car.y, player.x, player.y);
    car.angle = angleLerp(car.angle, want, clamp(3.2 * dt, 0, 1));
    car.speed += clamp(345 - car.speed, -600 * dt, 320 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    collideCircle(city, car, 16);
    if (dPlayer < 62 && car.ramCooldown <= 0) {
      car.ramCooldown = 0.6;
      state.events.ram = true;
      if (player.car) {
        player.car.hp -= 12;
        player.car.speed = player.car.speed * 0.4 + 120;
        player.car.x += Math.cos(car.angle) * 14;
        player.car.y += Math.sin(car.angle) * 14;
        state.particles.push({ x: player.car.x, y: player.car.y, vx: 0, vy: 0, life: 0.4, max: 0.4, color: '#ffd94d', size: 5 });
      } else {
        player.health -= 14;
        player.x += Math.cos(car.angle) * 26;
        player.y += Math.sin(car.angle) * 26;
      }
    }
    return;
  }
  // Far: follow the road graph to the player's intersection.
  if (car.pathTimer <= 0 || !car.path) {
    car.pathTimer = 1.2;
    car.path = findPath(city, car.x, car.y, player.x, player.y);
    car.pathIndex = 0;
    // Same guard as the screenshot autopilot: skip waypoints already behind the car,
    // or a fast cop car U-turns toward the intersection it just passed instead of
    // closing in on the player.
    while (car.pathIndex < car.path.length - 1
      && dist(car.x, car.y, car.path[car.pathIndex].x, car.path[car.pathIndex].y) < 40) {
      car.pathIndex += 1;
    }
  }
  const wp = car.path[Math.min(car.pathIndex, car.path.length - 1)];
  const dx = wp.x - car.x;
  const dy = wp.y - car.y;
  let tx = wp.x;
  let ty = wp.y;
  if (Math.abs(dx) >= Math.abs(dy)) ty = wp.y + (dx > 0 ? LANE : -LANE);
  else tx = wp.x + (dy > 0 ? -LANE : LANE);
  const d = dist(car.x, car.y, tx, ty);
  if (d < 30) {
    car.pathIndex += 1;
    if (car.pathIndex >= car.path.length) {
      car.path = null;
      return;
    }
  }
  const want = angleTo(car.x, car.y, tx, ty);
  car.angle = angleLerp(car.angle, want, clamp(2.6 * dt, 0, 1));
  car.speed += clamp(330 - car.speed, -500 * dt, 300 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function stepFootCop(state, cop, dt) {
  const { city, player } = state;
  cop.punchTimer = Math.max(0, cop.punchTimer - dt);
  const d = dist(cop.x, cop.y, player.x, player.y);
  if (player.onFoot && d < 700) {
    const want = angleTo(cop.x, cop.y, player.x, player.y);
    cop.angle = angleLerp(cop.angle, want, clamp(4 * dt, 0, 1));
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    collideCircle(city, cop, 13);
    if (d < 36) {
      cop.bustTimer += dt;
      if (cop.punchTimer <= 0) {
        cop.punchTimer = 0.8;
        player.health -= 8;
        state.events.hit = true;
      }
      if (cop.bustTimer >= WANTED.bustSeconds) {
        state.events.busted = true;
      }
    } else {
      cop.bustTimer = 0;
    }
  } else {
    cop.bustTimer = 0;
  }
}

export function stepPolice(state, dt, rng) {
  const police = state.police;
  const { player } = state;
  updateStars(police);

  // The helicopter: up at two stars, circling the player with its searchlight on them.
  // It never lands and never shoots — it pins the player down so the cars can close in.
  const heli = police.heli;
  if (police.stars >= 2) {
    if (!heli.active) {
      heli.active = true;
      heli.x = player.x - 260;
      heli.y = player.y - 260;
      heli.orbit = 0;
    }
    heli.orbit += dt * 0.55;
    const tx = player.x + Math.cos(heli.orbit) * 190;
    const ty = player.y + Math.sin(heli.orbit) * 190 - 60;
    heli.x += (tx - heli.x) * Math.min(1, 1.4 * dt);
    heli.y += (ty - heli.y) * Math.min(1, 1.4 * dt);
    heli.angle = angleTo(heli.x, heli.y, player.x, player.y);
  } else {
    heli.active = false;
  }

  // Heat cools when no officer is close enough to see the player.
  let seen = false;
  for (let index = 0; index < police.copCars.length; index += 1) {
    if (dist(police.copCars[index].x, police.copCars[index].y, player.x, player.y) < WANTED.sightRange) seen = true;
  }
  for (let index = 0; index < police.footCops.length; index += 1) {
    if (dist(police.footCops[index].x, police.footCops[index].y, player.x, player.y) < WANTED.sightRange) seen = true;
  }
  if (!seen && police.heat > 0) {
    police.heat = Math.max(0, police.heat - WANTED.decay * dt);
    updateStars(police);
  }

  // Keep the patrol at the wanted level's strength.
  const wantCars = Math.min(police.stars * WANTED.copCarsPerStar, WANTED.maxCopCars);
  police.spawnTimer -= dt;
  if (police.copCars.length < wantCars && police.spawnTimer <= 0) {
    police.spawnTimer = 2;
    spawnCopCar(state, rng);
  }
  const wantFoot = player.onFoot ? police.stars : 0;
  if (police.footCops.length < wantFoot && police.spawnTimer <= 0) {
    police.spawnTimer = 1.5;
    spawnFootCop(state, rng);
  }

  for (let index = 0; index < police.copCars.length; index += 1) {
    stepCopCar(state, police.copCars[index], dt, rng);
  }
  // Keep patrol cars from piling onto each other as they converge on the player.
  for (let a = 0; a < police.copCars.length; a += 1) {
    for (let b = a + 1; b < police.copCars.length; b += 1) {
      const ca = police.copCars[a];
      const cb = police.copCars[b];
      const d = dist(ca.x, ca.y, cb.x, cb.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const ax = (cb.x - ca.x) / d;
        const ay = (cb.y - ca.y) / d;
        cb.x += ax * push;
        cb.y += ay * push;
        ca.x -= ax * push;
        ca.y -= ay * push;
      }
    }
  }
  for (let index = 0; index < police.footCops.length; index += 1) {
    stepFootCop(state, police.footCops[index], dt);
  }

  // Roadblocks at three stars, ahead of the player.
  police.roadblockTimer -= dt;
  if (police.stars >= 3 && police.roadblockTimer <= 0 && police.roadblocks.length < 2) {
    police.roadblockTimer = 18;
    spawnRoadblock(state, rng);
  }
  for (let index = police.roadblocks.length - 1; index >= 0; index -= 1) {
    const block = police.roadblocks[index];
    block.timer -= dt;
    const d = dist(block.x, block.y, player.x, player.y);
    if (block.timer <= 0 || d > 900) {
      for (const car of block.cars) {
        car.roadblock = false;
        const at = state.traffic.cars.indexOf(car);
        if (at !== -1) state.traffic.cars.splice(at, 1);
      }
      police.roadblocks.splice(index, 1);
    }
  }

  // Clean up officers when the heat is gone.
  if (police.stars === 0) {
    for (const car of police.copCars) {
      const at = state.traffic.cars.indexOf(car);
      if (at !== -1) state.traffic.cars.splice(at, 1);
    }
    police.copCars.length = 0;
    police.footCops.length = 0;
  } else {
    // Drop cop cars that fell far behind.
    for (let index = police.copCars.length - 1; index >= 0; index -= 1) {
      const car = police.copCars[index];
      if (dist(car.x, car.y, player.x, player.y) > 1600) {
        const at = state.traffic.cars.indexOf(car);
        if (at !== -1) state.traffic.cars.splice(at, 1);
        police.copCars.splice(index, 1);
      }
    }
    for (let index = police.footCops.length - 1; index >= 0; index -= 1) {
      const cop = police.footCops[index];
      if (dist(cop.x, cop.y, player.x, player.y) > 900) police.footCops.splice(index, 1);
    }
  }
}
