// tuning.js — every constant and balance number for SOLMAR lives here.
// One job: numbers. No drawing, no input, no state. The other modules read
// these values so a balance change is a one-line edit in one place.

// Canvas the game renders at (CSS pixels; the page letterboxes it).
export const VIEW = { width: 1280, height: 800 };

// The city is bigger than the screen; the camera follows the player.
export const WORLD = { width: 3600, height: 2600, seaEdge: 260, beachEdge: 430 };

// Driving — arcade physics, tuned so a chase at 150+ km/h feels fast but
// a taxi mission at 60 km/h is still controllable.
export const CAR = {
  accel: 420,            // px/s^2 forward
  reverseAccel: 260,
  brake: 620,
  maxSpeed: 560,         // ~155 km/h at the speedometer's scale
  maxReverse: 180,
  turnRate: 2.6,         // rad/s at full lock, scaled down at speed
  grip: 6.5,             // lateral velocity damping (lower = more slide)
  driftGrip: 2.2,        // grip while the handbrake is held
  handbrakeTurn: 3.4,
  nitroBoost: 1.3,       // top-speed multiplier while nitro lasts
  nitroMax: 3.0,         // seconds of nitro per full tank
  damagePerHit: 9,       // car damage from a hard collision
  smokeAt: 55,           // damage % where the car starts smoking
  wreckAt: 100,          // damage % where the car is wrecked
};

// On foot.
export const FOOT = {
  walkSpeed: 170,
  runSpeed: 250,
  punchDamage: 12,
};

// Combat.
export const GUN = {
  pistol: { damage: 34, rate: 0.28, spread: 0.06, range: 520, mag: 12, reserve: 72 },
  smg: { damage: 18, rate: 0.09, spread: 0.11, range: 460, mag: 30, reserve: 120 },
};

// Wanted level. Foot cops show up at 1 star, patrol cars at 2+, the police
// helicopter with its searchlight at 2+. Heat decays only when no cop can
// see the player (line of sight broken).
export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  decayPerSecond: 14,    // heat lost while unseen
  seenGrace: 1.2,        // seconds of being unseen before decay starts
  bustTime: 1.5,         // seconds a foot cop must stay close to bust you
  bustFine: 150,
  wastedFine: 100,
  copCarSpeed: 500,
  heliSpeed: 340,
  heliSpotRadius: 170,
};

// Money and progression.
export const ECONOMY = {
  startCash: 150,
  nearMissCash: 150,     // "+$150 NEAR MISS" floating text
  driftCashPerChain: 25, // per drift multiplier step
  respectPerLevel: 500,  // respect points per level
  repairCost: 120,
  armourCost: 200,
  upgradeCost: 450,
  maxArmour: 100,
};

// Missions: 12 story jobs across 3 days. Payouts grow with the day.
export const MISSION_PAYOUTS = [300, 450, 500, 600, 750, 900, 1500, 1200, 1300, 1800, 2200, 5000];
export const MISSION_RESPECT = [120, 150, 150, 180, 200, 220, 250, 220, 240, 300, 350, 600];

// Radio — four procedural stations, all synthesized with WebAudio.
export const RADIO = [
  { name: 'SOL FM 95.4', genre: 'SUNSET SYNTH', bpm: 96 },
  { name: 'CORAL 88.1', genre: 'PALM POP', bpm: 118 },
  { name: 'NEON TIDE 99.1', genre: 'NIGHT DRIVE', bpm: 104 },
  { name: 'MARINA TALK 101.7', genre: 'CITY TALK', bpm: 80 },
];

// --- small utilities shared by every module -------------------------------

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleDiff(a, b) { return wrapAngle(b - a); }

// Deterministic RNG so the city (and staged screenshots) are reproducible.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtClock(hours) {
  const total = Math.round(hours * 60); // round first: 18.2 floats as 18.1999…
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function fmtTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function stars(n) { return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); }
