// Saving: the player's progress lives in localStorage, this browser only. A save holds cash,
// the mission reached, where the player stands, the time of day and the best cash earned,
// plus the garage upgrades, the guns and the respect earned so far.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      cash: Math.floor(state.player.cash),
      missionIndex: state.missions.index,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      minutes: Math.floor(state.clockMinutes),
      best: Math.floor(state.best),
      day: state.day,
      respect: Math.floor(state.player.respect || 0),
      armour: Math.floor(state.player.armour || 0),
      weapon: state.player.weapon,
      ammoPistol: state.player.ammoPistol,
      reservePistol: state.player.reservePistol,
      ammoSmg: state.player.ammoSmg,
      reserveSmg: state.player.reserveSmg,
      garage: {
        engine: state.garage.engine, armour: state.garage.armour,
        tyres: state.garage.tyres, nitro: state.garage.nitro,
      },
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
