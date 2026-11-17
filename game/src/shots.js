// The screenshot scenes behind ?shot=chase|street|mission|escape. Each one plays the real
// rules forward from a fresh world for a fixed number of seconds, steered by an autopilot that
// drives or walks toward the mission target, so the frame is what a short game really looks
// like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { angleTo, clamp, dist } from './random.js';
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

function autopilotDrive(state, input, dt) {
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
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
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
  // The chase starts far from the Safehouse so the escape is still on at the frame.
  chase: { mission: 2, seconds: 9, drive: true, carNear: 'docks' },
  // The walk starts far enough west that the player is still approaching the hotel at the
  // frame (the pickup triggers inside 80 px, so 6 s leaves him ~200 px out, marker visible).
  street: { mission: 1, seconds: 6, drive: false },
  mission: { mission: 3, seconds: 12, drive: true, carNear: 'casino' },
  escape: { mission: 4, seconds: 12, drive: true, carNear: 'casino', step: 1 },
};

/**
 * Set `state` to the named scene and return the screen to draw. Any other name stages the
 * title screen's backdrop.
 */
export function stageShot(name, state, seed) {
  const scene = SCENES[name];
  resetGameState(state, seed);
  if (!scene) {
    return { screen: 'title', best: 0 };
  }
  startMission(state, scene.mission);
  if (scene.step !== undefined) {
    state.missions.step = scene.step;
    // The escape step of the heist starts with three stars already on the player.
    state.police.heat = 75;
  }
  const input = makeAutoInput();
  if (scene.drive) {
    const lm = state.city.landmarks[scene.carNear];
    putPlayerInCar(state, lm.x, lm.y, name === 'escape' ? 'sports' : null);
    // Start the chase a little into the drive so the cops are already behind.
    runSim(state, input, scene.seconds, true);
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
  if (state.player.car) state.player.car.hp = 100;
  return { screen: SCREEN_PLAY, best: state.player.cash };
}
