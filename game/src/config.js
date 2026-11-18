// SOLMAR configuration: world size, districts, cars, radio, garage, tuning.
// One job: every number the rest of the game shares lives here.

export const WORLD = { width: 3600, height: 2600, roadGap: 400, blockSize: 280 };
export const VIEW = { width: 1280, height: 800 };
export const SCREEN = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSE: 'pause',
  OVER: 'over',
  GARAGE: 'garage',
  HOWTO: 'howto',
  MISSIONS: 'missions',
};

export const DISTRICTS = [
  { name: 'PALMLINE BEACH', flavour: 'SUN, SAND AND BAD DECISIONS', x0: 0, y0: 2100, x1: 3600, y1: 2600, sand: true },
  { name: 'CORAL STRIP', flavour: 'BEACHFRONT HOTELS', x0: 0, y0: 1600, x1: 1200, y1: 2100 },
  { name: 'MARINA DOCKS', flavour: 'CRATES, CRANES AND QUIET DEALS', x0: 0, y0: 0, x1: 800, y1: 800 },
  { name: 'OLD SOLMAR', flavour: 'NARROW STREETS, OLD MONEY', x0: 1200, y0: 800, x1: 2400, y1: 1600 },
  { name: 'NEON ROW', flavour: 'NEON, NOISE AND NIGHTLIFE', x0: 2400, y0: 800, x1: 3600, y1: 1600 },
  { name: 'HILLCREST', flavour: 'BIG HOUSES, BIGGER SECRETS', x0: 800, y0: 0, x1: 3600, y1: 800 },
  { name: 'CORAL CASINO', flavour: 'THE HOUSE ALWAYS WINS', x0: 1200, y0: 1600, x1: 2400, y1: 2100 },
];

export const CAR_DEFS = [
  { name: 'Solmar Comet', color: '#e8b23a', topSpeed: 320, accel: 260, grip: 3.2, hp: 100 },
  { name: 'Coral Cruiser', color: '#3a86d8', topSpeed: 260, accel: 200, grip: 2.8, hp: 120 },
  { name: 'Neon Runner', color: '#d84a7a', topSpeed: 360, accel: 300, grip: 3.0, hp: 90 },
  { name: 'Dock Hauler', color: '#7a7f85', topSpeed: 210, accel: 160, grip: 2.4, hp: 180 },
  { name: 'Sunset Taxi', color: '#f2c230', topSpeed: 280, accel: 220, grip: 2.9, hp: 110 },
];

export const RADIO_STATIONS = [
  { name: 'SOL FM', freq: '101.1', mood: 'sunny pop', bpm: 112 },
  { name: 'CORAL 88.1', freq: '88.1', mood: 'late-night jazz', bpm: 84 },
  { name: '99.1 NEON TIDE', freq: '99.1', mood: 'synthwave drive', bpm: 128 },
  { name: 'PALM TALK 540', freq: '540 AM', mood: 'talk radio', bpm: 0 },
];

export const GARAGE_UPGRADES = [
  { id: 'turbo', name: 'Turbo', cost: 800, desc: '+18% top speed' },
  { id: 'armour', name: 'Armour Plating', cost: 600, desc: '+60 car HP' },
  { id: 'tyres', name: 'Grip Tyres', cost: 500, desc: 'tighter handling' },
  { id: 'nitro', name: 'Nitro Kit', cost: 700, desc: 'Shift = nitro boost' },
];

export const WEAPONS = {
  fists: { name: 'FISTS', damage: 8, rate: 0.35, range: 46, auto: false },
  pistol: { name: 'PISTOL', damage: 22, rate: 0.28, range: 420, auto: false, mag: 12 },
  smg: { name: 'SMG', damage: 14, rate: 0.09, range: 380, auto: true, mag: 30 },
};

export const WANTED = {
  decayPerSecond: 0.045,
  copCarSpeed: 300,
  heliMinStars: 2,
  roadblockMinStars: 3,
  bustFine: 150,
  wastedFine: 100,
  ramDamage: 14,
  punchDamage: 8,
};

export const PLAYER_TUNING = {
  walkSpeed: 190,
  runSpeed: 260,
  maxHealth: 100,
  maxArmour: 100,
  regenPerSecond: 4,
  invulnSeconds: 0.8,
  carEnterRange: 90,
};

export const START_CASH = 50;
export const MAX_DAY = 3;
export const MISSION_COUNT = 12;
