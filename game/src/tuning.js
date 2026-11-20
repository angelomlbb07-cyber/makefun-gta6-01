// tuning.js — every tunable constant for SOLMAR lives here.
// One job: numbers. No game logic, no rendering, no imports.
export const TUNING = {
  // World dimensions (pixels in world space).
  worldWidth: 5200,
  worldHeight: 3600,
  roadSpacing: 260,
  roadWidth: 64,
  blockSize: 196,
  beachX: 340,          // west of this is sand
  waterX: 130,          // west of this is water
  marinaY: 900,         // marina docks live around this band

  // Colours — sun-soaked coastal palette.
  colours: {
    grass: '#7fae5a',
    sand: '#e8d29a',
    water: '#2e7fa8',
    waterDeep: '#1d5f86',
    road: '#3a3d44',
    roadLine: '#e8d44d',
    sidewalk: '#9a9a92',
    plaza: '#c9b896',
    downtown: '#5a6b7d',
    suburb: '#8aa86b',
    buildingRoof: ['#b0563a', '#c97e4a', '#7d8aa0', '#a8a08a', '#6b7d8f', '#c9a86a'],
    player: '#e8b13c',
    police: '#2e5fd0',
    heli: '#22303c',
  },

  // Player on foot.
  walkSpeed: 165,
  runSpeed: 285,
  playerRadius: 13,
  punchDamage: 22,
  punchRange: 42,
  punchCooldown: 0.42,

  // Shooting.
  pistolDamage: 34,
  pistolRange: 460,
  pistolCooldown: 0.24,
  pistolAmmoStart: 36,
  pistolAmmoMax: 120,
  bulletSpeed: 900,
  tracerLife: 0.09,

  // Driving.
  carAccel: 430,
  carBrake: 700,
  carReverseAccel: 260,
  carMaxSpeed: 560,
  carMaxReverse: 170,
  carTurnRate: 2.5,
  carDrag: 0.55,
  handbrakeTurnBoost: 1.9,
  carHealthMax: 100,
  collisionDamage: 9,
  driftCashPerSecond: 15,
  nearMissCash: 25,
  nearMissDistance: 46,

  // Traffic.
  trafficCount: 26,
  trafficSpeed: 165,
  trafficSpawnGap: 3.0,

  // Pedestrians.
  pedCount: 42,
  pedSpeed: 52,

  // Wanted / police.
  wantedMax: 5,
  wantedDecayDelay: 7.0,     // seconds out of sight before stars fall
  wantedDecayInterval: 4.0,
  copFootSpeed: 205,
  copCarSpeed: 430,
  copSpawnDistance: 520,
  heliSpeed: 300,
  heliAltitude: 1,            // drawn as a shadow + searchlight, not a sprite
  starsForFootCops: 1,
  starsForPatrolCars: 2,
  starsForHeli: 2,
  starsForRoadblock: 3,
  copPunchDamage: 8,
  copShootDamage: 6,
  thugShootDamage: 7,
  thugHealth: 60,
  copHealth: 80,

  // Pickups.
  healthPickupHeal: 40,
  armourPickupAmount: 50,
  pickupRadius: 26,

  // Missions.
  missionMarkerPulse: 2.2,
  deliveryBonusPerSecond: 4,
  chaseTargetSpeed: 380,
  escapeTimeBonus: 150,

  // Economy.
  startCash: 250,
  repairCost: 120,
  garageRepairRate: 60,       // health per second while parked in the garage zone
  respectPerMission: 120,

  // Day / night.
  dayLengthSeconds: 420,      // full 24h cycle in game seconds
  goldenHourStart: 16.5,     // hours
  goldenHourEnd: 18.75,
  nightStart: 19.5,
  nightEnd: 5.5,
  startClockHours: 17.1,     // golden hour — the cover look

  // Camera / view.
  viewWidth: 1280,
  viewHeight: 800,
  cameraLerp: 6.0,

  // HUD.
  minimapSize: 172,
  minimapScale: 0.033,
  popupRiseSpeed: 42,
  popupLife: 1.5,
};

// Sanity helper used by the /tmp logic tests: every numeric constant that
// must stay positive is checked from this list.
export const POSITIVE_KEYS = [
  'worldWidth', 'worldHeight', 'roadSpacing', 'roadWidth', 'walkSpeed',
  'runSpeed', 'carAccel', 'carMaxSpeed', 'carTurnRate', 'pistolDamage',
  'pistolRange', 'bulletSpeed', 'trafficCount', 'pedCount', 'dayLengthSeconds',
];

export function tuningIsSane() {
  for (const key of POSITIVE_KEYS) {
    const value = TUNING[key];
    if (typeof value !== 'number' || !(value > 0)) return { ok: false, key, value };
  }
  if (TUNING.wantedMax !== 5) return { ok: false, key: 'wantedMax', value: TUNING.wantedMax };
  if (TUNING.starsForHeli < TUNING.starsForPatrolCars) return { ok: false, key: 'starsForHeli', value: TUNING.starsForHeli };
  return { ok: true };
}
