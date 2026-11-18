// SOLMAR main loop: screens, input routing, save/continue, restart and
// respawn, autosave, screenshot staging. F2/F6: restartMission clears the
// between/passed timers and clamps through startMission; F12: respawn
// teleports to the safehouse/hospital landmark and startMission never
// teleports, so the landmark respawn is honoured.

import { SCREEN, RADIO_STATIONS, GARAGE_UPGRADES } from './config.js';
import { createState, addCash, setToast } from './state.js';
import { createPlayer, stepPlayer, damagePlayer, enterCar, exitCar, nearestCar, fireWeapon, switchWeapon, reloadWeapon } from './player.js';
import { spawnTraffic, spawnPeds, stepTraffic, stepPeds, stepBullets, stepParticles } from './traffic.js';
import { stepPolice, stepWanted, clearPolice, addWanted } from './police.js';
import { startMission, stepMissions, currentMission, MISSIONS } from './missions.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { initInput, isDown, wasPressed, anyPressed, endFrame, KEYS } from './input.js';
import { render, resize } from './render.js';
import { stageShot } from './shots.js';
import { landmark } from './city.js';
import { initAudio, resumeAudio, setMuted, isMuted, startEngine, setEngine, startRadio, stopRadio, playCash } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const state = createState();
let view = resize(canvas);
let last = performance.now();
let savedPassedKey = '';

window.__solmar = state;

function readInput() {
  return {
    up: anyPressed(KEYS.up) || isDown('KeyW') || isDown('ArrowUp'),
    down: isDown('KeyS') || isDown('ArrowDown'),
    left: isDown('KeyA') || isDown('ArrowLeft'),
    right: isDown('KeyD') || isDown('ArrowRight'),
    run: isDown('ShiftLeft') || isDown('ShiftRight'),
    nitro: isDown('ShiftLeft') || isDown('ShiftRight'),
    handbrake: isDown('Space'),
    enterCar: isDown('KeyE'),
    shoot: isDown('KeyF') || isDown('Mouse0'),
  };
}

function newGame() {
  const fresh = createState();
  Object.keys(fresh).forEach((k) => { state[k] = fresh[k]; });
  state.player = createPlayer(1500, 1150);
  state.camera.x = 1500; state.camera.y = 1150;
  state.saveSlot = null;
  spawnTraffic(state, 14);
  spawnPeds(state, 24);
  state.screen = SCREEN.PLAY;
  startMission(state, 0);
  startRadio(0, RADIO_STATIONS[0].bpm);
  startEngine();
  window.__solmar = state;
}

function continueGame() {
  const save = loadGame();
  if (!save) { newGame(); return; }
  // F8: loadGame already validated; clamp defensively anyway.
  const index = Math.max(0, Math.min(save.missionIndex, MISSIONS.length - 1));
  newGame();
  state.cash = save.cash;
  state.respect = save.respect || 0;
  state.respectLevel = 1 + Math.floor(state.respect / 250);
  state.day = save.day || 1;
  if (save.garage) state.garage = save.garage;
  state.player.x = save.playerX || 1500;
  state.player.y = save.playerY || 1150;
  state.player.health = save.health || 100;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  startMission(state, index);
  setToast(state, 'Welcome back, Marco. Day ' + state.day + ' — Marisol has work for you.', 4);
}

function restartMission() {
  const m = state.missions;
  // F6: clear the inter-mission and passed timers/state so the old
  // mission cannot restart itself a second time.
  m.betweenTimer = 0;
  m.passedTimer = 0;
  m.passed = null;
  state.events.wasted = false;
  state.events.busted = false;
  state.overKind = '';
  state.player.health = 100;
  state.player.armour = Math.max(state.player.armour, 25);
  clearPolice(state);
  // F2: startMission clamps; past the last mission this stays free-roam.
  const idx = Math.min(m.index, MISSIONS.length - 1);
  state.screen = SCREEN.PLAY;
  startMission(state, idx);
}

function respawn() {
  const kind = state.overKind;
  const fine = kind === 'wasted' ? 100 : 150;
  state.cash = Math.max(0, state.cash - fine);
  const spot = kind === 'wasted' ? landmark('hospital') : landmark('safehouse');
  // F12: honour the landmark — teleport here, and startMission (which
  // never teleports) leaves the player at the landmark.
  if (state.player.car) { state.player.car.driver = null; state.player.car = null; }
  state.player.onFoot = true;
  state.player.x = spot.x;
  state.player.y = spot.y;
  state.player.health = 100;
  state.player.armour = 25;
  state.camera.x = spot.x;
  state.camera.y = spot.y;
  clearPolice(state);
  state.events.wasted = false;
  state.events.busted = false;
  state.overKind = '';
  state.screen = SCREEN.PLAY;
  // Restart the current mission if the story is not finished (clamped).
  if (!state.missions.finished && state.missions.index < MISSIONS.length) {
    startMission(state, state.missions.index);
  }
}

function buyUpgrade() {
  const u = GARAGE_UPGRADES[state.garageChoice || 0];
  if (!u || state.garage[u.id]) return;
  if (state.cash < u.cost) {
    state.message = 'Not enough cash for ' + u.name + ' ($' + u.cost + ').';
    state.messageTimer = 3;
    return;
  }
  state.cash -= u.cost;
  state.garage[u.id] = true;
  if (u.id === 'armour' && state.player.car) state.player.car.hp += 60;
  playCash();
  state.message = u.name + ' installed at Benny\u2019s Garage.';
  state.messageTimer = 3;
}

function stepGame(dt) {
  const input = readInput();
  // Screenshot staging: keep the beach chase at full speed and the combat
  // scene firing, so the staged frames stay alive until capture.
  if (state.shotMode === 'beach' && state.player.car) {
    input.up = true; input.left = false; input.right = false;
  }
  if (state.shotMode === 'combat' && state.player.onFoot) {
    state._shotFire = (state._shotFire || 0) - dt;
    if (state._shotFire <= 0) { state._shotFire = 0.28; fireWeapon(state); }
  }
  state.time += dt;
  state.clockMinutes += dt * 0.6;
  if (state.clockMinutes >= 24 * 60) { state.clockMinutes -= 24 * 60; }
  state.day = Math.min(3, 1 + Math.floor(state.missions.index / 4));
  if (state.messageTimer > 0) state.messageTimer -= dt;
  // Camera follows the player.
  const p = state.player;
  const tx = p.x - 0;
  const ty = p.y - 0;
  state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 4);
  state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 4);
  stepPlayer(state, dt, input);
  stepTraffic(state, dt);
  stepPeds(state, dt);
  stepPolice(state, dt);
  stepWanted(state, dt);
  stepMissions(state, dt, input);
  stepBullets(state, dt);
  stepParticles(state, dt);
  // Shooting.
  if (input.shoot && p.onFoot) fireWeapon(state);
  // Enter / exit car.
  if (wasPressed(KEYS.enterCar)) {
    if (p.onFoot) {
      const car = nearestCar(state, 90);
      if (car) enterCar(state, car);
    } else {
      exitCar(state);
    }
  }
  if (wasPressed('KeyQ')) switchWeapon(p);
  if (wasPressed('KeyR')) reloadWeapon(p);
  if (wasPressed(KEYS.radio)) {
    state.radio.station = (state.radio.station + 1) % RADIO_STATIONS.length;
    startRadio(state.radio.station, RADIO_STATIONS[state.radio.station].bpm);
  }
  // Near-miss cash: fast pass beside a traffic car.
  if (p.car && Math.abs(p.car.speed) > 240) {
    for (const car of state.cars) {
      if (car.driver === 'player' || car._nearMissed) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < 70) {
        car._nearMissed = true;
        addCash(state, 25, 'NEAR MISS +$25');
        playCash();
      }
    }
  }
  // Taxi fare drop-off.
  if (p.car && p.car.isTaxi && state.taxiFare > 0) {
    const dest = landmark('neon');
    if (Math.hypot(p.x - dest.x, p.y - dest.y) < 90) {
      addCash(state, state.taxiFare, 'FARE +$' + state.taxiFare);
      state.taxiFare = 0;
      playCash();
    }
  }
  // Engine sound follows speed.
  setEngine(p.car ? Math.abs(p.car.speed) / 360 : 0, !!p.car);
  // Autosave after each mission passes.
  if (state.missions.passed) {
    const key = state.missions.index + ':' + state.missions.passed.name;
    if (savedPassedKey !== key) {
      savedPassedKey = key;
      saveGame(state);
    }
  }
  // Wanted rises when the player shoots or steals in view of cops.
  if (wasPressed('KeyF') && state.wanted < 5 && Math.random() < 0.25) addWanted(state, 0);
}

function stepTitle(dt) {
  if (wasPressed('ArrowUp') || wasPressed('KeyW')) {
    state.titleChoice = (state.titleChoice + 3) % 4;
  }
  if (wasPressed('ArrowDown') || wasPressed('KeyS')) {
    state.titleChoice = (state.titleChoice + 1) % 4;
  }
  if (wasPressed('Enter') || wasPressed('Space')) {
    const choice = state.titleChoice;
    if (choice === 0) newGame();
    else if (choice === 1) { if (hasSave()) continueGame(); else newGame(); }
    else if (choice === 2) state.screen = SCREEN.HOWTO;
    else if (choice === 3) state.screen = SCREEN.MISSIONS;
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (wasPressed(KEYS.mute)) setMuted(!isMuted());
  if (state.screen === SCREEN.TITLE) stepTitle(dt);
  else if (state.screen === SCREEN.HOWTO || state.screen === SCREEN.MISSIONS) {
    if (wasPressed('Enter') || wasPressed('Escape') || wasPressed('Space')) state.screen = SCREEN.TITLE;
  } else if (state.screen === SCREEN.PLAY) {
    if (wasPressed(KEYS.pause) || wasPressed('Escape')) {
      state.screen = SCREEN.PAUSE;
    } else if (wasPressed('KeyG')) {
      const g = landmark('garage');
      if (Math.hypot(state.player.x - g.x, state.player.y - g.y) < 160) {
        state.screen = SCREEN.GARAGE;
        state.garageChoice = 0;
      } else {
        state.message = 'Drive to Benny\u2019s Garage to buy upgrades.';
        state.messageTimer = 3;
      }
    } else {
      stepGame(dt);
    }
  } else if (state.screen === SCREEN.PAUSE) {
    if (wasPressed('Enter') || wasPressed(KEYS.pause) || wasPressed('Escape')) state.screen = SCREEN.PLAY;
    else if (wasPressed('KeyG')) { state.screen = SCREEN.GARAGE; state.garageChoice = 0; }
    else if (wasPressed('KeyR')) restartMission();
    else if (wasPressed('KeyS')) { saveGame(state); state.screen = SCREEN.TITLE; state.saveSlot = loadGame(); }
  } else if (state.screen === SCREEN.GARAGE) {
    if (wasPressed('ArrowUp') || wasPressed('KeyW')) state.garageChoice = ((state.garageChoice || 0) + 3) % 4;
    if (wasPressed('ArrowDown') || wasPressed('KeyS')) state.garageChoice = ((state.garageChoice || 0) + 1) % 4;
    if (wasPressed('Enter')) buyUpgrade();
    if (wasPressed('Escape')) state.screen = SCREEN.PAUSE;
  } else if (state.screen === SCREEN.OVER) {
    state.overTimer += dt;
    if (wasPressed('Enter') && state.overTimer > 0.8) respawn();
  }
  render(state, canvas, ctx, view);
  endFrame();
  requestAnimationFrame(frame);
}

function boot() {
  initInput(canvas);
  initAudio();
  window.addEventListener('resize', () => { view = resize(canvas); });
  document.addEventListener('pointerdown', () => { initAudio(); resumeAudio(); }, { once: true });
  document.addEventListener('keydown', () => { initAudio(); resumeAudio(); }, { once: true });
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  state.player = createPlayer(1500, 1150);
  state.camera.x = 1500; state.camera.y = 1150;
  spawnTraffic(state, 14);
  spawnPeds(state, 24);
  state.saveSlot = loadGame();
  if (shot) {
    // Screenshot staging: build the scene, then let it settle.
    stageShot(state, shot);
    setTimeout(() => { window.__shotReady = true; }, 1200);
  } else {
    window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

boot();
