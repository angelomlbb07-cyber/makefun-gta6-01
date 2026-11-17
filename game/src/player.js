// The player: Marco Solis on foot and behind the wheel. On foot he walks, runs, shoots and
// punches and gets in and out of cars; in a car he drives with acceleration, braking, steering
// and a handbrake, and the car takes damage from crashes. Guns, armour, respect, nitro, drift
// and near-miss scoring all live here. All collisions are circles and boxes.

import { CAR, DRIFT, NEAR_MISS, PLAYER, WANTED, WEAPONS } from './config.js';
import { angleLerp, angleTo, clamp, dist, wrapAngle } from './random.js';
import { collideCircle, hitBuilding } from './city.js';
import { addHeat } from './police.js';
import { makePed, nearestCar } from './traffic.js';

export function createPlayer(city) {
  const spawn = city.landmarks.spawn;
  return {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    cash: 50,
    onFoot: true,
    car: null,
    punchTimer: 0,
    invulnerable: 0,
    regenTimer: 0,
    speed: 0,
    weapon: 'pistol', // pistol or smg; Q switches, R reloads, F or click fires
    ammo: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    ammoPistol: WEAPONS.pistol.mag,
    reservePistol: WEAPONS.pistol.reserve,
    ammoSmg: WEAPONS.smg.mag,
    reserveSmg: WEAPONS.smg.reserve,
    ammoPistol: WEAPONS.pistol.mag,
    reservePistol: WEAPONS.pistol.reserve,
    armour: 0, // absorbs damage before health does
    respect: 0, // RESPECT LV rises with missions, drifts and near misses
    fireTimer: 0,
    driftTimer: 0,
    nearMissCooldown: 0,
  };
}

/** Respect level: one level per 500 respect, starting at 1. */
export function respectLevel(player) {
  return 1 + Math.floor((player.respect || 0) / 500);
}

function damagePlayer(state, amount) {
  const player = state.player;
  if (player.invulnerable > 0) return;
  // Armour eats the hit first; only the rest reaches health.
  const absorbed = Math.min(player.armour || 0, amount);
  player.armour -= absorbed;
  player.health -= (amount - absorbed);
  player.regenTimer = 5;
  state.events.hit = true;
  if (player.health <= 0) {
    player.health = 0;
    state.events.wasted = true;
  }
}

/** Fire the equipped gun: hitscan in a narrow cone, muzzle flash, tracer, stats. */
export function tryShoot(state) {
  const p = state.player;
  if (p.fireTimer > 0 || p.ammo <= 0) return false;
  const w = WEAPONS[p.weapon];
  p.fireTimer = w.rate;
  p.ammo -= 1;
  if (p.weapon === 'pistol') p.ammoPistol = p.ammo;
  else p.ammoSmg = p.ammo;
  state.missions.stats.shotsFired += 1;
  const ox = p.onFoot ? p.x : p.car.x;
  const oy = p.onFoot ? p.y : p.car.y;
  const ang = p.angle;
  const gx = ox + Math.cos(ang) * 26;
  const gy = oy + Math.sin(ang) * 26;
  state.particles.push({ x: gx, y: gy, vx: 0, vy: 0, life: 0.09, max: 0.09, color: '#ffe9a8', size: 9 });
  let hx = ox + Math.cos(ang) * w.range;
  let hy = oy + Math.sin(ang) * w.range;
  let hit = null;
  let best = Infinity;
  const targets = [];
  for (const cop of state.police.footCops) targets.push({ x: cop.x, y: cop.y, ref: cop, kind: 'cop' });
  for (const ped of state.traffic.peds) {
    if (ped.state !== 'down') targets.push({ x: ped.x, y: ped.y, ref: ped, kind: 'ped' });
  }
  for (const car of state.traffic.cars) {
    if (!car.playerDriven) targets.push({ x: car.x, y: car.y, ref: car, kind: 'car' });
  }
  for (const t of targets) {
    const d = dist(ox, oy, t.x, t.y);
    if (d > w.range) continue;
    const a = Math.abs(wrapAngle(Math.atan2(t.y - oy, t.x - ox) - ang));
    if (a > 0.22) continue;
    if (d < best) {
      best = d;
      hit = t;
    }
  }
  if (hit) {
    hx = hit.x;
    hy = hit.y;
    state.missions.stats.shotsHit += 1;
    if (hit.kind === 'cop') {
      hit.ref.x += Math.cos(ang) * 30;
      hit.ref.y += Math.sin(ang) * 30;
      addHeat(state, WANTED.hitCop);
    } else if (hit.kind === 'ped') {
      hit.ref.state = 'flee';
      hit.ref.timer = 3;
      hit.ref.fleeX = hit.ref.x - ox;
      hit.ref.fleeY = hit.ref.y - oy;
      addHeat(state, WANTED.punchPed);
    } else {
      hit.ref.hp -= w.damage;
      if (hit.ref.hp <= 0) {
        state.missions.stats.carsDestroyed += 1;
        state.events.crash = true;
      }
    }
  }
  state.particles.push({ x: gx, y: gy, x2: hx, y2: hy, vx: 0, vy: 0, life: 0.12, max: 0.12, color: '#ffd94d', size: 2, tracer: true });
  state.events.shoot = true;
  return true;
}

/** Reload from reserve ammo into the magazine. */
export function reloadWeapon(state) {
  const p = state.player;
  const w = WEAPONS[p.weapon];
  if (p.reserve <= 0 || p.ammo >= w.mag) return;
  const take = Math.min(w.mag - p.ammo, p.reserve);
  p.ammo += take;
  p.reserve -= take;
  if (p.weapon === 'pistol') {
    p.ammoPistol = p.ammo;
    p.reservePistol = p.reserve;
  } else {
    p.ammoSmg = p.ammo;
    p.reserveSmg = p.reserve;
  }
  state.events.reload = true;
}

/** Switch pistol / SMG, keeping each gun's ammo where it was. */
export function switchWeapon(state) {
  const p = state.player;
  if (p.weapon === 'pistol') {
    p.ammoPistol = p.ammo;
    p.reservePistol = p.reserve;
    p.weapon = 'smg';
    p.ammo = p.ammoSmg;
    p.reserve = p.reserveSmg;
  } else {
    p.ammoSmg = p.ammo;
    p.reserveSmg = p.reserve;
    p.weapon = 'pistol';
    p.ammo = p.ammoPistol;
    p.reserve = p.reservePistol;
  }
  state.events.reload = true;
}

function stepOnFoot(state, input, dt) {
  const { city, player, traffic } = state;
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  player.nearMissCooldown = Math.max(0, player.nearMissCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  const mx = input.moveX();
  const my = input.moveY();
  const moving = mx !== 0 || my !== 0;
  const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const speed = run ? PLAYER.run : PLAYER.walk;
  if (moving) {
    const want = Math.atan2(my, mx);
    player.angle = angleLerp(player.angle, want, clamp(10 * dt, 0, 1));
    player.x += Math.cos(want) * speed * dt;
    player.y += Math.sin(want) * speed * dt;
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  collideCircle(city, player, PLAYER.radius);

  // Fire the gun with F or a mouse click when loaded; punch when the magazine is empty.
  if ((input.pressed('KeyF') || input.clicked()) && player.punchTimer <= 0) {
    if (player.ammo > 0) {
      if (tryShoot(state)) player.punchTimer = 0.15;
    } else {
      player.punchTimer = PLAYER.punchCooldown;
      state.events.punch = true;
      const px = player.x + Math.cos(player.angle) * 30;
      const py = player.y + Math.sin(player.angle) * 30;
      for (let index = 0; index < traffic.peds.length; index += 1) {
        const ped = traffic.peds[index];
        if (ped.state === 'down') continue;
        const d = dist(px, py, ped.x, ped.y);
        const a = Math.abs(((Math.atan2(ped.y - player.y, ped.x - player.x) - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < PLAYER.punchRange && a < PLAYER.punchArc) {
          ped.state = 'flee';
          ped.timer = 3;
          ped.fleeX = ped.x - player.x;
          ped.fleeY = ped.y - player.y;
          addHeat(state, WANTED.punchPed);
          state.events.crime = true;
        }
      }
      for (let index = 0; index < state.police.footCops.length; index += 1) {
        const cop = state.police.footCops[index];
        const d = dist(px, py, cop.x, cop.y);
        if (d < PLAYER.punchRange + 8) {
          cop.x += Math.cos(player.angle) * 40;
          cop.y += Math.sin(player.angle) * 40;
          addHeat(state, WANTED.hitCop);
          state.events.crime = true;
        }
      }
    }
  }

  // R reloads the gun.
  if (input.pressed('KeyR')) reloadWeapon(state);

  // Get into the nearest car.
  if (input.pressed('KeyE')) {
    const car = nearestCar(traffic.cars, player.x, player.y, 56);
    if (car) {
      enterCar(state, car);
    }
  }
}

export function enterCar(state, car) {
  const { player, traffic } = state;
  if (car.driver) {
    // The driver bails and runs.
    const ped = makePed(state.city, state.rng, car.x + 30, car.y + 30);
    ped.state = 'flee';
    ped.timer = 3;
    ped.fleeX = 30;
    ped.fleeY = 30;
    traffic.peds.push(ped);
    car.driver = false;
  }
  car.parked = false;
  car.playerDriven = true;
  car.targetSpeed = 0;
  // Garage armour raises this car's max HP; the HUD bar reads car.hp / car.maxHp.
  car.maxHp = CAR.hp + 40 * (state.garage ? state.garage.armour : 0);
  if (car.hp > car.maxHp) car.hp = car.maxHp;
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  if (!car.stolen) {
    car.stolen = true;
    state.missions.stats.carsStolen += 1;
    addHeat(state, WANTED.stealCar);
    state.events.crime = true;
  }
  state.events.enterCar = true;
}

export function exitCar(state) {
  const { player } = state;
  const car = player.car;
  if (!car) return;
  car.playerDriven = false;
  car.parked = true;
  car.speed = 0;
  car.targetSpeed = 0;
  player.car = null;
  player.onFoot = true;
  player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  player.angle = car.angle;
  collideCircle(state.city, player, PLAYER.radius);
}

function stepDriving(state, input, dt) {
  const { city, player, traffic } = state;
  const car = player.car;
  player.punchTimer = 0;
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  player.nearMissCooldown = Math.max(0, player.nearMissCooldown - dt);
  const forward = input.isDown('KeyW') || input.isDown('ArrowUp');
  const back = input.isDown('KeyS') || input.isDown('ArrowDown');
  const steer = input.moveX();
  const handbrake = input.isDown('Space');
  const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  // Garage upgrades: engine adds speed, tyres sharpen the turn, nitro is a Shift boost.
  const g = state.garage || { engine: 0, tyres: 0, nitro: 0, nitroMeter: 0 };
  const nitroOn = g.nitro > 0 && run && g.nitroMeter > 0 && Math.abs(car.speed) > 60;
  if (nitroOn) g.nitroMeter = Math.max(0, g.nitroMeter - 30 * dt);
  else g.nitroMeter = Math.min(100, g.nitroMeter + 8 * dt);
  const topSpeed = CAR.maxSpeed * (1 + 0.12 * g.engine) * (nitroOn ? 1.3 : 1);
  const accel = CAR.accel * (1 + 0.12 * g.engine) * (nitroOn ? 1.8 : 1);
  if (forward) car.speed += accel * dt;
  if (back) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverse * dt;
  }
  car.speed -= car.speed * (handbrake ? CAR.handbrakeDrag : CAR.drag) * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, topSpeed);
  const turnScale = clamp(Math.abs(car.speed) / 140, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * CAR.turnRate * (1 + 0.1 * g.tyres) * turnScale * dt * (handbrake ? 1.5 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const impact = Math.abs(car.speed);
  car.x = nx;
  car.y = ny;
  const hit = hitBuilding(city, car.x, car.y, 16);
  if (hit) {
    collideCircle(city, car, 16);
    if (impact > 180) {
      car.hp -= Math.min(30, (impact - 180) / 8);
      damagePlayer(state, Math.min(18, (impact - 180) / 14));
      state.events.crash = true;
      spawnSparks(state, car.x, car.y);
    }
    car.speed *= 0.35;
  }
  if (car.y + 16 > 2740) {
    car.y = 2740 - 16;
    car.speed *= 0.5;
  }
  // Drift: handbrake + speed + steering builds a slide; cash it when the slide ends.
  if (handbrake && Math.abs(car.speed) > DRIFT.minSpeed && Math.abs(steer) > 0.3) {
    player.driftTimer += dt;
  } else if (player.driftTimer >= DRIFT.minTime) {
    const bonus = Math.round(player.driftTimer * DRIFT.cashPerSecond);
    player.cash += bonus;
    player.respect += 10;
    state.scoreToast = `DRIFT x${Math.max(2, Math.round(player.driftTimer))}  +$${bonus}`;
    state.scoreToastTimer = 2.5;
    player.driftTimer = 0;
  } else {
    player.driftTimer = 0;
  }
  // Nitro flames behind the car while the boost is on.
  if (nitroOn && Math.random() < 0.6) {
    state.particles.push({
      x: car.x - Math.cos(car.angle) * 24, y: car.y - Math.sin(car.angle) * 24,
      vx: -Math.cos(car.angle) * 60, vy: -Math.sin(car.angle) * 60,
      life: 0.3, max: 0.3, color: '#ff9a2c', size: 5,
    });
  }
  // Bump other cars and knock down pedestrians.
  for (let index = 0; index < traffic.cars.length; index += 1) {
    const other = traffic.cars[index];
    if (other === car || other.playerDriven) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 34 && d > 0.01) {
      const push = (34 - d) / 2;
      const ax = (other.x - car.x) / d;
      const ay = (other.y - car.y) / d;
      other.x += ax * push;
      other.y += ay * push;
      car.x -= ax * push * 0.5;
      car.y -= ay * push * 0.5;
      if (Math.abs(car.speed) > 200) {
        other.hp -= 8;
        car.hp -= 4;
        if (other.hp <= 0 && !other.countedDead) {
          other.countedDead = true;
          state.missions.stats.carsDestroyed += 1;
        }
        state.events.crash = true;
        spawnSparks(state, (car.x + other.x) / 2, (car.y + other.y) / 2);
        if (other.police) addHeat(state, WANTED.damageCopCar);
      }
      // Nudge the other car forward instead of swapping speeds: a swap pins the
      // player to a stopped car and the car can never get going again.
      other.speed = Math.max(other.speed, Math.max(0, car.speed * 0.5));
      car.speed *= 0.85;
    }
  }
  for (let index = 0; index < traffic.peds.length; index += 1) {
    const ped = traffic.peds[index];
    if (ped.state === 'down') continue;
    const d = dist(car.x, car.y, ped.x, ped.y);
    if (d < 26 && Math.abs(car.speed) > 40) {
      ped.state = 'down';
      ped.timer = 4;
      addHeat(state, WANTED.runOverPed);
      state.events.crime = true;
      state.events.crash = true;
    }
  }
  // Near miss: threading past traffic at speed pays $150.
  if (Math.abs(car.speed) > NEAR_MISS.minSpeed && player.nearMissCooldown <= 0) {
    for (let index = 0; index < traffic.cars.length; index += 1) {
      const other = traffic.cars[index];
      if (other === car || other.playerDriven) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d > NEAR_MISS.minDist && d < NEAR_MISS.maxDist) {
        player.cash += NEAR_MISS.cash;
        player.respect += 10;
        player.nearMissCooldown = NEAR_MISS.cooldown;
        state.scoreToast = `NEAR MISS  +$${NEAR_MISS.cash}`;
        state.scoreToastTimer = 2.5;
        break;
      }
    }
  }
  // Drive-by: F or click fires from the car window; R reloads.
  if (input.pressed('KeyF') || input.clicked()) tryShoot(state);
  if (input.pressed('KeyR')) reloadWeapon(state);
  // Dust when fast or handbraking.
  if ((Math.abs(car.speed) > 300 || handbrake) && Math.random() < 0.5) {
    state.particles.push({
      x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20,
      vx: -Math.cos(car.angle) * 30, vy: -Math.sin(car.angle) * 30,
      life: 0.5, max: 0.5, color: '#c9bfa5', size: 4,
    });
  }
  if (car.hp <= 0) {
    car.hp = 0;
    car.speed = 0;
    state.events.carDead = true;
    exitCar(state);
  }
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;
  if (input.pressed('KeyE')) exitCar(state);
}

function spawnSparks(state, x, y) {
  for (let index = 0; index < 8; index += 1) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
      life: 0.35, max: 0.35, color: '#ffd94d', size: 3,
    });
  }
}

export function stepPlayer(state, input, dt) {
  const { player } = state;
  player.regenTimer = Math.max(0, player.regenTimer - dt);
  if (player.regenTimer <= 0 && player.health < PLAYER.health && player.health > 0) {
    player.health = Math.min(PLAYER.health, player.health + 2 * dt);
  }
  if (player.onFoot) stepOnFoot(state, input, dt);
  else stepDriving(state, input, dt);
}
