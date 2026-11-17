// Traffic and pedestrians: cars that follow the road graph, parked cars to steal, and people
// walking the sidewalks who flee when trouble comes. Nothing here knows about missions or the
// police; it only moves the city's ordinary life.

import { CAR, LANE, ROAD_W, TRAFFIC } from './config.js';
import { angleLerp, angleTo, clamp, dist } from './random.js';
import { findPath, randomRoadPoint } from './city.js';

export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8c33c', '#7a7a7a', '#3d9e6a', '#c9c9c9', '#8a5fb0', '#e8903d', '#2b2b2b', '#f0ead8'];
export const PED_SHIRTS = ['#e8e8e8', '#d94f3d', '#3d7bd9', '#e8c33c', '#3d9e6a', '#e8903d', '#8a5fb0', '#58b368'];

const CAR_SIZE = {
  sedan: { len: 46, wid: 22 },
  taxi: { len: 46, wid: 22 },
  van: { len: 58, wid: 24 },
  sports: { len: 44, wid: 22 },
  truck: { len: 62, wid: 26 },
  police: { len: 48, wid: 23 },
};

export function carSize(kind) {
  return CAR_SIZE[kind] || CAR_SIZE.sedan;
}

let nextId = 1;

export function makeCar(city, rng, opts = {}) {
  const kind = opts.kind || rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sports', 'truck']);
  const size = carSize(kind);
  const car = {
    id: nextId += 1,
    kind,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    angle: opts.angle ?? 0,
    speed: 0,
    targetSpeed: 0,
    color: opts.color || (kind === 'taxi' ? '#f2c230' : kind === 'police' ? '#1f3a6e' : rng.pick(CAR_COLORS)),
    len: size.len,
    wid: size.wid,
    parked: opts.parked ?? false,
    driver: opts.driver ?? false,
    hp: CAR.hp,
    path: null,
    pathIndex: 0,
    brake: false,
    playerDriven: false,
    siren: 0,
  };
  if (!car.parked) {
    car.targetSpeed = rng.range(TRAFFIC.cruiseMin, TRAFFIC.cruiseMax);
    retarget(car, city, rng);
  }
  return car;
}

/** Give a moving car a fresh destination somewhere across the city. */
export function retarget(car, city, rng) {
  const dest = randomRoadPoint(city, rng);
  car.path = findPath(city, car.x, car.y, dest.x, dest.y);
  car.pathIndex = 0;
}

/** The next waypoint with the right-hand lane offset applied. */
function laneTarget(car) {
  const wp = car.path[car.pathIndex];
  const dx = wp.x - car.x;
  const dy = wp.y - car.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: wp.x, y: wp.y + (dx > 0 ? LANE : -LANE) };
  }
  return { x: wp.x + (dy > 0 ? -LANE : LANE), y: wp.y };
}

/** True when another car is right ahead of this one on the same stretch of road. */
function carAhead(cars, car) {
  const fx = car.x + Math.cos(car.angle) * 52;
  const fy = car.y + Math.sin(car.angle) * 52;
  for (let index = 0; index < cars.length; index += 1) {
    const other = cars[index];
    if (other === car || other.parked) continue;
    const d = dist(fx, fy, other.x, other.y);
    if (d < 30) return true;
  }
  return false;
}

export function stepCar(car, city, cars, dt, rng) {
  if (car.parked || !car.path) return;
  const target = laneTarget(car);
  const d = dist(car.x, car.y, target.x, target.y);
  if (d < 26) {
    car.pathIndex += 1;
    if (car.pathIndex >= car.path.length) {
      retarget(car, city, rng);
      return;
    }
  }
  const want = angleTo(car.x, car.y, target.x, target.y);
  const turn = clamp(angleLerp(0, want - car.angle, 1), -1, 1);
  car.angle += clamp(turn, -1, 1) * 2.4 * dt * Math.min(1, car.speed / 60 + 0.25);
  const blocked = carAhead(cars, car);
  const goal = blocked ? 0 : car.targetSpeed;
  car.speed += clamp(goal - car.speed, -500 * dt, 260 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

export function makePed(city, rng, x, y) {
  const onH = rng.chance(0.5);
  let px = x;
  let py = y;
  let road;
  if (px === undefined) {
    if (onH) {
      const j = rng.int(0, city.hRoads.length - 1);
      px = rng.range(100, city.width - 100);
      py = city.hRoads[j] + (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 14);
      road = { axis: 'h', index: j, dir: rng.chance(0.5) ? 1 : -1 };
    } else {
      const i = rng.int(0, city.vRoads.length - 1);
      px = city.vRoads[i] + (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 14);
      py = rng.range(100, city.height - 100);
      road = { axis: 'v', index: i, dir: rng.chance(0.5) ? 1 : -1 };
    }
  } else {
    road = { axis: 'h', index: 0, dir: 1 };
  }
  return {
    x: px, y: py,
    angle: road.axis === 'h' ? (road.dir > 0 ? 0 : Math.PI) : (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    speed: rng.range(38, 62),
    state: 'walk',
    timer: 0,
    shirt: rng.pick(PED_SHIRTS),
    road,
    fleeX: 0,
    fleeY: 0,
  };
}

export function stepPed(ped, city, dt, rng, threat) {
  if (ped.state === 'down') {
    ped.timer -= dt;
    return ped.timer <= 0;
  }
  if (threat && dist(ped.x, ped.y, threat.x, threat.y) < 110) {
    ped.state = 'flee';
    ped.timer = 2.5;
    ped.fleeX = ped.x - threat.x;
    ped.fleeY = ped.y - threat.y;
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const a = Math.atan2(ped.fleeY, ped.fleeX);
    ped.angle = angleLerp(ped.angle, a, 0.2);
    ped.x += Math.cos(a) * 135 * dt;
    ped.y += Math.sin(a) * 135 * dt;
    ped.x = clamp(ped.x, 20, city.width - 20);
    ped.y = clamp(ped.y, 20, city.height - 20);
    if (ped.timer <= 0) {
      ped.state = 'walk';
      ped.road = { axis: 'h', index: 0, dir: 1 };
      const at = nearestRoad(city, ped.x, ped.y);
      if (at) ped.road = at;
    }
    return false;
  }
  // Walk the sidewalk: along the road, and at an intersection sometimes turn.
  const r = ped.road;
  const speed = ped.speed * dt;
  if (r.axis === 'h') {
    ped.x += r.dir * speed;
    ped.y = city.hRoads[r.index] + (ped.y > city.hRoads[r.index] ? ROAD_W / 2 + 14 : -(ROAD_W / 2 + 14));
    ped.angle = r.dir > 0 ? 0 : Math.PI;
    if (ped.x < 60 || ped.x > city.width - 60) r.dir *= -1;
    else if (nearIntersection(city, ped.x, ped.y) && rng.chance(0.004)) {
      const v = nearestV(city, ped.x);
      ped.road = { axis: 'v', index: v, dir: rng.chance(0.5) ? 1 : -1 };
      ped.x = city.vRoads[v] + (ped.y > city.hRoads[r.index] ? ROAD_W / 2 + 14 : -(ROAD_W / 2 + 14));
    }
  } else {
    ped.y += r.dir * speed;
    ped.x = city.vRoads[r.index] + (ped.x > city.vRoads[r.index] ? ROAD_W / 2 + 14 : -(ROAD_W / 2 + 14));
    ped.angle = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ped.y < 60 || ped.y > city.height - 60) r.dir *= -1;
    else if (nearIntersection(city, ped.x, ped.y) && rng.chance(0.004)) {
      const h = nearestH(city, ped.y);
      ped.road = { axis: 'h', index: h, dir: rng.chance(0.5) ? 1 : -1 };
      ped.y = city.hRoads[h] + (ped.x > city.vRoads[r.index] ? ROAD_W / 2 + 14 : -(ROAD_W / 2 + 14));
    }
  }
  return false;
}

function nearIntersection(city, x, y) {
  for (let i = 0; i < city.vRoads.length; i += 1) {
    if (Math.abs(x - city.vRoads[i]) < 40) return true;
  }
  for (let j = 0; j < city.hRoads.length; j += 1) {
    if (Math.abs(y - city.hRoads[j]) < 40) return true;
  }
  return false;
}

function nearestV(city, x) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < city.vRoads.length; i += 1) {
    const d = Math.abs(city.vRoads[i] - x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function nearestH(city, y) {
  let best = 0;
  let bd = Infinity;
  for (let j = 0; j < city.hRoads.length; j += 1) {
    const d = Math.abs(city.hRoads[j] - y);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

function nearestRoad(city, x, y) {
  const h = nearestH(city, y);
  const v = nearestV(city, x);
  if (Math.abs(city.hRoads[h] - y) < Math.abs(city.vRoads[v] - x)) return { axis: 'h', index: h, dir: 1 };
  return { axis: 'v', index: v, dir: 1 };
}

export function createTraffic(city, rng) {
  const cars = [];
  for (let n = 0; n < TRAFFIC.cars; n += 1) {
    const spot = randomRoadPoint(city, rng);
    const car = makeCar(city, rng, { x: spot.x, y: spot.y, angle: spot.angle });
    cars.push(car);
  }
  for (let n = 0; n < TRAFFIC.parked; n += 1) {
    const spot = randomRoadPoint(city, rng);
    cars.push(makeCar(city, rng, { x: spot.x, y: spot.y, angle: spot.angle, parked: true }));
  }
  const peds = [];
  for (let n = 0; n < TRAFFIC.peds; n += 1) peds.push(makePed(city, rng));
  return { cars, peds };
}

export function stepTraffic(state, dt, rng) {
  const { city, traffic, player } = state;
  for (let index = 0; index < traffic.cars.length; index += 1) {
    stepCar(traffic.cars[index], city, traffic.cars, dt, rng);
  }
  const threat = player.onFoot || (player.car && Math.abs(player.car.speed) > 240)
    ? { x: player.x, y: player.y }
    : null;
  for (let index = traffic.peds.length - 1; index >= 0; index -= 1) {
    const ped = traffic.peds[index];
    const gone = stepPed(ped, city, dt, rng, threat);
    if (gone) traffic.peds[index] = makePed(city, rng);
  }
}

/** The nearest car the player could get into, or null. */
export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bd = maxDist;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (car.playerDriven) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) {
      bd = d;
      best = car;
    }
  }
  return best;
}
