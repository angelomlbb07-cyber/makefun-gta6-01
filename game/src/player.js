// SOLMAR — player.js
// Marco Solis, on foot and behind the wheel: movement, driving physics with
// drift and near-miss cash, entering and stealing cars, punching and
// shooting. Shooting routes through here; police damage routes through
// damagePlayer in state.js, never the other way round. Round 5: no gameplay
// change — only the drawn size of the on-foot player grew (render.js).
// F15: putPlayerInCar falls back to spawning a car nearby when none is.

import { CARS, WEAPONS, SAND_Y } from './config.js';
import { clamp, dist, angleDiff, angleTo } from './random.js';
import { blockedAt, isRoadAt, isSandAt, nearestRoadPoint } from './city.js';
import { addCash, addFloat, raiseHeat, showToast } from './state.js';

let nextCarId = 1;

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    onFoot: true,
    car: null, // the car object the player is driving, or null
    weapon: 'pistol',
    ammo: {
      pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
      smg: { mag: WEAPONS.smg.mag, reserve: WEAPONS.smg.reserve },
    },
    punchT: 0,
    shootT: 0,
    reloadT: 0,
    driftT: 0,
    driftScore: 0,
    lastNearMiss: 0,
    moving: false,
    aimAngle: 0,
  };
}

export function createCar(def, x, y, angle, driver) {
  return {
    id: nextCarId++,
    def, x, y, angle: angle || 0, speed: 0,
    hp: 100, driver: driver || 'traffic',
    colour: def.colour, nitro: 0,
  };
}

// Put the player in the nearest car, or spawn one nearby when there is none
// (F15: the old code silently failed when no car was near).
export function putPlayerInCar(state, city) {
  const p = state.player;
  let best = null;
  let bestD = 1e9;
  for (const c of state.cars) {
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best || bestD > 600) {
    const spot = nearestRoadPoint(p.x + 120, p.y);
    best = createCar(CARS[0], spot.x, spot.y, 0, 'player');
    state.cars.push(best);
  }
  enterCar(state, best);
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  if (!p || !car) return false;
  if (car.driver === 'traffic') {
    car.driver = 'player';
    state.mission.stats.carsStolen += 1;
    raiseHeat(state, 0.12);
    showToast(state, 'Car stolen — the owner is calling it in.');
  }
  if (p.car && p.car !== car) p.car.driver = 'traffic';
  p.car = car;
  p.onFoot = false;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = 0;
  return true;
}

export function exitCar(state) {
  const p = state.player;
  if (!p || p.onFoot || !p.car) return false;
  const car = p.car;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
  p.angle = car.angle;
  p.speed = 0;
  p.onFoot = true;
  p.car = null;
  return true;
}

export function switchWeapon(state, name) {
  const p = state.player;
  if (!p || !WEAPONS[name] || name === 'fists') return;
  p.weapon = name;
}

export function reloadWeapon(state) {
  const p = state.player;
  if (!p || p.reloadT > 0) return;
  const w = WEAPONS[p.weapon];
  const slot = p.ammo[p.weapon];
  if (!slot || slot.mag >= w.mag || slot.reserve <= 0) return;
  p.reloadT = 0.9;
}

function finishReload(state) {
  const p = state.player;
  const w = WEAPONS[p.weapon];
  const slot = p.ammo[p.weapon];
  const need = w.mag - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
}

export function updatePlayer(state, input, dt, city, audio) {
  const p = state.player;
  if (!p) return;
  p.punchT = Math.max(0, p.punchT - dt);
  p.shootT = Math.max(0, p.shootT - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) finishReload(state);
  }
  p.moving = false;
  if (p.onFoot) updateOnFoot(state, input, dt, city);
  else updateDriving(state, input, dt, city, audio);
  // Aim follows the mouse in screen space; the renderer converts it.
  if (input.mouse) p.aimAngle = input.aimAngle || p.angle;
}

// On foot: WASD walks, Space punches, mouse click shoots, E enters a car.
function updateOnFoot(state, input, dt, city) {
  const p = state.player;
  let mx = 0;
  let my = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) my -= 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) my += 1;
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    p.moving = true;
    const speed = 230;
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    if (!blockedAt(city, nx, p.y, false)) p.x = nx;
    if (!blockedAt(city, p.x, ny, false)) p.y = ny;
    p.angle = Math.atan2(my, mx);
  }
  if (input.pressed('Space')) punch(state);
  if (input.mouseDown) shoot(state, city);
  if (input.pressed('KeyE')) tryEnterCar(state);
  if (input.pressed('Digit1')) switchWeapon(state, 'pistol');
  if (input.pressed('Digit2')) switchWeapon(state, 'smg');
  if (input.pressed('KeyR')) reloadWeapon(state);
}

function punch(state) {
  const p = state.player;
  if (p.punchT > 0) return;
  p.punchT = WEAPONS.fists.interval;
  const range = WEAPONS.fists.range;
  const tx = p.x + Math.cos(p.aimAngle) * range;
  const ty = p.y + Math.sin(p.aimAngle) * range;
  state.muzzle.push({ x: tx, y: ty, angle: p.aimAngle, life: 0.12 });
  for (const e of state.enemies) {
    if (e.alive && dist(p.x, p.y, e.x, e.y) < range + 20) damageEnemy(state, e, WEAPONS.fists.damage);
  }
  for (const c of state.footCops) {
    if (dist(p.x, p.y, c.x, c.y) < range + 20) {
      c.hp -= WEAPONS.fists.damage;
      if (c.hp <= 0) c.down = true;
    }
  }
}

function shoot(state, city) {
  const p = state.player;
  if (p.shootT > 0 || p.reloadT > 0) return;
  const w = WEAPONS[p.weapon];
  const slot = p.ammo[p.weapon];
  if (!slot || slot.mag <= 0) {
    if (slot && slot.reserve > 0) reloadWeapon(state);
    return;
  }
  p.shootT = w.interval;
  slot.mag -= 1;
  state.mission.stats.shots += 1;
  const spread = (Math.random() - 0.5) * 0.06;
  const a = p.aimAngle + spread;
  const ex = p.x + Math.cos(a) * w.range;
  const ey = p.y + Math.sin(a) * w.range;
  state.bullets.push({ x1: p.x, y1: p.y, x2: ex, y2: ey, life: 0.09 });
  const mx = p.x + Math.cos(a) * 26;
  const my = p.y + Math.sin(a) * 26;
  state.muzzle.push({ x: mx, y: my, angle: a, life: 0.07 });
  // Hit the nearest enemy or foot cop along the shot line.
  let best = null;
  let bestD = 1e9;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d < w.range && Math.abs(angleDiff(a, angleTo(p.x, p.y, e.x, e.y))) < 0.12 && d < bestD) {
      best = e; bestD = d;
    }
  }
  if (best) {
    state.mission.stats.hits += 1;
    damageEnemy(state, best, w.damage);
  }
  for (const c of state.footCops) {
    if (!c.down && dist(p.x, p.y, c.x, c.y) < w.range &&
      Math.abs(angleDiff(a, angleTo(p.x, p.y, c.x, c.y))) < 0.12) {
      c.hp -= w.damage;
      state.mission.stats.hits += 1;
      if (c.hp <= 0) { c.down = true; state.wanted = Math.max(0, state.wanted - 1); }
    }
  }
  raiseHeat(state, 0.02);
}

export function damageEnemy(state, enemy, amount) {
  enemy.hp -= amount;
  addFloat(state, enemy.x, enemy.y - 24, '-' + amount, '#ff8a5a');
  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    state.mission.stats.kills += 1;
    addCash(state, 50, 'TAKEDOWN');
    const step = currentStep(state);
    if (step && step.kind === 'kill') {
      const left = step.count - state.mission.stats.kills;
      if (left > 0) showToast(state, step.text.replace(/\(\d+\/\d+ down\)/, '') + ' (' + state.mission.stats.kills + '/' + step.count + ' down)');
    }
  }
}

function currentStep(state) {
  const m = state.mission;
  if (!m.active) return null;
  const def = missionDef(state);
  return def ? def.steps[m.step] : null;
}

function missionDef(state) {
  // Local lookup to avoid an import cycle with missions.js.
  return null;
}

function tryEnterCar(state) {
  const p = state.player;
  let best = null;
  let bestD = 1e9;
  for (const c of state.cars) {
    if (c.driver === 'police') continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best && bestD < 90) enterCar(state, best);
}

// Driving: W/S throttle and brake, A/D steer, Shift nitro, Space handbrake
// (drift), E exit. Drifting and near misses pay cash and show floats.
function updateDriving(state, input, dt, city, audio) {
  const p = state.player;
  const car = p.car;
  if (!car) { p.onFoot = true; return; }
  const def = car.def;
  const turbo = state.garage.turbo * 18;
  const top = (def.top + turbo) * 3.6; // km/h -> world units/s (x3.6 scale)
  const grip = def.grip + state.garage.tyres * 0.25;
  let throttle = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) throttle = 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) throttle = -0.6;
  const steering = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? -1 : 0) +
    (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
  const nitro = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && state.nitro > 0 && throttle > 0;
  if (nitro) state.nitro = Math.max(0, state.nitro - 30 * dt);
  else state.nitro = Math.min(state.maxNitro, state.nitro + 4 * dt);
  const accel = def.accel * (nitro ? 1.7 : 1);
  car.speed += throttle * accel * dt;
  car.speed -= car.speed * 0.55 * dt; // drag
  if (throttle === 0) car.speed -= car.speed * 1.4 * dt;
  car.speed = clamp(car.speed, -top * 0.35, top);
  const handbrake = input.isDown('Space');
  const steerRate = grip * (handbrake ? 1.7 : 1) * clamp(Math.abs(car.speed) / 220, 0.25, 1);
  car.angle += steering * steerRate * dt * Math.sign(car.speed || 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Collisions: buildings and the sea stop the car and cost HP.
  if (!blockedAt(city, nx, car.y, true)) car.x = nx;
  else crashCar(state, car);
  if (!blockedAt(city, car.x, ny, true)) car.y = ny;
  else crashCar(state, car);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = car.speed;
  p.moving = Math.abs(car.speed) > 20;
  // Drift: handbrake + speed + steering pays out while it lasts.
  if (handbrake && Math.abs(car.speed) > 260 && steering !== 0) {
    p.driftT += dt;
    if (p.driftT > 0.7) {
      p.driftScore += 1;
      if (p.driftScore % 30 === 0) {
        addCash(state, 30, 'DRIFT x3');
        addFloat(state, car.x, car.y - 40, 'DRIFT x3 +$30', '#ffd94d');
      }
    }
  } else {
    p.driftT = 0;
    p.driftScore = 0;
  }
  nearMissCheck(state, car);
  if (input.pressed('KeyE')) exitCar(state);
  if (input.pressed('KeyR')) reloadWeapon(state);
}

function crashCar(state, car) {
  if (Math.abs(car.speed) > 320) {
    car.hp -= 12;
    car.speed *= -0.25;
    state.mission.stats.carsDestroyed += car.hp <= 0 ? 1 : 0;
    if (car.hp <= 0) {
      addFloat(state, car.x, car.y - 30, 'WRECKED', '#ff5a5a');
      car.speed = 0;
    }
    raiseHeat(state, 0.03);
  } else {
    car.speed *= 0.3;
  }
}

function nearMissCheck(state, car) {
  const p = state.player;
  const now = state.playTime;
  if (now - p.lastNearMiss < 1.2) return;
  for (const other of state.cars) {
    if (other === car || other.driver === 'police') continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 70 && Math.abs(car.speed) > 320) {
      p.lastNearMiss = now;
      addCash(state, 150, 'NEAR MISS');
      addFloat(state, car.x, car.y - 46, '+$150 NEAR MISS', '#ffd94d');
      break;
    }
  }
}

// Speed in km/h for the HUD speedometer.
export function speedKmh(state) {
  const p = state.player;
  if (!p || p.onFoot) return 0;
  return Math.round(Math.abs(p.speed) / 3.6);
}

// The car the player is driving, for the HUD and the minimap.
export function playerCar(state) {
  return state.player && !state.player.onFoot ? state.player.car : null;
}
