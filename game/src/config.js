// SOLMAR — tuning, palette and city constants. One place for every number the game plays by.
// The city is a grid of blocks separated by roads: 11 columns x 8 rows of 260px blocks with
// 90px roads between them, so the world is 3940 x 2890 px. The south edge is beach and water,
// the east edge is the docks. Everything else is derived from these numbers.
// v2: twelve story missions, guns, a police helicopter, Benny's Garage upgrades, a day
// system, radio stations, respect and armour, drift and near-miss scoring.

export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 800 };
export const WORLD = { width: 3940, height: 2890 };

export const BLOCK_W = 260;
export const BLOCK_H = 260;
export const ROAD_W = 90;
export const COLS = 11;
export const ROWS = 7;
export const LANE = 22; // how far right of a road centre a car drives

export const SAVE_KEY = 'solmar.save.v1';

// Sun-soaked coastal palette: warm sand, turquoise water, pastel buildings, dark warm roads.
export const PALETTE = {
  ground: '#d9b380',
  sand: '#ecd19a',
  water: '#2f9db8',
  waterDeep: '#1f7d99',
  road: '#4b4640',
  roadEdge: '#6b6257',
  lane: '#d8cfae',
  sidewalk: '#b7a98c',
  park: '#6fae5e',
  parkDark: '#5c9a4e',
  building: ['#e8a87c', '#e8c07c', '#c97b7b', '#7fb8a4', '#d9c9a3', '#b08bb8', '#e39a9a', '#8fb8d9'],
  roof: ['#c98a5e', '#b8905e', '#a86464', '#5f9a86', '#b8a67e', '#8a6a9a', '#c07a7a', '#6f9ab8'],
  glass: '#9fd4e8',
  player: '#f2f2f2',
  playerShirt: '#e8452c',
  cop: '#2c4a8a',
  copCar: '#1f3a6e',
  taxi: '#f2c230',
  text: '#f5efe2',
  muted: '#c9bfa5',
  gold: '#f2c230',
  red: '#e8452c',
  green: '#58b368',
  dark: '#241f1a',
  panel: 'rgba(24, 20, 16, 0.78)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// District ground tints so each part of the city reads differently at a glance: Downtown
// cool grey-blue, Marina Bay teal, Coral Heights warm pink, Old Town ochre, Beachfront sand.
export const DISTRICT_FILL = {
  Downtown: '#c2a878', 'Marina Bay': '#cbb37e', 'Coral Heights': '#d3a184',
  'Old Town': '#cfa96f', Beachfront: '#e0c184', 'The Docks': '#a89a7c', Northside: '#cdb27e',
};
export const DISTRICT_FLAVOUR = {
  Downtown: 'GLASS, GOLD AND BAD DECISIONS', 'Marina Bay': 'YACHTS, MONEY AND TROUBLE',
  'Coral Heights': 'PALMS, POOLS AND QUIET MONEY', 'Old Town': 'WHERE SOLMAR STARTED',
  Beachfront: 'SUN, SAND AND FAST CARS', 'The Docks': 'CRATES, CRANES AND NO QUESTIONS',
  Northside: 'THE QUIET END OF TOWN',
};
// Building signs, one per district flavour: the city advertises itself.
export const SIGNS = ['MOTEL PALMERA', 'TACOS 24H', 'SURF SHOP', 'DONUTS', 'LIQUOR', 'VACANCY',
  'PIER 9', 'CORAL CASINO', 'PALMERA HOTEL', "BENNY'S GARAGE", 'SEAFOOD', 'HOTEL SOL', 'BAR NEON', 'PAWN SHOP'];
export function districtAt(col, row) {
  if (row >= 6) return 'Beachfront';
  if (col >= 10) return 'The Docks';
  if (col <= 1 && row >= 4) return 'Marina Bay';
  if (col >= 5 && col <= 7 && row <= 3) return 'Downtown';
  if (col >= 8 && row <= 2) return 'Coral Heights';
  if (row <= 1) return 'Northside';
  return 'Old Town';
}

export const STREET_NAMES_H = [
  'Ocean Front', 'Palmera Ave', 'Sunset Blvd', 'Coral St', 'Harbor Way',
  'Jacaranda St', 'Marina Drive', 'Palm Court', 'Boardwalk',
];
export const STREET_NAMES_V = [
  'Seawall Rd', 'Gull Ave', 'Anchor St', 'Trade St', 'Bayview Ave', 'Cactus Ln',
  'Lighthouse Rd', 'Fig St', 'Dockside Rd', 'Pier Ave', 'Breakwater Blvd', 'Coral Way',
];

// Player on foot.
export const PLAYER = {
  radius: 13,
  walk: 165,
  run: 245,
  health: 100,
  punchRange: 46,
  punchArc: 1.1,
  punchDamage: 34,
  punchCooldown: 0.45,
};

// Driving.
export const CAR = {
  accel: 420,
  brake: 700,
  reverse: 220,
  maxSpeed: 430,
  maxReverse: 150,
  turnRate: 2.6,
  drag: 0.55,
  handbrakeDrag: 1.4, // strong enough to swing the tail out, light enough that a drift can hold speed
  radius: 16,
  hp: 100,
};

export const TRAFFIC = {
  cars: 34,
  parked: 26,
  peds: 64,
  cruiseMin: 110,
  cruiseMax: 175,
  followGap: 58,
};

// Wanted: heat 0..100; stars at 10 / 40 / 70. Heat decays when no police can see the player.
export const WANTED = {
  starAt: [10, 40, 70],
  stealCar: 15,
  punchPed: 10,
  runOverPed: 25,
  hitCop: 30,
  damageCopCar: 8,
  decay: 2.2,
  sightRange: 460,
  copCarsPerStar: 2,
  maxCopCars: 6,
  bustSeconds: 1.5,
};

export const MISSION_REWARDS = [300, 600, 900, 1400, 4000, 1200, 1800, 2200, 5000, 2600, 3200, 6000];
export const TAXI_FARE = [45, 150];
export const BUST_FINE = 150;
export const WASTED_FINE = 100;

// Guns: name, magazine size, reserve ammo, damage, range, fire rate (seconds between shots).
export const WEAPONS = {
  pistol: { name: 'PISTOL', mag: 12, reserve: 72, damage: 34, range: 380, rate: 0.28 },
  smg: { name: 'HORNET SMG', mag: 30, reserve: 120, damage: 22, range: 460, rate: 0.09 },
};
// Radio stations and their tracks, cycled while driving.
export const RADIO = [
  { name: 'SOL FM 96.4', tracks: ['Sunset Drive', 'Palmera Nights', 'Golden Hour'] },
  { name: 'CORAL 88.1', tracks: ['Tide Runner', 'Neon Palms', 'Boardwalk Lights'] },
  { name: 'NEON TIDE 99.1', tracks: ['Midnight Ferry', 'Heat Wave', 'Coastline'] },
  { name: 'BRISA 88.0', tracks: ['Sea Breeze', 'Old Town Rumba', 'Marina Waltz'] },
];
// Benny's Garage: upgrade name, price per level, max level. Engine raises speed, armour adds
// car HP, tyres sharpen steering, nitro unlocks a Shift boost.
export const GARAGE_UPGRADES = [
  { key: 'engine', name: 'Turbo Engine', prices: [800, 1500, 2500], desc: '+12% top speed per level' },
  { key: 'armour', name: 'Armour Plating', prices: [600, 1100, 1800], desc: '+40 car HP per level' },
  { key: 'tyres', name: 'Racing Tyres', prices: [500, 900, 1400], desc: 'Sharper steering, better grip' },
  { key: 'nitro', name: 'Nitro Kit', prices: [1200], desc: 'Hold Shift for a nitro boost' },
];
// Car names by kind, shown in the speedometer gauge.
export const CAR_NAMES = {
  sedan: ['Azul GT Coupe', 'Solmar Sedan', 'Coral Cruiser'],
  taxi: ['City Taxi'], van: ['Harbor Van'], sports: ['Sunset GT', 'Veloce RS', 'Hornet S'],
  truck: ['Dock Hauler'], police: ['PD Interceptor'],
};
// Drift and near-miss scoring: cash paid for stylish driving. Speeds here are px/s
// (430 px/s is the top speed, ~193 km/h): a handbrake drift holds ~300 px/s with the
// throttle down, so the drift floor sits at 180, not 200.
export const DRIFT = { minSpeed: 180, minTime: 0.4, cashPerSecond: 50 };
export const NEAR_MISS = { minSpeed: 250, minDist: 34, maxDist: 52, cash: 150, cooldown: 3 };

// Game clock: 1 game minute per 2 real seconds, starting at golden afternoon.
export const CLOCK = { startMinutes: 16 * 60 + 20, minutesPerSecond: 0.5 };

export const BEST_KEY = 'solmar.best';
