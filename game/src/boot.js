// boot.js — startup, the main loop, the screen state machine, rendering,
// and the ?shot=N staging used for screenshots. One job: run the game.
import { TUNING } from './tuning.js';
import { drawWorld, inGarageZone, lightingForHour } from './world.js';
import {
  updatePlayerCar, updateTrafficCar, resolveCarCollisions,
  checkNearMiss, nearestCar, drawCar, addPopup,
} from './vehicles.js';
import {
  updatePlayerOnFoot, playerPunch, playerShoot, updateCops,
  updateThugs, updatePeds, updateWanted, collectPickups,
  damagePlayer, raiseWanted, drawPerson, drawHeli, makeThug, makeCop,
} from './actors.js';
import {
  MISSIONS, startMission, updateMission, retryMission,
} from './story.js';
import {
  drawHUD, drawTitle, drawPause, drawPassed, drawFailed,
} from './hud.js';
import {
  createGame, updateCamera, updateClock, updateEffects,
  saveGame, loadSave, hasSave, showMessage, debugSnapshot,
} from './core.js';
import { createInput } from './keys.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SCALE = 1; // canvas is exactly 1280x800; CSS scales it to the window.

export const state = createGame();
state.hasSave = hasSave();
const input = createInput(canvas);

// The play-test and the screenshot script read this to assert progress.
window.SOLMAR = {
  state,
  snapshot: () => debugSnapshot(state),
  startMission: (i) => startMission(state, i),
  version: 'round8',
};

// --- Shot staging ---------------------------------------------------------
// ?shot=N sets up a scene before the first frame, so screenshots show the
// game at its best: chase, title, night combat, passed screen.
export function applyShot(n) {
  state.shot = n;
  if (n === 1) {
    // Golden-hour beach chase: player driving fast, police behind, popups.
    state.screen = 'play';
    state.clockHours = 17.1;
    state.player.x = 480; state.player.y = 620;
    state.player.onFoot = false;
    const car = state.cars[0];
    car.x = 480; car.y = 620; car.angle = Math.PI / 2; car.speed = 480;
    state.playerCar = car;
    state.player.x = car.x; state.player.y = car.y;
    state.wanted = 2; state.wantedWhole = 2;
    state.cash = 1840;
    state.mission = null;
    startMission(state, 1); // Beach Run — delivery to the plaza
    state.mission.timer = 58;
    // Two patrol cars right behind.
    for (let i = 0; i < 2; i++) {
      const cop = makeCop(480, 620 - 150 - i * 90, true);
      const copCar = { kind: 'car', x: cop.x, y: cop.y, angle: Math.PI / 2, model: 'Interceptor', color: '#2e5fd0', len: 48, wid: 23, speed: 430, health: 100, traffic: false, steer: 0, drift: 0, dead: false, targetSpeed: 430, police: true };
      cop.car = copCar;
      state.cars.push(copCar);
      state.cops.push(cop);
    }
    state.heli = { kind: 'heli', x: 560, y: 420, angle: 0, speed: 0, searchAngle: 1.2, shootCooldown: 2 };
  } else if (n === 2) {
    // Title menu over the golden-hour city.
    state.screen = 'title';
    state.clockHours = 17.4;
    state.player.x = 900; state.player.y = 800;
    state.cash = 250;
  } else if (n === 3) {
    // Night combat at the plaza: tracers, muzzle flash, heli, 3 stars.
    state.screen = 'play';
    state.clockHours = 21.5;
    state.player.x = 2550; state.player.y = 1750;
    state.player.onFoot = true;
    state.player.angle = 0.4;
    state.player.health = 68; state.player.armour = 45;
    state.wanted = 3; state.wantedWhole = 3;
    state.cash = 2310;
    state.mission = null;
    startMission(state, 5); // Warehouse War shootout, retargeted at the plaza
    state.mission.targetX = 2620; state.mission.targetY = 1680;
    state.message = 'Plaza Ambush — Rival thugs hold Marina Plaza. Clear them all.';
    state.messageT = 6;
    state.thugs = [];
    for (let i = 0; i < 4; i++) {
      const thug = makeThug(2680 + i * 46, 1640 + (i % 2) * 90);
      thug.alerted = true;
      state.thugs.push(thug);
    }
    state.tracers.push({ x1: 2550, y1: 1750, x2: 2690, y2: 1670, life: 0.09 });
    state.tracers.push({ x1: 2680, y1: 1640, x2: 2550, y2: 1750, life: 0.08 });
    state.muzzle = { x: 2570, y: 1760, life: 0.07 };
    state.heli = { kind: 'heli', x: 2400, y: 1560, angle: 0, speed: 0, searchAngle: 0.8, shootCooldown: 2 };
    for (let i = 0; i < 2; i++) state.cops.push(makeCop(2440 + i * 60, 1900, false));
    state.headlights = true;
  } else if (n === 4) {
    // Mission PASSED panel: 5 stars, payout, time, accuracy, level up.
    state.screen = 'passed';
    state.clockHours = 17.6;
    state.player.x = 1200; state.player.y = 900;
    state.cash = 4310;
    state.respect = 650; // consistent with Level 3 (1 + floor(650/300))
    state.level = 3;
    state.lastResult = {
      kind: 'passed', title: 'The Big Score', payout: 1650, timeBonus: 240,
      time: 214, accuracy: 78, carsDestroyed: 3, leveledUp: true,
      next: 'Next job: Vault Break', stars: 5,
    };
    state.completed = [1, 2, 3, 4, 5, 6, 7, 8];
    state.missionIndex = 9;
  }
  updateCamera(state, 1);
}

const params = new URLSearchParams(window.location.search);
const shotParam = parseInt(params.get('shot') || '0', 10);
if (shotParam >= 1 && shotParam <= 4) {
  applyShot(shotParam);
  state.shotApplied = true;
} else {
  updateCamera(state, 1);
}

// --- Input → actions ------------------------------------------------------
function handlePressedKeys() {
  // Enter: title → play, passed → continue, failed → retry, pause → resume.
  if (input.wasPressed('Enter')) {
    state.sound.ensure();
    if (state.screen === 'title') {
      if (state.hasSave) loadSave(state);
      state.screen = 'play';
      showMessage(state, 'Welcome back to Solmar. Press M to start your next job.', 5);
    } else if (state.screen === 'passed') {
      state.screen = 'play';
      if (state.missionIndex < MISSIONS.length) startMission(state, state.missionIndex);
    } else if (state.screen === 'failed') {
      retryMission(state);
    } else if (state.screen === 'pause') {
      state.screen = 'play';
    }
  }
  if (input.wasPressed('KeyP')) {
    if (state.screen === 'play') state.screen = 'pause';
    else if (state.screen === 'pause') state.screen = 'play';
  }
  if (input.wasPressed('Escape')) {
    if (state.screen === 'pause' || state.screen === 'play') state.screen = 'title';
  }
  if (input.wasPressed('KeyM')) {
    if (state.screen === 'play' || state.screen === 'pause') {
      if (!state.mission || state.mission.phase !== 'active') {
        if (state.missionIndex < MISSIONS.length) {
          state.screen = 'play';
          startMission(state, state.missionIndex);
        } else {
          showMessage(state, 'Story complete — Solmar is yours. Free roam!', 4);
        }
      }
    }
  }
  if (input.wasPressed('KeyC') && state.screen === 'play') saveGame(state);
  if (input.wasPressed('KeyR') && state.screen === 'play') {
    const station = state.sound.toggleRadio();
    if (station) {
      state.radioLabel = `RADIO: ${station.name}`;
      state.radioLabelT = 3;
    } else {
      state.radioLabel = 'RADIO OFF';
      state.radioLabelT = 2;
    }
  }
  if (input.wasPressed('KeyH')) state.headlights = !state.headlights;
  if (input.wasPressed('KeyE') && state.screen === 'play') toggleEnterCar();
  if (input.wasPressed('KeyF') && state.screen === 'play') {
    if (playerPunch(state)) state.sound.punch();
  }
}

function toggleEnterCar() {
  const p = state.player;
  if (p.onFoot) {
    const car = nearestCar(state.cars, p.x, p.y, 78);
    if (car) {
      p.onFoot = false;
      state.playerCar = car;
      car.traffic = false;
      showMessage(state, `You took the ${car.model}.`, 2.5);
      raiseWanted(state, 0.5);
      state.sound.ensure();
    } else {
      showMessage(state, 'No car close enough — walk up to one and press E.', 2.5);
    }
  } else if (state.playerCar) {
    const car = state.playerCar;
    p.onFoot = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    state.playerCar = null;
  }
}

// --- Update ---------------------------------------------------------------
function update(dt) {
  state.time += dt;
  updateClock(state, dt);
  if (state.screen !== 'play') return;

  state.mouse.x = input.mouse.x;
  state.mouse.y = input.mouse.y;
  state.mouse.down = input.mouse.down;
  input.updateMouseWorld(state.camera, SCALE);
  state.mouse.worldX = input.mouse.worldX;
  state.mouse.worldY = input.mouse.worldY;

  const p = state.player;
  if (p.onFoot) {
    updatePlayerOnFoot(p, input, state.world, dt, state);
    if (input.mouse.down || input.shoot) playerShoot(state);
  } else if (state.playerCar) {
    const car = state.playerCar;
    updatePlayerCar(car, input, dt, state);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    checkNearMiss(state, dt);
    if (car.dead) {
      state.playerCar = null;
      p.onFoot = true;
      p.x = car.x + 40; p.y = car.y;
      state.sound.crash();
    }
    // Benny's Garage repairs a parked car.
    if (inGarageZone(state.world, car.x, car.y) && Math.abs(car.speed) < 20 && car.health < 100) {
      car.health = Math.min(100, car.health + TUNING.garageRepairRate * dt);
      if (Math.random() < dt * 2) addPopup(state, car.x, car.y - 30, 'REPAIRING…', '#7db8dc');
    }
  }

  // Traffic + chase cars.
  for (const car of state.cars) {
    if (car === state.playerCar || car.dead || car.police) continue;
    if (car.chaseTarget) {
      updateChaseCar(car, dt);
    } else if (car.traffic) {
      updateTrafficCar(car, state.cars, state.world, dt);
    }
  }
  resolveCarCollisions(state.cars, state);
  state.cars = state.cars.filter((c) => !c.dead || c === state.playerCar || c.police);

  updateWanted(state, dt);
  updateCops(state, dt);
  updateThugs(state, dt);
  updatePeds(state, dt);
  collectPickups(state);
  updateEffects(state, dt);
  updateCamera(state, dt);

  const result = updateMission(state, dt);
  if (result === 'passed' || result === 'failed') {
    // screen already switched by story.js
  }
  // Staged screenshot scenes keep refreshing their signature effects so the
  // frame looks alive whenever it is captured: the chase stays on the beach
  // road at speed with fresh cash popups; the night fight keeps firing.
  if (state.shot === 1 && state.screen === 'play' && state.playerCar) {
    const car = state.playerCar;
    car.x = 480; // beach road centre — never drifts into a building
    car.angle = Math.PI / 2;
    if (Math.abs(car.speed) < 420) car.speed = 480;
    state.shotFxT = (state.shotFxT || 0) + dt;
    if (state.shotFxT > 1.4) {
      state.shotFxT = 0;
      addPopup(state, car.x + 90, car.y - 50, 'NEAR MISS +$25', '#7ddc8a');
      addPopup(state, car.x + 120, car.y + 10, 'DRIFT +$15', '#e8b13c');
    }
  }
  if (state.shot === 3 && state.screen === 'play') {
    // Keep the helicopter hovering off to the side so its searchlight washes
    // the fight without its body hiding the player.
    if (state.heli) {
      state.heli.x = state.player.x - 280;
      state.heli.y = state.player.y - 280;
    }
    state.shotFxT = (state.shotFxT || 0) + dt;
    if (state.shotFxT > 0.35) {
      state.shotFxT = 0;
      const p = state.player;
      const thug = state.thugs.find((t) => !t.dead);
      if (thug) {
        state.tracers.push({ x1: p.x, y1: p.y, x2: thug.x, y2: thug.y, life: 0.12 });
        state.tracers.push({ x1: thug.x, y1: thug.y, x2: p.x, y2: p.y, life: 0.1 });
        state.muzzle = { x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20, life: 0.09 };
      }
    }
  }
  if (state.playerDead && state.screen === 'play') {
    if (state.mission && state.mission.phase === 'active') {
      updateMission(state, dt);
    } else {
      state.screen = 'title';
      state.player.health = 100;
      state.playerDead = false;
      state.wanted = 0; state.wantedWhole = 0;
      showMessage(state, 'You were taken down. The city keeps moving.', 4);
    }
  }
  state.sound.update(state);
}

// Chase target: flees from the player along the roads, weaving.
function updateChaseCar(car, dt) {
  const p = state.player;
  const dx = car.x - p.x, dy = car.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const fleeAngle = Math.atan2(dy, dx);
  let diff = fleeAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff + Math.sin(state.time * 1.7) * 0.5));
  car.speed = Math.min(car.targetSpeed, car.speed + 380 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (car.x < 200 || car.x > TUNING.worldWidth - 100 || car.y < 100 || car.y > TUNING.worldHeight - 100) {
    car.angle += Math.PI / 2;
  }
}

// --- Render ---------------------------------------------------------------
function render() {
  const viewW = TUNING.viewWidth, viewH = TUNING.viewHeight;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-state.camera.x, -state.camera.y);
  const light = drawWorld(ctx, state.world, state.camera, viewW, viewH, state.clockHours);

  // Mission target marker.
  if (state.mission && state.mission.phase === 'active') {
    const m = state.mission;
    const pulse = 26 + Math.sin(state.time * TUNING.missionMarkerPulse * 2) * 6;
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(m.targetX, m.targetY, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath(); ctx.arc(m.targetX, m.targetY, 6, 0, Math.PI * 2); ctx.fill();
    // Guide line from the player to the target.
    ctx.strokeStyle = 'rgba(255,210,60,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(state.player.x, state.player.y);
    ctx.lineTo(m.targetX, m.targetY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Pickups.
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = pk.kind === 'health' ? '#e84a3a' : '#7db8dc';
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + 5);
  }

  // Peds, thugs, cops, cars.
  for (const ped of state.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, false, 0);
  }
  for (const thug of state.thugs) {
    if (thug.dead) continue;
    drawPerson(ctx, thug.x, thug.y, thug.angle, '#3a3a3a', '#c98a5a', false, 0);
    ctx.fillStyle = '#ff5a4d';
    ctx.fillRect(thug.x - 14, thug.y - 24, 28 * (thug.health / TUNING.thugHealth), 4);
  }
  for (const cop of state.cops) {
    if (cop.dead) continue;
    if (cop.inCar) continue; // the patrol car is drawn below
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#2e5fd0', '#e8b88a', false, 0);
  }
  for (const car of state.cars) {
    if (car.dead) continue;
    drawCar(ctx, car, car === state.playerCar);
  }
  // Player on foot (drawn after cars so they stay visible).
  if (state.player.onFoot) {
    drawPerson(ctx, state.player.x, state.player.y, state.player.angle, TUNING.colours.player, '#e8b88a', true, state.player.armour);
  }
  // Headlight cones at night.
  if (state.headlights && light.night && state.playerCar) {
    const car = state.playerCar;
    const grad = ctx.createLinearGradient(car.x, car.y, car.x + Math.cos(car.angle) * 260, car.y + Math.sin(car.angle) * 260);
    grad.addColorStop(0, 'rgba(255,244,190,0.4)');
    grad.addColorStop(1, 'rgba(255,244,190,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(car.x, car.y);
    ctx.lineTo(car.x + Math.cos(car.angle - 0.3) * 260, car.y + Math.sin(car.angle - 0.3) * 260);
    ctx.lineTo(car.x + Math.cos(car.angle + 0.3) * 260, car.y + Math.sin(car.angle + 0.3) * 260);
    ctx.closePath();
    ctx.fill();
  }
  // Tracers + muzzle flash + particles.
  for (const tr of state.tracers) {
    ctx.strokeStyle = 'rgba(255,233,168,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
  }
  if (state.muzzle) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(state.muzzle.x, state.muzzle.y, 10, 0, Math.PI * 2); ctx.fill();
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Helicopter last (it flies above everything).
  if (state.heli) drawHeli(ctx, state.heli, state.time);

  ctx.restore();

  // Screen-space UI.
  if (state.screen === 'title') {
    drawTitle(ctx, state, viewW, viewH);
  } else if (state.screen === 'pause') {
    drawHUD(ctx, state, viewW, viewH);
    drawPause(ctx, viewW, viewH);
  } else if (state.screen === 'passed') {
    drawHUD(ctx, state, viewW, viewH);
    drawPassed(ctx, state, viewW, viewH);
  } else if (state.screen === 'failed') {
    drawHUD(ctx, state, viewW, viewH);
    drawFailed(ctx, state, viewW, viewH);
  } else {
    drawHUD(ctx, state, viewW, viewH);
    if (state.radioLabelT > 0 && state.radioLabel) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(state.radioLabel, viewW - 18, 92);
    }
  }
}

// --- Main loop ------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  handlePressedKeys();
  update(dt);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

// First user gesture unlocks audio (browsers require it).
window.addEventListener('pointerdown', () => state.sound.ensure(), { once: true });
window.addEventListener('keydown', () => state.sound.ensure(), { once: true });

requestAnimationFrame(frame);
