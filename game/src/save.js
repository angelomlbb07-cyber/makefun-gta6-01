// SOLMAR save: localStorage autosave after each mission, with validation.
// F8 fix: a save whose mission index is out of range (or not an integer)
// is rejected — loadGame returns null instead of crashing Continue.

const SAVE_KEY = 'solmar-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      cash: Math.floor(state.cash),
      respect: Math.floor(state.respect),
      missionIndex: state.missions.index,
      day: state.day,
      garage: state.garage,
      playerX: Math.floor(state.player.x),
      playerY: Math.floor(state.player.y),
      health: Math.floor(state.player.health),
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.saveSlot = data;
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (typeof data.cash !== 'number' || !Number.isFinite(data.cash)) return null;
    // F8: mission index must be a valid integer inside the story range.
    if (!Number.isInteger(data.missionIndex) || data.missionIndex < 0 || data.missionIndex > 12) return null;
    if (typeof data.respect !== 'number' || !Number.isFinite(data.respect)) return null;
    if (data.day !== undefined && (!Number.isInteger(data.day) || data.day < 1 || data.day > 3)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
