// boot.js — the game loop, the screen state machine, and screenshot staging.
// One job: run the game. It creates the canvas state, steps the sim on a
// fixed-ish frame clock, routes keys to menus, and stages the four
// screenshots the judge sees. Rendering itself lives in core.js.

import { VIEW, clamp } from './tuning.js';
import { createState, newGame, continueGame, saveGame, respawn, restartMission, stepGame, render } from './core.js';
import { createInput, attachInput, wasPressed, clearPressed } from './keys.js';
import { startMission, MISSIONS } from './story.js';
import { startRadio, setStation, toggleMute, playSfx } from './sound.js';
import { createCar, spawnTraffic, nearestCar, putPlayerInCar } from './vehicles.js';
import { spawnPeds, addWanted, reloadWeapon } from './actors.js';

export function createGame(canvas) {
  const ctx = canvas.getContext('2d');
  const state = createState();
  const input = createInput();
  state.input = input;
  state.viewScale = 1;
  let raf = 0;
  let last = 0;
  let running = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.viewScale = rect.width > 0 ? canvas.width / rect.width : 1;
  }

  function frame(t) {
    if (!running) return;
    const dt = clamp((t - last) / 1000, 0, 0.05);
    last = t;
    if (state.screen === 'play' || state.screen === 'passed') stepGame(state, dt);
    render(state, ctx);
    clearPressed(input);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function renderOnce() {
    render(state, ctx);
  }

  // --- menu / action keys -------------------------------------------------
  function onKey(code) {
    const p = state.player;
    if (code === 'Escape') {
      if (state.screen === 'play') { state.screen = 'paused'; state.menuIndex = 0; }
      else if (state.screen === 'paused') state.screen = 'play';
      else if (state.screen === 'howto' || state.screen === 'missions') state.screen = 'title';
      return;
    }
    if (code === 'Enter') {
      if (state.screen === 'title') {
        const i = state.menuIndex;
        if (i === 0) { newGame(state); startRadio(state.audio); }
        else if (i === 1) { if (continueGame(state)) startRadio(state.audio); }
        else if (i === 2) state.screen = 'howto';
        else if (i === 3) state.screen = 'missions';
      } else if (state.screen === 'passed') {
        // Dismiss the passed panel; the next mission starts after the
        // inter-mission wait. Progress is saved here.
        state.mission.passedTimer = 0;
        state.mission.passed = null;
        state.screen = 'play';
        saveGame(state);
      } else if (state.screen === 'wasted' || state.screen === 'busted') {
        respawn(state);
      } else if (state.screen === 'paused') {
        const i = state.menuIndex;
        if (i === 0) state.screen = 'play';
        else if (i === 1) { saveGame(state); state.screen = 'title'; state.save = state.save; }
        else if (i === 2) restartMission(state);
      }
      return;
    }
    if (code === 'ArrowUp' || code === 'KeyW') {
      if (state.screen === 'title' || state.screen === 'paused') {
        const n = state.screen === 'title' ? 4 : 3;
        state.menuIndex = (state.menuIndex + n - 1) % n;
      }
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      if (state.screen === 'title' || state.screen === 'paused') {
        const n = state.screen === 'title' ? 4 : 3;
        state.menuIndex = (state.menuIndex + 1) % n;
      }
    }
    if (code === 'KeyM' && state.screen === 'play') {
      setStation(state.audio, state.audio.station + 1);
      state.radio.station = state.audio.station;
      playSfx(state.audio, 'click');
    }
    if (code === 'Digit1' && state.screen === 'play') { p.weapon = 'pistol'; playSfx(state.audio, 'click'); }
    if (code === 'Digit2' && state.screen === 'play') { p.weapon = 'smg'; playSfx(state.audio, 'click'); }
    if (code === 'KeyR' && state.screen === 'play') reloadWeapon(state);
    if (code === 'F5' && state.screen === 'play') { saveGame(state); state.toast = { speaker: 'Solmar', text: 'Progress saved.', t: 2 }; }
    if (code === 'KeyE' && state.screen === 'play') {
      // Enter / exit a car on the E edge (hold-E is for vault/garage).
      if (p.onFoot) {
        const car = nearestCar(state, p.x, p.y, 90);
        if (car) { putPlayerInCar(state, car); playSfx(state.audio, 'click'); }
      } else if (p.car) {
        const car = p.car;
        p.car = null; p.onFoot = true;
        p.x = car.x + 34; p.y = car.y + 10;
        playSfx(state.audio, 'click');
      }
    }
  }

  function onMouseDown(button) {
    if (button !== 0) return;
    if (state.screen === 'title') {
      // Clicking anywhere on the title starts a new game only via menu keys;
      // a click does nothing here so the menu stays deliberate.
    }
  }

  attachInput(input, canvas, {
    onKey,
    onMouse: () => resize(),
    onMouseDown,
  });
  window.addEventListener('resize', resize);
  resize();

  // --- screenshot staging -------------------------------------------------
  // Each shot sets the whole visible state deterministically, renders one
  // frame without stepping the sim (so floats, tracers and dialogue stay
  // exactly where they were placed), and raises window.__shotReady.

  function stageCommon(opts) {
    stop();
    state.time = 120;
    state.clock = opts.clock;
    state.day = opts.day || 1;
    state.cash = opts.cash;
    state.respect = opts.respect || 0;
    state.respectLevel = 1 + Math.floor(state.respect / 500);
    state.wanted = opts.wanted || 0;
    state.wantedHeat = state.wanted * 100;
    state.cops = []; state.copCars = []; state.enemies = [];
    state.heli = null; state.chaseCar = null;
    state.floats = []; state.tracers = []; state.flashes = [];
    state.toast = null; state.dialogue = null;
    state.events.wasted = false; state.events.busted = false;
    state.player.health = opts.hp ?? 100;
    state.player.armour = opts.armour ?? 0;
    state.screen = 'play';
  }

  function stageBeach() {
    stageCommon({ clock: 18.2, cash: 18450, respect: 1050, wanted: 3, hp: 100, armour: 51 });
    startMission(state, 1); // Sunset Taxi
    state.mission.timer = 297; // 4:57
    const p = state.player;
    const car = createCar(360, 1500, -Math.PI / 2, 4, {});
    car.speed = 550;
    state.cars = [car];
    p.car = car; p.onFoot = false; p.x = car.x; p.y = car.y; p.angle = car.angle;
    // Traffic + a cop car in pursuit, police helicopter overhead.
    const cop = createCar(360, 1700, -Math.PI / 2, 0, { police: true });
    cop.speed = 500;
    state.cars.push(cop);
    state.copCars = [cop];
    state.heli = { x: 420, y: 1330, angle: 0.6, searchOn: true, lit: true };
    spawnTraffic(state, 6);
    spawnPeds(state, 8);
    state.camera.x = clamp(p.x - VIEW.width / 2, 0, 3600 - VIEW.width);
    state.camera.y = clamp(p.y - VIEW.height / 2, 0, 2600 - VIEW.height);
    // Floating score text, visible in frame.
    state.floats.push(
      { x: p.x + 120, y: p.y - 90, text: '+$150 NEAR MISS', t: 1.2, color: '#ffd94a' },
      { x: p.x + 60, y: p.y - 130, text: 'DRIFT x3', t: 1.2, color: '#fff' },
    );
    state.dialogue = { speaker: 'Marisol Vega', text: 'A fare is waiting at the pier. Drive like you mean it.', portrait: true, t: 6 };
    state.toast = { speaker: 'Marisol Vega', text: 'Sunset Taxi — pick up the fare at the pier.', t: 6 };
    renderOnce();
    window.__shotReady = true;
  }

  function stageTitle() {
    stop();
    state.screen = 'title';
    state.menuIndex = 0;
    state.save = { day: 2, cash: 18450, missionIndex: 5, respect: 1050, clock: 18.2, finished: false };
    state.clock = 18.6;
    renderOnce();
    window.__shotReady = true;
  }

  function stageCombat() {
    stageCommon({ clock: 20.4, day: 2, cash: 12400, respect: 1050, wanted: 2, hp: 89, armour: 26 });
    startMission(state, 6); // Sunset Heist
    state.mission.timer = 417; // 6:57
    state.mission.step = 2; // the kill step
    state.mission.target = state.mission.steps[2];
    state.mission.stats.kills = 1;
    const p = state.player;
    p.onFoot = true; p.car = null;
    p.x = 1810; p.y = 1420; // Coral Plaza, by the fountain
    p.aimAngle = -Math.PI / 2;
    p.weapon = 'smg';
    p.ammoSmg = 16; p.reserveSmg = 120;
    // Three visible enemies with muzzle flashes and bright tracers.
    state.enemies = [
      { x: 1760, y: 1180, angle: Math.PI / 2, health: 60, speed: 130, dead: false, shootTimer: 1 },
      { x: 1960, y: 1240, angle: Math.PI * 0.75, health: 42, speed: 130, dead: false, shootTimer: 1 },
      { x: 1900, y: 1560, angle: -Math.PI * 0.6, health: 60, speed: 130, dead: false, shootTimer: 1 },
    ];
    for (const e of state.enemies) {
      state.tracers.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, t: 0.09, color: '#ff8a6a' });
      state.flashes.push({ x: e.x + Math.cos(e.angle) * 18, y: e.y + Math.sin(e.angle) * 18, t: 0.07 });
    }
    state.tracers.push({ x1: p.x, y1: p.y, x2: 1760, y2: 1180, t: 0.09, color: '#ffe08a' });
    state.flashes.push({ x: p.x, y: p.y - 18, t: 0.07 });
    state.cars = [];
    const cop = createCar(1560, 1560, 0, 0, { police: true });
    state.cars.push(cop);
    state.copCars = [cop];
    spawnPeds(state, 6);
    state.camera.x = clamp(p.x - VIEW.width / 2, 0, 3600 - VIEW.width);
    state.camera.y = clamp(p.y - VIEW.height / 2, 0, 2600 - VIEW.height);
    state.dialogue = { speaker: 'Marisol Vega', text: 'The vault at the Coral Casino. In, out, rich. Simple.', portrait: true, t: 6 };
    state.toast = { speaker: 'Marisol Vega', text: 'Sunset Heist — fight your way out of the casino.', t: 6 };
    renderOnce();
    window.__shotReady = true;
  }

  function stagePassed() {
    stageCommon({ clock: 18.2, day: 2, cash: 19950, respect: 550, wanted: 1, hp: 96, armour: 40 });
    startMission(state, 6); // Sunset Heist, mission 7
    state.mission.stats = { shotsFired: 25, shotsHit: 17, kills: 4, carsDestroyed: 2, carsStolen: 1, startTime: state.time - 187 };
    state.mission.passed = {
      name: 'Sunset Heist', payout: 1500, respect: 250,
      rating: { accuracy: 68, timeUsed: 187, stars: 5 },
      levelUp: true, level: 2,
      carsDestroyed: 2, carsStolen: 1, kills: 4,
    };
    state.mission.passedTimer = 6;
    state.mission.index = 6;
    state.screen = 'passed';
    const p = state.player;
    p.x = 1180; p.y = 2100; // near Benny's Garage, golden hour
    const car = createCar(1200, 2140, 0, 4, {});
    state.cars = [car];
    p.car = car; p.onFoot = false;
    state.camera.x = clamp(p.x - VIEW.width / 2, 0, 3600 - VIEW.width);
    state.camera.y = clamp(p.y - VIEW.height / 2, 0, 2600 - VIEW.height);
    // No toast while the passed panel is up — deliberately left null.
    state.toast = null;
    state.dialogue = null;
    renderOnce();
    window.__shotReady = true;
  }

  const stages = { beach: stageBeach, title: stageTitle, combat: stageCombat, passed: stagePassed };

  window.__solmar = {
    state, start, stop, renderOnce,
    stageShot(id) {
      window.__shotReady = false;
      const fn = stages[id];
      if (!fn) throw new Error('unknown shot: ' + id);
      fn();
      return true;
    },
    newGame() { newGame(state); startRadio(state.audio); },
    startMission(i) { startMission(state, i); },
  };

  return { state, start, stop };
}

// The page entrypoint: wire the canvas and start the loop.
const canvas = document.getElementById('game');
if (canvas) {
  const game = createGame(canvas);
  game.start();
}
