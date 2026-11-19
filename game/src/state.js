// SOLMAR — state.js
// The single game state object and the only functions allowed to change the
// player's health, cash and respect. Every damage source in the game — cop
// rams, foot-cop punches, gang bullets, crashes — must go through
// damagePlayer, because it is the only place that sets events.wasted. That
// is the F3 fix: no direct health subtraction anywhere else.
// Respect levels, cash, wanted level and the floating score texts live here.
// Round 6: full fresh rewrite in one recording — no state change; the kill
// counter the combat banner shows is the mission stats already tracked here.

import { levelForRespect, MAX_WANTED, START_CASH } from './config.js';
import { clamp } from './random.js';

// A fresh game state. seed drives the city generator and all spawns.
export function createGameState(seed) {
  return {
    seed,
    mode: 'title', // title | play | pause | passed | wasted | busted | howto | missions
    time: 8 * 60 + 14, // minutes since midnight; staged shots override this
    timeOfDay: 'day',
    day: 1,
    cash: START_CASH,
    wanted: 0,
    wantedHeat: 0, // 0..1, fills while committing crimes, drains while quiet
    health: 100,
    maxHealth: 100,
    armour: 0,
    maxArmour: 100,
    respect: 0,
    respectLevel: 1,
    nitro: 100,
    maxNitro: 100,
    radioStation: 0,
    muted: false,
    garage: { turbo: 0, armour: 0, tyres: 0, nitro: 0 },
    player: null, // set by player.js createPlayer
    cars: [], // traffic + parked cars, each {id, def, x, y, angle, speed, hp, driver}
    peds: [], // pedestrians, each {x, y, angle, speed, colour, fleeing}
    cops: [], // police cars chasing the player
    footCops: [], // foot cops chasing / punching / busting
    roadblocks: [], // {x, y, angle} placed ahead of the player at 3+ stars
    heli: null, // {x, y, angle} police helicopter at 2+ stars
    enemies: [], // armed gang members for combat missions
    bullets: [], // player tracers in flight {x1,y1,x2,y2,life}
    muzzle: [], // muzzle flash markers {x, y, angle, life}
    floats: [], // floating score texts {x, y, text, life, colour}
    pickups: [], // mission packages / collectibles {x, y, kind, taken}
    camera: { x: 1600, y: 1200, zoom: 1 },
    mission: {
      index: 0,
      step: 0,
      active: false,
      finished: false,
      timer: 0, // seconds left on the current mission
      objective: '',
      passed: false,
      passedTimer: 0, // counts down while the passed panel shows
      betweenTimer: 0, // gap between missions
      stats: { shots: 0, hits: 0, carsDestroyed: 0, carsStolen: 0, time: 0 },
      last: null, // last completed mission's report for the passed panel
    },
    dialogue: null, // {name, text, colour, timer}
    toast: null, // {text, timer} briefing toast, drawn below the banner
    events: { wasted: false, busted: false, passed: false },
    invuln: 0, // seconds of invulnerability after a hit (F11)
    playTime: 0,
    shot: null, // staged screenshot name, or null in live play
    ready: false, // set once a staged shot has painted
    saveInfo: null, // {day, cash, mission, text} shown on the title menu
  };
}

// The central damage function. Armour absorbs 60% of every hit. When health
// reaches zero the player is WASTED: hp clamps at 0, the event fires, and the
// mode flips to the wasted screen. Returns true when damage was applied.
export function damagePlayer(state, amount, source) {
  if (!state || state.events.wasted || state.mode === 'wasted') return false;
  if (state.invuln > 0) return false;
  if (amount <= 0) return false;
  const absorbed = Math.min(state.armour, amount * 0.6);
  state.armour -= absorbed;
  const hpDamage = amount - absorbed;
  state.health = Math.max(0, state.health - hpDamage);
  state.invuln = 0.6;
  addFloat(state, state.player ? state.player.x : state.camera.x,
    state.player ? state.player.y - 30 : state.camera.y, '-' + Math.round(hpDamage), '#ff5a5a');
  if (state.health <= 0) {
    state.health = 0;
    state.events.wasted = true;
    state.mode = 'wasted';
    state.wanted = Math.max(0, state.wanted - 1);
  }
  return true;
}

export function healPlayer(state, amount) {
  state.health = clamp(state.health + amount, 0, state.maxHealth);
}

export function addCash(state, amount, why) {
  state.cash = Math.max(0, state.cash + amount);
  if (amount > 0 && state.player) {
    addFloat(state, state.player.x, state.player.y - 44,
      '+' + '$' + Math.round(amount) + (why ? ' ' + why : ''), '#ffd94d');
  }
  return state.cash;
}

// Respect gain. Returns {levelUp, level} so the passed panel can shout
// LEVEL UP when the gain crosses a level boundary.
export function addRespect(state, amount) {
  const before = state.respectLevel;
  state.respect = Math.max(0, state.respect + amount);
  state.respectLevel = levelForRespect(state.respect);
  return { levelUp: state.respectLevel > before, level: state.respectLevel, before };
}

export function setWanted(state, level, reason) {
  const next = clamp(Math.round(level), 0, MAX_WANTED);
  if (next > state.wanted && reason) {
    showToast(state, 'WANTED LEVEL ' + next + ' — ' + reason);
  }
  state.wanted = next;
  state.wantedHeat = next > 0 ? 0.5 : 0;
}

export function raiseHeat(state, amount) {
  state.wantedHeat = clamp(state.wantedHeat + amount, 0, 1);
  if (state.wantedHeat >= 1 && state.wanted < MAX_WANTED) {
    setWanted(state, state.wanted + 1, 'The heat is on.');
    state.wantedHeat = 0.4;
  }
}

export function showDialogue(state, name, text, colour) {
  state.dialogue = { name, text, colour: colour || '#ff9ecf', timer: 6 };
}

export function showToast(state, text) {
  // The toast is never shown while the passed panel is up; the panel owns
  // the screen then (P0 defect fix from the round-2 gap analysis).
  if (state.mission.passedTimer > 0 || state.mission.passed) return;
  state.toast = { text, timer: 5 };
}

export function addFloat(state, x, y, text, colour) {
  state.floats.push({ x, y, text, life: 1.6, colour: colour || '#ffd94d' });
  if (state.floats.length > 24) state.floats.shift();
}

export function tickFloats(state, dt) {
  for (const f of state.floats) {
    f.life -= dt;
    f.y -= 26 * dt;
  }
  state.floats = state.floats.filter((f) => f.life > 0);
  for (const b of state.bullets) b.life -= dt;
  state.bullets = state.bullets.filter((b) => b.life > 0);
  for (const m of state.muzzle) m.life -= dt;
  state.muzzle = state.muzzle.filter((m) => m.life > 0);
  if (state.dialogue) {
    state.dialogue.timer -= dt;
    if (state.dialogue.timer <= 0) state.dialogue = null;
  }
  if (state.toast) {
    state.toast.timer -= dt;
    if (state.toast.timer <= 0) state.toast = null;
  }
  if (state.invuln > 0) state.invuln -= dt;
}
