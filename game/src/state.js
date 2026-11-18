// SOLMAR game state: one factory builds a fresh world; one job only.
// Everything the loop, the renderer and the missions share lives here.

import { SCREEN, START_CASH, MAX_DAY } from './config.js';

export function createState() {
  return {
    screen: SCREEN.TITLE,
    titleChoice: 0,
    pausedFrom: SCREEN.PLAY,
    time: 0,
    clockMinutes: 8 * 60 + 12,
    day: 1,
    maxDay: MAX_DAY,
    cash: START_CASH,
    respect: 0,
    respectLevel: 1,
    wanted: 0,
    heat: 0,
    camera: { x: 1800, y: 1300 },
    player: null,
    cars: [],
    peds: [],
    copCars: [],
    footCops: [],
    heli: { x: 0, y: 0, active: false, angle: 0 },
    roadblocks: [],
    bullets: [],
    particles: [],
    floaters: [],
    missions: {
      index: 0,
      step: 0,
      timer: 0,
      passed: null,
      passedTimer: 0,
      betweenTimer: 0,
      finished: false,
      stats: { shots: 0, hits: 0, carsStolen: 0, carsDestroyed: 0, startTime: 0, earned: 0 },
      toast: '',
      toastTimer: 0,
      objective: '',
    },
    radio: { station: 0, muted: false },
    garage: { turbo: false, armour: false, tyres: false, nitro: false },
    events: { wasted: false, busted: false },
    overKind: '',
    overTimer: 0,
    taxiFare: 0,
    driftCash: 0,
    nearMissCash: 0,
    seed: 20261118,
    shotMode: null,
    shotReady: false,
    saveSlot: null,
    message: '',
    messageTimer: 0,
  };
}

export function respectForLevel(level) {
  return (level - 1) * 250;
}

export function levelFromRespect(respect) {
  return Math.min(10, 1 + Math.floor(respect / 250));
}

export function addRespect(state, amount) {
  state.respect += amount;
  state.respectLevel = levelFromRespect(state.respect);
}

export function addCash(state, amount, label) {
  state.cash += amount;
  if (label) {
    state.floaters.push({ x: state.player ? state.player.x : 0, y: state.player ? state.player.y - 30 : 0, text: label, timer: 1.6, color: '#7dff8a' });
  }
}

export function setToast(state, text, seconds) {
  state.missions.toast = text;
  state.missions.toastTimer = seconds || 4;
}

export function resetRunFlags(state) {
  state.events.wasted = false;
  state.events.busted = false;
  state.overKind = '';
  state.overTimer = 0;
  state.missions.passed = null;
  state.missions.passedTimer = 0;
  state.missions.betweenTimer = 0;
}
