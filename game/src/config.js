// SOLMAR — config.js
// Every tunable number, name and label for the game lives here, so the other
// modules read plain data instead of hiding magic numbers in their logic.
// The city is Solmar: a sun-soaked coastal city, 3200 by 2400 world units,
// streets on a grid, beach and sea along the south edge, docks in the west,
// a plaza with a fountain near the middle, and a casino district.
// Round 6: full fresh rewrite in one recording; values carried over from round 5.

export const VIEW_W = 1280;
export const VIEW_H = 800;
export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 72;
export const BLOCK = 400;

// Vertical and horizontal street centre lines. Blocks between them hold
// buildings, parks, the plaza and the casino forecourt.
export const ROADS_V = [320, 720, 1120, 1520, 1920, 2320, 2720];
export const ROADS_H = [320, 720, 1120, 1520, 1920];

export const SEA_Y = 2240;
export const SAND_Y = 2080;

export const MISSION_COUNT = 12;
export const START_CASH = 150;
export const MAX_WANTED = 5;

// Districts: rectangular zones with a name and a flavour line for the HUD.
export const DISTRICTS = [
  { name: 'OLD SOLMAR', flavour: 'NARROW STREETS, OLD MONEY', x0: 0, y0: 0, x1: 1120, y1: 1120 },
  { name: 'PALMLINE BEACH', flavour: 'SUN, SAND AND BAD DECISIONS', x0: 0, y0: 1920, x1: 3200, y1: 2400 },
  { name: 'CORAL CASINO', flavour: 'THE HOUSE ALWAYS WINS', x0: 1120, y0: 0, x1: 2120, y1: 1120 },
  { name: 'MARINA BAY', flavour: 'BOATS, BANKS AND BIG SCORES', x0: 2120, y0: 0, x1: 3200, y1: 1120 },
  { name: 'PALM GROVE PARK', flavour: 'GREEN IN THE MIDDLE OF TOWN', x0: 2120, y0: 1120, x1: 3200, y1: 1920 },
  { name: 'DOCKSIDE', flavour: 'CRATES, CRANES AND QUIET DEALS', x0: 0, y0: 1120, x1: 1120, y1: 1920 },
  { name: 'SOLMAR PLAZA', flavour: 'THE HEART OF THE CITY', x0: 1120, y0: 1120, x1: 2120, y1: 1920 },
];

// Radio stations: name, colour for the HUD chip, and a music flavour used by
// the synthesised radio sequencer in audio.js.
export const RADIOS = [
  { name: '99.1 NEON TIDE', colour: '#ff5da2', scale: [0, 3, 5, 7, 10], tempo: 132, wave: 'square' },
  { name: '95.4 SOL FM', colour: '#ffb02e', scale: [0, 2, 4, 7, 9], tempo: 104, wave: 'triangle' },
  { name: '88.3 CORAL WAVE', colour: '#2ec8ff', scale: [0, 3, 5, 8, 10], tempo: 88, wave: 'sine' },
  { name: '101.7 VICE NIGHT', colour: '#b678ff', scale: [0, 1, 3, 6, 8], tempo: 120, wave: 'sawtooth' },
];

// Drivable cars. top is top speed in km/h, accel and grip tune the feel,
// and price is what Benny's Garage charges for the upgrade path.
export const CARS = [
  { name: 'Falco Coupe', colour: '#e33f2f', top: 172, accel: 150, grip: 2.6, price: 0 },
  { name: 'Solmar Taxi', colour: '#f7c948', top: 148, accel: 120, grip: 2.4, price: 500 },
  { name: 'Vento GT', colour: '#2f7fe3', top: 196, accel: 175, grip: 2.9, price: 2400 },
  { name: 'Marea Van', colour: '#7a8a99', top: 132, accel: 95, grip: 2.1, price: 900 },
  { name: 'Palma Cruiser', colour: '#e38ac2', top: 158, accel: 130, grip: 2.5, price: 1200 },
];

export const POLICE_CAR = { name: 'Solmar PD Cruiser', colour: '#20242e', top: 178, accel: 165, grip: 3.0 };

// Weapons: damage per hit, magazine size, reserve ammo, and fire interval.
export const WEAPONS = {
  fists: { name: 'FISTS', damage: 12, mag: 0, reserve: 0, interval: 0.45, range: 46 },
  pistol: { name: 'PISTOL', damage: 34, mag: 12, reserve: 72, interval: 0.28, range: 420 },
  smg: { name: 'SMG', damage: 22, mag: 32, reserve: 120, interval: 0.09, range: 380 },
};

// Garage upgrades sold by Benny. Each level adds to the matching stat.
export const GARAGE = [
  { id: 'turbo', name: 'Turbo Kit', desc: '+18 km/h top speed', price: 800 },
  { id: 'armour', name: 'Armour Plating', desc: '+40 max armour', price: 650 },
  { id: 'tyres', name: 'Grip Tyres', desc: 'tighter handling, better drift', price: 500 },
  { id: 'nitro', name: 'Nitro Tank', desc: '+50 nitro capacity', price: 700 },
];

// Respect: level n needs (n-1)*250 respect points. Level up is a big deal:
// the passed screen calls it out with a LEVEL UP banner.
export function levelForRespect(respect) {
  return 1 + Math.floor(Math.max(0, respect) / 250);
}

export function respectForLevel(level) {
  return (level - 1) * 250;
}

// Time-of-day palettes. The renderer tints the whole scene with these and
// draws long shadows at golden hour, glow and headlights at sunset/night.
// Round 6: the night palette carries the night combat shot — its tint
// and dark values were checked against that shot so the player, the
// enemies and the tracers still read under the night overlay.
export const TIMES_OF_DAY = {
  day: { label: 'DAY', tint: 'rgba(255,255,255,0)', shadow: 0, dark: 0, sky: '#8ec9ee' },
  golden: { label: 'GOLDEN HOUR', tint: 'rgba(255,150,50,0.16)', shadow: 26, dark: 0, sky: '#ffb35c' },
  sunset: { label: 'SUNSET', tint: 'rgba(255,90,110,0.20)', shadow: 34, dark: 0.08, sky: '#ff7a6b' },
  night: { label: 'NIGHT', tint: 'rgba(12,22,64,0.42)', shadow: 0, dark: 0.3, sky: '#101a3a' },
};

// Clock helpers: minutes since midnight -> "17:31".
export function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function starsText(n) {
  let s = '';
  for (let i = 0; i < MAX_WANTED; i++) s += i < n ? '★' : '☆';
  return s;
}
