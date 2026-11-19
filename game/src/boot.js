// SOLMAR boot — the entry module. It owns the canvas, the game loop,
// the camera, mode transitions, the time-of-day lighting, and the
// deterministic ?shot= staging used for the four screenshots.

import { createState, loadSave, applySave, saveGame, clearSave, clamp, WORLD_W, WORLD_H } from './core.js';
import { buildCity, drawGround } from './world.js';
import { attachInput, tap, releaseTaps } from './keys.js';
import { createSound } from './sound.js';
import { spawnTraffic, spawnParked, updateTraffic, updatePlayerCar, updateCopCars, enterCar, exitCar, drawCars, addWanted } from './vehicles.js';
import { spawnPeds, updatePeds, drawPeds, updateFoes, drawFoes, updateBullets, drawBullets, updateParticles, drawParticles, drawPlayer, drawHeli, updatePlayerOnFoot } from './actors.js';
import { MISSIONS, startMission, updateMission } from './story.js';
import { drawHUD, drawWorldMarker, drawTitle, drawBrief, drawPassed, drawFailed, drawGameOver, drawBusted, drawPaused } from './hud.js';
import { MOOD_TINTS, TUNE } from './tuning.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const G = createState();
const city = buildCity(1337);
const S = createSound();
attachInput(G, canvas);

let save = loadSave();
G.hasSave = !!save;

// ---- World population -------------------------------------------------
spawnTraffic(G, city, TUNE.maxTraffic);
spawnParked(G, city, 8);
spawnPeds(G, city, TUNE.maxPeds);

// ---- Staging (?shot=1..4) --------------------------------------------
// Deterministic scenes for the four screenshots. The simulation is
// frozen so the captured frame is exactly the staged one.
function stageShot(n) {
  G.frozen = true;
  if (n === 1) {
    // Golden-hour beach chase: player driving fast, cops behind,
    // near-miss and drift cash on screen.
    G.mode = 'play';
    G.mood = 'golden';
    G.day = 1;
    G.wanted = 2;
    G.wantedHeat = 35;
    G.money = 1250;
    startMission(G, 0, city, null);
    G.mode = 'play';
    const car = G.cars.find((c) => c.driver === 'parked') || G.cars[0];
    car.driver = 'player';
    car.speed = 520;
    car.angle = -Math.PI / 2;
    car.x = 600;
    car.y = 1500;
    G.player.car = car;
    G.player.onFoot = false;
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.angle = car.angle;
    // Camera is the view's top-left corner: centre it on the car so the
    // chase (and the beach to the west) fills the frame.
    G.camera.x = car.x - 640;
    G.camera.y = car.y - 400;
    // Two cop cars in pursuit, one traffic car to brush past.
    const cop1 = G.cops[0] || null;
    void cop1;
    const mk = (x, y, a) => {
      const c = { id: 900 + Math.floor(Math.random() * 90), x, y, angle: a, kind: 'cop', color: '#e8e8e8', speed: 430, w: 44, h: 22, hp: 100, driver: 'cop', driftT: 0, nearMissCd: 0, dead: false };
      G.cars.push(c);
      G.cops.push(c);
      return c;
    };
    mk(600, 1780, -Math.PI / 2);
    mk(660, 1930, -Math.PI / 2);
    const near = { id: 950, x: 648, y: 1420, angle: Math.PI / 2, kind: 'sedan', color: '#3f7dc9', speed: 190, w: 44, h: 22, hp: 100, driver: 'traffic', driftT: 0, nearMissCd: 3, dead: false };
    G.cars.push(near);
    G.floats.push({ x: 660, y: 1380, text: 'NEAR MISS +$25', color: '#ffd94d', life: 1.6, max: 1.6 });
    G.floats.push({ x: 560, y: 1460, text: 'DRIFT +$15', color: '#ffd94d', life: 1.6, max: 1.6 });
    G.notice = '';
    G.noticeT = 0;
    G.missionTime = 42;
  } else if (n === 2) {
    // Clean title menu over the city.
    G.mode = 'title';
    G.mood = 'golden';
    G.camera.x = 1800;
    G.camera.y = 1000;
  } else if (n === 3) {
    // Night combat at the plaza: player shooting, thugs returning fire.
    G.mode = 'play';
    G.health = 82;
    G.armour = 40;
    G.ammo = 18;
    startMission(G, 6, city, null);
    // startMission sets day/mood from the mission (day 2, sunset);
    // this shot is the night fight, so override AFTER it.
    G.mood = 'night';
    G.day = 3;
    G.wanted = 3;
    G.wantedHeat = 55;
    G.mode = 'play';
    G.notice = '';
    G.noticeT = 0;
    G.player.x = 1800;
    G.player.y = 1180;
    G.player.aim = -Math.PI / 2;
    G.player.angle = -Math.PI / 2;
    G.camera.x = 1800 - 640;
    G.camera.y = 1180 - 400;
    G.foes.forEach((f, i) => {
      f.x = 1720 + i * 55;
      f.y = 980 + (i % 2) * 60;
    });
    // A live tracer + muzzle flash, frozen mid-flight.
    G.bullets.push({ x: 1800, y: 1100, angle: -Math.PI / 2, vx: 0, vy: -900, life: 0.5, friendly: true });
    G.bullets.push({ x: 1760, y: 1020, angle: Math.PI / 2, vx: 0, vy: 900, life: 0.5, friendly: false });
    for (let i = 0; i < 5; i++) {
      G.parts.push({ x: 1800, y: 1150, vx: (Math.random() - 0.5) * 200, vy: -200, life: 0.12, max: 0.12, size: 4, color: '#ffd94d' });
    }
    G.missionTime = 96;
    G.heli = { angle: 0.6, r: 260, x: 2050, y: 900 };
  } else if (n === 4) {
    // Mission PASSED panel: 5 stars, +$1,800, 2 cars destroyed, level up.
    G.mode = 'passed';
    G.mood = 'sunset';
    G.day = 3;
    G.level = 5;
    G.money = 4850;
    G.passed = {
      mission: 'King of Solmar',
      stars: 5,
      payout: 1800,
      time: '04:32',
      accuracy: 78,
      carsDestroyed: 2,
      levelUp: true,
      next: null,
    };
    G.player.x = 1800;
    G.player.y = 1150;
    G.camera.x = 1800 - 640;
    G.camera.y = 1000 - 400;
  }
}

const params = new URLSearchParams(window.location.search);
const shot = parseInt(params.get('shot') || '0', 10);
if (shot >= 1 && shot <= 4) stageShot(shot);

// ---- Mode transitions ---------------------------------------------------
function beginNewGame() {
  clearSave();
  const fresh = createState();
  Object.keys(fresh).forEach((k) => { G[k] = fresh[k]; });
  G.hasSave = false;
  save = null;
  spawnTraffic(G, city, TUNE.maxTraffic);
  spawnParked(G, city, 8);
  spawnPeds(G, city, TUNE.maxPeds);
  startMission(G, 0, city, S);
}

function continueGame() {
  if (!save) return;
  const fresh = createState();
  Object.keys(fresh).forEach((k) => { G[k] = fresh[k]; });
  applySave(G, save);
  spawnTraffic(G, city, TUNE.maxTraffic);
  spawnParked(G, city, 8);
  spawnPeds(G, city, TUNE.maxPeds);
  startMission(G, G.missionIdx, city, S);
}

function nextMission() {
  const idx = Math.min(G.missionIdx + 1, MISSIONS.length - 1);
  if (G.missionIdx >= MISSIONS.length - 1) {
    G.mode = 'title';
    save = loadSave();
    return;
  }
  startMission(G, idx, city, S);
}

function handleModeKeys() {
  if (tap(G, 'Enter') || tap(G, 'NumpadEnter')) {
    S.ensure();
    if (G.mode === 'title') {
      if (save && !G._forceNew) continueGame();
      else beginNewGame();
    } else if (G.mode === 'brief') {
      G.mode = 'play';
    } else if (G.mode === 'passed') {
      nextMission();
    } else if (G.mode === 'failed') {
      startMission(G, G.missionIdx, city, S);
    } else if (G.mode === 'over') {
      G.health = 100;
      G.armour = 50;
      G.wanted = 0;
      G.wantedHeat = 0;
      G.player.x = 1800;
      G.player.y = 1150;
      G.mode = 'play';
    } else if (G.mode === 'busted') {
      G.health = 100;
      G.player.x = 1800;
      G.player.y = 1150;
      G.mode = 'play';
    }
  }
  if (G.mode === 'title' && tap(G, 'KeyN')) {
    G._forceNew = true;
    beginNewGame();
  }
  if (G.mode === 'play' && tap(G, 'Escape')) {
    G.mode = 'paused';
  } else if (G.mode === 'paused') {
    if (tap(G, 'Escape')) G.mode = 'play';
    if (tap(G, 'KeyS')) {
      saveGame(G);
      save = loadSave();
      G.notice = 'GAME SAVED';
      G.noticeT = 2;
    }
    if (tap(G, 'KeyR')) startMission(G, G.missionIdx, city, S);
    if (tap(G, 'KeyT')) {
      G.mode = 'title';
      save = loadSave();
    }
  }
  if (G.mode === 'play' && tap(G, 'KeyQ')) {
    const name = S.nextStation();
    G.radio = S.station;
    G.notice = name;
    G.noticeT = 2;
  }
  if (tap(G, 'KeyM')) {
    G.radioOn = !G.radioOn;
    S.radioOn = G.radioOn;
  }
}

// ---- Update ---------------------------------------------------------------
function update(dt) {
  G.time += dt;
  if (G.noticeT > 0) G.noticeT -= dt;
  // Wanted heat decays when the player is not committing crimes.
  if (G.wanted > 0 && G.mode === 'play') {
    G.wantedHeat = Math.max(0, G.wantedHeat - TUNE.wantedDecay * dt);
    const stars = G.wantedHeat <= 0 ? 0 : G.wantedHeat < 20 ? 1 : G.wantedHeat < 40 ? 2 : G.wantedHeat < 60 ? 3 : G.wantedHeat < 80 ? 4 : 5;
    G.wanted = stars;
  }
  if (G.mode !== 'play') return;

  const p = G.player;
  // Mouse world position for aiming.
  G.mouse.wx = G.camera.x + G.mouse.x;
  G.mouse.wy = G.camera.y + G.mouse.y;

  if (p.onFoot) {
    updatePlayerOnFoot(G, dt, city, S);
    if (tap(G, 'KeyF')) enterCar(G, S);
  } else {
    updatePlayerCar(G, dt, city, S);
    if (tap(G, 'KeyF')) exitCar(G);
  }
  updateTraffic(G, dt, city, S);
  updateCopCars(G, dt, city, S);
  updatePeds(G, dt, city);
  updateFoes(G, dt, city, S);
  updateBullets(G, dt, city, S);
  updateParticles(G, dt);
  updateMission(G, dt, city, S);

  // Camera follows the player, clamped to the world.
  const tx = clamp(p.x - canvas.width / 2, 0, WORLD_W - canvas.width);
  const ty = clamp(p.y - canvas.height / 2, 0, WORLD_H - canvas.height);
  G.camera.x += (tx - G.camera.x) * Math.min(1, dt * 5);
  G.camera.y += (ty - G.camera.y) * Math.min(1, dt * 5);
}

// ---- Render ---------------------------------------------------------------
function render() {
  const W = canvas.width;
  const H = canvas.height;
  const cam = { x: Math.round(G.camera.x), y: Math.round(G.camera.y), w: W, h: H };
  ctx.clearRect(0, 0, W, H);
  // World space: every world draw call below works in world coordinates,
  // so translate by the camera once here instead of in each function.
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGround(ctx, G, city, cam, cam);
  drawWorldMarker(ctx, G, city);
  drawPeds(ctx, G, cam, cam);
  drawCars(ctx, G, cam, cam);
  drawFoes(ctx, G, cam, cam);
  drawPlayer(ctx, G);
  drawBullets(ctx, G);
  drawParticles(ctx, G);
  drawHeli(ctx, G, cam, cam);
  ctx.restore();

  // Screen space from here on: lighting, HUD, menus.

  // Time-of-day lighting.
  const tint = MOOD_TINTS[G.mood] || MOOD_TINTS.golden;
  ctx.fillStyle = tint.ground;
  ctx.fillRect(0, 0, W, H);
  if (G.mood === 'night') {
    // Darkness with a lit circle around the player.
    ctx.fillStyle = 'rgba(6, 8, 30, 0.30)';
    ctx.fillRect(0, 0, W, H);
    const px = G.player.x - cam.x;
    const py = G.player.y - cam.y;
    const grad = ctx.createRadialGradient(px, py, 60, px, py, 420);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  if (G.mode === 'play' || G.mode === 'paused') drawHUD(ctx, G, city);
  if (G.mode === 'title') drawTitle(ctx, G, save);
  if (G.mode === 'brief') drawBrief(ctx, G);
  if (G.mode === 'passed') drawPassed(ctx, G);
  if (G.mode === 'failed') drawFailed(ctx, G);
  if (G.mode === 'over') drawGameOver(ctx, G);
  if (G.mode === 'busted') drawBusted(ctx, G);
  if (G.mode === 'paused') drawPaused(ctx, G);
}

// ---- Main loop --------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  handleModeKeys();
  if (!G.frozen) update(dt);
  else G.time += 0.016; // keep staged pulses alive without simulating
  render();
  releaseTaps(G);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose the state for debugging and for automated play-tests.
window.__solmar = G;
