// SOLMAR — main.js
// Boot and the one game loop. It wires the fourteen modules together:
// config numbers, seeded random, state, city, traffic, player, police,
// missions, audio, input, save, shots and render. Live play runs the full
// update (player, traffic, police, enemies, missions, clock, camera,
// audio); a staged screenshot (?shot=<name>&seed=<n>) builds one frozen
// scene, paints it, and sets window.__solmarReady so a screenshot script
// can capture it. No network is used anywhere. Round 5: the staged combat
// scene now runs at night with a zoom-2.0 camera — still one frozen frame,
// still flagged ready the same way.

import { VIEW_W, VIEW_H, TIMES_OF_DAY } from './config.js';
import { makeRng } from './random.js';
import { createGameState, tickFloats, showToast } from './state.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, putPlayerInCar, exitCar } from './player.js';
import { updatePolice, clearPolice } from './police.js';
import { spawnTraffic, spawnPedestrians, updateTraffic, updateEnemies } from './traffic.js';
import { startMission, restartMission, stepMissions, dismissPassed, MISSIONS } from './missions.js';
import { createAudio, resumeAudio, setMuted, updateEngine, updateSiren, updateRadio, cycleRadio, playPassed } from './audio.js';
import { createInput, isDown, pressed, endFrameInput } from './input.js';
import { saveGame, loadGame, applySave } from './save.js';
import { stageShot } from './shots.js';
import { drawGame } from './render.js';
import { speedKmh } from './player.js';
import { dist } from './random.js';

const SAFEHOUSE = { x: 520, y: 520 };

export function boot(canvas) {
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  const seed = Number(params.get('seed') || 1) || 1;
  const rng = makeRng(seed * 101 + 7);
  const city = buildCity(seed);
  const state = createGameState(seed);
  state.player = createPlayer(SAFEHOUSE.x, SAFEHOUSE.y);
  state.onAutosave = () => saveGame(state);
  const input = createInput(canvas);
  const audio = createAudio();
  spawnTraffic(state, city, rng, 12);
  spawnPedestrians(state, city, rng, 18);
  // A parked car near the safehouse so the first minutes are not on foot.
  putPlayerInCar(state, city);
  exitCar(state);

  const game = { state, city, input, audio, rng, canvas, ctx, shotName };

  if (shotName) {
    // Staged screenshot: build the scene, paint once, flag readiness.
    // The scene is frozen — no gameplay update runs, so the frame the
    // screenshot script captures is exactly the staged one.
    stageShot(state, city, shotName, seed);
    updateAim(game);
    drawGame(ctx, state, city);
    state.ready = true;
    window.__solmarReady = true;
    window.__solmarState = state;
    requestAnimationFrame(function frozen() {
      drawGame(ctx, state, city);
      requestAnimationFrame(frozen);
    });
    return game;
  }

  // Live play starts on the title menu.
  const saved = loadGame();
  if (saved) state.saveInfo = saved ? describeSaveShort(saved) : null;
  window.__solmarState = state;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateAim(game);
    update(game, dt);
    drawGame(ctx, state, city);
    endFrameInput(input);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return game;
}

function describeSaveShort(data) {
  return {
    day: data.day, cash: data.cash, mission: data.mission,
    text: 'Day ' + data.day + ' · $' + data.cash.toLocaleString('en-US') +
      ' · Mission ' + (data.mission + 1) + '/12',
  };
}

function updateAim(game) {
  const { state, input } = game;
  const p = state.player;
  if (!p) return;
  const cam = state.camera;
  const wx = (input.mouse.x - VIEW_W / 2) / cam.zoom + cam.x;
  const wy = (input.mouse.y - VIEW_H / 2) / cam.zoom + cam.y;
  p.aimAngle = Math.atan2(wy - p.y, wx - p.x);
  // Title-menu hover: which button row is the mouse over?
  if (state.mode === 'title') {
    const my = input.mouse.y;
    state.menuHover = -1;
    for (let i = 0; i < 4; i++) {
      if (input.mouse.x >= 440 && input.mouse.x <= 840 && my >= 310 + i * 66 && my <= 362 + i * 66) {
        state.menuHover = i;
      }
    }
    if (input.mouse.down && state.menuHover >= 0) menuAction(game, state.menuHover);
  }
}

function menuAction(game, i) {
  const { state, city } = game;
  if (i === 0) newGame(game);
  else if (i === 1) continueGame(game);
  else if (i === 2) state.mode = 'howto';
  else if (i === 3) state.mode = 'missions';
}

function newGame(game) {
  const { state, city } = game;
  const fresh = createGameState(state.seed);
  fresh.player = state.player;
  fresh.player.x = SAFEHOUSE.x;
  fresh.player.y = SAFEHOUSE.y;
  fresh.player.onFoot = true;
  fresh.player.car = null;
  fresh.player.angle = -Math.PI / 2;
  Object.assign(state, fresh);
  state.player = fresh.player;
  state.onAutosave = () => saveGame(state);
  clearPolice(state);
  spawnTraffic(state, city, game.rng, 12);
  spawnPedestrians(state, city, game.rng, 18);
  // Park a car by the safehouse so the first minutes are not on foot.
  putPlayerInCar(state, city);
  exitCar(state);
  state.mode = 'play';
  startMission(state, 0, city);
  resumeAudio(game.audio);
}

function continueGame(game) {
  const { state, city } = game;
  const saved = loadGame();
  if (!saved) {
    newGame(game);
    return;
  }
  applySave(state, saved);
  state.player.x = SAFEHOUSE.x;
  state.player.y = SAFEHOUSE.y;
  state.player.onFoot = true;
  state.player.car = null;
  state.mode = 'play';
  if (saved.missionFinished) {
    state.mission.finished = true;
    state.mission.active = false;
    state.mission.objective = 'Story complete — Solmar is yours. Free roam.';
  } else {
    startMission(state, saved.mission, city);
  }
  resumeAudio(game.audio);
}

function update(game, dt) {
  const { state, city, input, audio, rng } = game;
  state.playTime += dt;
  // M mutes sound, but on the title menu M opens the Missions list.
  if (pressed(input, 'KeyM') && (state.mode === 'play' || state.mode === 'pause' || state.mode === 'passed')) {
    state.muted = !state.muted;
    setMuted(audio, state.muted);
  }
  if (state.mode === 'title' || state.mode === 'howto' || state.mode === 'missions') {
    if (pressed(input, 'Enter')) newGame(game);
    else if (pressed(input, 'KeyC')) continueGame(game);
    else if (pressed(input, 'KeyH')) state.mode = 'howto';
    else if (pressed(input, 'KeyM') && state.mode === 'title') state.mode = 'missions';
    else if (pressed(input, 'Escape')) state.mode = 'title';
    return;
  }
  if (state.mode === 'pause') {
    if (pressed(input, 'Escape')) state.mode = 'play';
    if (pressed(input, 'KeyR')) { restartMission(state, city); respawn(game); }
    return;
  }
  if (state.mode === 'passed') {
    stepMissions(state, dt, city); // F1: the timer ticks here too
    if (pressed(input, 'Enter') || (input.mouse.down && state.mode === 'passed')) {
      dismissPassed(state, city);
    }
    return;
  }
  if (state.mode === 'wasted' || state.mode === 'busted') {
    if (pressed(input, 'KeyR') || pressed(input, 'Enter')) {
      restartMission(state, city);
      respawn(game);
    }
    return;
  }
  if (state.mode !== 'play') return;
  if (pressed(input, 'Escape')) { state.mode = 'pause'; return; }
  if (pressed(input, 'F5')) { saveGame(state); showToast(state, 'Progress saved.'); }
  if (pressed(input, 'F9')) {
    const saved = loadGame();
    if (saved) { applySave(state, saved); startMission(state, saved.mission, city); showToast(state, 'Save loaded.'); }
  }
  if (pressed(input, 'KeyT')) cycleRadio(state, audio);
  // Clock: one game minute every two real seconds; day 1-3, then it holds.
  state.time += dt * 0.5;
  if (state.time >= 1440) {
    state.time -= 1440;
    state.day = Math.min(3, state.day + 1);
  }
  state.timeOfDay = timeOfDayFor(state.time);
  updatePlayer(state, input, dt, city, audio);
  updateTraffic(state, dt, city, rng);
  updatePolice(state, dt, city, rng);
  updateEnemies(state, dt, city, rng);
  stepMissions(state, dt, city);
  collectPickups(state);
  tickFloats(state, dt);
  // Health slowly recovers when out of trouble (never from below zero —
  // the wasted state is terminal until restart, per the F3 fix).
  if (state.health > 0 && state.health < state.maxHealth && state.wanted === 0) {
    state.health = Math.min(state.maxHealth, state.health + dt * 2);
  }
  // Camera follows the player.
  const p = state.player;
  const targetZoom = p.onFoot ? 1.15 : 1;
  state.camera.zoom += (targetZoom - state.camera.zoom) * dt * 2;
  state.camera.x += (p.x - state.camera.x) * dt * 4;
  state.camera.y += (p.y - state.camera.y) * dt * 4;
  updateEngine(audio, speedKmh(state), p.onFoot);
  updateSiren(audio, state.wanted);
  updateRadio(audio, state, dt);
  if (state.mode === 'passed') playPassed(audio);
}

function timeOfDayFor(minutes) {
  if (minutes >= 360 && minutes < 960) return 'day';
  if (minutes >= 960 && minutes < 1110) return 'golden';
  if (minutes >= 1110 && minutes < 1230) return 'sunset';
  return 'night';
}

function collectPickups(state) {
  const p = state.player;
  if (!p) return;
  for (const pk of state.pickups) {
    if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 52) {
      pk.taken = true;
      state.mission.stats.collected += 1;
      showToast(state, 'Package collected (' + state.mission.stats.collected + ').');
    }
  }
}

function respawn(game) {
  const { state, city } = game;
  state.player.x = SAFEHOUSE.x;
  state.player.y = SAFEHOUSE.y;
  state.player.onFoot = true;
  state.player.car = null;
  state.player.angle = -Math.PI / 2;
  state.player.speed = 0;
  state.camera.x = SAFEHOUSE.x;
  state.camera.y = SAFEHOUSE.y;
  state.mode = 'play';
  clearPolice(state);
}

// Auto-boot when the page loads.
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('game');
  if (canvas) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    boot(canvas);
  }
}
