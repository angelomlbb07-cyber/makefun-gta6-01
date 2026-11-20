// core.js — shared game state, orchestration, and the camera.
// One job: hold the whole game in one object and keep it moving.
import { TUNING } from './tuning.js';
import { generateCity, lightingForHour } from './world.js';
import { makePlayer, spawnPeds } from './actors.js';
import { makeCar, spawnTraffic } from './vehicles.js';
import { SoundEngine } from './sound.js';

export const SAVE_KEY = 'solmar-save-v8';

export function createGame() {
  const world = generateCity();
  const start = world.landmarks.beachStart;
  const player = makePlayer(start.x, start.y);
  const state = {
    world,
    player,
    playerCar: null,
    cars: [],
    peds: [],
    cops: [],
    thugs: [],
    heli: null,
    bullets: [],
    tracers: [],
    particles: [],
    popups: [],
    pickups: [
      { kind: 'health', x: start.x + 60, y: start.y - 40, taken: false },
      { kind: 'armour', x: world.landmarks.plaza.x - 80, y: world.landmarks.plaza.y + 60, taken: false },
      { kind: 'health', x: world.landmarks.garage.x - 60, y: world.landmarks.garage.y - 60, taken: false },
    ],
    camera: { x: start.x - TUNING.viewWidth / 2, y: start.y - TUNING.viewHeight / 2 },
    time: 0,
    clockHours: TUNING.startClockHours,
    day: 1,
    cash: TUNING.startCash,
    respect: 0,
    level: 1,
    wanted: 0,
    wantedWhole: 0,
    lastSeenT: -100,
    wantedDecayT: 0,
    mission: null,
    missionIndex: 0,
    completed: [],
    lastResult: null,
    screen: 'title',        // title | play | pause | passed | failed
    hasSave: false,
    playerDead: false,
    driftCash: 0,
    nearMissCooldown: 0,
    mouse: { x: 0, y: 0, down: false, worldX: 0, worldY: 0 },
    message: '',
    messageT: 0,
    muzzle: null,
    headlights: false,
    radioLabel: '',
    radioLabelT: 0,
    stats: { shots: 0, hits: 0, punches: 0, thugsDown: 0, copsDown: 0, carsDestroyed: 0, carsDamaged: 0, nearMissCash: 0 },
    sound: null,
    shot: 0,
    shotApplied: false,
  };
  // A starter car parked ON the beach road (road centre x=480) so the first
  // mission is instant and the car never spawns inside a building.
  const starter = makeCar(start.x, start.y + 80, Math.PI / 2, 2, false);
  state.cars.push(starter);
  state.cars.push(...spawnTraffic(world, TUNING.trafficCount, start.x, start.y));
  state.peds.push(...spawnPeds(world, TUNING.pedCount, start.x, start.y));
  state.sound = new SoundEngine();
  return state;
}

// Camera follows the player (or their car), clamped to the world.
export function updateCamera(state, dt) {
  const focus = state.playerCar && !state.player.onFoot ? state.playerCar : state.player;
  const tx = focus.x - TUNING.viewWidth / 2;
  const ty = focus.y - TUNING.viewHeight / 2;
  const k = Math.min(1, TUNING.cameraLerp * dt);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
  state.camera.x = Math.max(0, Math.min(TUNING.worldWidth - TUNING.viewWidth, state.camera.x));
  state.camera.y = Math.max(0, Math.min(TUNING.worldHeight - TUNING.viewHeight, state.camera.y));
}

// Advance the clock; returns the lighting for this frame.
export function updateClock(state, dt) {
  state.clockHours += (dt / TUNING.dayLengthSeconds) * 24;
  if (state.clockHours >= 24) state.clockHours -= 24;
  return lightingForHour(state.clockHours);
}

// Age particles, tracers, popups, and the toast message.
export function updateEffects(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.98; pt.vy *= 0.98;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const tr of state.tracers) tr.life -= dt;
  state.tracers = state.tracers.filter((tr) => tr.life > 0);
  for (const pop of state.popups) pop.life -= dt;
  state.popups = state.popups.filter((pop) => pop.life > 0);
  if (state.muzzle) {
    state.muzzle.life -= dt;
    if (state.muzzle.life <= 0) state.muzzle = null;
  }
  state.messageT = Math.max(0, state.messageT - dt);
  state.radioLabelT = Math.max(0, state.radioLabelT - dt);
}

export function showMessage(state, text, seconds = 4) {
  state.message = text;
  state.messageT = seconds;
}

// --- Save / load ----------------------------------------------------------
// localStorage only; nothing leaves the machine.
export function saveGame(state) {
  try {
    const data = {
      cash: state.cash, respect: state.respect, level: state.level,
      day: state.day, missionIndex: state.missionIndex,
      completed: state.completed,
      px: state.player.x, py: state.player.y,
      health: state.player.health, armour: state.player.armour, ammo: state.player.ammo,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.hasSave = true;
    showMessage(state, 'Game saved.', 2.5);
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSave(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    state.cash = data.cash ?? TUNING.startCash;
    state.respect = data.respect ?? 0;
    state.level = data.level ?? 1;
    state.day = data.day ?? 1;
    state.missionIndex = data.missionIndex ?? 0;
    state.completed = data.completed ?? [];
    state.player.x = data.px ?? state.player.x;
    state.player.y = data.py ?? state.player.y;
    state.player.health = data.health ?? 100;
    state.player.armour = data.armour ?? 0;
    state.player.ammo = data.ammo ?? TUNING.pistolAmmoStart;
    state.hasSave = true;
    return true;
  } catch (err) {
    return false;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return false;
  }
}

// Expose a tiny debug handle so the headless play-test can assert progress.
export function debugSnapshot(state) {
  return {
    screen: state.screen,
    px: Math.round(state.player.x), py: Math.round(state.player.y),
    cash: state.cash, wanted: state.wantedWhole,
    mission: state.mission ? state.mission.def.title : null,
    cars: state.cars.length, peds: state.peds.length,
    health: Math.round(state.player.health),
  };
}
