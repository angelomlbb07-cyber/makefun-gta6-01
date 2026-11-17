// The whole game state in one object, built fresh from a seed: the city, its traffic, the
// police, the missions, the player, and the camera. Both the live game and the screenshot
// scenes build their world from here, so a scene is a real game, not a painting.
// v2 adds the day counter, the radio, Benny's Garage upgrades and the score toasts.

import { CLOCK } from './config.js';
import { buildCity } from './city.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createPlayer } from './player.js';
import { createRandom, clamp } from './random.js';

export function createGameState(seed) {
  const rng = createRandom(seed);
  const city = buildCity(rng);
  const state = {
    rng,
    city,
    traffic: createTraffic(city, rng),
    police: createPolice(),
    missions: createMissions(),
    player: null,
    particles: [],
    events: {},
    time: 0,
    clockMinutes: CLOCK.startMinutes,
    day: 1, // DAY 1, 2, 3: the clock wraps at midnight and the story spans three days
    radio: { station: 0, track: 0, trackTimer: 0 },
    garage: { open: false, selected: 0, engine: 0, armour: 0, tyres: 0, nitro: 0, nitroMeter: 100 },
    scoreToast: '', // drift / near-miss bonus line, shown under the cash panel
    scoreToastTimer: 0,
    best: 0,
    camera: { x: 0, y: 0, zoom: 0.85, shakeX: 0, shakeY: 0 },
    hint: '',
    streetName: 'Solmar',
  };
  state.player = createPlayer(city);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  return state;
}

/** Rebuild every piece of a state in place, from a fresh seed. */
export function resetGameState(state, seed) {
  const fresh = createGameState(seed);
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

/** Keep the camera's view inside the world, so no dark band shows past the map edge. */
export function clampCamera(state) {
  const hw = 640 / state.camera.zoom;
  const hh = 400 / state.camera.zoom;
  state.camera.x = clamp(state.camera.x, hw, state.city.width - hw);
  state.camera.y = clamp(state.camera.y, hh, state.city.height - hh);
}
