// The story: twelve missions for Marco Solis, a driver working for the fixer Marisol Vega,
// plus taxi fares once the city is his. Each mission is a list of steps; a step completes when
// the player reaches its target, steals a car, or holds E long enough to crack the vault.
// Missions run against a timer and end on a MISSION PASSED screen with payout and stats.

import { MISSION_REWARDS, TAXI_FARE } from './config.js';
import { dist } from './random.js';

export const MISSIONS = [
  {
    title: 'First Wheels',
    briefing: "Marisol: You need wheels, Marco. Take any car on the street and bring it to my garage.",
    timeLimit: 240,
    steps: [
      { type: 'steal', text: 'Steal any car (walk up to one and press E)' },
      { type: 'goto', target: 'garage', text: "Drive to Rico's Garage" },
    ],
  },
  {
    title: 'The Pickup',
    briefing: 'Marisol: Eddie Ramos is waiting at the Palmera Hotel. Pick him up, take him to the Marina Restaurant. No trouble.',
    timeLimit: 240,
    steps: [
      { type: 'pickup', target: 'hotel', text: 'Pick up Eddie at the Palmera Hotel' },
      { type: 'deliver', target: 'restaurant', text: 'Drive Eddie to the Marina Restaurant' },
    ],
  },
  {
    title: 'Getaway Driver',
    briefing: 'Marisol: The cops are on us. Lose them and get to the Safehouse — the paint shop clears your heat.',
    timeLimit: 210,
    steps: [
      { type: 'escape', target: 'safehouse', text: 'Escape the police — reach the Safehouse', wanted: 45 },
    ],
  },
  {
    title: 'The Dock Job',
    briefing: 'Marisol: A package waits at Dock 9. Pick it up, deliver it to Warehouse 12. The PD is watching the docks — keep it clean.',
    timeLimit: 240,
    steps: [
      { type: 'pickup', target: 'docks', text: 'Pick up the package at Dock 9', wanted: 12 },
      { type: 'deliver', target: 'warehouse', text: 'Deliver the package to Warehouse 12' },
    ],
  },
  {
    title: 'Sunset Heist',
    briefing: 'Marisol: The Coral Casino. Walk in, crack the vault, and run. The whole city will be on you — get to the boat.',
    timeLimit: 300,
    steps: [
      { type: 'grab', target: 'casino', hold: 3, text: 'Get out of the car, walk into the Coral Casino, hold E to crack the vault' },
      { type: 'escape', target: 'boat', text: 'Escape with the cash — reach the boat at the marina', wanted: 75 },
    ],
  },
  {
    title: 'The Informant',
    briefing: 'Marisol: Our man at Solmar General talks too much. Pick him up before the PD does, hide him at the Safehouse.',
    timeLimit: 240,
    steps: [
      { type: 'pickup', target: 'hospital', text: 'Pick up the informant at Solmar General', wanted: 20 },
      { type: 'deliver', target: 'safehouse', text: 'Get him to the Safehouse, clean' },
    ],
  },
  {
    title: 'Neon Nights',
    briefing: 'Marisol: A high roller at the Coral Casino wants a ride to the Palmera Hotel. No cops, no fuss — he pays double.',
    timeLimit: 210,
    steps: [
      { type: 'pickup', target: 'casino', text: 'Pick up the high roller at the Coral Casino' },
      { type: 'deliver', target: 'hotel', text: 'Drive him to the Palmera Hotel' },
    ],
  },
  {
    title: 'Bank Job',
    briefing: 'Marisol: Warehouse 12 holds the take from the Harbor Bank. Crack it open and run for the boat — the heli will be up.',
    timeLimit: 300,
    steps: [
      { type: 'grab', target: 'warehouse', hold: 3, text: 'Walk into Warehouse 12, hold E to crack the stash' },
      { type: 'escape', target: 'boat', text: 'Escape with the cash — reach the boat at the marina', wanted: 80 },
    ],
  },
  {
    title: 'The Rival',
    briefing: 'Marisol: Rico keeps a Sunset GT at his garage and he owes me. Take it. Bring it to my garage — fast.',
    timeLimit: 210,
    steps: [
      { type: 'steal', kind: 'sports', text: 'Steal a sports car (any red sports car will do)' },
      { type: 'goto', target: 'garage', text: "Drive it to Rico's Garage" },
    ],
  },
  {
    title: 'Harbor Lights',
    briefing: 'Marisol: A crate at Dock 9, a buyer at the Marina Restaurant. The docks are hot tonight — keep your head down.',
    timeLimit: 240,
    steps: [
      { type: 'pickup', target: 'docks', text: 'Pick up the crate at Dock 9', wanted: 30 },
      { type: 'deliver', target: 'restaurant', text: 'Deliver it to the Marina Restaurant' },
    ],
  },
  {
    title: 'The Long Con',
    briefing: 'Marisol: Eddie is waiting at the hotel again, and this time the PD knows. Get him to Warehouse 12 and do not stop.',
    timeLimit: 240,
    steps: [
      { type: 'pickup', target: 'hotel', text: 'Pick up Eddie at the Palmera Hotel', wanted: 35 },
      { type: 'deliver', target: 'warehouse', text: 'Drive Eddie to Warehouse 12' },
    ],
  },
  {
    title: 'King of Solmar',
    briefing: 'Marisol: One last job, Marco. The Coral Casino vault, then the Safehouse. Do this and Solmar is yours.',
    timeLimit: 330,
    steps: [
      { type: 'grab', target: 'casino', hold: 4, text: 'Walk into the Coral Casino, hold E to crack the vault' },
      { type: 'escape', target: 'safehouse', text: 'Escape with the cash — reach the Safehouse', wanted: 85 },
    ],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    holdTimer: 0,
    toast: '',
    toastTimer: 0,
    betweenTimer: 0,
    finished: false,
    taxi: { phase: 'idle', from: null, to: null, fare: 0, timer: 0 },
    storyShown: false,
    timer: 0, // seconds left on the current mission; 0 means no timer running
    passed: null, // the MISSION PASSED screen data, shown for a few seconds after a win
    passedTimer: 0,
    stats: { shotsFired: 0, shotsHit: 0, carsDestroyed: 0, carsStolen: 0, startTime: 0 },
  };
}

export function currentMission(state) {
  const m = state.missions;
  if (m.index >= MISSIONS.length) return null;
  return MISSIONS[m.index];
}

export function currentStep(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.steps[state.missions.step];
}

export function currentTarget(state) {
  const step = currentStep(state);
  if (step && step.target) {
    const lm = state.city.landmarks[step.target];
    return { x: lm.x, y: lm.y, name: lm.name };
  }
  const taxi = state.missions.taxi;
  if (taxi.phase === 'pickup' && taxi.from) return { x: taxi.from.x, y: taxi.from.y, name: 'Fare' };
  if (taxi.phase === 'dropoff' && taxi.to) return { x: taxi.to.x, y: taxi.to.y, name: 'Destination' };
  return null;
}

export function currentObjective(state) {
  const mission = currentMission(state);
  if (mission) {
    const step = currentStep(state);
    return `MISSION ${state.missions.index + 1}/${MISSIONS.length} — ${mission.title} — ${step.text}`;
  }
  const taxi = state.missions.taxi;
  if (taxi.phase === 'pickup') return 'Taxi fare — pick up the passenger';
  if (taxi.phase === 'dropoff') return 'Taxi fare — drive the passenger to the destination';
  return 'Free roam — the city is yours, Marco';
}

function showToast(state, text, seconds) {
  state.missions.toast = text;
  state.missions.toastTimer = seconds;
}

function startStep(state) {
  const step = currentStep(state);
  if (step && step.wanted) {
    state.police.heat = Math.max(state.police.heat, step.wanted);
  }
}

export function startMission(state, index) {
  const m = state.missions;
  m.index = index;
  m.step = 0;
  m.holdTimer = 0;
  m.timer = MISSIONS[index].timeLimit || 0;
  m.passed = null;
  m.passedTimer = 0;
  m.stats = { shotsFired: 0, shotsHit: 0, carsDestroyed: 0, carsStolen: 0, startTime: state.time };
  const mission = MISSIONS[index];
  showToast(state, mission.briefing, 6);
  state.events.briefing = true;
  startStep(state);
}

/** Mission rating from time, accuracy and chaos: 1-4 stars, shown on the passed screen. */
export function missionRating(state, elapsed) {
  const s = state.missions.stats;
  const acc = s.shotsFired > 0 ? s.shotsHit / s.shotsFired : 1;
  let stars = 2;
  if (acc >= 0.5) stars += 1;
  if (elapsed < 120) stars += 1;
  if (s.carsDestroyed >= 3) stars -= 1;
  return Math.max(1, Math.min(4, stars));
}

function completeMission(state) {
  const m = state.missions;
  const mission = MISSIONS[m.index];
  const reward = MISSION_REWARDS[m.index];
  const elapsed = state.time - m.stats.startTime;
  state.player.cash += reward;
  state.player.respect = (state.player.respect || 0) + 120 + m.index * 40;
  state.player.armour = Math.min(100, (state.player.armour || 0) + 10);
  m.passed = {
    title: mission.title,
    payout: reward,
    time: Math.round(elapsed),
    accuracy: m.stats.shotsFired > 0 ? Math.round((100 * m.stats.shotsHit) / m.stats.shotsFired) : 100,
    carsDestroyed: m.stats.carsDestroyed,
    carsStolen: m.stats.carsStolen,
    maxWanted: state.police.stars,
    rating: missionRating(state, elapsed),
    index: m.index,
  };
  m.passedTimer = 6;
  showToast(state, `${mission.title} complete — $${reward} earned`, 5);
  state.events.missionComplete = true;
  state.events.autosave = true;
  m.index += 1;
  m.step = 0;
  m.holdTimer = 0;
  if (m.index >= MISSIONS.length) {
    m.finished = true;
    showToast(state, 'SOLMAR IS YOURS — all twelve missions done. Taxi fares pay the bills now.', 8);
    startTaxi(state);
  } else {
    m.betweenTimer = 2.5;
  }
}

function startTaxi(state) {
  const taxi = state.missions.taxi;
  const lm = state.city.landmarks;
  const spots = [lm.hotel, lm.restaurant, lm.casino, lm.docks, lm.warehouse, lm.garage];
  const from = spots[Math.floor(Math.random() * spots.length)];
  let to = spots[Math.floor(Math.random() * spots.length)];
  if (to === from) to = lm.boat;
  taxi.phase = 'pickup';
  taxi.from = { x: from.x, y: from.y, name: from.name };
  taxi.to = { x: to.x, y: to.y, name: to.name };
  taxi.fare = Math.floor(Math.random() * (TAXI_FARE[1] - TAXI_FARE[0]) + TAXI_FARE[0]);
}

export function stepMissions(state, dt, input) {
  const m = state.missions;
  const { player } = state;
  if (m.toastTimer > 0) m.toastTimer -= dt;
  if (m.betweenTimer > 0) {
    m.betweenTimer -= dt;
    // The MISSION PASSED screen gets its full moment: the next mission waits for it.
    if (m.passedTimer > 0) m.passedTimer -= dt;
    if (m.betweenTimer <= 0 && m.passedTimer <= 0) startMission(state, m.index);
    else if (m.betweenTimer <= 0) m.betweenTimer = 0.01;
    return;
  }
  // Mission timer: out of time and Marisol makes you run it again from the top.
  if (currentMission(state) && m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 0;
      m.step = 0;
      m.holdTimer = 0;
      showToast(state, 'Too slow — Marisol is not happy. Run it again.', 4);
      startMission(state, m.index);
      return;
    }
  }
  const mission = currentMission(state);
  if (!mission) {
    // Free roam: taxi fares.
    const taxi = m.taxi;
    if (taxi.phase === 'pickup' && taxi.from && dist(player.x, player.y, taxi.from.x, taxi.from.y) < 70) {
      taxi.phase = 'dropoff';
      showToast(state, `Passenger in — drive to ${taxi.to.name} ($${taxi.fare})`, 4);
      state.events.pickup = true;
    } else if (taxi.phase === 'dropoff' && taxi.to && dist(player.x, player.y, taxi.to.x, taxi.to.y) < 70) {
      player.cash += taxi.fare;
      showToast(state, `Fare paid — $${taxi.fare}`, 4);
      state.events.missionComplete = true;
      state.events.autosave = true;
      taxi.timer = 2;
      taxi.phase = 'idle';
    } else if (taxi.phase === 'idle') {
      taxi.timer -= dt;
      if (taxi.timer <= 0) startTaxi(state);
    }
    return;
  }
  const step = currentStep(state);
  if (!step) return;
  if (step.type === 'steal') {
    // A steal step with a kind wants that kind of car (The Rival wants a sports car).
    if (player.car && (!step.kind || player.car.kind === step.kind)) {
      m.step += 1;
      state.events.pickup = true;
      if (m.step >= mission.steps.length) completeMission(state);
    }
    return;
  }
  if (step.type === 'grab') {
    const lm = state.city.landmarks[step.target];
    const near = dist(player.x, player.y, lm.x, lm.y) < 70;
    if (near && player.onFoot && input.isDown('KeyE')) {
      m.holdTimer += dt;
      if (m.holdTimer >= step.hold) {
        m.holdTimer = 0;
        state.events.pickup = true;
        showToast(state, 'Vault cracked — $4,000 in the bag. RUN!', 4);
        m.step += 1;
        startStep(state);
      }
    } else {
      m.holdTimer = Math.max(0, m.holdTimer - dt * 2);
    }
    return;
  }
  const lm = state.city.landmarks[step.target];
  if (dist(player.x, player.y, lm.x, lm.y) < 80) {
    if (step.type === 'escape' && step.target === 'safehouse') {
      state.police.heat = 0;
      state.police.stars = 0;
    }
    if (step.type === 'pickup' || step.type === 'deliver' || step.type === 'goto' || step.type === 'escape') {
      state.events.pickup = true;
    }
    m.step += 1;
    if (m.step >= mission.steps.length) {
      completeMission(state);
    } else {
      startStep(state);
    }
  }
}
