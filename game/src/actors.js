// actors.js — people: the player on foot, pedestrians, foot cops, patrol
// cars and the police helicopter. One job: bodies and the wanted level.
// damagePlayer is the ONLY place that can set events.wasted — every damage
// source (ram, punch, bullet) routes through it, so death always fires.

import { FOOT, GUN, WANTED, WORLD, clamp, dist, wrapAngle, mulberry32 } from './tuning.js';
import { isWater, roadPoint } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null,
    health: 100, armour: 0,
    weapon: 'pistol',
    ammoPistol: GUN.pistol.mag, reservePistol: GUN.pistol.reserve,
    ammoSmg: GUN.smg.mag, reserveSmg: GUN.smg.reserve,
    fireCooldown: 0, reloadTimer: 0,
    invuln: 0, runTimer: 0,
    aimAngle: 0,
  };
}

export function createPed(x, y, rng) {
  const colors = ['#e8c840', '#c86a8a', '#6aa8c8', '#8ac86a', '#d8d8d8', '#e08a3a'];
  return {
    x, y, angle: rng() * Math.PI * 2, speed: 30 + rng() * 40,
    color: colors[Math.floor(rng() * colors.length)],
    walkPhase: rng() * 6, target: null, panic: 0,
  };
}

export function spawnPeds(state, count) {
  const rng = mulberry32((state.world.seed ^ 0x77aa) >>> 0);
  let guard = 0;
  while (state.peds.length < count && guard++ < 300) {
    const p = roadPoint(state.world, rng);
    if (dist(p.x, p.y, state.player.x, state.player.y) < 260) continue;
    state.peds.push(createPed(p.x, p.y, rng));
  }
}

// --- the player on foot ---------------------------------------------------

export function stepPlayerOnFoot(state, input, dt) {
  const p = state.player;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.reloadTimer = Math.max(0, p.reloadTimer - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const speed = input.run ? FOOT.runSpeed : FOOT.walkSpeed;
  if (moving) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.walkPhase = (p.walkPhase || 0) + dt * 10;
  }
  p.x = clamp(p.x, 20, WORLD.width - 20);
  p.y = clamp(p.y, 20, WORLD.height - 20);
  // Aim at the mouse (screen space is converted by boot.js into world aim).
  if (input.aimX !== undefined) p.aimAngle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  // Slow health regen while alive and not recently hurt.
  if (p.health > 0 && p.health < 100 && p.invuln <= 0) p.health = Math.min(100, p.health + 2 * dt);
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (p.invuln > 0 || state.events.wasted || state.events.busted) return;
  let left = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, left * 0.6);
    p.armour -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  p.invuln = 0.6; // brief i-frames so rams cannot stack every frame
  state.events.hurtFlash = 0.25;
  if (p.health <= 0) {
    p.health = 0;
    state.events.wasted = true;
    state.screen = 'wasted';
    state.cash = Math.max(0, state.cash - WANTED.wastedFine);
  }
}

// Fire the current weapon toward the aim angle. Returns a tracer to draw.
export function fireWeapon(state) {
  const p = state.player;
  if (p.fireCooldown > 0 || p.reloadTimer > 0 || !p.onFoot) return null;
  const gun = p.weapon === 'smg' ? GUN.smg : GUN.pistol;
  const ammoKey = p.weapon === 'smg' ? 'ammoSmg' : 'ammoPistol';
  if (p[ammoKey] <= 0) { reloadWeapon(state); return null; }
  p[ammoKey]--;
  p.fireCooldown = gun.rate;
  const spread = (Math.random() - 0.5) * gun.spread * 2;
  const a = p.aimAngle + spread;
  const ex = p.x + Math.cos(a) * gun.range, ey = p.y + Math.sin(a) * gun.range;
  state.mission.stats.shotsFired++;
  state.tracers.push({ x1: p.x, y1: p.y, x2: ex, y2: ey, t: 0.09, color: '#ffe08a' });
  state.flashes.push({ x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18, t: 0.07 });
  // Hit test: nearest enemy within a cone of the shot line.
  let best = null, bestD = Infinity;
  for (const e of [...state.cops, ...state.enemies]) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const along = dx * Math.cos(a) + dy * Math.sin(a);
    if (along < 0 || along > gun.range) continue;
    const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
    if (perp < 26 && along < bestD) { bestD = along; best = e; }
  }
  if (best) {
    best.health -= gun.damage;
    state.mission.stats.shotsHit++;
    if (best.health <= 0) {
      best.dead = true;
      state.mission.stats.kills++;
      state.floats.push({ x: best.x, y: best.y - 20, text: 'DOWN', t: 1.2, color: '#ff5a5a' });
    }
  }
  return { x: ex, y: ey };
}

export function reloadWeapon(state) {
  const p = state.player;
  const gun = p.weapon === 'smg' ? GUN.smg : GUN.pistol;
  const ammoKey = p.weapon === 'smg' ? 'ammoSmg' : 'ammoPistol';
  const reserveKey = p.weapon === 'smg' ? 'reserveSmg' : 'reservePistol';
  if (p[ammoKey] >= gun.mag || p[reserveKey] <= 0 || p.reloadTimer > 0) return;
  const need = gun.mag - p[ammoKey];
  const take = Math.min(need, p[reserveKey]);
  p[ammoKey] += take;
  p[reserveKey] -= take;
  p.reloadTimer = 0.9;
}

// --- pedestrians ----------------------------------------------------------

export function stepPeds(state, dt) {
  const rng = mulberry32((state.time * 977 | 0) + 13);
  for (const ped of state.peds) {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
      ped.target = roadPoint(state.world, rng);
    }
    const danger = state.wanted >= 3 || state.events.wasted;
    const speed = ped.panic > 0 ? 150 : ped.speed;
    const a = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.angle = a;
    ped.x += Math.cos(a) * speed * dt;
    ped.y += Math.sin(a) * speed * dt;
    ped.walkPhase += dt * 8;
    ped.panic = Math.max(0, ped.panic - dt);
    // Flee from gunfire.
    if (state.flashes.length > 0 && dist(ped.x, ped.y, state.player.x, state.player.y) < 300) ped.panic = 1.5;
    if (isWater(state.world, ped.x, ped.y)) { ped.x += 30 * dt * 10; }
  }
}

// --- police ---------------------------------------------------------------

export function addWanted(state, stars) {
  state.wanted = clamp(state.wanted + stars, 0, WANTED.maxStars);
  state.wantedHeat = state.wanted * WANTED.heatPerStar;
  state.wantedSeenTimer = 0;
}

// Wanted decays only while no cop can see the player.
export function stepWanted(state, dt) {
  if (state.wanted <= 0) return;
  const seen = state.cops.some(c => !c.dead && dist(c.x, c.y, state.player.x, state.player.y) < 420)
    || state.copCars.some(c => !c.dead && dist(c.x, c.y, state.player.x, state.player.y) < 520)
    || (state.heli && dist(state.heli.x, state.heli.y, state.player.x, state.player.y) < 600);
  if (seen) { state.wantedSeenTimer = 0; return; }
  state.wantedSeenTimer += dt;
  if (state.wantedSeenTimer < WANTED.seenGrace) return;
  state.wantedHeat -= WANTED.decayPerSecond * dt;
  if (state.wantedHeat <= 0) {
    state.wanted = Math.max(0, state.wanted - 1);
    state.wantedHeat = state.wanted * WANTED.heatPerStar;
    if (state.wanted === 0) { state.cops = []; state.copCars = []; state.heli = null; }
  }
}

export function spawnPolice(state) {
  const p = state.player;
  const rng = mulberry32((state.time * 613 | 0) + 7);
  const wantFoot = state.wanted >= 1 ? Math.min(2 + state.wanted, 6) : 0;
  const wantCars = state.wanted >= 2 ? Math.min(state.wanted - 1, 3) : 0;
  while (state.cops.filter(c => !c.dead).length < wantFoot) {
    const a = rng() * Math.PI * 2;
    const x = clamp(p.x + Math.cos(a) * 520, 40, WORLD.width - 40);
    const y = clamp(p.y + Math.sin(a) * 520, 40, WORLD.height - 40);
    state.cops.push({ x, y, health: 60, speed: 200, dead: false, punchTimer: 0, bustTimer: 0 });
  }
  while (state.copCars.filter(c => !c.dead).length < wantCars) {
    const a = rng() * Math.PI * 2;
    const x = clamp(p.x + Math.cos(a) * 640, 40, WORLD.width - 40);
    const y = clamp(p.y + Math.sin(a) * 640, 40, WORLD.height - 40);
    const car = { x, y, angle: 0, speed: 0, vx: 0, vy: 0, type: { name: 'Police Interceptor', color: '#20242e', top: 1.05 }, typeIndex: 0, damage: 0, color: '#20242e', traffic: false, police: true, stolen: false, nitro: 3, driftChain: 0, driftTime: 0, dead: false, path: null, pathIdx: 0 };
    state.copCars.push(car);
    state.cars.push(car);
  }
  if (state.wanted >= 2 && !state.heli) {
    state.heli = { x: p.x + 300, y: p.y - 300, angle: 0, searchOn: true };
  }
  if (state.wanted < 2) state.heli = null;
}

export function stepCops(state, dt) {
  const p = state.player;
  for (const cop of state.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const a = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = a;
    if (d > 26) {
      cop.x += Math.cos(a) * cop.speed * dt;
      cop.y += Math.sin(a) * cop.speed * dt;
    }
    cop.punchTimer -= dt;
    if (d < 30 && cop.punchTimer <= 0) {
      cop.punchTimer = 0.9;
      damagePlayer(state, 8); // foot-cop punch, routed through damagePlayer (F3)
    }
    // Bust: a cop standing next to you on foot for 1.5 s arrests you.
    if (d < 40 && p.onFoot && !state.events.wasted) {
      cop.bustTimer += dt;
      if (cop.bustTimer >= WANTED.bustTime) {
        state.events.busted = true;
        state.screen = 'busted';
        state.cash = Math.max(0, state.cash - WANTED.bustFine);
        state.wanted = 0; state.wantedHeat = 0;
      }
    } else cop.bustTimer = 0;
  }
  for (const car of state.copCars) {
    if (car.dead) continue;
    const d = dist(car.x, car.y, p.x, p.y);
    const want = Math.atan2(p.y - car.y, p.x - car.x);
    car.angle += clamp(wrapAngle(want - car.angle), -2.2 * dt, 2.2 * dt);
    const target = p.car ? Math.min(WANTED.copCarSpeed, d * 1.4 + 120) : Math.min(320, d * 1.2 + 60);
    car.speed = lerp(car.speed, target, 1 - Math.exp(-2 * dt));
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    // Ram: on contact the cop car hurts the player through damagePlayer.
    if (d < 40) {
      if (p.car) {
        p.car.damage = Math.min(100, p.car.damage + 4);
        car.speed *= 0.5;
      } else {
        damagePlayer(state, 14); // cop-car ram, routed through damagePlayer (F3)
        car.speed *= 0.4;
      }
    }
  }
}

export function stepHeli(state, dt) {
  const h = state.heli;
  if (!h) return;
  const p = state.player;
  const d = dist(h.x, h.y, p.x, p.y);
  const want = Math.atan2(p.y - h.y, p.x - h.x);
  h.angle = want;
  const sp = d > 200 ? WANTED.heliSpeed : 120;
  h.x += Math.cos(want) * sp * dt;
  h.y += Math.sin(want) * sp * dt;
  // The searchlight pins the player: heat stops decaying while lit.
  h.lit = d < WANTED.heliSpotRadius * 2.4;
}

// --- drawing people -------------------------------------------------------

function drawPerson(ctx, x, y, angle, color, opts = {}) {
  const big = opts.big ? 1.6 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 10 * big, 7 * big, 0, 0, Math.PI * 2); ctx.fill();
  // Body (drawn as a visible person, never a dot).
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 9 * big, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0c8a0'; // head
  ctx.beginPath(); ctx.arc(5 * big, 0, 5.5 * big, 0, Math.PI * 2); ctx.fill();
  if (opts.gun) {
    ctx.strokeStyle = '#1c1c20'; ctx.lineWidth = 3 * big;
    ctx.beginPath(); ctx.moveTo(8 * big, 0); ctx.lineTo(20 * big, 0); ctx.stroke();
  }
  if (opts.cop) {
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(5 * big, 0, 5.5 * big, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a6aff';
    ctx.fillRect(-2, -8 * big, 12, 3);
  }
  ctx.restore();
}

export function drawActors(ctx, state, cam) {
  const p = state.player;
  // Pedestrians as visible people.
  for (const ped of state.peds) {
    if (ped.x < cam.x - 60 || ped.x > cam.x + 1340 || ped.y < cam.y - 60 || ped.y > cam.y + 860) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, { panic: ped.panic > 0 });
  }
  // Mission enemies (gang / guards).
  for (const e of state.enemies) {
    if (e.dead) continue;
    drawPerson(ctx, e.x, e.y, e.angle || 0, '#a83a3a', { gun: true, big: true });
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - 18, e.y - 26, 36, 5);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(e.x - 18, e.y - 26, 36 * Math.max(0, e.health / 60), 5);
  }
  // Foot cops.
  for (const cop of state.cops) {
    if (cop.dead) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle || 0, '#20242e', { cop: true, big: true });
  }
  // The player on foot — large, with a gun, never a dot.
  if (p.onFoot) {
    drawPerson(ctx, p.x, p.y, p.aimAngle || p.angle, '#e8b04b', { gun: true, big: true });
    if (p.invuln > 0 && Math.floor(state.time * 10) % 2 === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Helicopter + searchlight.
  const h = state.heli;
  if (h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    if (h.lit) {
      const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, WANTED.heliSpotRadius);
      grad.addColorStop(0, 'rgba(255,250,200,0.30)');
      grad.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x - h.x, p.y - h.y, WANTED.heliSpotRadius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,250,200,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.x - h.x, p.y - h.y); ctx.stroke();
    }
    ctx.rotate(h.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 4, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c8c8d0'; ctx.lineWidth = 2;
    const rotor = state.time * 22;
    ctx.beginPath(); ctx.moveTo(Math.cos(rotor) * 30, Math.sin(rotor) * 6); ctx.lineTo(-Math.cos(rotor) * 30, -Math.sin(rotor) * 6); ctx.stroke();
    ctx.restore();
  }
  // Bullet tracers and muzzle flashes.
  for (const t of state.tracers) {
    ctx.strokeStyle = t.color; ctx.lineWidth = 3;
    ctx.globalAlpha = Math.min(1, t.t / 0.09);
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const f of state.flashes) {
    ctx.fillStyle = 'rgba(255,220,120,0.95)';
    ctx.beginPath(); ctx.arc(f.x, f.y, 10 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, Math.PI * 2); ctx.fill();
  }
}
