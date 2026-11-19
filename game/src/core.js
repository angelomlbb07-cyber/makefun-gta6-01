// SOLMAR core — shared helpers and the single game-state factory.
// Every other module reads helpers from here; nothing here knows about
// rendering, missions or sound, so the state stays easy to reason about.

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const SAVE_KEY = 'solmar-save-v7';

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Deterministic RNG so staged screenshots and replays look identical.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Push a circle entity out of an axis-aligned rectangle. Returns true on hit.
export function pushOutOfRect(e, r) {
  const nx = clamp(e.x, r.x, r.x + r.w);
  const ny = clamp(e.y, r.y, r.y + r.h);
  const dx = e.x - nx;
  const dy = e.y - ny;
  const d2 = dx * dx + dy * dy;
  const rad = e.r || 14;
  if (d2 >= rad * rad) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    e.x = nx + (dx / d) * rad;
    e.y = ny + (dy / d) * rad;
  } else {
    // Centre inside the rect: push out along the smallest penetration.
    const left = e.x - r.x;
    const right = r.x + r.w - e.x;
    const top = e.y - r.y;
    const bottom = r.y + r.h - e.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) e.x = r.x - rad;
    else if (m === right) e.x = r.x + r.w + rad;
    else if (m === top) e.y = r.y - rad;
    else e.y = r.y + r.h + rad;
  }
  return true;
}

export function circleHitsRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// The one and only game state object. boot.js creates it; every system
// reads and writes fields on it, so save/load is a plain JSON snapshot.
export function createState() {
  return {
    mode: 'title', // title | brief | play | paused | passed | failed | over | busted
    frozen: false, // staging: render but do not simulate
    time: 0,
    day: 1,
    mood: 'golden', // golden | day | sunset | night
    money: 250,
    respect: 0,
    level: 1,
    health: 100,
    armour: 0,
    wanted: 0,
    wantedHeat: 0, // 0..100, drives star changes
    ammo: 24,
    reserveAmmo: 120,
    player: {
      x: 1800, y: 1150, angle: -Math.PI / 2, speed: 0,
      onFoot: true, car: null, r: 14, moving: false,
      aim: 0, fireCd: 0, reloadT: 0, hurtT: 0,
    },
    cars: [],
    peds: [],
    foes: [],
    cops: [],
    heli: null,
    bullets: [],
    parts: [],
    floats: [],
    pickups: [],
    missionIdx: 0,
    mission: null,
    missionTime: 0,
    missionLeft: 0,
    shotsFired: 0,
    shotsHit: 0,
    carsDestroyed: 0,
    kills: 0,
    camera: { x: 1800, y: 1150 },
    keys: {},
    mouse: { x: 640, y: 400, down: false, wx: 0, wy: 0 },
    radio: 0,
    radioOn: true,
    notice: '',
    noticeT: 0,
    passed: null,
    failReason: '',
    bustedT: 0,
    stats: { earned: 0, missionsDone: 0 },
    hasSave: false,
  };
}

export function saveGame(G) {
  try {
    const snap = {
      money: G.money, respect: G.respect, level: G.level,
      missionIdx: G.missionIdx, day: G.day,
      health: G.health, armour: G.armour,
      px: G.player.x, py: G.player.y,
      stats: G.stats, savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    /* storage unavailable */
  }
}

export function applySave(G, snap) {
  if (!snap) return;
  G.money = snap.money ?? 250;
  G.respect = snap.respect ?? 0;
  G.level = snap.level ?? 1;
  G.missionIdx = snap.missionIdx ?? 0;
  G.day = snap.day ?? 1;
  G.health = snap.health ?? 100;
  G.armour = snap.armour ?? 0;
  G.player.x = snap.px ?? 1800;
  G.player.y = snap.py ?? 1150;
  G.stats = snap.stats ?? { earned: 0, missionsDone: 0 };
  G.hasSave = true;
}
