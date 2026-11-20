// story.js — the SOLMAR story: 12 missions across 3 days.
// One job: mission definitions, progression, and win/fail rules.
import { TUNING } from './tuning.js';
import { raiseWanted, makeThug } from './actors.js';
import { addPopup } from './vehicles.js';

// Every mission: id, day, title, type, briefing, target landmark, payout,
// optional time limit, and how many thugs guard it.
export const MISSIONS = [
  { id: 1, day: 1, title: 'First Wheels', type: 'drive', briefing: 'Benny needs a car moved from the beach to his garage. Steal any car and drive it there.', target: 'garage', payout: 150, timeLimit: 0, thugs: 0 },
  { id: 2, day: 1, title: 'Beach Run', type: 'delivery', briefing: 'Deliver the package to Marina Plaza before the timer runs out. Cops are watching the beach road.', target: 'plaza', payout: 220, timeLimit: 75, thugs: 0 },
  { id: 3, day: 1, title: 'Dockside Debt', type: 'shootout', briefing: 'Three dock thugs owe Benny money. Go to the South Docks and collect — by force if needed.', target: 'southDocks', payout: 300, timeLimit: 0, thugs: 3 },
  { id: 4, day: 1, title: 'The Getaway', type: 'escape', briefing: 'The job went loud. Lose the cops: break line of sight until your wanted level drops to zero.', target: 'northGate', payout: 280, timeLimit: 120, thugs: 0 },
  { id: 5, day: 2, title: 'Plaza Pickup', type: 'drive', briefing: 'Pick up the courier at Marina Plaza and bring her to Downtown. Do not wreck the car.', target: 'downtown', payout: 350, timeLimit: 100, thugs: 0 },
  { id: 6, day: 2, title: 'Warehouse War', type: 'shootout', briefing: 'Rival crew holds the warehouse by the airfield. Clear all five thugs.', target: 'airport', payout: 520, timeLimit: 0, thugs: 5 },
  { id: 7, day: 2, title: 'Hot Pursuit', type: 'chase', briefing: 'A rival driver stole Benny’s Comet. Chase him down the beach road and ram his car until it wrecks.', target: 'beachStart', payout: 480, timeLimit: 110, thugs: 0 },
  { id: 8, day: 2, title: 'Night Shift', type: 'delivery', briefing: 'Night delivery to the North Gate. The streets are crawling with patrol cars — stay fast, stay quiet.', target: 'northGate', payout: 430, timeLimit: 90, thugs: 0 },
  { id: 9, day: 3, title: 'The Big Score', type: 'drive', briefing: 'Day three. Drive to Downtown and case the vault. One mistake and the whole city wakes up.', target: 'downtown', payout: 600, timeLimit: 120, thugs: 0 },
  { id: 10, day: 3, title: 'Vault Break', type: 'shootout', briefing: 'Inside the vault. Six guards between you and the money. Clear the room.', target: 'downtown', payout: 900, timeLimit: 0, thugs: 6 },
  { id: 11, day: 3, title: 'Harbour Chase', type: 'chase', briefing: 'They are running for the marina. Run their car off the road before they reach the docks.', target: 'marina', payout: 750, timeLimit: 100, thugs: 0 },
  { id: 12, day: 3, title: 'Final Escape', type: 'escape', briefing: 'The big score is done. Five stars. Escape to the airfield and lose every cop — then Solmar is yours.', target: 'airport', payout: 1500, timeLimit: 180, thugs: 0 },
];

export function missionIsValid(m) {
  return m && typeof m.id === 'number' && m.id >= 1 && m.id <= 12
    && typeof m.title === 'string' && m.title.length > 2
    && typeof m.payout === 'number' && m.payout > 0
    && ['drive', 'delivery', 'shootout', 'chase', 'escape'].includes(m.type)
    && typeof m.target === 'string' && m.target.length > 0
    && m.day >= 1 && m.day <= 3;
}

export function missionsAreComplete() {
  if (MISSIONS.length !== 12) return { ok: false, reason: `expected 12 missions, got ${MISSIONS.length}` };
  const ids = new Set();
  for (const m of MISSIONS) {
    if (!missionIsValid(m)) return { ok: false, reason: `mission ${m.id} invalid` };
    if (ids.has(m.id)) return { ok: false, reason: `duplicate mission id ${m.id}` };
    ids.add(m.id);
  }
  for (let day = 1; day <= 3; day++) {
    if (!MISSIONS.some((m) => m.day === day)) return { ok: false, reason: `no missions on day ${day}` };
  }
  return { ok: true };
}

// Start a mission: place the marker, spawn its thugs / chase car, reset timers.
export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return null;
  const landmark = state.world.landmarks[def.target];
  const mission = {
    def, index, timer: def.timeLimit, elapsed: 0,
    targetX: landmark.x, targetY: landmark.y, targetLabel: landmark.label,
    phase: 'active', thugsLeft: def.thugs, chaseCar: null,
    startCash: state.cash, startHealth: state.player.health,
  };
  if (def.type === 'shootout') {
    for (let i = 0; i < def.thugs; i++) {
      const a = (i / def.thugs) * Math.PI * 2;
      state.thugs.push(makeThug(landmark.x + Math.cos(a) * 130, landmark.y + Math.sin(a) * 130));
    }
  }
  if (def.type === 'chase') {
    const chase = {
      kind: 'car', x: landmark.x + 160, y: landmark.y, angle: 0,
      model: 'Prowler', color: '#7d3ad8', len: 47, wid: 22,
      speed: 0, health: 120, traffic: false, steer: 0, drift: 0, dead: false,
      targetSpeed: TUNING.chaseTargetSpeed, chaseTarget: true,
    };
    state.cars.push(chase);
    mission.chaseCar = chase;
    mission.targetX = chase.x; mission.targetY = chase.y;
  }
  if (def.type === 'escape') {
    raiseWanted(state, def.id === 12 ? 5 : 2);
  }
  state.mission = mission;
  state.message = `${def.title} — ${def.briefing}`;
  state.messageT = 6;
  if (state.sound) state.sound.missionStart();
  return mission;
}

function distToTarget(state) {
  const m = state.mission;
  const px = state.playerCar && !state.player.onFoot ? state.playerCar.x : state.player.x;
  const py = state.playerCar && !state.player.onFoot ? state.playerCar.y : state.player.y;
  return Math.hypot(m.targetX - px, m.targetY - py);
}

// Advance the active mission. Returns 'passed', 'failed', or null.
export function updateMission(state, dt) {
  const m = state.mission;
  if (!m || m.phase !== 'active') return null;
  m.elapsed += dt;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) return failMission(state, 'Time ran out.');
  }
  if (m.def.type === 'shootout') {
    m.thugsLeft = state.thugs.filter((t) => !t.dead).length;
    const nearTarget = Math.hypot(state.player.x - m.targetX, state.player.y - m.targetY) < 420;
    if (nearTarget) for (const t of state.thugs) t.alerted = true;
    if (m.thugsLeft === 0 && state.thugs.length > 0) return passMission(state);
    if (m.thugsLeft === 0 && state.thugs.length === 0) return passMission(state);
  }
  if (m.def.type === 'chase' && m.chaseCar) {
    m.targetX = m.chaseCar.x; m.targetY = m.chaseCar.y;
    if (m.chaseCar.dead || m.chaseCar.health <= 0) return passMission(state);
  }
  if (m.def.type === 'escape') {
    const reached = distToTarget(state) < 130;
    if (reached && state.wantedWhole === 0) return passMission(state);
  }
  if (['drive', 'delivery'].includes(m.def.type)) {
    if (distToTarget(state) < 110) return passMission(state);
  }
  if (state.playerDead) return failMission(state, 'You were taken down.');
  return null;
}

export function passMission(state) {
  const m = state.mission;
  m.phase = 'passed';
  const timeBonus = m.timer > 0 ? Math.floor(m.timer) * TUNING.deliveryBonusPerSecond : 0;
  const payout = m.def.payout + timeBonus + (m.def.type === 'escape' ? TUNING.escapeTimeBonus : 0);
  state.cash += payout;
  state.respect += TUNING.respectPerMission;
  const newLevel = 1 + Math.floor(state.respect / 300);
  const leveledUp = newLevel > state.level;
  state.level = newLevel;
  state.completed.push(m.def.id);
  state.missionIndex = Math.min(MISSIONS.length, m.index + 1);
  state.day = MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)].day;
  const accuracy = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 100;
  state.lastResult = {
    kind: 'passed', title: m.def.title, payout, timeBonus,
    time: Math.round(m.elapsed), accuracy,
    carsDestroyed: state.stats.carsDestroyed, leveledUp,
    next: state.missionIndex < MISSIONS.length
      ? `Next job: ${MISSIONS[state.missionIndex].title}`
      : 'Story complete — Solmar is yours.',
    stars: 5,
  };
  state.screen = 'passed';
  state.thugs = state.thugs.filter((t) => t.dead);
  if (state.sound) state.sound.missionPassed();
  addPopup(state, state.player.x, state.player.y - 40, `+$${payout}`, '#7ddc8a');
  return 'passed';
}

export function failMission(state, reason) {
  const m = state.mission;
  m.phase = 'failed';
  state.lastResult = {
    kind: 'failed', title: m.def.title, reason: reason || 'Mission failed.',
    payout: 0, time: Math.round(m.elapsed),
  };
  state.screen = 'failed';
  state.wanted = Math.max(state.wanted, 1);
  state.wantedWhole = Math.floor(state.wanted);
  if (state.sound) state.sound.missionFailed();
  return 'failed';
}

export function retryMission(state) {
  const index = state.mission ? state.mission.index : state.missionIndex;
  state.thugs = [];
  state.player.health = 100;
  state.playerDead = false;
  state.screen = 'play';
  startMission(state, index);
}

export function nextMissionLabel(state) {
  if (state.missionIndex >= MISSIONS.length) return 'Story complete';
  const m = MISSIONS[state.missionIndex];
  return `Day ${m.day} — ${m.title} ($${m.payout})`;
}
