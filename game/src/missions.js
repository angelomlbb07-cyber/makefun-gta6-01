// SOLMAR — missions.js
// The 12 story missions for fixer Marisol Vega, and the mission state
// machine: start, step, pass, restart. Two endgame fixes live here:
//  F1 — the passed timer is decremented unconditionally at the top of
//       stepMissions, so the passed panel always dismisses, even after
//       the 12th mission when there is no next mission to set a timer.
//  F2 — startMission and restartMission clamp the index: when the story is
//       finished the player stays in free-roam (or restarts mission 12)
//       instead of indexing past the end of the list and throwing.
// A mission step is one of: goto (reach a point), deliver (reach it in a
// car), kill (take out N enemies), collect (grab N packages), hold (stay in
// a zone), escape (reach the safehouse while the heat is on). Round 6: full
// fresh rewrite in one recording — no mission change; the combat shot
// re-stages mission 7's kill step only.

import { MISSION_COUNT } from './config.js';
import { addCash, addRespect, showDialogue, showToast } from './state.js';
import { dist } from './random.js';

export const MISSIONS = [
  {
    name: 'First Wheels', reward: 300, wanted: 1,
    brief: 'Marisol Vega: Any car. Don\'t ask. Bring it to the garage.',
    steps: [
      { text: 'Steal any car', kind: 'steal' },
      { text: 'Deliver the car to Benny\'s Garage', kind: 'deliver', x: 920, y: 1320 },
    ],
  },
  {
    name: 'Sunset Taxi', reward: 450, wanted: 2,
    brief: 'Marisol Vega: A fare is waiting at the plaza. Drive smooth, drive fast.',
    steps: [
      { text: 'Pick up the fare at Solmar Plaza', kind: 'goto', x: 1520, y: 1520 },
      { text: 'Drop the fare at Palmine Beach', kind: 'deliver', x: 2200, y: 2160 },
    ],
  },
  {
    name: 'Dockside Drop', reward: 600, wanted: 2,
    brief: 'Marisol Vega: A crate at the docks. Nobody watches the docks at night.',
    steps: [
      { text: 'Collect the crate at the docks', kind: 'collect', x: 180, y: 1520, count: 1 },
      { text: 'Deliver the crate to Marina Bay Bank', kind: 'deliver', x: 2520, y: 1520 },
    ],
  },
  {
    name: 'Repo Run', reward: 700, wanted: 2,
    brief: 'Marisol Vega: The Falco Coupe at the marina. The owner owes us.',
    steps: [
      { text: 'Steal the Falco Coupe at the marina', kind: 'steal' },
      { text: 'Deliver the Falco to Benny\'s Garage', kind: 'deliver', x: 920, y: 1320 },
    ],
  },
  {
    name: 'Palm Grove Pickup', reward: 850, wanted: 2,
    brief: 'Marisol Vega: A package in the park. Walk in like you belong there.',
    steps: [
      { text: 'Find the package in Palm Grove Park', kind: 'collect', x: 2320, y: 720, count: 2 },
      { text: 'Bring the packages to Marisol', kind: 'deliver', x: 1520, y: 1520 },
    ],
  },
  {
    name: 'Neon Courier', reward: 950, wanted: 3,
    brief: 'Marisol Vega: Neon signs, fast car, no stops. The cops love a courier.',
    steps: [
      { text: 'Pick up the parcel at Coral Casino', kind: 'goto', x: 1520, y: 520 },
      { text: 'Deliver it to the Sunset Inn before the timer runs out', kind: 'deliver', x: 2620, y: 420 },
    ],
  },
  {
    name: 'Sunset Heist', reward: 1800, wanted: 3,
    brief: 'Marisol Vega: The Coral Kings are guarding the vault. Take them out, then hold the vault.',
    steps: [
      { text: 'Take out the Coral Kings (1/6 down)', kind: 'kill', count: 6, x: 1520, y: 1520 },
      { text: 'Hold the vault room until the safe opens', kind: 'hold', x: 1520, y: 520, hold: 12 },
    ],
  },
  {
    name: 'Midnight Run', reward: 2400, wanted: 3,
    brief: 'Marisol Vega: Midnight, pier, one boat. Don\'t let the cops see the handoff.',
    steps: [
      { text: 'Reach the pier with the cargo', kind: 'deliver', x: 1600, y: 2240 },
      { text: 'Lose the heat, then reach the safehouse', kind: 'escape', x: 520, y: 520 },
    ],
  },
  {
    name: 'The Big Score', reward: 3200, wanted: 4,
    brief: 'Marisol Vega: Marina Bay Bank. Big vault, big noise, big payout.',
    steps: [
      { text: 'Take out the bank guards (0/4 down)', kind: 'kill', count: 4, x: 2520, y: 1520 },
      { text: 'Hold the vault until the safe opens', kind: 'hold', x: 2520, y: 1520, hold: 15 },
      { text: 'Escape to the safehouse with the cash', kind: 'escape', x: 520, y: 520 },
    ],
  },
  {
    name: 'Heatwave Getaway', reward: 2800, wanted: 4,
    brief: 'Marisol Vega: Every cruiser in Solmar is looking for you. Make them look stupid.',
    steps: [
      { text: 'Outrun the police for 60 seconds', kind: 'survive', hold: 60 },
      { text: 'Reach the garage in one piece', kind: 'deliver', x: 920, y: 1320 },
    ],
  },
  {
    name: 'Marina Standoff', reward: 3600, wanted: 5,
    brief: 'Marisol Vega: The Marina Boys turned. End it at the marina, loud.',
    steps: [
      { text: 'Take out the Marina Boys (0/8 down)', kind: 'kill', count: 8, x: 2720, y: 1120 },
      { text: 'Hold the marina until backup arrives', kind: 'hold', x: 2720, y: 1120, hold: 15 },
    ],
  },
  {
    name: 'Solmar Nights', reward: 5000, wanted: 5,
    brief: 'Marisol Vega: One last job. The whole city, one night, no mistakes.',
    steps: [
      { text: 'Collect the three drops across the city', kind: 'collect', x: 1520, y: 1520, count: 3 },
      { text: 'Take out the last of the Coral Kings (0/6 down)', kind: 'kill', count: 6, x: 1520, y: 520 },
      { text: 'Bring it home to the safehouse', kind: 'escape', x: 520, y: 520 },
    ],
  },
];

export function missionAt(index) {
  if (index < 0 || index >= MISSIONS.length) return null;
  return MISSIONS[index];
}

export function missionLabel(state) {
  const m = state.mission;
  if (m.finished) return 'STORY COMPLETE — FREE ROAM';
  const def = missionAt(m.index);
  if (!def) return 'FREE ROAM';
  return 'MISSION ' + (m.index + 1) + '/' + MISSION_COUNT + ' — ' + def.name.toUpperCase();
}

// Start a mission by index. Clamped: an index past the end means the story
// is finished, so the player stays in free-roam instead of throwing (F2).
export function startMission(state, index, city) {
  const m = state.mission;
  if (index >= MISSIONS.length) {
    m.finished = true;
    m.active = false;
    m.objective = 'Story complete — Solmar is yours. Free roam.';
    return false;
  }
  if (index < 0) index = 0;
  const def = MISSIONS[index];
  m.index = index;
  m.step = 0;
  m.active = true;
  m.finished = false;
  m.passed = false;
  m.passedTimer = 0;
  m.betweenTimer = 0;
  m.timer = 420;
  m.stats = { shots: 0, hits: 0, carsDestroyed: 0, carsStolen: 0, time: 0, kills: 0, collected: 0, holdT: 0 };
  m.objective = def.steps[0].text;
  m.stepsRef = def.steps; // render.js reads the active step's target from here
  showToast(state, def.brief);
  showDialogue(state, 'Marisol Vega', def.brief, '#ff9ecf');
  spawnStepTargets(state, city);
  return true;
}

// Restart the current mission after BUSTED / WASTED. Clamped the same way:
// after the finale, restart the last mission instead of indexing past it.
export function restartMission(state, city) {
  const m = state.mission;
  m.passed = false;
  m.passedTimer = 0;
  m.betweenTimer = 0;
  state.events.wasted = false;
  state.events.busted = false;
  state.health = state.maxHealth;
  state.armour = Math.min(state.armour, state.maxArmour);
  state.wanted = 0;
  state.wantedHeat = 0;
  if (m.finished || m.index >= MISSIONS.length) {
    // Story done: free-roam at the safehouse, or replay the finale.
    if (m.index >= MISSIONS.length) m.index = MISSIONS.length - 1;
    m.finished = true;
    m.active = false;
    m.objective = 'Story complete — Solmar is yours. Free roam.';
    return false;
  }
  return startMission(state, m.index, city);
}

function spawnStepTargets(state, city) {
  const def = missionAt(state.mission.index);
  if (!def) return;
  const step = def.steps[state.mission.step];
  if (!step) return;
  state.pickups = [];
  state.enemies = [];
  if (step.kind === 'collect') {
    for (let i = 0; i < step.count; i++) {
      state.pickups.push({ x: step.x + (i - 1) * 90, y: step.y + ((i % 2) ? 60 : -40), kind: 'package', taken: false });
    }
  }
  if (step.kind === 'kill') {
    const rngSeed = state.seed + state.mission.index * 131 + state.mission.step * 17;
    let s = rngSeed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < step.count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 120 + rnd() * 260;
      state.enemies.push({
        x: step.x + Math.cos(a) * r, y: step.y + Math.sin(a) * r,
        hp: 60, angle: 0, shootT: 1 + rnd() * 2, kind: 'gang', alive: true,
      });
    }
  }
}

// The per-frame mission update. The passed timer is decremented FIRST and
// unconditionally (F1): even with no next mission, the panel dismisses.
export function stepMissions(state, dt, city) {
  const m = state.mission;
  if (m.passedTimer > 0) {
    m.passedTimer -= dt;
    if (m.passedTimer <= 0) {
      m.passedTimer = 0;
      m.passed = false;
      state.mode = state.mode === 'passed' ? 'play' : state.mode;
      state.events.passed = false;
    }
  }
  if (m.betweenTimer > 0) {
    m.betweenTimer -= dt;
    if (m.betweenTimer <= 0) {
      m.betweenTimer = 0;
      if (!m.finished) startMission(state, m.index, city);
    }
    return;
  }
  if (!m.active || m.passed) return;
  const def = missionAt(m.index);
  if (!def) return;
  const step = def.steps[m.step];
  if (!step) return;
  m.timer -= dt;
  m.stats.time += dt;
  const p = state.player;
  if (!p) return;
  let done = false;
  if (step.kind === 'goto' || step.kind === 'deliver') {
    if (dist(p.x, p.y, step.x, step.y) < 90) done = true;
  } else if (step.kind === 'steal') {
    if (!p.onFoot) done = true;
  } else if (step.kind === 'collect') {
    if (m.stats.collected >= step.count) done = true;
  } else if (step.kind === 'kill') {
    if (m.stats.kills >= step.count) done = true;
  } else if (step.kind === 'hold') {
    if (dist(p.x, p.y, step.x, step.y) < 170) {
      m.stats.holdT += dt;
      if (m.stats.holdT >= step.hold) done = true;
    } else {
      m.stats.holdT = Math.max(0, m.stats.holdT - dt);
    }
  } else if (step.kind === 'survive') {
    m.stats.holdT += dt;
    if (m.stats.holdT >= step.hold) done = true;
  } else if (step.kind === 'escape') {
    if (state.wanted === 0 && dist(p.x, p.y, step.x, step.y) < 110) done = true;
  }
  if (m.timer <= 0) {
    // Out of time: the mission fails back to its start, no soft-lock.
    showToast(state, 'Mission failed — out of time. Marisol is not happy.');
    startMission(state, m.index, city);
    return;
  }
  if (!done) return;
  m.step += 1;
  m.stats.holdT = 0;
  if (m.step >= def.steps.length) {
    completeMission(state, city);
  } else {
    const next = def.steps[m.step];
    m.objective = next.text;
    showToast(state, next.text);
    spawnStepTargets(state, city);
  }
}

function completeMission(state, city) {
  const m = state.mission;
  const def = missionAt(m.index);
  if (!def) return;
  const payout = def.reward;
  const shots = m.stats.shots;
  const hits = m.stats.hits;
  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : null; // dash when nothing fired (F14)
  const respectGain = 120 + m.index * 20;
  const res = addRespect(state, respectGain);
  addCash(state, payout, 'MISSION PAY');
  const stars = accuracy === null ? 4 : accuracy >= 80 ? 5 : accuracy >= 60 ? 4 : accuracy >= 40 ? 3 : 2;
  const nextDef = missionAt(m.index + 1);
  m.last = {
    name: def.name,
    payout,
    time: Math.round(m.stats.time),
    accuracy,
    carsDestroyed: m.stats.carsDestroyed,
    carsStolen: m.stats.carsStolen,
    rating: ['D', 'C', 'B', 'A', 'S'][stars - 1] || 'A',
    stars,
    respectGain,
    levelUp: res.levelUp,
    level: res.level,
    nextName: nextDef ? nextDef.name : null,
    nextReward: nextDef ? nextDef.reward : 0,
    nextWanted: nextDef ? nextDef.wanted : 0,
    index: m.index,
  };
  m.active = false;
  m.passed = true;
  m.passedTimer = 8;
  m.index += 1;
  state.events.passed = true;
  state.mode = 'passed';
  state.wanted = 0;
  state.wantedHeat = 0;
  if (m.index >= MISSIONS.length) {
    m.finished = true;
    m.betweenTimer = 0; // no next mission: F1's unconditional decrement dismisses the panel
  } else {
    m.betweenTimer = 0; // the player presses Enter, or the timer, to continue
  }
  saveAfterMission(state);
}

function saveAfterMission(state) {
  // Best-effort autosave hook; save.js owns the real write, called by main.
  if (typeof state.onAutosave === 'function') state.onAutosave();
}

// Dismiss the passed panel early (Enter key / click). Safe after mission 12:
// the story is finished, so play continues in free-roam.
export function dismissPassed(state, city) {
  const m = state.mission;
  if (!m.passed) return;
  m.passed = false;
  m.passedTimer = 0;
  state.events.passed = false;
  state.mode = 'play';
  if (m.finished) {
    m.active = false;
    m.objective = 'Story complete — Solmar is yours. Free roam.';
    return;
  }
  startMission(state, m.index, city);
}

export function missionTimerText(state) {
  const t = Math.max(0, Math.ceil(state.mission.timer));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

export function missionProgressText(state) {
  const m = state.mission;
  if (m.finished) return '12/12';
  return (m.index + 1) + '/' + MISSION_COUNT;
}
