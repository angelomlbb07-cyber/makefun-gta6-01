// SOLMAR tuning — every balance number in one place, so a play-test
// can retune the game by editing this file alone.

export const TUNE = {
  walkSpeed: 210,
  runSpeed: 330,
  carAccel: 620,
  carBrake: 900,
  carMaxSpeed: 560,
  carReverseMax: 180,
  carTurn: 2.6,
  offroadFactor: 0.55,
  bulletSpeed: 900,
  bulletRange: 620,
  pistolDamage: 34,
  foeDamage: 9,
  copRamDamage: 12,
  playerHp: 100,
  armourMax: 100,
  nearMissCash: 25,
  driftCash: 15,
  nearMissDist: 46,
  wantedDecay: 1.6, // heat points per second while unseen
  wantedPerSteal: 34,
  wantedPerShot: 6,
  wantedPerKill: 30,
  wantedPerCopKill: 45,
  copSpawnInterval: 4.5,
  maxCopCars: 5,
  maxTraffic: 14,
  maxPeds: 26,
  heliMinStars: 2,
  bustedTouchTime: 1.6,
  missionParBonus: 500,
  respectPerMission: 120,
};

export const PALETTE = {
  grass: '#6da054',
  grassDark: '#5c8f47',
  sand: '#e0c98f',
  water: '#2e7fa8',
  waterDeep: '#1d5f86',
  asphalt: '#3a3a40',
  asphaltLine: '#d8c95a',
  sidewalk: '#8d8d94',
  plaza: '#b9a98a',
  roofA: '#b0563f',
  roofB: '#4f6d8f',
  roofC: '#7a5a8a',
  roofD: '#3f7d5a',
  roofE: '#c98a3f',
  buildingEdge: '#2c2c30',
  carColors: ['#c94f42', '#3f7dc9', '#e0b13c', '#7ac74f', '#e8e8e8', '#2b2b2e', '#8a5fc9', '#d97b2f'],
  taxi: '#f2c200',
  copCar: '#e8e8e8',
  copBlue: '#2456c9',
};

export const RADIO_STATIONS = [
  { name: 'SOL 98.5 — Sunset FM', wave: 'sine', bpm: 96, root: 220.0 },
  { name: 'MARINA 101 — Wave Radio', wave: 'triangle', bpm: 122, root: 261.63 },
  { name: 'PALM 87 — Night Drive', wave: 'sawtooth', bpm: 84, root: 196.0 },
  { name: 'VICE 104 — Street Talk', wave: 'square', bpm: 140, root: 174.61 },
];

export const MOOD_TINTS = {
  golden: { sky: 'rgba(255, 176, 92, 0.10)', ground: 'rgba(255, 190, 110, 0.06)', label: 'GOLDEN HOUR' },
  day: { sky: 'rgba(120, 180, 255, 0.05)', ground: 'rgba(255, 255, 255, 0.0)', label: 'DAY' },
  sunset: { sky: 'rgba(255, 110, 70, 0.16)', ground: 'rgba(255, 120, 60, 0.08)', label: 'SUNSET' },
  night: { sky: 'rgba(10, 16, 60, 0.34)', ground: 'rgba(8, 12, 48, 0.22)', label: 'NIGHT' },
};

export const DAY_MOODS = ['golden', 'day', 'sunset', 'night'];
