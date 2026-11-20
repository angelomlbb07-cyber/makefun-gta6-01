// vehicles.js — cars: arcade physics, traffic, stealing, collisions.
// One job: everything with four wheels. Car physics is a simple bicycle-ish
// arcade model: forward speed, steering that weakens at speed, lateral grip
// that drops while the handbrake is held (drift), and collisions that trade
// speed between the two cars only when they really overlap.

import { CAR, WORLD, clamp, lerp, wrapAngle, dist, mulberry32 } from './tuning.js';
import { isRoad, roadPoint, nearestRoadPoint } from './world.js';

export const CAR_TYPES = [
  { name: 'Solmar Compact', color: '#c8c8d0', top: 0.82 },
  { name: 'Palm Cruiser', color: '#e8a040', top: 0.9 },
  { name: 'Marina GT', color: '#3a7ac8', top: 1.0 },
  { name: 'Coral Taxi', color: '#e8d040', top: 0.86, taxi: true },
  { name: 'Sunset Coupe', color: '#c83a5a', top: 1.08 },
  { name: 'Beach Van', color: '#7ac8a0', top: 0.75 },
];

export function createCar(x, y, angle, typeIndex = 0, opts = {}) {
  const type = CAR_TYPES[typeIndex % CAR_TYPES.length];
  return {
    x, y, angle, speed: 0, vx: 0, vy: 0,
    type, typeIndex,
    damage: opts.damage ?? 0,
    color: opts.color ?? type.color,
    traffic: !!opts.traffic,
    police: !!opts.police,
    stolen: false,
    nitro: CAR.nitroMax,
    driftChain: 0,
    driftTime: 0,
    dead: false,
    path: null, pathIdx: 0,
  };
}

// Spawn traffic on roads, never on top of the player (min 420 px away).
export function spawnTraffic(state, count) {
  const rng = mulberry32((state.world.seed ^ 0x5f3a) >>> 0);
  let guard = 0;
  while (state.cars.filter(c => c.traffic).length < count && guard++ < 400) {
    const p = roadPoint(state.world, rng);
    if (dist(p.x, p.y, state.player.x, state.player.y) < 420) continue;
    if (state.cars.some(c => dist(c.x, c.y, p.x, p.y) < 90)) continue;
    const angle = rng() < 0.5 ? 0 : Math.PI / 2;
    const car = createCar(p.x, p.y, angle, Math.floor(rng() * CAR_TYPES.length), { traffic: true });
    car.speed = 90 + rng() * 70;
    state.cars.push(car);
  }
}

export function nearestCar(state, x, y, maxDist = 90) {
  let best = null, bestD = maxDist;
  for (const c of state.cars) {
    if (c.dead) continue;
    const d = dist(c.x, c.y, x, y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function putPlayerInCar(state, car) {
  if (!car) return false;
  state.player.car = car;
  state.player.onFoot = false;
  car.stolen = true;
  state.mission.stats.carsStolen++;
  return true;
}

// One physics step for a driven car. Returns events the HUD floats on.
export function stepDrivenCar(state, car, input, dt) {
  const events = [];
  const nitro = input.nitro && car.nitro > 0 && input.up;
  const top = CAR.maxSpeed * car.type.top * (nitro ? CAR.nitroBoost : 1);
  if (input.up) car.speed += CAR.accel * dt;
  else if (input.down) car.speed -= (car.speed > 5 ? CAR.brake : CAR.reverseAccel) * dt;
  else car.speed -= Math.sign(car.speed) * 120 * dt;
  if (nitro) car.nitro = Math.max(0, car.nitro - dt);
  else car.nitro = Math.min(CAR.nitroMax, car.nitro + dt * 0.25);
  car.speed = clamp(car.speed, -CAR.maxReverse, top);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 300, 0.25, 1);
  const turn = input.handbrake ? CAR.handbrakeTurn : CAR.turnRate;
  car.angle += steer * turn * speedFactor * dt * (car.speed >= 0 ? 1 : -1);
  // Velocity follows heading with lateral grip; handbrake kills grip (drift).
  const grip = input.handbrake ? CAR.driftGrip : CAR.grip;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const forward = car.vx * fx + car.vy * fy;
  const latX = car.vx - forward * fx, latY = car.vy - forward * fy;
  const latDamp = Math.exp(-grip * dt);
  car.vx = forward * fx + latX * latDamp;
  car.vy = forward * fy + latY * latDamp;
  // Blend velocity toward the target forward speed.
  const target = car.speed;
  car.vx = lerp(car.vx, fx * target, 1 - Math.exp(-8 * dt));
  car.vy = lerp(car.vy, fy * target, 1 - Math.exp(-8 * dt));
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // Drift scoring: sideways slide at speed while handbraking.
  const slide = Math.abs(latX * -fy + latY * fx);
  if (input.handbrake && Math.abs(car.speed) > 180 && slide > 60) {
    car.driftTime += dt;
    if (car.driftTime > 0.5) {
      const chain = 1 + Math.floor(car.driftTime);
      if (chain !== car.driftChain) {
        car.driftChain = chain;
        events.push({ kind: 'drift', x: car.x, y: car.y, text: 'DRIFT x' + chain, cash: 25 * chain });
      }
    }
  } else if (car.driftTime > 0) {
    car.driftTime = 0;
    car.driftChain = 0;
  }
  keepInWorld(car);
  return events;
}

// Traffic follows the road grid: pick a neighbouring intersection, drive to
// it, pick another. Slow, predictable, and never through buildings.
export function stepTrafficCar(state, car, dt) {
  if (!car.path || car.pathIdx >= car.path.length) {
    const cur = nearestRoadPoint(state.world, car.x, car.y);
    const rng = mulberry32((state.time * 1000 | 0) + (car.x | 0));
    const dest = roadPoint(state.world, rng);
    car.path = [cur, dest];
    car.pathIdx = 0;
  }
  const target = car.path[car.pathIdx];
  const d = dist(car.x, car.y, target.x, target.y);
  if (d < 30) { car.pathIdx++; return; }
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  car.angle += clamp(wrapAngle(want - car.angle), -1.8 * dt, 1.8 * dt);
  const sp = Math.min(150, d * 1.2);
  car.vx = Math.cos(car.angle) * sp;
  car.vy = Math.sin(car.angle) * sp;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  keepInWorld(car);
}

function keepInWorld(car) {
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
}

// Collisions trade speed only on a real overlap (centre distance < 34 px).
// Returns the cars that took damage, for smoke/explosion effects.
export function collideCars(state) {
  const hit = [];
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.dead || b.dead) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d >= 38 || d === 0) continue;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      const overlap = 38 - d;
      a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
      b.x += nx * overlap / 2; b.y += ny * overlap / 2;
      // Trade speed along the impact normal.
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = -rel * 0.7;
        a.vx -= nx * impulse; a.vy -= ny * impulse;
        b.vx += nx * impulse; b.vy += ny * impulse;
        a.speed *= 0.82; b.speed *= 0.82;
        const hard = -rel > 160;
        if (hard) {
          a.damage = Math.min(100, a.damage + CAR.damagePerHit);
          b.damage = Math.min(100, b.damage + CAR.damagePerHit);
          hit.push(a, b);
          if (a.damage >= CAR.wreckAt) a.dead = true;
          if (b.damage >= CAR.wreckAt) b.dead = true;
        }
      }
    }
  }
  return hit;
}

export function drawCars(ctx, state, cam) {
  for (const car of state.cars) {
    if (car.dead) {
      // Wreck: charred husk.
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
      ctx.fillStyle = '#1c1c20';
      ctx.fillRect(-22, -11, 44, 22);
      ctx.restore();
      continue;
    }
    if (car.x < cam.x - 80 || car.x > cam.x + 1360 || car.y < cam.y - 80 || car.y > cam.y + 880) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(-21, -10, 44, 24);
    // Body.
    ctx.fillStyle = car.police ? '#20242e' : car.color;
    ctx.beginPath();
    ctx.roundRect(-22, -11, 44, 22, 6);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = car.police ? '#c8d8e8' : 'rgba(20,30,45,0.75)';
    ctx.fillRect(-6, -9, 14, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(6, -9, 4, 18);
    // Headlights.
    ctx.fillStyle = '#fff6c0';
    ctx.fillRect(20, -9, 3, 5); ctx.fillRect(20, 4, 3, 5);
    if (car.police) {
      // Light bar.
      const on = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = on ? '#ff3a3a' : '#3a6aff';
      ctx.fillRect(-4, -11, 8, 5);
      ctx.fillStyle = on ? '#3a6aff' : '#ff3a3a';
      ctx.fillRect(-4, 6, 8, 5);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 0);
    }
    if (car.type.taxi) {
      ctx.fillStyle = '#20242e';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 0);
    }
    // Smoke when damaged.
    if (car.damage >= CAR.smokeAt && Math.floor(state.time * 8) % 2 === 0) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath(); ctx.arc(-16, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Drift smoke behind the car.
    if (car.driftChain > 0) {
      ctx.fillStyle = 'rgba(220,220,220,0.35)';
      ctx.beginPath(); ctx.arc(car.x - Math.cos(car.angle) * 24, car.y - Math.sin(car.angle) * 24, 9, 0, Math.PI * 2); ctx.fill();
    }
  }
}
