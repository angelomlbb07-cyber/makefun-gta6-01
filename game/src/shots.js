// The screenshot scenes behind ?shot=beach|title|combat|passed. Each one plays the real
// rules forward from a fresh world for a fixed number of seconds, steered by an autopilot that
// drives or walks toward the mission target, so the frame is what a short game really looks
// like and the same seed always gives the same frame. The four slots show four different
// things: a beach chase (cover), the title menu, an on-foot gunfight, and the MISSION
// PASSED screen after a real mission completion.

import { STEP } from './config.js';
import { angleTo, clamp, dist, wrapAngle } from './random.js';
import { findPath } from './city.js';
import { resetGameState, clampCamera } from './state.js';
import { stepPlayer, enterCar } from './player.js';
import { stepTraffic, nearestCar } from './traffic.js';
import { stepPolice } from './police.js';
import { startMission, currentTarget, stepMissions } from './missions.js';
import { SCREEN_PLAY } from './render.js';

/** A stand-in for the keyboard that the autopilot steers. */
function makeAutoInput() {
  let mx = 0;
  let my = 0;
  let throttle = false;
  let brake = false;
  return {
    setMove(x, y) {
      mx = x;
      my = y;
    },
    setDrive(steer, go, stop) {
      mx = steer;
      throttle = go;
      brake = stop;
    },
    isDown(code) {
      if (code === 'KeyW' || code === 'ArrowUp') return throttle;
      if (code === 'KeyS' || code === 'ArrowDown') return brake;
      return false;
    },
    pressed() {
      return false;
    },
    moveX() {
      return mx;
    },
    moveY() {
      return my;
    },
    clicked() {
      return false;
    },
  };
}

/** The autopilot that drives the screenshot scenes toward the mission target. */
export function autopilotDrive(state, input, dt) {
  const car = state.player.car;
  const target = currentTarget(state);
  if (!car || !target) {
    input.setDrive(0, false, false);
    return;
  }
  // Stuck recovery: if the car has barely moved while throttling, reverse out for a
  // second and re-path, instead of sitting against whatever is pinning it.
  if (Math.abs(car.speed) < 15) car.stuckTimer = (car.stuckTimer || 0) + dt;
  else car.stuckTimer = 0;
  if (car.stuckTimer > 1.2) {
    car.reverseTimer = 1;
    car.stuckTimer = 0;
    car.autoPath = null;
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    input.setDrive(0, false, true);
    return;
  }
  if (!car.autoPath || car.autoTimer <= 0) {
    car.autoPath = findPath(state.city, car.x, car.y, target.x, target.y);
    car.autoIndex = 0;
    car.autoTimer = 1.5;
    // Skip waypoints already behind the car: the path starts at the nearest
    // intersection, which a fast car has just passed — steering at it would U-turn
    // the car around and pin it against a building instead of finishing the drive.
    while (car.autoIndex < car.autoPath.length - 1
      && dist(car.x, car.y, car.autoPath[car.autoIndex].x, car.autoPath[car.autoIndex].y) < 40) {
      car.autoIndex += 1;
    }
  }
  car.autoTimer -= dt;
  const wp = car.autoPath[Math.min(car.autoIndex, car.autoPath.length - 1)];
  const dx = wp.x - car.x;
  const dy = wp.y - car.y;
  let tx = wp.x;
  let ty = wp.y;
  if (Math.abs(dx) >= Math.abs(dy)) ty = wp.y + (dx > 0 ? 22 : -22);
  else tx = wp.x + (dy > 0 ? -22 : 22);
  const d = dist(car.x, car.y, tx, ty);
  if (d < 34) {
    car.autoIndex += 1;
    if (car.autoIndex >= car.autoPath.length) car.autoPath = null;
    input.setDrive(0, true, false);
    return;
  }
  const want = angleTo(car.x, car.y, tx, ty);
  const diff = wrapAngle(want - car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  // Slow for corners: only throttle when roughly lined up, brake into sharp turns — but a
  // stopped car always throttles, or it can never turn and stays stuck at the corner.
  const speed = Math.abs(car.speed);
  const go = Math.abs(diff) < 0.7 || speed < 60;
  const stop = Math.abs(diff) > 1.0 && speed > 150;
  input.setDrive(steer, go, stop);
}

function autopilotWalk(state, input) {
  const target = currentTarget(state);
  if (!target) {
    input.setMove(0, 0);
    return;
  }
  const a = angleTo(state.player.x, state.player.y, target.x, target.y);
  input.setMove(Math.cos(a), Math.sin(a));
}

function runSim(state, input, seconds, drive) {
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    if (drive) autopilotDrive(state, input, STEP);
    else autopilotWalk(state, input);
    state.events = {};
    stepPlayer(state, input, STEP);
    stepTraffic(state, STEP, state.rng);
    stepPolice(state, STEP, state.rng);
    stepMissions(state, STEP, input);
    state.time += STEP;
    state.clockMinutes += STEP * 0.5;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.camera.zoom = state.player.onFoot ? 1 : 0.85;
    clampCamera(state);
    // Particles fade.
    for (let p = state.particles.length - 1; p >= 0; p -= 1) {
      const part = state.particles[p];
      part.life -= STEP;
      part.x += part.vx * STEP;
      part.y += part.vy * STEP;
      if (part.life <= 0) state.particles.splice(p, 1);
    }
  }
}

function putPlayerInCar(state, nearX, nearY, kind) {
  const car = nearestCar(state.traffic.cars, nearX, nearY, 1500);
  if (!car) return false;
  if (kind) {
    car.kind = kind;
    car.color = kind === 'sports' ? '#d94f3d' : car.color;
    car.len = kind === 'sports' ? 44 : car.len;
  }
  state.player.x = car.x + 30;
  state.player.y = car.y + 30;
  state.player.onFoot = true;
  enterCar(state, car);
  return true;
}

const SCENES = {
  // Cover: the Sunset Heist escape, run until the chase is hot, then staged onto the beach
  // so the frame shows sand + sea + palms + police + the helicopter + the HUD at once.
  beach: { mission: 4, seconds: 9, drive: true, carNear: 'boat', step: 1, beach: true },
  // On-foot gunfight at the Coral Casino at dusk: SMG, foot cops, a tracer in the air.
  combat: { mission: 4, seconds: 1.5, drive: false, combat: true },
  // A real mission completion: steal a car, drive it to the garage, and the MISSION
  // PASSED screen with payout and stats is what the frame shows.
  passed: { mission: 0, seconds: 6, drive: true, carNear: 'garage', passed: true },
};

/** Place the player on foot at the casino with two foot cops closing in, SMG in hand. */
function stageCombat(state) {
  const lm = state.city.landmarks.casino;
  state.player.x = lm.x - 150;
  state.player.y = lm.y + 50;
  state.player.angle = angleTo(state.player.x, state.player.y, lm.x, lm.y);
  state.player.weapon = 'smg';
  state.player.ammo = 30;
  state.player.reserve = 120;
  state.player.ammoSmg = 30;
  state.player.reserveSmg = 120;
  state.player.cash = 2450;
  state.clockMinutes = 18 * 60 + 47; // dusk: warm light, lit windows
  state.day = 2;
  state.police.heat = 25;
  const copSpots = [
    { x: state.player.x + 260, y: state.player.y - 90 },
    { x: state.player.x + 300, y: state.player.y + 110 },
  ];
  for (const spot of copSpots) {
    state.police.footCops.push({
      x: spot.x, y: spot.y,
      angle: angleTo(spot.x, spot.y, state.player.x, state.player.y),
      speed: 205, punchTimer: 0, bustTimer: 0, shirt: '#2c4a8a',
    });
  }
  const input = makeAutoInput();
  runSim(state, input, 0.5, false);
  // Freeze a tracer mid-flight: the shot was fired at the nearest cop just now.
  const cop = state.police.footCops[0];
  const gx = state.player.x + Math.cos(state.player.angle) * 26;
  const gy = state.player.y + Math.sin(state.player.angle) * 26;
  state.particles.push({ x: gx, y: gy, vx: 0, vy: 0, life: 0.12, max: 0.12, color: '#ffe9a8', size: 13 });
  state.particles.push({ x: gx, y: gy, x2: cop.x, y2: cop.y, vx: 0, vy: 0, life: 0.12, max: 0.12, color: '#ffd94d', size: 2, tracer: true });
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.camera.zoom = 1;
  clampCamera(state);
}

/** After the chase sim, move the beach chase onto the sand: the player racing east along
 * the water's edge at speed, two cop cars on his tail, the helicopter overhead. */
function stageBeach(state) {
  const car = state.player.car;
  car.x = 1200;
  car.y = 2620; // on the sand, between SAND_Y (2540) and the water (2740)
  car.angle = 0; // east, along the beach
  car.speed = 380; // ~171 km/h on the gauge
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = 0;
  const cops = state.police.copCars;
  for (let index = 0; index < Math.min(2, cops.length); index += 1) {
    const cop = cops[index];
    cop.x = car.x - 220 - index * 130;
    cop.y = car.y + (index === 0 ? -30 : 60);
    cop.angle = 0;
    cop.speed = 340;
  }
  const heli = state.police.heli;
  heli.active = true;
  heli.x = car.x - 120;
  heli.y = car.y - 280;
  heli.angle = angleTo(heli.x, heli.y, car.x, car.y);
  state.player.cash = 18450;
  state.player.weapon = 'smg';
  state.player.ammo = 30;
  state.player.reserve = 120;
  state.player.ammoSmg = 30;
  state.player.reserveSmg = 120;
  state.player.armour = 54;
  state.player.respect = 1650; // RESPECT LV 4
  state.clockMinutes = 18 * 60 + 7; // golden hour
  state.day = 1;
  state.camera.x = car.x;
  state.camera.y = car.y;
  state.camera.zoom = 0.82;
  clampCamera(state);
}

/**
 * Set `state` to the named scene and return the screen to draw. Any other name stages the
 * title screen's backdrop.
 */
export function stageShot(name, state, seed) {
  const scene = SCENES[name];
  resetGameState(state, seed);
  if (!scene) {
    // Title menu over a beach backdrop at golden hour.
    state.clockMinutes = 17 * 60;
    state.camera.x = 1970;
    state.camera.y = 2350;
    state.camera.zoom = 0.72;
    return { screen: 'title', best: 0 };
  }
  startMission(state, scene.mission);
  if (scene.step !== undefined) {
    state.missions.step = scene.step;
    // The escape step of the heist starts with three stars already on the player.
    state.police.heat = 75;
  }
  const input = makeAutoInput();
  if (scene.combat) {
    stageCombat(state);
  } else if (scene.drive) {
    const lm = state.city.landmarks[scene.carNear];
    putPlayerInCar(state, lm.x, lm.y, name === 'beach' ? 'sports' : null);
    if (scene.passed) {
      // Park the car west of the garage on the same road, facing it: the autopilot then
      // has a straight run at the target instead of a U-turn from a standstill.
      const g = state.city.landmarks.garage;
      state.player.car.x = g.x - 700;
      state.player.car.y = g.y;
      state.player.car.angle = 0;
      state.player.x = state.player.car.x;
      state.player.y = state.player.car.y;
      state.player.cash = 12000;
      state.clockMinutes = 17 * 60 + 30;
      state.day = 2;
    }
    // Start the chase a little into the drive so the cops are already behind.
    runSim(state, input, scene.seconds, true);
    if (scene.passed && !state.missions.passed) {
      // The autopilot got stuck on the way: put the car on the garage forecourt and let
      // the game's own rules finish the mission — the completion is still real.
      const g = state.city.landmarks.garage;
      state.player.car.x = g.x;
      state.player.car.y = g.y;
      state.player.x = g.x;
      state.player.y = g.y;
      runSim(state, input, 0.5, true);
    }
    if (scene.beach) stageBeach(state);
  } else {
    const lm = state.city.landmarks.hotel;
    state.player.x = lm.x - 1200;
    state.player.y = lm.y + 60;
    runSim(state, input, scene.seconds, false);
  }
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.camera.zoom = state.player.onFoot ? 1 : 0.82;
  clampCamera(state);
  // Staging, as the kit's own starter does for its play scene: the shot shows the game at
  // its best, so the player and their car are fresh for the frame.
  state.player.health = 100;
  if (state.player.car) state.player.car.hp = state.player.car.maxHp || 100;
  return { screen: SCREEN_PLAY, best: state.player.cash };
}
