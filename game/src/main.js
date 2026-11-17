// SOLMAR — boot and the one loop. Input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. Screens: title, play, paused, over
// (busted / wasted). ?shot=beach|title|combat|passed (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
// v2: twelve missions, guns (Q switch, R reload, F fire), radio (C), Benny's Garage (G),
// day counter, drift and near-miss scoring.

import { BEST_KEY, CLOCK, GARAGE_UPGRADES, RADIO, STEP } from './config.js';
import { createGameState, resetGameState, clampCamera } from './state.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { stepPlayer, exitCar, switchWeapon } from './player.js';
import { stepTraffic, nearestCar } from './traffic.js';
import { stepPolice } from './police.js';
import { MISSIONS, currentStep, startMission, stepMissions } from './missions.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { blockAt, roadAt } from './city.js';
import { clamp, dist } from './random.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createGameState(seed);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best cash then lasts this visit only.
  }
}

state.best = readBest();

function announce(message) {
  status.textContent = message;
}

function updateCamera(dt) {
  const cam = state.camera;
  const targetZoom = state.player.onFoot ? 1 : 0.82;
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, 2 * dt);
  cam.x += (state.player.x - cam.x) * Math.min(1, 6 * dt);
  cam.y += (state.player.y - cam.y) * Math.min(1, 6 * dt);
  clampCamera(state);
}

function updateStreet() {
  const road = roadAt(state.city, state.player.x, state.player.y);
  if (road) {
    state.streetName = road.name;
    return;
  }
  const block = blockAt(state.city, state.player.x, state.player.y);
  state.streetName = block ? block.district : 'Solmar';
}

function updateHint() {
  const { player } = state;
  const step = currentStep(state);
  const garageLm = state.city.landmarks.garage;
  if (!player.onFoot && dist(player.x, player.y, garageLm.x, garageLm.y) < 160) {
    state.hint = "G — Benny's Garage (upgrades) · E — Get out · Space — Handbrake";
    return;
  }
  if (player.onFoot) {
    const near = nearestCar(state.traffic.cars, player.x, player.y, 56);
    if (step && step.type === 'grab') {
      state.hint = 'Walk in, then hold E to crack the vault · F — Fire · R — Reload';
    } else if (near) {
      state.hint = 'E — Steal car · F — Fire · Q — Switch gun · Shift — Run';
    } else {
      state.hint = 'WASD — Walk · Shift — Run · F — Fire · Q — Switch gun';
    }
  } else {
    state.hint = 'E — Get out · Space — Handbrake · F — Drive-by · C — Radio';
  }
}

function updateParticles(dt) {
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const p = state.particles[index];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.particles.splice(index, 1);
  }
}

function handleEvents() {
  const events = state.events;
  if (events.punch) audio.punch();
  if (events.shoot) audio.shoot();
  if (events.reload) audio.click();
  if (events.radio) audio.radio();
  if (events.crash) {
    audio.crash();
    state.camera.shakeX = (Math.random() * 2 - 1) * 7;
    state.camera.shakeY = (Math.random() * 2 - 1) * 7;
  }
  if (events.pickup) audio.pickup();
  if (events.enterCar) audio.click();
  if (events.missionComplete) {
    audio.complete();
    state.best = Math.max(state.best, Math.floor(state.player.cash));
    saveBest(state.best);
  }
  if (events.autosave) saveGame(state);
  if (events.busted) {
    audio.busted();
    endRun('busted');
  } else if (events.wasted) {
    audio.busted();
    endRun('wasted');
  }
  state.camera.shakeX *= 0.85;
  state.camera.shakeY *= 0.85;
}

function stepGame(dt) {
  state.events = {};
  // One-shot keys: Q switches gun, C changes radio station, G opens the garage.
  if (input.pressed('KeyQ')) switchWeapon(state);
  if (input.pressed('KeyC')) {
    state.radio.station = (state.radio.station + 1) % RADIO.length;
    state.radio.track = 0;
    state.radio.trackTimer = 0;
    state.events.radio = true;
  }
  if (input.pressed('KeyG')) openGarage(state);
  stepPlayer(state, input, dt);
  stepTraffic(state, dt, state.rng);
  stepPolice(state, dt, state.rng);
  stepMissions(state, dt, input);
  updateParticles(dt);
  state.time += dt;
  state.clockMinutes += dt * CLOCK.minutesPerSecond;
  // Midnight rolls the day over; the story spans three days.
  if (state.clockMinutes >= 24 * 60) {
    state.clockMinutes -= 24 * 60;
    state.day = Math.min(3, state.day + 1);
  }
  // The radio moves to the next track every 25 seconds.
  state.radio.trackTimer += dt;
  if (state.radio.trackTimer >= 25) {
    state.radio.trackTimer = 0;
    const station = RADIO[state.radio.station % RADIO.length];
    state.radio.track = (state.radio.track + 1) % station.tracks.length;
  }
  if (state.scoreToastTimer > 0) state.scoreToastTimer -= dt;
  updateCamera(dt);
  updateStreet();
  updateHint();
  handleEvents();
  audio.engine(state.player.car ? Math.abs(state.player.car.speed) / 430 : 0, !!state.player.car);
  audio.siren(state.police.stars > 0);
}

/** Open Benny's Garage when the player drives up to it; Esc closes it. */
function openGarage(state) {
  const lm = state.city.landmarks.garage;
  if (state.player.onFoot) return;
  if (dist(state.player.x, state.player.y, lm.x, lm.y) >= 160) return;
  state.garage.open = true;
  state.garage.selected = 0;
  audio.engine(0, false);
  announce("Benny's Garage. Upgrades cost cash and stay on your car.");
}

function buyUpgrade(state) {
  const g = state.garage;
  const up = GARAGE_UPGRADES[g.selected];
  const level = g[up.key];
  if (level >= up.prices.length) return;
  const price = up.prices[level];
  if (state.player.cash < price) return;
  state.player.cash -= price;
  g[up.key] = level + 1;
  // Armour applies at once to the car the player is sitting in.
  if (up.key === 'armour' && state.player.car) {
    state.player.car.maxHp = 100 + 40 * g.armour;
    state.player.car.hp = Math.min(state.player.car.maxHp, state.player.car.hp + 40);
  }
  audio.complete();
  state.events.autosave = true;
  saveGame(state);
}

function handleGarageInput() {
  const g = state.garage;
  if (input.pressed('ArrowUp') || input.pressed('KeyW')) {
    g.selected = (g.selected - 1 + GARAGE_UPGRADES.length) % GARAGE_UPGRADES.length;
    audio.click();
  }
  if (input.pressed('ArrowDown') || input.pressed('KeyS')) {
    g.selected = (g.selected + 1) % GARAGE_UPGRADES.length;
    audio.click();
  }
  if (input.pressed('Enter') || input.pressed('NumpadEnter')) buyUpgrade(state);
  if (input.pressed('Escape') || input.pressed('KeyG')) {
    g.open = false;
    announce('Back on the streets of Solmar.');
  }
}

function restartMission() {
  const m = state.missions;
  m.step = 0;
  m.holdTimer = 0;
  m.toastTimer = 0;
  state.police.heat = 0;
  state.police.stars = 0;
  state.player.health = 100;
  if (state.player.car) exitCar(state);
  state.player.x = state.city.landmarks.spawn.x;
  state.player.y = state.city.landmarks.spawn.y;
  state.player.angle = -Math.PI / 2;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  startMission(state, m.index);
}

function endRun(kind) {
  const fine = kind === 'busted' ? 150 : 100;
  state.player.cash = Math.max(0, state.player.cash - fine);
  ui.overKind = kind;
  screen = SCREEN_OVER;
  audio.engine(0, false);
  audio.siren(false);
  announce(kind === 'busted' ? 'Busted. The mission restarts.' : 'Wasted. The mission restarts.');
}

function respawn() {
  const kind = ui.overKind;
  const lm = kind === 'busted' ? state.city.landmarks.safehouse : state.city.landmarks.hospital;
  state.player.health = 100;
  if (state.player.car) exitCar(state);
  state.player.x = lm.x;
  state.player.y = lm.y;
  state.player.angle = -Math.PI / 2;
  state.camera.x = lm.x;
  state.camera.y = lm.y;
  restartMission();
  screen = SCREEN_PLAY;
  announce('Back on the streets of Solmar.');
}

function menuItems() {
  const items = ['New Game'];
  if (hasSave()) items.push('Continue');
  items.push('How to Play', 'Missions');
  return items;
}

const ui = {
  menuIndex: 0,
  menuItems: menuItems(),
  showHowTo: false,
  showMissions: false,
  pauseIndex: 0,
  pauseItems: ['Resume', 'Restart Mission', 'Sound: On', 'Save & Quit to Title'],
  overKind: 'busted',
};

let screen = SCREEN_TITLE;

function startNewGame() {
  resetGameState(state, Math.floor(Math.random() * 4294967296));
  state.best = readBest();
  startMission(state, 0);
  screen = SCREEN_PLAY;
  audio.resume();
  announce('Playing. Mission 1: First Wheels.');
}

function continueGame() {
  const save = loadGame();
  if (!save) {
    startNewGame();
    return;
  }
  resetGameState(state, Math.floor(Math.random() * 4294967296));
  state.best = readBest();
  state.player.cash = save.cash;
  state.player.x = save.x;
  state.player.y = save.y;
  state.clockMinutes = save.minutes;
  state.day = save.day || 1;
  state.player.respect = save.respect || 0;
  state.player.armour = save.armour || 0;
  if (save.weapon) {
    state.player.weapon = save.weapon;
    state.player.ammoPistol = save.ammoPistol ?? state.player.ammoPistol;
    state.player.reservePistol = save.reservePistol ?? state.player.reservePistol;
    state.player.ammoSmg = save.ammoSmg ?? state.player.ammoSmg;
    state.player.reserveSmg = save.reserveSmg ?? state.player.reserveSmg;
    if (save.weapon === 'pistol') {
      state.player.ammo = state.player.ammoPistol;
      state.player.reserve = state.player.reservePistol;
    } else {
      state.player.ammo = state.player.ammoSmg;
      state.player.reserve = state.player.reserveSmg;
    }
  }
  if (save.garage) {
    state.garage.engine = save.garage.engine || 0;
    state.garage.armour = save.garage.armour || 0;
    state.garage.tyres = save.garage.tyres || 0;
    state.garage.nitro = save.garage.nitro || 0;
  }
  state.camera.x = save.x;
  state.camera.y = save.y;
  startMission(state, Math.min(save.missionIndex, MISSIONS.length - 1));
  screen = SCREEN_PLAY;
  audio.resume();
  announce('Continuing your game in Solmar.');
}

function chooseMenuItem() {
  const item = ui.menuItems[ui.menuIndex];
  audio.click();
  if (ui.showHowTo || ui.showMissions) {
    ui.showHowTo = false;
    ui.showMissions = false;
    return;
  }
  if (item === 'New Game') startNewGame();
  else if (item === 'Continue') continueGame();
  else if (item === 'How to Play') ui.showHowTo = true;
  else if (item === 'Missions') ui.showMissions = true;
}

function choosePauseItem() {
  const item = ui.pauseItems[ui.pauseIndex];
  audio.click();
  if (item === 'Resume') {
    screen = SCREEN_PLAY;
  } else if (item === 'Restart Mission') {
    restartMission();
    screen = SCREEN_PLAY;
  } else if (item.startsWith('Sound:')) {
    const muted = !audio.isMuted();
    audio.setMuted(muted);
    ui.pauseItems[2] = muted ? 'Sound: Off' : 'Sound: On';
  } else if (item === 'Save & Quit to Title') {
    saveGame(state);
    audio.engine(0, false);
    audio.siren(false);
    ui.menuItems = menuItems();
    ui.menuIndex = 0;
    ui.showHowTo = false;
    ui.showMissions = false;
    screen = SCREEN_TITLE;
  }
}

function handleMenuInput() {
  const down = input.pressed('ArrowDown') || input.pressed('KeyS');
  const up = input.pressed('ArrowUp') || input.pressed('KeyW');
  const confirm = input.pressed('Enter') || input.pressed('NumpadEnter') || input.clicked();
  if (screen === SCREEN_TITLE) {
    if (ui.showHowTo || ui.showMissions) {
      if (confirm || input.pressed('Escape')) chooseMenuItem();
      return;
    }
    if (down) ui.menuIndex = (ui.menuIndex + 1) % ui.menuItems.length;
    if (up) ui.menuIndex = (ui.menuIndex - 1 + ui.menuItems.length) % ui.menuItems.length;
    if (confirm) chooseMenuItem();
    // Clicking a menu row chooses it directly.
    if (input.clicked()) {
      const pos = renderer.toLogical(input.clickPos().x, input.clickPos().y);
      const areas = renderer.menuHitAreas(screen, ui);
      for (const area of areas) {
        if (pos.x >= area.x && pos.x <= area.x + area.w && pos.y >= area.y && pos.y <= area.y + area.h) {
          ui.menuIndex = area.index;
          chooseMenuItem();
          break;
        }
      }
    }
  } else if (screen === SCREEN_PAUSED) {
    if (input.pressed('KeyP') || input.pressed('Escape')) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (down) ui.pauseIndex = (ui.pauseIndex + 1) % ui.pauseItems.length;
    if (up) ui.pauseIndex = (ui.pauseIndex - 1 + ui.pauseItems.length) % ui.pauseItems.length;
    if (confirm) choosePauseItem();
    if (input.clicked()) {
      const pos = renderer.toLogical(input.clickPos().x, input.clickPos().y);
      const areas = renderer.menuHitAreas(screen, ui);
      for (const area of areas) {
        if (pos.x >= area.x && pos.x <= area.x + area.w && pos.y >= area.y && pos.y <= area.y + area.h) {
          ui.pauseIndex = area.index;
          choosePauseItem();
          break;
        }
      }
    }
  } else if (screen === SCREEN_OVER) {
    if (confirm) respawn();
  }
}

function runShot(name) {
  const scene = stageShot(name, state, seed);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let attractTime = 0;
  let prevScreen = screen;

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // A screen change drops every queued press, so gameplay keys never leak into menus.
    if (screen !== prevScreen) {
      input.clearPressed();
      prevScreen = screen;
    }
    if (input.pressed('KeyM')) {
      const muted = !audio.isMuted();
      audio.setMuted(muted);
      ui.pauseItems[2] = muted ? 'Sound: Off' : 'Sound: On';
    }

    if (screen === SCREEN_PLAY) {
      if (state.garage.open) {
        // The garage is a shop, not the street: the world waits while you buy.
        accumulator = 0;
        handleGarageInput();
      } else if (input.pressed('KeyP') || input.pressed('Escape')) {
        screen = SCREEN_PAUSED;
        ui.pauseIndex = 0;
        audio.engine(0, false);
        audio.siren(false);
        announce('Paused.');
      } else {
        while (accumulator >= STEP) {
          stepGame(STEP);
          accumulator -= STEP;
          if (screen !== SCREEN_PLAY) break;
        }
      }
    } else if (screen === SCREEN_TITLE) {
      // The city stays alive behind the title: traffic drives, the camera drifts.
      while (accumulator >= STEP) {
        state.events = {};
        stepTraffic(state, STEP, state.rng);
        state.time += STEP;
        attractTime += STEP;
        state.camera.x = 1970 + Math.sin(attractTime * 0.05) * 700;
        state.camera.y = 1445 + Math.cos(attractTime * 0.04) * 450;
        state.camera.zoom = 0.72;
        accumulator -= STEP;
      }
      handleMenuInput();
    } else {
      accumulator = 0;
      handleMenuInput();
    }
    renderer.draw(state, screen, ui);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      ui.pauseIndex = 0;
      audio.engine(0, false);
      audio.siren(false);
      announce('Paused.');
    }
  });

  announce('SOLMAR. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
