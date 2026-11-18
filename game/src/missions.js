// SOLMAR missions: 12 story jobs for fixer Marisol Vega.
// F1 fix: passedTimer is decremented unconditionally at the top of
// stepMissions, so the PASSED panel always dismisses — even after mission 12.
// F2 fix: startMission clamps the index; past the last mission the game
// stays in finished free-roam instead of indexing past the array.
// F14 fix: accuracy shows a dash when zero shots were fired.

import { landmark } from './city.js';
import { formatTime } from './random.js';
import { addCash, addRespect, setToast } from './state.js';
import { playMissionStart, playMissionPassed } from './audio.js';

export const MISSIONS = [
  { name: 'First Wheels', giver: 'Marisol Vega', timeLimit: 240, payout: 300,
    briefing: 'Marisol: Steal a car and bring it to Benny\u2019s Garage. Any car. Don\u2019t ask.',
    steps: [{ text: 'Steal any car and drive to Benny\u2019s Garage', x: 2100, y: 1250, kind: 'car' }] },
  { name: 'Sunset Taxi', giver: 'Marisol Vega', timeLimit: 300, payout: 350,
    briefing: 'Marisol: A fare is waiting at Palmline Beach. Drive them to Neon Row. No shortcuts through the sea.',
    steps: [
      { text: 'Pick up the fare at Palmline Beach', x: 1800, y: 2320, kind: 'go' },
      { text: 'Drop the fare off at Neon Row', x: 3000, y: 1200, kind: 'go' },
    ] },
  { name: 'Dockside Pickup', giver: 'Marisol Vega', timeLimit: 300, payout: 400,
    briefing: 'Marisol: A package is waiting at the Marina Docks. Grab it and bring it to the Safehouse.',
    steps: [
      { text: 'Collect the package at the Marina Docks', x: 420, y: 420, kind: 'go' },
      { text: 'Deliver the package to the Safehouse', x: 1500, y: 1150, kind: 'go' },
    ] },
  { name: 'Neon Nights', giver: 'Benny Torres', timeLimit: 360, payout: 450,
    briefing: 'Benny: My boys left a car at Neon Row. Fetch it, then lose the cops if they notice you.',
    steps: [
      { text: 'Fetch Benny\u2019s car at Neon Row', x: 3000, y: 1200, kind: 'car' },
      { text: 'Lose the heat — get your wanted level to zero', x: 1500, y: 1150, kind: 'escape', survive: 20 },
    ] },
  { name: 'Market Run', giver: 'Marisol Vega', timeLimit: 300, payout: 500,
    briefing: 'Marisol: The Old Market stall has my cut. Pick it up, then drop it at the hospital. Quietly.',
    steps: [
      { text: 'Pick up the cut at the Old Market', x: 1500, y: 700, kind: 'go' },
      { text: 'Drop the cut at Solmar General', x: 2600, y: 500, kind: 'go' },
    ] },
  { name: 'Pier Pressure', giver: 'Dario Cruz', timeLimit: 360, payout: 550,
    briefing: 'Dario: Rivals own the Sunset Pier. Clear them out, then hold the pier for me.',
    steps: [
      { text: 'Clear the rivals off Sunset Pier', x: 900, y: 2380, kind: 'kill', count: 3 },
      { text: 'Hold the pier — stand on the mark and hold E', x: 900, y: 2380, kind: 'hold', hold: 4 },
    ] },
  { name: 'Sunset Heist', giver: 'Marisol Vega', timeLimit: 420, payout: 800,
    briefing: 'Marisol: The Coral Casino vault. Walk in on foot, hold E to crack it, then get out before the cops swarm.',
    steps: [
      { text: 'Get out of the car, walk into the Coral Casino, hold E to crack the vault', x: 1800, y: 1850, kind: 'hold', hold: 4 },
      { text: 'Escape to the Safehouse with the loot', x: 1500, y: 1150, kind: 'go' },
    ] },
  { name: 'Airfield Run', giver: 'Benny Torres', timeLimit: 360, payout: 650,
    briefing: 'Benny: A crate lands at the Airfield. Be there when it does, then drive it to the Docks.',
    steps: [
      { text: 'Reach the Solmar Airfield', x: 3200, y: 300, kind: 'go' },
      { text: 'Drive the crate to the Marina Docks', x: 420, y: 420, kind: 'go' },
    ] },
  { name: 'Hillcrest Job', giver: 'Dario Cruz', timeLimit: 420, payout: 750,
    briefing: 'Dario: A Hillcrest mansion, a safe, three guards. Handle the guards, crack the safe, leave rich.',
    steps: [
      { text: 'Deal with the Hillcrest guards', x: 2400, y: 400, kind: 'kill', count: 3 },
      { text: 'Crack the mansion safe — hold E', x: 2400, y: 400, kind: 'hold', hold: 4 },
    ] },
  { name: 'Casino Royale', giver: 'Marisol Vega', timeLimit: 420, payout: 900,
    briefing: 'Marisol: The casino boss wants a word. Drive to the Coral Casino, settle it, and don\u2019t come back empty.',
    steps: [
      { text: 'Drive to the Coral Casino', x: 1800, y: 1850, kind: 'go' },
      { text: 'Settle the score at the casino', x: 1800, y: 1850, kind: 'kill', count: 3 },
    ] },
  { name: 'The Long Chase', giver: 'Benny Torres', timeLimit: 480, payout: 1000,
    briefing: 'Benny: The cops want my car back. Drive it from the Docks to the Airfield with the whole city chasing you.',
    steps: [
      { text: 'Grab the car at the Marina Docks', x: 420, y: 420, kind: 'car' },
      { text: 'Outrun the chase to the Solmar Airfield', x: 3200, y: 300, kind: 'go' },
    ] },
  { name: 'King of Solmar', giver: 'Marisol Vega', timeLimit: 480, payout: 1500,
    briefing: 'Marisol: One last job. The vault under Neon Row. Crack it, survive the heat, and Solmar is yours.',
    steps: [
      { text: 'Reach the Neon Row vault', x: 3000, y: 1200, kind: 'go' },
      { text: 'Crack the vault — hold E, four seconds', x: 3000, y: 1200, kind: 'hold', hold: 4 },
      { text: 'Escape to the Safehouse. King of Solmar.', x: 1500, y: 1150, kind: 'go' },
    ] },
];

export function missionCount() { return MISSIONS.length; }

export function currentMission(state) {
  const m = state.missions;
  if (m.index >= MISSIONS.length) return null;
  return MISSIONS[m.index];
}

export function currentStep(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.steps[Math.min(state.missions.step, mission.steps.length - 1)];
}

// F2: clamp the index. Past the last mission, stay in finished free-roam.
export function startMission(state, index) {
  const m = state.missions;
  m.betweenTimer = 0;
  m.passedTimer = 0;
  m.passed = null;
  if (index >= MISSIONS.length) {
    m.index = MISSIONS.length;
    m.finished = true;
    m.objective = 'Story complete — free roam Solmar. Day ' + state.day + '.';
    return false;
  }
  if (index < 0) index = 0;
  m.index = index;
  m.step = 0;
  m.finished = false;
  const mission = MISSIONS[index];
  m.timer = mission.timeLimit;
  m.stats = { shots: 0, hits: 0, carsStolen: 0, carsDestroyed: 0, startTime: state.time, earned: 0 };
  m.holdProgress = 0;
  m.rivalsLeft = 0;
  m.stepStarted = false;
  m.objective = mission.steps[0].text;
  setToast(state, mission.giver + ': ' + mission.briefing, 5);
  playMissionStart();
  return true;
}

function beginStep(state) {
  const m = state.missions;
  const step = currentStep(state);
  if (!step) return;
  m.stepStarted = true;
  m.holdProgress = 0;
  m.objective = step.text;
  if (step.kind === 'kill') {
    m.rivalsLeft = step.count || 3;
    for (let i = 0; i < m.rivalsLeft; i++) {
      const a = (i / m.rivalsLeft) * Math.PI * 2;
      state.footCops.push({
        x: step.x + Math.cos(a) * 120, y: step.y + Math.sin(a) * 120,
        angle: 0, hp: 50, punchCooldown: 0, bustTimer: 0, rival: true,
      });
    }
    setToast(state, 'Rivals ahead — take them down!', 3);
  }
  if (step.kind === 'escape') {
    state.wanted = Math.max(state.wanted, 2);
    state.heat = state.wanted;
    m.escapeTimer = step.survive || 15;
  }
}

function advanceStep(state) {
  const m = state.missions;
  const mission = currentMission(state);
  m.step++;
  m.stepStarted = false;
  m.holdProgress = 0;
  if (m.step >= mission.steps.length) {
    completeMission(state);
  } else {
    m.objective = mission.steps[m.step].text;
  }
}

export function missionRating(state) {
  const s = state.missions.stats;
  const acc = s.shots > 0 ? s.hits / s.shots : null;
  const elapsed = state.time - s.startTime;
  let score = 50;
  if (acc !== null) score += acc * 30;
  if (elapsed < 120) score += 15;
  else if (elapsed < 240) score += 8;
  score -= s.carsDestroyed * 2;
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  return 'C';
}

export function accuracyText(state) {
  const s = state.missions.stats;
  if (s.shots === 0) return '-';
  return Math.round((s.hits / s.shots) * 100) + '%';
}

function completeMission(state) {
  const m = state.missions;
  const mission = currentMission(state);
  const elapsed = state.time - m.stats.startTime;
  const payout = mission.payout;
  addCash(state, payout);
  addRespect(state, 120);
  m.stats.earned = payout;
  m.passed = {
    name: mission.name,
    payout,
    time: formatTime(elapsed),
    accuracy: accuracyText(state),
    rating: missionRating(state),
    carsDestroyed: m.stats.carsDestroyed,
    carsStolen: m.stats.carsStolen,
    respect: 120,
    next: m.index + 1 < MISSIONS.length ? MISSIONS[m.index + 1].name : null,
    nextGiver: m.index + 1 < MISSIONS.length ? MISSIONS[m.index + 1].giver : null,
  };
  m.passedTimer = 6;
  playMissionPassed();
  // F1: betweenTimer only exists when there IS a next mission.
  if (m.index + 1 < MISSIONS.length) {
    m.betweenTimer = 2.5;
  } else {
    m.finished = true;
    m.betweenTimer = 0;
  }
}

export function stepMissions(state, dt, input) {
  const m = state.missions;
  // F1: decrement the passed timer unconditionally, at the top, so the
  // PASSED panel always dismisses — including after the final mission.
  if (m.passedTimer > 0) {
    m.passedTimer -= dt;
    if (m.passedTimer <= 0) {
      m.passedTimer = 0;
      m.passed = null;
    }
  }
  if (m.toastTimer > 0) m.toastTimer -= dt;
  if (m.finished || m.index >= MISSIONS.length) return;
  const mission = MISSIONS[m.index];
  if (m.betweenTimer > 0) {
    m.betweenTimer -= dt;
    if (m.betweenTimer <= 0) {
      m.betweenTimer = 0;
      m.index++;
      if (m.index >= MISSIONS.length) {
        m.finished = true;
        m.objective = 'Story complete — free roam Solmar.';
        return;
      }
      startMission(state, m.index);
    }
    return;
  }
  if (m.passed) return;
  m.timer -= dt;
  if (m.timer <= 0) {
    setToast(state, 'Out of time — mission failed. Try again.', 4);
    startMission(state, m.index);
    return;
  }
  if (!m.stepStarted) beginStep(state);
  const step = mission.steps[m.step];
  const p = state.player;
  if (!p || !step) return;
  const d = Math.hypot(p.x - step.x, p.y - step.y);
  if (step.kind === 'go' || step.kind === 'car') {
    if (step.kind === 'car' && !p.car) {
      // Reach the spot on foot first; the car step completes in a car.
      if (d < 80) m.objective = step.text + ' (get in a car!)';
    } else if (d < 80) {
      advanceStep(state);
    }
  } else if (step.kind === 'hold') {
    if (d < 80 && input.enterCar) {
      m.holdProgress += dt;
      if (m.holdProgress >= (step.hold || 3)) advanceStep(state);
    } else {
      m.holdProgress = Math.max(0, m.holdProgress - dt * 0.5);
    }
  } else if (step.kind === 'kill') {
    m.rivalsLeft = state.footCops.filter((c) => c.rival).length;
    if (m.rivalsLeft <= 0) advanceStep(state);
  } else if (step.kind === 'escape') {
    if (state.wanted <= 0) {
      advanceStep(state);
    } else {
      m.escapeTimer -= dt;
      if (m.escapeTimer <= 0) {
        state.wanted = 0; state.heat = 0;
        advanceStep(state);
      }
    }
  }
}

export function missionTarget(state) {
  const step = currentStep(state);
  if (!step || state.missions.passed) return null;
  return { x: step.x, y: step.y };
}

export { landmark };
