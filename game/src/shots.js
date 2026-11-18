// SOLMAR screenshot staging: four genuinely different scenes for the
// 4-slot strategy (beach chase cover, title menu, on-foot combat,
// mission-passed). F15 fix: putPlayerInCar falls back to spawning a car
// when none is nearby, so staging can never throw on a null car.
// F14 fix: the passed scene is staged far from the garage with a real
// mission time (3:58) and real accuracy (75%, 12 shots fired).

import { SCREEN } from './config.js';
import { landmark } from './city.js';
import { createPlayer, enterCar } from './player.js';
import { makeCar, spawnTraffic, spawnPeds } from './traffic.js';
import { spawnCopCar, spawnFootCop } from './police.js';
import { startMission } from './missions.js';

export function putPlayerInCar(state) {
  const p = state.player;
  let best = null, bestD = 1500;
  for (const c of state.cars) {
    if (c.dead || c.driver === 'player') continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  // F15: no car nearby — spawn one beside the player instead of failing.
  if (!best) {
    best = makeCar(p.x + 60, p.y, 2, 'traffic');
    state.cars.push(best);
  }
  enterCar(state, best);
  return best;
}

function placePlayer(state, x, y) {
  state.player.x = x;
  state.player.y = y;
  state.player.angle = 0;
  state.camera.x = x;
  state.camera.y = y;
}

export function stageShot(state, name) {
  state.shotMode = name;
  state.cars = [];
  state.peds = [];
  state.copCars = [];
  state.footCops = [];
  state.roadblocks = [];
  state.bullets = [];
  state.particles = [];
  state.floaters = [];
  state.wanted = 0;
  state.heat = 0;
  state.heli.active = false;
  state.missions.passed = null;
  state.missions.passedTimer = 0;
  state.missions.betweenTimer = 0;
  state.missions.toastTimer = 0;

  if (name === 'title') {
    state.screen = SCREEN.TITLE;
    state.titleChoice = 0;
    state.saveSlot = { day: 2, cash: 18450, missionIndex: 5 };
    state.shotReady = true;
    return;
  }

  state.screen = SCREEN.PLAY;
  if (name === 'beach') {
    // Cover: beach chase — sand, sea, palms, police behind, 171 km/h.
    state.cash = 18450;
    state.day = 2;
    state.respect = 620;
    state.respectLevel = 3;
    startMission(state, 1);
    placePlayer(state, 1500, 2260);
    state.player.health = 100;
    state.player.armour = 65;
    state.player.weapon = 'pistol';
    state.player.ammoPistol = 12;
    state.player.reservePistol = 72;
    spawnTraffic(state, 8);
    const car = putPlayerInCar(state);
    car.speed = 310;
    car.angle = 0;
    car.hp = 88;
    state.wanted = 3;
    state.heat = 3;
    spawnCopCar(state); spawnCopCar(state); spawnCopCar(state);
    state.copCars[0].x = state.player.x - 260; state.copCars[0].y = state.player.y - 40;
    state.copCars[1].x = state.player.x - 320; state.copCars[1].y = state.player.y + 60;
    state.heli.active = true;
    state.heli.x = state.player.x + 180; state.heli.y = state.player.y - 220;
    spawnPeds(state, 6);
    state.radio.station = 2;
  } else if (name === 'combat') {
    // On-foot SMG combat at the Coral Casino with tracer fire.
    state.cash = 12400;
    state.day = 2;
    state.respect = 540;
    state.respectLevel = 3;
    startMission(state, 6);
    state.missions.step = 0;
    state.missions.stepStarted = false;
    placePlayer(state, 1720, 1800);
    state.player.health = 82;
    state.player.armour = 40;
    state.player.weapon = 'smg';
    state.player.ammoSmg = 30;
    state.player.reserveSmg = 120;
    state.player.angle = Math.PI / 4;
    state.wanted = 2;
    state.heat = 2;
    spawnFootCop(state); spawnFootCop(state);
    state.footCops[0].x = 1900; state.footCops[0].y = 1740;
    state.footCops[1].x = 1860; state.footCops[1].y = 1960;
    state.bullets.push({ x: 1760, y: 1830, vx: 640, vy: 640, life: 0.4, damage: 14, fromPlayer: true });
    state.bullets.push({ x: 1790, y: 1860, vx: 640, vy: 640, life: 0.3, damage: 14, fromPlayer: true });
    state.particles.push({ x: 1752, y: 1824, vx: 0, vy: 0, life: 0.1, max: 0.1, color: '#ffd94a', size: 14 });
    spawnTraffic(state, 6);
    spawnPeds(state, 8);
    state.radio.station = 0;
    state.missions.toast = 'Marisol: The Coral Casino vault. Walk in on foot, hold E to crack it.';
    state.missions.toastTimer = 5;
  } else if (name === 'passed') {
    // MISSION PASSED panel: staged far from the garage, real stats.
    // F14: time 3:58 (not 0:02), accuracy 75% with 12 shots fired.
    state.cash = 18750;
    state.day = 2;
    state.respect = 370;
    state.respectLevel = 2;
    startMission(state, 0);
    state.missions.stats.shots = 12;
    state.missions.stats.hits = 9;
    state.missions.stats.carsStolen = 1;
    state.missions.stats.carsDestroyed = 0;
    state.missions.stats.startTime = state.time - 238;
    placePlayer(state, 1500, 2260);
    state.player.health = 94;
    state.player.armour = 20;
    state.player.weapon = 'pistol';
    spawnTraffic(state, 7);
    putPlayerInCar(state);
    state.player.car.speed = 0;
    state.missions.passed = {
      name: 'First Wheels',
      payout: 300,
      time: '3:58',
      accuracy: '75%',
      rating: 'A',
      carsDestroyed: 0,
      carsStolen: 1,
      respect: 120,
      next: 'Sunset Taxi',
      nextGiver: 'Marisol Vega',
    };
    state.missions.passedTimer = 6;
    state.missions.index = 1;
    state.missions.step = 0;
    state.missions.objective = 'Pick up the fare at Palmline Beach';
    state.radio.station = 1;
    state.wanted = 0;
  }
  state.shotReady = true;
}

export { landmark };
