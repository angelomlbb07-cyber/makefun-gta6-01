// SOLMAR vehicles — cars the player can steal and drive, the traffic
// that fills the avenues, and the police cars that chase the player.
// Driving physics, drift and near-miss cash live here too.

import { WORLD_W, WORLD_H, clamp, dist, angleDiff, pushOutOfRect, mulberry32 } from './core.js';
import { TUNE, PALETTE } from './tuning.js';
import { isOnRoad, isWater, roadPointNear, AVENUES, STREETS, ROAD_W } from './world.js';

let carId = 1;

export function makeCar(x, y, angle, kind, color) {
  return {
    id: carId++,
    x, y, angle, kind: kind || 'sedan',
    color: color || PALETTE.carColors[Math.floor(Math.random() * PALETTE.carColors.length)],
    speed: 0,
    w: 44, h: 22,
    hp: 100,
    driver: kind === 'cop' ? 'cop' : (Math.random() < 0.8 ? 'traffic' : 'parked'),
    // Traffic waypoint state.
    road: null, dir: 1, target: null,
    driftT: 0, nearMissCd: 0, honkT: 0,
    dead: false,
  };
}

export function spawnTraffic(G, city, n) {
  const rng = mulberry32(4242 + Math.floor(G.time));
  while (G.cars.filter((c) => c.driver === 'traffic').length < n) {
    const vertical = rng() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = AVENUES[Math.floor(rng() * AVENUES.length)] + (rng() < 0.5 ? -22 : 22);
      y = 100 + rng() * (WORLD_H - 200);
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = 350 + rng() * (WORLD_W - 450);
      y = STREETS[Math.floor(rng() * STREETS.length)] + (rng() < 0.5 ? -22 : 22);
      angle = rng() < 0.5 ? 0 : Math.PI;
    }
    if (dist(x, y, G.player.x, G.player.y) < 500) continue;
    const c = makeCar(x, y, angle, rng() < 0.08 ? 'taxi' : 'sedan');
    if (c.kind === 'taxi') c.color = PALETTE.taxi;
    c.speed = 150 + rng() * 90;
    c.driver = 'traffic';
    G.cars.push(c);
  }
}

export function spawnParked(G, city, n) {
  const rng = mulberry32(777);
  let placed = 0;
  let guard = 0;
  while (placed < n && guard++ < 300) {
    const vertical = rng() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = AVENUES[Math.floor(rng() * AVENUES.length)] + (rng() < 0.5 ? -30 : 30);
      y = 200 + rng() * (WORLD_H - 400);
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = 400 + rng() * (WORLD_W - 500);
      y = STREETS[Math.floor(rng() * STREETS.length)] + (rng() < 0.5 ? -30 : 30);
      angle = rng() < 0.5 ? 0 : Math.PI;
    }
    if (dist(x, y, G.player.x, G.player.y) < 260) continue;
    if (G.cars.some((c) => dist(c.x, c.y, x, y) < 90)) continue;
    const c = makeCar(x, y, angle, 'sedan');
    c.driver = 'parked';
    c.speed = 0;
    G.cars.push(c);
    placed++;
  }
}

function carCollidesBuildings(car, city) {
  const e = { x: car.x, y: car.y, r: 20 };
  for (const b of city.buildings) {
    if (car.x < b.x - 40 || car.x > b.x + b.w + 40 || car.y < b.y - 40 || car.y > b.y + b.h + 40) continue;
    if (pushOutOfRect(e, b)) {
      car.x = e.x;
      car.y = e.y;
      car.speed *= 0.4;
      return true;
    }
  }
  return false;
}

export function updateTraffic(G, dt, city, S) {
  for (const c of G.cars) {
    if (c.driver !== 'traffic' || c.dead) continue;
    // Follow the road: steer toward the lane centre, keep speed.
    const vertical = Math.abs(Math.sin(c.angle)) > 0.7;
    let laneX = c.x;
    let laneY = c.y;
    if (vertical) {
      let best = AVENUES[0];
      for (const ax of AVENUES) if (Math.abs(ax - c.x) < Math.abs(best - c.x)) best = ax;
      laneX = best + (Math.sin(c.angle) > 0 ? 22 : -22) * 0; // keep current lane offset
      c.angle += clamp(angleDiff(c.angle, Math.sin(c.angle) > 0 ? Math.PI / 2 : -Math.PI / 2), -1.2 * dt, 1.2 * dt);
    } else {
      let best = STREETS[0];
      for (const sy of STREETS) if (Math.abs(sy - c.y) < Math.abs(best - c.y)) best = sy;
      c.angle += clamp(angleDiff(c.angle, Math.cos(c.angle) > 0 ? 0 : Math.PI), -1.2 * dt, 1.2 * dt);
    }
    void laneX; void laneY;
    // Slow for the car ahead.
    let ahead = null;
    for (const o of G.cars) {
      if (o === c || o.dead) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const fwd = dx * Math.cos(c.angle) + dy * Math.sin(c.angle);
      const side = Math.abs(-dx * Math.sin(c.angle) + dy * Math.cos(c.angle));
      if (fwd > 0 && fwd < 110 && side < 30) { ahead = o; break; }
    }
    const targetSpeed = ahead ? 0 : (c.cruise || 190);
    c.cruise = c.cruise || 170 + Math.random() * 60;
    c.speed += clamp(targetSpeed - c.speed, -400 * dt, 200 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Wrap around the map edges so traffic never runs dry.
    if (c.x < 280) { c.x = WORLD_W - 120; }
    if (c.x > WORLD_W - 80) { c.x = 300; }
    if (c.y < 60) { c.y = WORLD_H - 80; }
    if (c.y > WORLD_H - 60) { c.y = 80; }
    if (c.nearMissCd > 0) c.nearMissCd -= dt;
  }
  // Top up traffic and remove wrecks.
  G.cars = G.cars.filter((c) => !c.dead);
  spawnTraffic(G, city, TUNE.maxTraffic);
}

export function updatePlayerCar(G, dt, city, S) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const keys = G.keys;
  const up = keys.KeyW || keys.ArrowUp;
  const down = keys.KeyS || keys.ArrowDown;
  const left = keys.KeyA || keys.ArrowLeft;
  const right = keys.KeyD || keys.ArrowRight;
  const onRoad = isOnRoad(car.x, car.y);
  const grip = onRoad ? 1 : TUNE.offroadFactor;
  if (up) car.speed += TUNE.carAccel * grip * dt;
  if (down) {
    if (car.speed > 30) car.speed -= TUNE.carBrake * dt;
    else car.speed -= TUNE.carAccel * 0.5 * dt;
  }
  if (!up && !down) car.speed -= Math.sign(car.speed) * 160 * dt;
  car.speed = clamp(car.speed, -TUNE.carReverseMax, TUNE.carMaxSpeed);
  if (Math.abs(car.speed) < 4 && !up && !down) car.speed = 0;
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const spd01 = clamp(Math.abs(car.speed) / TUNE.carMaxSpeed, 0, 1);
  car.angle += steer * TUNE.carTurn * spd01 * Math.sign(car.speed || 1) * dt * 1.4;
  const prevX = car.x;
  const prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 170, WORLD_W - 40);
  car.y = clamp(car.y, 40, WORLD_H - 40);
  if (carCollidesBuildings(car, city)) {
    if (Math.abs(car.speed) > 260 && S) S.crash();
    if (Math.abs(car.speed) > 200) car.hp -= 6;
  }
  // Drift: hard steering at speed pays cash.
  if (Math.abs(steer) > 0 && Math.abs(car.speed) > 380) {
    car.driftT += dt;
    if (car.driftT > 0.9) {
      car.driftT = 0;
      G.money += TUNE.driftCash;
      addFloat(G, car.x, car.y - 30, 'DRIFT +$' + TUNE.driftCash, '#ffd94d');
      if (S) S.cash();
    }
  } else {
    car.driftT = 0;
  }
  // Near miss: brushing past traffic at speed pays cash.
  for (const o of G.cars) {
    if (o === car || o.dead || o.nearMissCd > 0) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 78 && d > 34 && Math.abs(car.speed) > 300) {
      o.nearMissCd = 3;
      G.money += TUNE.nearMissCash;
      addFloat(G, car.x, car.y - 34, 'NEAR MISS +$' + TUNE.nearMissCash, '#ffd94d');
      if (S) S.cash();
    }
  }
  // Car-to-car bumps.
  for (const o of G.cars) {
    if (o === car || o.dead) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 46 && d > 0.01) {
      const push = (46 - d) / 2;
      const nx = (car.x - o.x) / d;
      const ny = (car.y - o.y) / d;
      car.x += nx * push;
      car.y += ny * push;
      o.x -= nx * push;
      o.y -= ny * push;
      if (Math.abs(car.speed) > 240) {
        o.hp -= 12;
        car.hp -= 4;
        if (S) S.crash();
        if (o.hp <= 0) explodeCar(G, o, S);
      }
      car.speed *= 0.82;
    }
  }
  if (car.hp <= 0) explodeCar(G, car, S);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = car.speed;
  if (S) S.setEngine(spd01, true);
  void prevX; void prevY;
}

export function explodeCar(G, car, S) {
  if (car.dead) return;
  car.dead = true;
  G.carsDestroyed++;
  for (let i = 0; i < 26; i++) {
    G.parts.push({
      x: car.x, y: car.y,
      vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420,
      life: 0.5 + Math.random() * 0.5, max: 1,
      size: 3 + Math.random() * 6,
      color: ['#ff9a3c', '#ff5a3c', '#ffd94d', '#888'][i % 4],
    });
  }
  addFloat(G, car.x, car.y - 30, 'CAR DESTROYED', '#ff6a4d');
  if (S) S.crash();
  if (G.player.car === car) {
    G.player.car = null;
    G.player.onFoot = true;
    G.player.x = car.x + 40;
    G.player.y = car.y;
    G.health -= 20;
  }
}

export function nearestCar(G, maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of G.cars) {
    if (c.dead || c.driver === 'cop') continue;
    const d = dist(G.player.x, G.player.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function enterCar(G, S) {
  const car = nearestCar(G, 70);
  if (!car) return false;
  if (car.driver === 'traffic' || car.driver === 'parked') {
    car.driver = 'player';
    G.player.car = car;
    G.player.onFoot = false;
    car.speed = 0;
    addWanted(G, TUNE.wantedPerSteal);
    addFloat(G, car.x, car.y - 30, 'CAR STOLEN', '#ff8a5c');
    if (S) S.siren();
    return true;
  }
  return false;
}

export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  G.player.car = null;
  G.player.onFoot = true;
  const a = car.angle + Math.PI / 2;
  G.player.x = car.x + Math.cos(a) * 40;
  G.player.y = car.y + Math.sin(a) * 40;
}

export function addWanted(G, amount) {
  G.wantedHeat = clamp(G.wantedHeat + amount, 0, 100);
  const stars = G.wantedHeat <= 0 ? 0 : G.wantedHeat < 20 ? 1 : G.wantedHeat < 40 ? 2 : G.wantedHeat < 60 ? 3 : G.wantedHeat < 80 ? 4 : 5;
  if (stars > G.wanted) {
    G.notice = 'WANTED LEVEL ' + stars;
    G.noticeT = 2.2;
  }
  G.wanted = stars;
}

export function updateCopCars(G, dt, city, S) {
  // Spawn pressure scales with wanted level.
  G._copTimer = (G._copTimer || 0) - dt;
  const want = G.wanted;
  const target = want === 0 ? 0 : Math.min(want + 1, TUNE.maxCopCars);
  const alive = G.cops.filter((c) => !c.dead).length;
  if (want > 0 && alive < target && G._copTimer <= 0) {
    G._copTimer = TUNE.copSpawnInterval / Math.max(1, want);
    const a = Math.random() * Math.PI * 2;
    const d = 700 + Math.random() * 300;
    const rp = roadPointNear(G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d) || { x: G.player.x + 700, y: G.player.y };
    const cop = makeCar(clamp(rp.x, 300, WORLD_W - 60), clamp(rp.y, 60, WORLD_H - 60), 0, 'cop', PALETTE.copCar);
    cop.driver = 'cop';
    cop.speed = 300;
    G.cars.push(cop);
    G.cops.push(cop);
    if (S && Math.random() < 0.5) S.siren();
  }
  // Chase: steer toward the player, ram on contact.
  for (const cop of G.cops) {
    if (cop.dead) continue;
    const wantAngle = Math.atan2(G.player.y - cop.y, G.player.x - cop.x);
    cop.angle += clamp(angleDiff(cop.angle, wantAngle), -2.4 * dt, 2.4 * dt);
    const targetSpeed = 300 + want * 55;
    cop.speed += clamp(targetSpeed - cop.speed, -500 * dt, 380 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    carCollidesBuildings(cop, city);
    const d = dist(cop.x, cop.y, G.player.x, G.player.y);
    if (d < 52) {
      if (G.player.onFoot) {
        G._bustedTouch = (G._bustedTouch || 0) + dt;
        if (G._bustedTouch > TUNE.bustedTouchTime) {
          G.mode = 'busted';
          G.bustedT = 0;
          G.money = Math.max(0, G.money - 200);
          G.wanted = 0;
          G.wantedHeat = 0;
        }
      } else {
        G.player.car.hp -= TUNE.copRamDamage * dt * 2;
        cop.speed *= 0.7;
        if (G.player.car.hp <= 0) explodeCar(G, G.player.car, S);
      }
    } else {
      G._bustedTouch = 0;
    }
    if (cop.hp <= 0) explodeCar(G, cop, S);
  }
  G.cops = G.cops.filter((c) => !c.dead);
  // Helicopter appears at 2+ stars and circles overhead.
  if (want >= TUNE.heliMinStars) {
    if (!G.heli) G.heli = { angle: 0, r: 260 };
    G.heli.angle += dt * 0.5;
    G.heli.x = G.player.x + Math.cos(G.heli.angle) * G.heli.r;
    G.heli.y = G.player.y + Math.sin(G.heli.angle) * G.heli.r - 60;
  } else {
    G.heli = null;
  }
}

export function addFloat(G, x, y, text, color) {
  G.floats.push({ x, y, text, color: color || '#fff', life: 1.6, max: 1.6 });
}

export function drawCars(ctx, G, cam, view) {
  for (const c of G.cars) {
    if (c.dead) continue;
    if (c.x < cam.x - 60 || c.x > cam.x + view.w + 60 || c.y < cam.y - 60 || c.y > cam.y + view.h + 60) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-20, -9, 46, 24);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-22, -11, 44, 22, 6);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    ctx.beginPath();
    ctx.roundRect(-6, -9, 16, 18, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.fillRect(8, -8, 4, 16);
    if (c.kind === 'cop') {
      ctx.fillStyle = PALETTE.copBlue;
      ctx.fillRect(-22, -11, 44, 5);
      ctx.fillRect(-22, 6, 44, 5);
      // Light bar, flashing.
      const flash = Math.floor(G.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f6bff';
      ctx.fillRect(-4, -13, 8, 4);
      ctx.fillStyle = flash ? '#2f6bff' : '#ff3b30';
      ctx.fillRect(4, -13, 8, 4);
    }
    if (c.kind === 'taxi') {
      ctx.fillStyle = '#222';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    // Headlights at night.
    if (G.mood === 'night' && c.speed > 10) {
      ctx.fillStyle = 'rgba(255, 240, 180, 0.25)';
      ctx.beginPath();
      ctx.moveTo(22, -8);
      ctx.lineTo(90, -26);
      ctx.lineTo(90, 26);
      ctx.lineTo(22, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
