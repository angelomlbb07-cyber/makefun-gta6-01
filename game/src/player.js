// SOLMAR player: Marco Solis on foot and behind the wheel.
// Owns health/armour, weapons, damage (the ONLY place that sets wasted),
// regeneration, and car driving physics.

import { PLAYER_TUNING, WEAPONS, CAR_DEFS } from './config.js';
import { clamp, dist, wrapAngle } from './random.js';
import { playGunshot, playPunch, playCash, playCrash } from './audio.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    health: PLAYER_TUNING.maxHealth,
    armour: 0,
    onFoot: true,
    car: null,
    weapon: 'pistol',
    ammoPistol: 12, reservePistol: 72,
    ammoSmg: 30, reserveSmg: 120,
    invulnerable: 0,
    fireCooldown: 0,
    punchCooldown: 0,
    driftScore: 0,
    drifting: false,
  };
}

// The single damage path. Every hit in the game must come through here:
// it is the only place that sets events.wasted, and it grants i-frames (F11).
export function damagePlayer(state, amount) {
  const p = state.player;
  if (!p || p.invulnerable > 0) return false;
  let remaining = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, remaining * 0.6);
    p.armour -= absorbed;
    remaining -= absorbed;
  }
  p.health -= remaining;
  p.invulnerable = PLAYER_TUNING.invulnSeconds;
  if (p.health <= 0) {
    p.health = 0;
    state.events.wasted = true;
    state.overKind = 'wasted';
    state.screen = 'over';
    state.overTimer = 0;
  }
  return true;
}

export function healPlayer(state, amount) {
  const p = state.player;
  p.health = clamp(p.health + amount, 0, PLAYER_TUNING.maxHealth);
}

export function currentWeapon(player) {
  return WEAPONS[player.weapon] || WEAPONS.fists;
}

export function ammoText(player) {
  if (player.weapon === 'pistol') return player.ammoPistol + '/' + player.reservePistol;
  if (player.weapon === 'smg') return player.ammoSmg + '/' + player.reserveSmg;
  return '--';
}

export function switchWeapon(player) {
  const order = ['fists', 'pistol', 'smg'];
  const i = order.indexOf(player.weapon);
  player.weapon = order[(i + 1) % order.length];
}

export function reloadWeapon(player) {
  if (player.weapon === 'pistol' && player.reservePistol > 0) {
    const need = WEAPONS.pistol.mag - player.ammoPistol;
    const take = Math.min(need, player.reservePistol);
    player.ammoPistol += take; player.reservePistol -= take;
  } else if (player.weapon === 'smg' && player.reserveSmg > 0) {
    const need = WEAPONS.smg.mag - player.ammoSmg;
    const take = Math.min(need, player.reserveSmg);
    player.ammoSmg += take; player.reserveSmg -= take;
  }
}

export function fireWeapon(state) {
  const p = state.player;
  const w = currentWeapon(p);
  if (p.fireCooldown > 0 || !p.onFoot) return false;
  if (p.weapon === 'fists') {
    p.fireCooldown = w.rate;
    playPunch();
    state.particles.push({ x: p.x + Math.cos(p.angle) * 30, y: p.y + Math.sin(p.angle) * 30, vx: 0, vy: 0, life: 0.15, max: 0.15, color: '#ffe9a8', size: 10 });
    return true;
  }
  if (p.weapon === 'pistol') {
    if (p.ammoPistol <= 0) { reloadWeapon(p); return false; }
    p.ammoPistol--;
  } else if (p.weapon === 'smg') {
    if (p.ammoSmg <= 0) { reloadWeapon(p); return false; }
    p.ammoSmg--;
  }
  p.fireCooldown = w.rate;
  state.missions.stats.shots++;
  playGunshot();
  const bx = p.x + Math.cos(p.angle) * 34;
  const by = p.y + Math.sin(p.angle) * 34;
  state.bullets.push({ x: bx, y: by, vx: Math.cos(p.angle) * 900, vy: Math.sin(p.angle) * 900, life: 0.5, damage: w.damage, fromPlayer: true });
  state.particles.push({ x: bx, y: by, vx: 0, vy: 0, life: 0.08, max: 0.08, color: '#ffd94a', size: 14 });
  return true;
}

export function stepPlayer(state, dt, input) {
  const p = state.player;
  if (!p) return;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  if (p.health > 0 && p.health < PLAYER_TUNING.maxHealth) {
    p.health = Math.min(PLAYER_TUNING.maxHealth, p.health + PLAYER_TUNING.regenPerSecond * dt);
  }
  if (p.onFoot) {
    let mx = 0, my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    const moving = mx !== 0 || my !== 0;
    const speed = input.run ? PLAYER_TUNING.runSpeed : PLAYER_TUNING.walkSpeed;
    if (moving) {
      const len = Math.hypot(mx, my);
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.angle = Math.atan2(my, mx);
    }
    p.x = clamp(p.x, 20, 3580);
    p.y = clamp(p.y, 20, 2580);
  } else if (p.car) {
    stepCar(state, p.car, dt, input);
    p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle;
  }
}

function stepCar(state, car, dt, input) {
  const def = CAR_DEFS[car.def];
  let top = def.topSpeed;
  if (state.garage.turbo) top *= 1.18;
  const grip = def.grip + (state.garage.tyres ? 0.6 : 0);
  const nitro = input.nitro && state.garage.nitro && car.nitro > 0;
  if (nitro) { top *= 1.3; car.nitro = Math.max(0, car.nitro - 30 * dt); }
  else car.nitro = Math.min(100, car.nitro + 4 * dt);
  if (input.up) car.speed += def.accel * dt * (nitro ? 1.5 : 1);
  else if (input.down) car.speed -= def.accel * 0.8 * dt;
  else car.speed *= Math.pow(0.4, dt);
  if (input.handbrake) {
    car.speed *= Math.pow(0.05, dt);
    if (Math.abs(car.speed) > 120) {
      state.player.drifting = true;
      state.player.driftScore += Math.abs(car.speed) * dt * 0.02;
    }
  } else state.player.drifting = false;
  car.speed = clamp(car.speed, -120, top);
  const turn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  car.angle += turn * grip * dt * clamp(Math.abs(car.speed) / 120, 0, 1) * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, 3570);
  car.y = clamp(car.y, 30, 2570);
  if (Math.abs(car.speed) > 260 && state.player.drifting && state.player.driftScore > 25) {
    const bonus = Math.floor(state.player.driftScore);
    state.cash += bonus;
    state.floaters.push({ x: car.x, y: car.y - 40, text: 'DRIFT +$' + bonus, timer: 1.2, color: '#7dff8a' });
    state.player.driftScore = 0;
    playCash();
  }
  if (car.hp <= 0) {
    state.missions.stats.carsDestroyed++;
    explodeCar(state, car);
  }
}

export function explodeCar(state, car) {
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({ x: car.x, y: car.y, vx: Math.cos(a) * (60 + Math.random() * 160), vy: Math.sin(a) * (60 + Math.random() * 160), life: 0.7, max: 0.7, color: i % 2 ? '#ff9a3d' : '#ff5a3d', size: 6 + Math.random() * 8 });
  }
  playCrash();
  car.dead = true;
  if (state.player && state.player.car === car) {
    state.player.onFoot = true;
    state.player.car = null;
    state.player.x = car.x + 40; state.player.y = car.y + 40;
  }
}

export function enterCar(state, car) {
  const p = state.player;
  p.onFoot = false;
  p.car = car;
  car.driver = 'player';
  state.missions.stats.carsStolen++;
  if (car.isTaxi) {
    state.taxiFare = 40 + Math.floor(Math.random() * 80);
    state.message = 'TAXI: drop the passenger off for $' + state.taxiFare;
    state.messageTimer = 4;
  }
}

export function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  car.driver = null;
  p.onFoot = true;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
  p.speed = 0;
}

export function nearestCar(state, maxDist) {
  const p = state.player;
  let best = null, bestD = maxDist;
  for (const c of state.cars) {
    if (c.dead || c.driver === 'player') continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
