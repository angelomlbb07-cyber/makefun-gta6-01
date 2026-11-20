// story.js — the 12-mission story of Solmar across 3 days, with dialogue,
// objectives, payouts and progression. One job: what the player has to do
// and what happens when they do it. Mission types: taxi, repo/delivery,
// chase, combat, heist. Marisol Vega is the contact; Benny runs the garage.

import { MISSION_PAYOUTS, MISSION_RESPECT, clamp, dist, mulberry32 } from './tuning.js';
import { roadPoint } from './world.js';
import { createCar, nearestCar } from './vehicles.js';
import { damagePlayer } from './actors.js';

export const MISSIONS = [
  { name: 'First Wheels', day: 1, type: 'repo', time: 240, payout: 300, respect: 120, wanted: 0,
    brief: 'Marisol needs wheels. Any car. Don\'t ask.',
    dialogue: 'Marisol Vega: Maris needs wheels. Any car. Don\'t ask where it goes.' },
  { name: 'Sunset Taxi', day: 1, type: 'taxi', time: 300, payout: 450, respect: 150, wanted: 0,
    brief: 'Pick up the fare at the pier, drop them at the Sunset Inn.',
    dialogue: 'Marisol Vega: A fare is waiting at the pier. Drive like you mean it.' },
  { name: 'The Repo Run', day: 1, type: 'repo', time: 300, payout: 500, respect: 150, wanted: 1,
    brief: 'Steal the Sunset Coupe at the marina. Bring it to Benny\'s Garage.',
    dialogue: 'Benny: That coupe at the marina? It\'s mine now. Bring it home.' },
  { name: 'Marina Chase', day: 1, type: 'chase', time: 240, payout: 600, respect: 180, wanted: 2,
    brief: 'A rival crew took the cash. Chase their car down and take it back.',
    dialogue: 'Marisol Vega: They took my cash. Follow that car. Do not lose it.' },
  { name: 'Dockside Delivery', day: 2, type: 'delivery', time: 300, payout: 750, respect: 200, wanted: 1,
    brief: 'Pick up the package at the docks. Deliver it to the plaza. No stops.',
    dialogue: 'Marisol Vega: The package is at the docks. No stops, no peeking.' },
  { name: 'Plaza Pickup', day: 2, type: 'taxi', time: 300, payout: 900, respect: 220, wanted: 1,
    brief: 'A client waits at Coral Plaza. Get them to the Coral Casino, fast.',
    dialogue: 'Marisol Vega: Client at the plaza. Casino, fast. Tip\'s in it for you.' },
  { name: 'Sunset Heist', day: 2, type: 'heist', time: 420, payout: 1500, respect: 250, wanted: 2,
    brief: 'Walk into the Coral Casino, crack the vault, then fight your way out.',
    dialogue: 'Marisol Vega: The vault at the Coral Casino. In, out, rich. Simple.' },
  { name: 'Getaway Driver', day: 2, type: 'chase', time: 300, payout: 1200, respect: 220, wanted: 2,
    brief: 'Lose the cops, then reach the safehouse on Old Solmar.',
    dialogue: 'Marisol Vega: Three stars and counting. Lose them, then come home.' },
  { name: 'Turf War', day: 3, type: 'combat', time: 360, payout: 1300, respect: 240, wanted: 2,
    brief: 'Take out the Coral Kings holding the plaza. Six of them. All of them.',
    dialogue: 'Marisol Vega: The Coral Kings took my plaza. Take it back. All six.' },
  { name: 'The Big Score', day: 3, type: 'delivery', time: 360, payout: 1800, respect: 300, wanted: 2,
    brief: 'Move the score from Marina Bay Bank to the safehouse. Cops will notice.',
    dialogue: 'Marisol Vega: The bank job money. Move it. Do not get cute.' },
  { name: 'Harbor Ambush', day: 3, type: 'combat', time: 360, payout: 2200, respect: 350, wanted: 3,
    brief: 'Ambush the convoy on the harbor road. Take the truck, lose the tail.',
    dialogue: 'Benny: Convoy on the harbor road. Hit it hard, then vanish.' },
  { name: 'King of Solmar', day: 3, type: 'heist', time: 480, payout: 5000, respect: 600, wanted: 3,
    brief: 'One last job: crack the vault, hold the plaza, walk out a legend.',
    dialogue: 'Marisol Vega: One last job and Solmar is ours. Make it count.' },
];

export function createMissionState() {
  return {
    index: 0, step: 0, timer: 0,
    target: null, steps: [],
    passed: null, passedTimer: 0, betweenTimer: 0,
    finished: false,
    holdTimer: 0, chaseTimer: 0, taxiFare: null,
    stats: { shotsFired: 0, shotsHit: 0, kills: 0, carsDestroyed: 0, carsStolen: 0, startTime: 0 },
  };
}

function buildSteps(state, mission) {
  const rng = mulberry32((state.world.seed + mission.name.length * 977 + state.mission.index * 131) >>> 0);
  const w = state.world;
  const steps = [];
  const garage = { x: w.garage.x, y: w.garage.y };
  const plaza = { x: w.fountain.x, y: w.fountain.y };
  const casino = { x: 2455, y: 1625 };
  const pier = { x: 320, y: 1473 };
  const bank = { x: 2285, y: 765 };
  const safehouse = { x: w.safehouse.x, y: w.safehouse.y };
  switch (mission.type) {
    case 'repo': {
      const carSpot = roadPoint(w, rng);
      steps.push({ kind: 'goto', x: carSpot.x, y: carSpot.y, label: 'Steal a car — any car will do' });
      steps.push({ kind: 'drive', x: garage.x, y: garage.y, label: 'Deliver the car to Benny\'s Garage' });
      break;
    }
    case 'taxi': {
      const from = mission.name === 'Sunset Taxi' ? pier : plaza;
      const to = mission.name === 'Sunset Taxi' ? { x: 780, y: 1755 } : casino;
      steps.push({ kind: 'goto', x: from.x, y: from.y, label: 'Pick up the fare' });
      steps.push({ kind: 'drive', x: to.x, y: to.y, label: 'Drop the fare off — drive smooth' });
      break;
    }
    case 'chase': {
      const start = roadPoint(w, rng);
      steps.push({ kind: 'chase', x: start.x, y: start.y, label: 'Chase the rival car — stay close', seconds: 12 });
      steps.push({ kind: 'drive', x: safehouse.x, y: safehouse.y, label: 'Lose the heat — reach the safehouse' });
      break;
    }
    case 'delivery': {
      const pickup = roadPoint(w, rng);
      steps.push({ kind: 'goto', x: pickup.x, y: pickup.y, label: 'Pick up the package' });
      steps.push({ kind: 'drive', x: plaza.x, y: plaza.y, label: 'Deliver the package to Coral Plaza' });
      break;
    }
    case 'heist': {
      steps.push({ kind: 'goto', x: casino.x, y: casino.y, label: 'Get out of the car, walk into the Coral Casino' });
      steps.push({ kind: 'hold', x: casino.x, y: casino.y, label: 'Hold E to crack the vault', hold: mission.name === 'King of Solmar' ? 4 : 3 });
      steps.push({ kind: 'kill', x: plaza.x, y: plaza.y, label: 'Fight your way out — take down the guards', count: 6 });
      steps.push({ kind: 'drive', x: safehouse.x, y: safehouse.y, label: 'Reach the safehouse with the score' });
      break;
    }
    case 'combat': {
      steps.push({ kind: 'kill', x: plaza.x, y: plaza.y, label: 'Take out the Coral Kings (' + (mission.name === 'Turf War' ? 6 : 5) + ' of them)', count: mission.name === 'Turf War' ? 6 : 5 });
      steps.push({ kind: 'drive', x: safehouse.x, y: safehouse.y, label: 'Get clear — reach the safehouse' });
      break;
    }
    default:
      steps.push({ kind: 'drive', x: safehouse.x, y: safehouse.y, label: 'Reach the safehouse' });
  }
  return steps;
}

export function startMission(state, index) {
  // F2 guard: an index past the last mission stays in finished free-roam
  // (or replays mission 12) instead of throwing on MISSIONS[12].
  if (index >= MISSIONS.length) {
    state.mission.finished = true;
    state.mission.index = MISSIONS.length;
    return;
  }
  const m = state.mission;
  m.index = clamp(Math.floor(index), 0, MISSIONS.length - 1);
  m.step = 0;
  m.passed = null; m.passedTimer = 0; m.betweenTimer = 0;
  m.holdTimer = 0; m.chaseTimer = 0; m.taxiFare = null;
  m.stats = { shotsFired: 0, shotsHit: 0, kills: 0, carsDestroyed: 0, carsStolen: 0, startTime: state.time };
  const mission = MISSIONS[m.index];
  m.timer = mission.time;
  m.steps = buildSteps(state, mission);
  m.target = m.steps[0];
  state.day = mission.day;
  if (mission.wanted > 0) {
    state.wanted = mission.wanted;
    state.wantedHeat = mission.wanted * 100;
  }
  state.enemies = [];
  state.toast = { speaker: 'Marisol Vega', text: mission.dialogue.replace('Marisol Vega: ', ''), t: 6 };
  state.dialogue = { speaker: 'Marisol Vega', text: mission.dialogue.replace('Marisol Vega: ', ''), portrait: true, t: 6 };
}

export function currentObjectiveText(state) {
  const m = state.mission;
  if (m.finished) return 'Free roam — Solmar is yours';
  const step = m.steps[m.step];
  if (!step) return MISSIONS[m.index].brief;
  if (step.kind === 'kill') {
    const done = Math.min(m.stats.kills, step.count);
    const base = step.label.replace(/\(\d+ of them\)/, '').trim();
    return base + ' — ' + done + '/' + step.count + ' down';
  }
  return step.label;
}

export function missionRating(state) {
  const s = state.mission.stats;
  const accuracy = s.shotsFired === 0 ? 0 : Math.round((s.shotsHit / s.shotsFired) * 100);
  const timeUsed = Math.max(1, Math.round(state.time - s.startTime));
  const starsEarned = 3 + (accuracy >= 60 ? 1 : 0) + (timeUsed < 200 ? 1 : 0);
  return { accuracy, timeUsed, stars: Math.min(5, starsEarned) };
}

export function completeMission(state) {
  const m = state.mission;
  const mission = MISSIONS[m.index];
  const rating = missionRating(state);
  state.cash += mission.payout;
  state.respect += mission.respect;
  const before = state.respectLevel;
  state.respectLevel = 1 + Math.floor(state.respect / 500);
  m.passed = {
    name: mission.name, payout: mission.payout, respect: mission.respect,
    rating, levelUp: state.respectLevel > before, level: state.respectLevel,
    carsDestroyed: m.stats.carsDestroyed, carsStolen: m.stats.carsStolen,
    kills: m.stats.kills,
  };
  m.passedTimer = 6;
  state.wanted = Math.max(0, state.wanted - 1);
  state.wantedHeat = state.wanted * 100;
  state.enemies = [];
  state.floats.push({ x: state.player.x, y: state.player.y - 40, text: '+' + mission.payout + ' PAYOUT', t: 2, color: '#ffd94a' });
  if (m.index + 1 >= MISSIONS.length) {
    m.finished = true;
    m.betweenTimer = 0;
  } else {
    m.betweenTimer = 2.5;
  }
  state.screen = 'passed';
}

export function stepMissions(state, dt) {
  const m = state.mission;
  // F1 fix: the passed panel's timer ticks unconditionally, so the panel
  // always dismisses — even after the 12th mission.
  if (m.passedTimer > 0) {
    m.passedTimer -= dt;
    if (m.passedTimer <= 0) {
      m.passed = null;
      if (state.screen === 'passed') state.screen = 'play';
    }
  }
  if (m.finished || m.passed) return;
  if (state.screen !== 'play') return;
  m.timer -= dt;
  if (m.timer <= 0) {
    // Time ran out: restart the mission.
    startMission(state, m.index);
    return;
  }
  const step = m.steps[m.step];
  if (!step) return;
  const p = state.player;
  const d = dist(p.x, p.y, step.x, step.y);
  switch (step.kind) {
    case 'goto':
      if (d < 70) advanceStep(state);
      break;
    case 'drive':
      if (d < 80 && !p.onFoot) advanceStep(state);
      else if (d < 80 && p.onFoot) {
        // On foot at the target still counts for delivery-style steps.
        if (m.index === 0) advanceStep(state);
      }
      break;
    case 'chase': {
      if (!state.chaseCar || state.chaseCar.dead) {
        state.chaseCar = createCar(step.x, step.y, 0, 4, {});
        state.cars.push(state.chaseCar);
      }
      const cd = dist(p.x, p.y, state.chaseCar.x, state.chaseCar.y);
      if (cd < 420) {
        m.chaseTimer += dt;
        if (m.chaseTimer >= step.seconds) advanceStep(state);
      } else m.chaseTimer = Math.max(0, m.chaseTimer - dt * 2);
      // The fleeing car drives away along the roads.
      const flee = Math.atan2(step.y - state.chaseCar.y, step.x - state.chaseCar.x);
      state.chaseCar.angle = flee;
      state.chaseCar.speed = 260;
      state.chaseCar.x += Math.cos(flee) * 260 * dt;
      state.chaseCar.y += Math.sin(flee) * 260 * dt;
      break;
    }
    case 'hold': {
      const near = d < 60 && p.onFoot;
      if (near && state.input.holdE) {
        m.holdTimer += dt;
        if (m.holdTimer >= step.hold) advanceStep(state);
      } else m.holdTimer = Math.max(0, m.holdTimer - dt);
      break;
    }
    case 'kill': {
      if (state.enemies.length === 0 && m.stats.kills < step.count) spawnEnemies(state, step);
      if (m.stats.kills >= step.count) advanceStep(state);
      break;
    }
    default:
      if (d < 80) advanceStep(state);
  }
  // Inter-mission wait: start the next mission after the passed panel.
  if (m.betweenTimer > 0) {
    m.betweenTimer -= dt;
    if (m.betweenTimer <= 0 && !m.finished) startMission(state, m.index + 1);
  }
}

function advanceStep(state) {
  const m = state.mission;
  m.step++;
  m.holdTimer = 0; m.chaseTimer = 0;
  if (m.step >= m.steps.length) {
    completeMission(state);
  } else {
    m.target = m.steps[m.step];
  }
}

function spawnEnemies(state, step) {
  const rng = mulberry32((state.time * 331 | 0) + step.count * 17);
  for (let i = 0; i < step.count; i++) {
    const a = (i / step.count) * Math.PI * 2;
    state.enemies.push({
      x: step.x + Math.cos(a) * 160, y: step.y + Math.sin(a) * 160,
      angle: a + Math.PI, health: 60, speed: 130, dead: false, shootTimer: 1 + rng() * 2,
    });
  }
}

export function stepEnemies(state, dt) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    e.angle = a;
    if (d > 260) {
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
    }
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 520) {
      e.shootTimer = 1.4 + Math.random() * 0.8;
      state.tracers.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, t: 0.09, color: '#ff8a6a' });
      state.flashes.push({ x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18, t: 0.07 });
      if (Math.random() < 0.55) damagePlayer(state, 6); // enemy fire, one damage path
    }
  }
}

export function nextMissionPreview(state) {
  const next = MISSIONS[state.mission.index + 1];
  if (!next) return null;
  return { name: next.name, payout: next.payout, wanted: next.wanted };
}
