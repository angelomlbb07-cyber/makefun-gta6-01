// The player: Marco Solis on foot and behind the wheel. On foot he walks, runs, punches and
// gets in and out of cars; in a car he drives with acceleration, braking, steering and a
// handbrake, and the car takes damage from crashes. All collisions are circles and boxes.

import { CAR, PLAYER, WANTED } from './config.js';
import { angleLerp, angleTo, clamp, dist } from './random.js';
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
  };
}

function damagePlayer(state, amount) {
  const player = state.player;
  if (player.invulnerable > 0) return;
  player.health -= amount;
  player.regenTimer = 5;
  state.events.hit = true;
  if (player.health <= 0) {
    player.health = 0;
    state.events.wasted = true;
  }
}

function stepOnFoot(state, input, dt) {
  const { city, player, traffic } = state;
  player.punchTimer = Math.max(0, player.punchTimer - dt);
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

  // Punch: F or a mouse click, short range in front.
  if ((input.pressed('KeyF') || input.clicked()) && player.punchTimer <= 0) {
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
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  if (!car.stolen) {
    car.stolen = true;
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
  const forward = input.isDown('KeyW') || input.isDown('ArrowUp');
  const back = input.isDown('KeyS') || input.isDown('ArrowDown');
  const steer = input.moveX();
  const handbrake = input.isDown('Space');
  if (forward) car.speed += CAR.accel * dt;
  if (back) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverse * dt;
  }
  car.speed -= car.speed * (handbrake ? CAR.handbrakeDrag : CAR.drag) * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const turnScale = clamp(Math.abs(car.speed) / 140, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * CAR.turnRate * turnScale * dt * (handbrake ? 1.5 : 1);
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
        state.events.crash = true;
        spawnSparks(state, (car.x + other.x) / 2, (car.y + other.y) / 2);
        if (other.police) addHeat(state, WANTED.damageCopCar);
      }
      const swap = car.speed * 0.5;
      car.speed = other.speed * 0.4;
      other.speed = swap;
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
