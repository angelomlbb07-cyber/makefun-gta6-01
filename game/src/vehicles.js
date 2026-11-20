// vehicles.js — car physics, traffic AI, spawning, and stealing cars.
// One job: everything with four wheels.
import { TUNING } from './tuning.js';
import { makeRng, resolveCircleCollision, solidAt } from './world.js';

export const CAR_MODELS = [
  { name: 'Comet', color: '#d84a3a', len: 46, wid: 22 },
  { name: 'Sundown', color: '#3a7bd8', len: 48, wid: 22 },
  { name: 'Vagabond', color: '#e8b13c', len: 50, wid: 24 },
  { name: 'Prowler', color: '#5a5f6b', len: 47, wid: 22 },
  { name: 'Breeze', color: '#e8e8e8', len: 44, wid: 21 },
  { name: 'Interceptor', color: '#2e5fd0', len: 48, wid: 23 },
];

export function makeCar(x, y, angle, modelIndex, traffic = false) {
  const model = CAR_MODELS[modelIndex % CAR_MODELS.length];
  return {
    kind: 'car', x, y, angle, model: model.name, color: model.color,
    len: model.len, wid: model.wid,
    speed: 0, health: TUNING.carHealthMax, traffic,
    steer: 0, drift: 0, dead: false, honkT: 0,
    routeDir: (Math.floor(angle / (Math.PI / 2)) % 4 + 4) % 4,
    targetSpeed: traffic ? TUNING.trafficSpeed * (0.85 + Math.random() * 0.3) : 0,
  };
}

// Spawn a parked / traffic car on a road near (x, y), but never right on
// top of the spawn point — a traffic jam at the player's feet pins the
// starter car and the first mission with it.
export function spawnTrafficCar(world, rng, nearX, nearY) {
  const roadsV = world.roadsV, roadsH = world.roadsH;
  let x, y, angle;
  for (let attempt = 0; attempt < 8; attempt++) {
    const vertical = rng() < 0.5;
    if (vertical) {
      x = roadsV[Math.floor(rng() * roadsV.length)];
      y = nearY + (rng() - 0.5) * 900;
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = nearX + (rng() - 0.5) * 900;
      y = roadsH[Math.floor(rng() * roadsH.length)];
      angle = rng() < 0.5 ? 0 : Math.PI;
    }
    if (Math.hypot(x - nearX, y - nearY) > 350) break;
  }
  x = Math.max(200, Math.min(TUNING.worldWidth - 100, x));
  y = Math.max(100, Math.min(TUNING.worldHeight - 100, y));
  const car = makeCar(x, y, angle, Math.floor(rng() * CAR_MODELS.length), true);
  car.speed = car.targetSpeed;
  return car;
}

export function spawnTraffic(world, count, nearX, nearY) {
  const rng = makeRng(987654 + count);
  const cars = [];
  for (let i = 0; i < count; i++) cars.push(spawnTrafficCar(world, rng, nearX, nearY));
  return cars;
}

// --- Player driving -------------------------------------------------------
// Arcade physics: accelerate / brake / reverse, steering that scales with
// speed, handbrake drift that pays cash while sliding.
export function updatePlayerCar(car, input, dt, state) {
  const T = TUNING;
  const forward = input.up ? 1 : input.down ? -0.6 : 0;
  if (input.up) car.speed += T.carAccel * dt;
  if (input.down) {
    if (car.speed > 30) car.speed -= T.carBrake * dt;
    else car.speed -= T.carReverseAccel * dt;
  }
  car.speed -= car.speed * T.carDrag * dt;
  if (car.speed > T.carMaxSpeed) car.speed = T.carMaxSpeed;
  if (car.speed < -T.carMaxReverse) car.speed = -T.carMaxReverse;
  if (!input.up && !input.down && Math.abs(car.speed) < 12) car.speed = 0;

  const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const speedFactor = Math.min(1, Math.abs(car.speed) / 220);
  const turnBoost = input.handbrake ? T.handbrakeTurnBoost : 1;
  car.angle += steerInput * T.carTurnRate * speedFactor * turnBoost * dt * Math.sign(car.speed || 1);
  car.steer = steerInput;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const beforeX = car.x, beforeY = car.y;
  car.x = nx; car.y = ny;
  const hitWall = resolveCircleCollision(state.world, car, car.len / 2);
  if (hitWall || solidAt(state.world, car.x, car.y)) {
    car.x = beforeX; car.y = beforeY;
    if (Math.abs(car.speed) > 260) {
      car.health -= T.collisionDamage;
      state.stats.carsDamaged += 1;
      addCrashSparks(state, car.x, car.y);
    }
    car.speed *= -0.25;
  }

  // Drift: handbrake + speed + steering = sliding cash.
  const drifting = input.handbrake && Math.abs(car.speed) > 240 && steerInput !== 0;
  car.drift = drifting ? car.drift + dt : 0;
  if (drifting) {
    state.driftCash += T.driftCashPerSecond * dt;
    if (car.drift > 0.8 && Math.floor(car.drift * 2) !== Math.floor((car.drift - dt) * 2)) {
      state.cash += T.driftCashPerSecond;
      addPopup(state, car.x, car.y - 30, `DRIFT +$${T.driftCashPerSecond}`, '#e8b13c');
    }
    spawnTyreSmoke(state, car.x, car.y);
  }
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    state.stats.carsDestroyed += 1;
    addPopup(state, car.x, car.y - 30, 'CAR WRECKED', '#ff5a4d');
    explodeCar(state, car);
  }
  return car;
}

// --- Traffic AI -----------------------------------------------------------
// Traffic follows the road grid: drive straight, turn at intersections,
// slow down when another car is right ahead.
export function updateTrafficCar(car, cars, world, dt) {
  const T = TUNING;
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  let blocked = false;
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - aheadX, dy = other.y - aheadY;
    if (dx * dx + dy * dy < 55 * 55) { blocked = true; break; }
  }
  const want = blocked ? 0 : car.targetSpeed;
  car.speed += Math.sign(want - car.speed) * 200 * dt;
  if (Math.abs(car.speed) < 4 && !blocked) car.speed = want * 0.2;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Turn at intersections: snap to the nearest road crossing and pick a turn.
  const nearV = nearestRoad(world.roadsV, car.x);
  const nearH = nearestRoad(world.roadsH, car.y);
  const onV = Math.abs(car.x - nearV) < 26 && Math.abs(Math.sin(car.angle)) > 0.7;
  const onH = Math.abs(car.y - nearH) < 26 && Math.abs(Math.cos(car.angle)) > 0.7;
  if ((onV || onH) && Math.random() < dt * 0.5) {
    const turns = [0, Math.PI / 2, -Math.PI / 2];
    car.angle += turns[Math.floor(Math.random() * turns.length)];
  }
  // Keep traffic inside the city and on roads: bounce off the edges.
  if (car.x < 180 || car.x > TUNING.worldWidth - 80 || car.y < 80 || car.y > TUNING.worldHeight - 80) {
    car.angle += Math.PI;
    car.x = Math.max(200, Math.min(TUNING.worldWidth - 100, car.x));
    car.y = Math.max(100, Math.min(TUNING.worldHeight - 100, car.y));
  }
  resolveCircleCollision(world, car, car.len / 2);
}

function nearestRoad(roads, v) {
  let best = roads[0], bd = Infinity;
  for (const r of roads) {
    const d = Math.abs(r - v);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// --- Stealing -------------------------------------------------------------
export function nearestCar(cars, x, y, maxDist = 90) {
  let best = null, bd = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const dx = car.x - x, dy = car.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

// --- Collisions between cars ---------------------------------------------
export function resolveCarCollisions(cars, state) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = (a.len + b.len) / 2 - 8;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 200) {
          a.health -= 6; b.health -= 6;
          addCrashSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2);
          if (a === state.playerCar || b === state.playerCar) {
            state.stats.carsDamaged += 1;
          }
        }
        // Only trade speed on a real hit: a stopped car must not zero the
        // player's speed every frame and pin them in a traffic jam.
        if (impact > 60) {
          const tmp = a.speed; a.speed = b.speed * 0.4; b.speed = tmp * 0.4;
        }
      }
    }
  }
}

// --- Near miss (player car passes a traffic car closely at speed) ---------
export function checkNearMiss(state, dt) {
  const pc = state.playerCar;
  if (!pc || state.player.onFoot) return;
  if (Math.abs(pc.speed) < 300) return;
  state.nearMissCooldown = Math.max(0, (state.nearMissCooldown || 0) - dt);
  if (state.nearMissCooldown > 0) return;
  for (const car of state.cars) {
    if (car === pc || car.dead) continue;
    const dx = car.x - pc.x, dy = car.y - pc.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < TUNING.nearMissDistance + 40 && d > 20) {
      state.cash += TUNING.nearMissCash;
      state.stats.nearMissCash += TUNING.nearMissCash;
      addPopup(state, pc.x, pc.y - 34, `NEAR MISS +$${TUNING.nearMissCash}`, '#7ddc8a');
      state.nearMissCooldown = 1.6;
      break;
    }
  }
}

// --- Effects helpers (live on state; drawn by hud/world render) -----------
export function addPopup(state, x, y, text, color) {
  state.popups.push({ x, y, text, color: color || '#ffffff', life: TUNING.popupLife });
  if (state.popups.length > 24) state.popups.shift();
}

export function addCrashSparks(state, x, y) {
  for (let i = 0; i < 10; i++) {
    state.particles.push({
      x, y, vx: (Math.random() - 0.5) * 320, vy: (Math.random() - 0.5) * 320,
      life: 0.5, maxLife: 0.5, color: '#ffb13c', size: 3,
    });
  }
}

export function spawnTyreSmoke(state, x, y) {
  state.particles.push({
    x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
    vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
    life: 0.7, maxLife: 0.7, color: 'rgba(200,200,200,0.55)', size: 7,
  });
}

export function explodeCar(state, car) {
  for (let i = 0; i < 26; i++) {
    state.particles.push({
      x: car.x, y: car.y, vx: (Math.random() - 0.5) * 520, vy: (Math.random() - 0.5) * 520,
      life: 0.9, maxLife: 0.9, color: i % 3 === 0 ? '#ff5a3c' : '#ffb13c', size: 5,
    });
  }
}

// --- Rendering ------------------------------------------------------------
export function drawCar(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid);
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,30,44,0.75)';
  ctx.fillRect(-car.len / 2 + 10, -car.wid / 2 + 4, 13, car.wid - 8); // windshield
  ctx.fillRect(car.len / 2 - 20, -car.wid / 2 + 4, 12, car.wid - 8); // rear window
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(car.len / 2 - 3, -car.wid / 2 + 3, 3, 5); // headlights
  ctx.fillRect(car.len / 2 - 3, car.wid / 2 - 8, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-car.len / 2, -car.wid / 2 + 3, 3, 5); // tail lights
  ctx.fillRect(-car.len / 2, car.wid / 2 - 8, 3, 5);
  if (isPlayer) {
    ctx.strokeStyle = '#e8b13c';
    ctx.lineWidth = 2.5;
    roundRect(ctx, -car.len / 2 - 4, -car.wid / 2 - 4, car.len + 8, car.wid + 8, 9);
    ctx.stroke();
  }
  if (car.health < 45) {
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    ctx.beginPath(); ctx.arc(-car.len / 4, 0, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
