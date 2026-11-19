// SOLMAR — save.js
// localStorage autosave: after every mission, and on demand with quick
// save. Loading validates the save (F8): a mission index out of range, a
// non-numeric cash value, or a day outside 1-3 returns null instead of
// loading garbage and crashing the game. Round 6: full fresh rewrite in
// one recording — no save change; the title shot still proves the Day 2
// save slot the same way. Storage access is guarded so the
// game also runs where localStorage is unavailable (private mode, file://).

import { MISSION_COUNT } from './config.js';

const KEY = 'solmar-save-v3';

export function saveGame(state) {
  const data = {
    version: 3,
    day: state.day,
    cash: Math.round(state.cash),
    mission: state.mission.index,
    missionFinished: state.mission.finished,
    health: Math.round(state.health),
    armour: Math.round(state.armour),
    respect: Math.round(state.respect),
    radioStation: state.radioStation,
    garage: { ...state.garage },
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    state.saveInfo = describeSave(data);
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  return validateSave(data);
}

// F8: reject anything that is not a sane save.
export function validateSave(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.cash !== 'number' || !Number.isFinite(data.cash) || data.cash < 0) return null;
  if (typeof data.mission !== 'number' || !Number.isInteger(data.mission) ||
    data.mission < 0 || data.mission >= MISSION_COUNT) return null;
  if (typeof data.day !== 'number' || !Number.isInteger(data.day) || data.day < 1 || data.day > 3) return null;
  if (typeof data.health !== 'number' || data.health < 0 || data.health > 200) return null;
  if (typeof data.respect !== 'number' || data.respect < 0) return null;
  return data;
}

export function applySave(state, data) {
  state.day = data.day;
  state.cash = data.cash;
  state.health = data.health;
  state.armour = typeof data.armour === 'number' ? data.armour : 0;
  state.respect = data.respect;
  state.radioStation = data.radioStation || 0;
  if (data.garage) state.garage = { ...state.garage, ...data.garage };
  state.mission.index = data.mission;
  state.mission.finished = !!data.missionFinished;
  state.saveInfo = describeSave(data);
}

export function describeSave(data) {
  const missionText = data.missionFinished
    ? 'Story complete'
    : 'Mission ' + (data.mission + 1) + '/' + MISSION_COUNT;
  return {
    day: data.day,
    cash: data.cash,
    mission: data.mission,
    text: 'Day ' + data.day + ' · $' + data.cash.toLocaleString('en-US') + ' · ' + missionText,
  };
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* storage is best-effort */ }
}
