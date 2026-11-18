// SOLMAR — shots.js
// Deterministic staging for the four screenshots. A URL like
// ?shot=beach&seed=1 builds exactly one scene: the state is set by hand
// (cash, wanted, mission, clock, time of day, positions), the camera is
// placed, and window.__solmarReady is set once the scene has painted.
// The four shots are the 4-slot strategy: beach chase (cover), title menu,
// on-foot combat, mission passed. Staging follows the round-3 gap analysis:
//  P0 — title palms/sun never cross the menu; no toast behind the passed
//       panel; no clipped text anywhere.
//  P1 — combat re-staged in the plaza with a big visible player, visible
//       enemies, muzzle flashes and bright tracers, and a kill counter;
//       passed re-staged on mission 7 with a $1,800 payout, 2 cars
//       destroyed, a star row and a LEVEL UP; the cover shows floating
//       "+$150 NEAR MISS" and "DRIFT x3" score text.
//  P2 — time-of-day variety (golden hour cover, sunset combat, golden hour
//       passed, sunset title); a landmark per shot (plaza fountain, pier,
//       beach); labelled buildings and pedestrians drawn as people.

import { CARS, RADIOS } from './config.js';
import { showDialogue, showToast, addFloat } from './state.js';
import { createCar, enterCar } from './player.js';
import { makeRng, range } from './random.js';
import { spawnTraffic, spawnPedestrians } from './traffic.js';
import { MISSIONS } from './missions.js';

export const SHOT_NAMES = ['beach', 'title', 'combat', 'passed'];

function baseScene(state, city, rng) {
  // Fresh ambient life around the staged scene, then the shot customises.
  state.cars = state.cars.filter((c) => c.driver === 'player' || c.driver === 'police');
  state.peds = [];
  state.cops = [];
  state.footCops = [];
  state.roadblocks = [];
  state.enemies = [];
  state.bullets = [];
  state.muzzle = [];
  state.floats = [];
  state.pickups = [];
  state.dialogue = null;
  state.toast = null;
  state.heli = null;
  spawnTraffic(state, city, rng, 10);
  spawnPedestrians(state, city, rng, 14);
}

function putPlayerIn(state, carDef, x, y, angle, speedKmh) {
  const car = createCar(carDef, x, y, angle, 'player');
  car.speed = speedKmh * 3.6;
  state.cars.push(car);
  enterCar(state, car);
  state.player.angle = angle;
  return car;
}

function addCopBehind(state, x, y, angle) {
  const cop = createCar({ name: 'Solmar PD Cruiser', colour: '#20242e', top: 178, accel: 165, grip: 3.0 },
    x, y, angle, 'police');
  cop.speed = 480;
  state.cops.push(cop);
  state.cars.push(cop);
  return cop;
}

export function stageShot(state, city, name, seed) {
  const rng = makeRng(seed * 7919 + 13);
  state.shot = name;
  state.mode = 'play';
  baseScene(state, city, rng);

  if (name === 'beach') {
    // S1 cover: golden-hour beach chase. Big cash, 3 stars, helicopter,
    // high speed, beach and sea in frame, floating score text visible.
    state.timeOfDay = 'golden';
    state.time = 17 * 60 + 31;
    state.day = 1;
    state.cash = 18450;
    state.wanted = 3;
    state.health = 100;
    state.armour = 51;
    state.respect = 520;
    state.respectLevel = 3;
    state.radioStation = 0;
    state.nitro = 82;
    putPlayerIn(state, CARS[2], 1500, 2140, 0.12, 154);
    state.player.speed = 154 * 3.6; // the HUD speedometer reads player speed
    state.camera = { x: state.player.x, y: state.player.y - 40, zoom: 1 };
    state.heli = { x: state.player.x - 260, y: state.player.y - 320, angle: 0.4 };
    addCopBehind(state, 1180, 2160, 0.1);
    addCopBehind(state, 1060, 2100, 0.15);
    state.mission.index = 1;
    state.mission.stepsRef = MISSIONS[1].steps;
    state.mission.step = 1;
    state.mission.active = true;
    state.mission.timer = 4 * 60 + 57;
    state.mission.objective = 'Drop the fare at Palmine Beach';
    state.mission.stats = { shots: 0, hits: 0, carsDestroyed: 0, carsStolen: 1, time: 123, kills: 0, collected: 0, holdT: 0 };
    state.player.weapon = 'pistol';
    state.player.ammo.pistol = { mag: 12, reserve: 72 };
    showDialogue(state, 'Marisol Vega', 'Smooth and fast, Marco. The fare pays double if we beat the sunset.', '#ff9ecf');
    addFloat(state, 1620, 2060, '+$150 NEAR MISS', '#ffd94d');
    addFloat(state, 1420, 2200, 'DRIFT x3 +$90', '#ffd94d');
    // A couple of beach pedestrians, drawn as people, near the umbrellas.
    state.peds.push(
      { x: 1750, y: 2200, angle: 1.2, speed: 50, colour: '#ff8a5a', shirt: '#e33f2f', fleeing: false, waitT: 0 },
      { x: 1820, y: 2220, angle: -0.6, speed: 45, colour: '#5aa2ff', shirt: '#2f7fe3', fleeing: false, waitT: 0 },
    );
  } else if (name === 'title') {
    // S2 title: sunset over the city. The menu panel owns the centre; the
    // sun disc and palm silhouettes stay at the margins (render.js enforces
    // this) so nothing crosses the buttons or the SOLMAR wordmark.
    state.timeOfDay = 'sunset';
    state.time = 18 * 60 + 42;
    state.day = 2;
    state.cash = 18450;
    state.wanted = 0;
    state.health = 100;
    state.armour = 51;
    state.respect = 520;
    state.respectLevel = 3;
    state.mode = 'title';
    state.mission.index = 5;
    state.mission.finished = false;
    state.mission.active = false;
    state.saveInfo = { day: 2, cash: 18450, mission: 5, text: 'Day 2 · $18,450 · Mission 6/12' };
    state.camera = { x: 1600, y: 1500, zoom: 0.62 };
    state.player.x = 1520;
    state.player.y = 1520;
    state.player.onFoot = true;
  } else if (name === 'combat') {
    // S3 combat: sunset ambush in Solmar Plaza, by the fountain. The player
    // is on foot and drawn large (close camera), three armed enemies are
    // visible with muzzle flashes and bright tracers, and the banner shows
    // the kill counter. Parked cars glow with headlights.
    state.timeOfDay = 'sunset';
    state.time = 20 * 60 + 8;
    state.day = 2;
    state.cash = 12400;
    state.wanted = 2;
    state.health = 89;
    state.armour = 26;
    state.respect = 540;
    state.respectLevel = 3;
    state.radioStation = 3;
    state.player.x = 1520;
    state.player.y = 1660;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.angle = -Math.PI / 2;
    state.player.aimAngle = -Math.PI / 2;
    state.player.weapon = 'smg';
    state.player.ammo.smg = { mag: 24, reserve: 120 };
    state.camera = { x: 1520, y: 1560, zoom: 1.45 };
    state.mission.index = 6;
    state.mission.stepsRef = MISSIONS[6].steps;
    state.mission.step = 0;
    state.mission.active = true;
    state.mission.timer = 6 * 60 + 57;
    state.mission.objective = 'Take out the Coral Kings (1/6 down)';
    state.mission.stats = { shots: 14, hits: 9, carsDestroyed: 0, carsStolen: 1, time: 63, kills: 1, collected: 0, holdT: 0 };
    const plaza = city.plaza;
    const spots = [
      { x: plaza.x - 190, y: plaza.y - 150 },
      { x: plaza.x + 210, y: plaza.y - 120 },
      { x: plaza.x + 60, y: plaza.y - 170 },
    ];
    for (const s of spots) {
      state.enemies.push({ x: s.x, y: s.y, hp: 60, angle: 0.6, shootT: 0.4, kind: 'gang', alive: true });
    }
    // Staged gunfire: enemy tracers and muzzle flashes frozen in frame,
    // plus one player tracer, all bright enough to read at contact-sheet
    // scale.
    for (const e of state.enemies) {
      const a = Math.atan2(state.player.y - e.y, state.player.x - e.x);
      state.bullets.push({ x1: e.x, y1: e.y, x2: state.player.x - 30, y2: state.player.y - 20, life: 9, enemy: true });
      state.muzzle.push({ x: e.x + Math.cos(a) * 26, y: e.y + Math.sin(a) * 26, angle: a, life: 9 });
    }
    state.bullets.push({ x1: state.player.x, y1: state.player.y - 10, x2: spots[0].x + 20, y2: spots[0].y + 10, life: 9 });
    state.muzzle.push({ x: state.player.x, y: state.player.y - 34, angle: -Math.PI / 2, life: 9 });
    showDialogue(state, 'Marisol Vega', 'They were waiting for you. Stay alive, Marco.', '#ff9ecf');
    // A parked car with headlights on, and fleeing pedestrians as people.
    const parked = createCar(CARS[4], plaza.x + 330, plaza.y + 130, -0.4, 'traffic');
    parked.speed = 0;
    state.cars.push(parked);
    state.peds.push(
      { x: plaza.x - 280, y: plaza.y + 180, angle: 2.4, speed: 170, colour: '#ffd94d', shirt: '#f7c948', fleeing: true, waitT: 0 },
      { x: plaza.x + 280, y: plaza.y + 200, angle: 0.8, speed: 170, colour: '#8aff9e', shirt: '#3da35d', fleeing: true, waitT: 0 },
    );
  } else if (name === 'passed') {
    // S4 passed: golden-hour mission 7 complete. Richer than round 2: a
    // $1,800 payout, 2 cars destroyed, a 5-star row, a LEVEL UP callout,
    // and the next job in a dialogue box with a portrait, reward and
    // wanted preview. No briefing toast is drawn while this panel is up.
    state.timeOfDay = 'golden';
    state.time = 18 * 60 + 5;
    state.day = 2;
    state.cash = 16000;
    state.wanted = 0;
    state.health = 96;
    state.armour = 64;
    state.respect = 790;
    state.respectLevel = 4;
    state.radioStation = 1;
    putPlayerIn(state, CARS[0], 980, 1420, -0.5, 0);
    state.player.car.speed = 0;
    state.camera = { x: 1000, y: 1420, zoom: 1 };
    state.mission.index = 7;
    state.mission.stepsRef = MISSIONS[6].steps;
    state.mission.step = 0;
    state.mission.active = false;
    state.mission.finished = false;
    state.mission.passed = true;
    state.mission.passedTimer = 8;
    state.mission.timer = 0;
    state.mission.stats = { shots: 41, hits: 28, carsDestroyed: 2, carsStolen: 1, time: 222, kills: 6, collected: 0, holdT: 12 };
    state.mission.last = {
      name: 'Sunset Heist',
      payout: 1800,
      time: 222,
      accuracy: 68,
      carsDestroyed: 2,
      carsStolen: 1,
      rating: 'S',
      stars: 5,
      respectGain: 250,
      levelUp: true,
      level: 4,
      nextName: 'Midnight Run',
      nextReward: 2400,
      nextWanted: 3,
      index: 6,
    };
    state.mode = 'passed';
    state.events.passed = true;
    state.toast = null;
    state.dialogue = null;
  }
  // The staged scene is painted by main.js right after this returns; the
  // readiness flag is set there, once the first frame is on the canvas.
  return state;
}
