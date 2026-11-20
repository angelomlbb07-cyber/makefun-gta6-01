// core.js — glue and render orchestration. One job: own the game state,
// run one simulation step, and draw one frame. boot.js owns the loop and
// the state machine's transitions; this file owns what a state IS.

import { VIEW, WORLD, ECONOMY, RADIO, clamp, mulberry32 } from './tuning.js';
import { createWorld, drawWorld, districtAt } from './world.js';
import { createCar, spawnTraffic, stepDrivenCar, stepTrafficCar, collideCars, nearestCar, putPlayerInCar, drawCars } from './vehicles.js';
import { createPlayer, stepPlayerOnFoot, stepPeds, stepCops, stepHeli, spawnPolice, spawnPeds, stepWanted, fireWeapon, reloadWeapon, damagePlayer, drawActors, addWanted } from './actors.js';
import { createMissionState, startMission, stepMissions, stepEnemies, MISSIONS } from './story.js';
import { drawHud, drawTitleScreen, drawPassedScreen, drawPauseScreen, drawOverScreen, drawHowTo, drawMissionsList } from './hud.js';
import { createAudio, updateRadio, updateSiren, playSfx } from './sound.js';

export const SAVE_KEY = 'solmar-save-v1';

export function createState() {
  const world = createWorld(20261120);
  const state = {
    time: 0, clock: 8.23, day: 1,
    screen: 'title',
    cash: ECONOMY.startCash, respect: 0, respectLevel: 1,
    wanted: 0, wantedHeat: 0, wantedSeenTimer: 0,
    world,
    player: createPlayer(1585, 355),
    cars: [], peds: [], cops: [], copCars: [], enemies: [],
    heli: null, chaseCar: null,
    mission: createMissionState(),
    input: null,
    audio: createAudio(),
    radio: { station: 0, stations: RADIO },
    camera: { x: 900, y: 0 },
    floats: [], tracers: [], flashes: [],
    toast: null, dialogue: null,
    events: { wasted: false, busted: false, hurtFlash: 0 },
    menuIndex: 0,
    save: loadGame(),
    garageOpen: false,
  };
  // The player's starter car waits by the safehouse; traffic fills the city.
  const starter = createCar(1620, 420, -Math.PI / 2, 2, {});
  state.cars.push(starter);
  state.player.car = starter;
  state.player.onFoot = false;
  spawnTraffic(state, 14);
  spawnPeds(state, 18);
  return state;
}

// --- save / load ----------------------------------------------------------
// F8: a save is only trusted when every field validates; anything else is
// treated as no save at all.

export function saveGame(state) {
  try {
    const data = {
      cash: Math.round(state.cash),
      respect: Math.round(state.respect),
      missionIndex: state.mission.index,
      day: state.day,
      clock: state.clock,
      finished: state.mission.finished,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.save = data;
  } catch (e) { /* storage unavailable — the game still plays */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.cash !== 'number' || !Number.isFinite(d.cash)) return null;
    if (!Number.isInteger(d.missionIndex) || d.missionIndex < 0 || d.missionIndex > 12) return null;
    if (!Number.isInteger(d.day) || d.day < 1 || d.day > 3) return null;
    return d;
  } catch (e) {
    return null;
  }
}

export function continueGame(state) {
  const s = state.save || loadGame();
  if (!s) return false;
  state.cash = s.cash;
  state.respect = s.respect || 0;
  state.respectLevel = 1 + Math.floor(state.respect / 500);
  state.day = s.day;
  state.clock = s.clock || 8.23;
  state.screen = 'play';
  if (s.finished) {
    state.mission.finished = true;
    state.mission.index = 12;
  } else {
    startMission(state, s.missionIndex);
  }
  return true;
}

export function newGame(state) {
  state.cash = ECONOMY.startCash;
  state.respect = 0;
  state.respectLevel = 1;
  state.day = 1;
  state.clock = 8.23;
  state.wanted = 0; state.wantedHeat = 0;
  state.events.wasted = false; state.events.busted = false;
  state.player = createPlayer(1585, 355);
  const starter = createCar(1620, 420, -Math.PI / 2, 2, {});
  state.cars = [starter];
  state.player.car = starter;
  state.player.onFoot = false;
  state.cops = []; state.copCars = []; state.enemies = []; state.heli = null;
  state.mission = createMissionState();
  state.screen = 'play';
  startMission(state, 0);
}

export function respawn(state) {
  // After WASTED/BUSTED: back on foot at the hospital, mission restarts
  // from its beginning (clamped — F2 — so a finished story stays in
  // free-roam instead of throwing).
  const p = state.player;
  p.health = 100;
  p.x = state.world.hospital.x; p.y = state.world.hospital.y;
  p.onFoot = true; p.car = null;
  state.events.wasted = false; state.events.busted = false;
  state.wanted = 0; state.wantedHeat = 0;
  state.cops = []; state.copCars = []; state.heli = null;
  state.screen = 'play';
  if (!state.mission.finished) startMission(state, state.mission.index);
}

export function restartMission(state) {
  // F6: clear the inter-mission timers so the mission cannot restart twice.
  state.mission.betweenTimer = 0;
  state.mission.passedTimer = 0;
  state.mission.passed = null;
  state.events.wasted = false; state.events.busted = false;
  state.player.health = 100;
  state.screen = 'play';
  startMission(state, state.mission.index);
}

// --- one simulation step --------------------------------------------------

export function stepGame(state, dt) {
  state.time += dt;
  state.clock += dt / 240; // a full day in 4 minutes of play
  if (state.clock >= 24) { state.clock -= 24; state.day = Math.min(3, state.day + 1); }
  const p = state.player;
  const input = state.input;
  // Timers on transient effects.
  state.events.hurtFlash = Math.max(0, state.events.hurtFlash - dt);
  if (state.toast) { state.toast.t -= dt; if (state.toast.t <= 0) state.toast = null; }
  if (state.dialogue) { state.dialogue.t -= dt; if (state.dialogue.t <= 0) state.dialogue = null; }
  for (const f of state.floats) f.t -= dt;
  state.floats = state.floats.filter(f => f.t > 0);
  for (const t of state.tracers) t.t -= dt;
  state.tracers = state.tracers.filter(t => t.t > 0);
  for (const f of state.flashes) f.t -= dt;
  state.flashes = state.flashes.filter(f => f.t > 0);

  if (state.screen !== 'play') return;

  // Aim: mouse position in world coordinates.
  if (input) {
    const scale = state.viewScale || 1;
    input.aimX = state.camera.x + input.mouseX / scale;
    input.aimY = state.camera.y + input.mouseY / scale;
  }
  if (p.onFoot) {
    stepPlayerOnFoot(state, input, dt);
    if (input && input.shoot) {
      const shot = fireWeapon(state);
      if (shot) playSfx(state.audio, 'shoot');
    }
  } else if (p.car) {
    const events = stepDrivenCar(state, p.car, input, dt);
    // The player rides in the car: their position IS the car's position,
    // so the camera, near-miss checks and mission distances all follow it.
    p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle;
    for (const ev of events) {
      state.cash += ev.cash;
      state.floats.push({ x: ev.x, y: ev.y - 30, text: '+$' + ev.cash + ' ' + ev.text, t: 1.4, color: '#ffd94a' });
      playSfx(state.audio, 'cash');
    }
    // Near-miss: fast pass within 46 px of a traffic car.
    for (const c of state.cars) {
      if (!c.traffic || c.dead || c === p.car) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 46 && Math.abs(p.car.speed) > 300 && !c.nearMissed) {
        c.nearMissed = true;
        state.cash += 150;
        state.floats.push({ x: p.x, y: p.y - 40, text: '+$150 NEAR MISS', t: 1.4, color: '#ffd94a' });
        playSfx(state.audio, 'cash');
      } else if (d > 120) c.nearMissed = false;
    }
    // Car wrecked under the player: out on foot, mission unaffected.
    if (p.car.damage >= 100) {
      p.car.dead = true;
      state.mission.stats.carsDestroyed++;
      p.onFoot = true;
      p.x = p.car.x + 30; p.y = p.car.y + 30;
      p.car = null;
      playSfx(state.audio, 'explosion');
    }
  }
  // Traffic keeps flowing; top it back up if the player wrecked some.
  for (const c of state.cars) {
    if (c.traffic && !c.dead) stepTrafficCar(state, c, dt);
  }
  if (state.cars.filter(c => c.traffic && !c.dead).length < 10) spawnTraffic(state, 12);
  collideCars(state);
  stepPeds(state, dt);
  stepWanted(state, dt);
  spawnPolice(state);
  stepCops(state, dt);
  stepHeli(state, dt);
  stepEnemies(state, dt);
  stepMissions(state, dt);
  // Garage: drive into Benny's and press E to repair / buy armour.
  const g = state.world.garage;
  state.garageOpen = !p.onFoot && Math.hypot(p.x - g.x, p.y - g.y) < 120;
  if (state.garageOpen && input && input.holdE && p.car && p.car.damage > 0 && state.cash >= 120) {
    state.cash -= 120;
    p.car.damage = 0;
    playSfx(state.audio, 'pickup');
    state.toast = { speaker: 'Benny', text: 'Good as new. That\'ll be $120. Come back any time.', t: 4 };
  }
  // Camera follows the player, clamped to the world.
  state.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  state.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  updateRadio(state.audio, dt);
  updateSiren(state.audio, state.wanted);
}

// --- one frame ------------------------------------------------------------

export function render(state, ctx) {
  ctx.save();
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  if (state.screen === 'title' || state.screen === 'howto' || state.screen === 'missions') {
    drawTitleScreen(ctx, state);
    if (state.screen === 'howto') drawHowTo(ctx, state);
    if (state.screen === 'missions') drawMissionsList(ctx, state);
    ctx.restore();
    return;
  }
  // World-space drawing, translated by the camera.
  ctx.save();
  ctx.translate(-state.camera.x, -state.camera.y);
  drawWorld(ctx, state.world, state.camera, state.clock);
  drawCars(ctx, state, state.camera);
  drawActors(ctx, state, state.camera);
  ctx.restore();
  // Screen-space HUD.
  if (state.screen === 'play' || state.screen === 'passed') drawHud(ctx, state);
  if (state.screen === 'passed') drawPassedScreen(ctx, state);
  if (state.screen === 'paused') { drawHud(ctx, state); drawPauseScreen(ctx, state); }
  if (state.screen === 'wasted') drawOverScreen(ctx, state, 'wasted');
  if (state.screen === 'busted') drawOverScreen(ctx, state, 'busted');
  // Garage hint.
  if (state.garageOpen && state.screen === 'play') {
    ctx.fillStyle = 'rgba(12,14,22,0.85)';
    ctx.beginPath(); ctx.roundRect(VIEW.width / 2 - 220, VIEW.height - 150, 440, 34, 8); ctx.fill();
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center';
    ctx.fillText("BENNY'S GARAGE — hold E to repair ($120)", VIEW.width / 2, VIEW.height - 128);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
