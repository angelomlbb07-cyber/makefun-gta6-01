// actors.js — people: the player on foot, pedestrians, police, thugs,
// and the police helicopter. One job: actors and combat.
import { TUNING } from './tuning.js';
import { makeRng, resolveCircleCollision, solidAt } from './world.js';
import { addPopup, addCrashSparks } from './vehicles.js';

const PED_SHIRTS = ['#d84a6a', '#4a8ad8', '#5ab06a', '#e8e8e8', '#c97e4a', '#8a6ad8', '#3aa88a'];
const PED_SKINS = ['#e8b88a', '#c98a5a', '#8a5a3a', '#f0c8a0'];

export function makePlayer(x, y) {
  return {
    kind: 'player', x, y, angle: -Math.PI / 2, speed: 0,
    health: 100, armour: 0, ammo: TUNING.pistolAmmoStart,
    onFoot: true, punchCooldown: 0, shootCooldown: 0, moving: false,
  };
}

export function makePed(x, y, rng) {
  return {
    kind: 'ped', x, y, angle: rng() * Math.PI * 2, speed: TUNING.pedSpeed * (0.7 + rng() * 0.6),
    shirt: PED_SHIRTS[Math.floor(rng() * PED_SHIRTS.length)],
    skin: PED_SKINS[Math.floor(rng() * PED_SKINS.length)],
    walkPhase: rng() * 6.28, panic: 0, fleeX: 0, fleeY: 0,
  };
}

export function spawnPeds(world, count, nearX, nearY) {
  const rng = makeRng(424242 + count);
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < count * 40) {
    const x = nearX + (rng() - 0.5) * 1600;
    const y = nearY + (rng() - 0.5) * 1200;
    if (x < 200 || x > TUNING.worldWidth - 100 || y < 100 || y > TUNING.worldHeight - 100) continue;
    if (solidAt(world, x, y)) continue;
    peds.push(makePed(x, y, rng));
  }
  return peds;
}

export function makeCop(x, y, inCar) {
  return {
    kind: 'cop', x, y, angle: 0, speed: 0, health: TUNING.copHealth,
    inCar: !!inCar, shootCooldown: 1 + Math.random(), punchCooldown: 0,
    car: null, dead: false,
  };
}

export function makeThug(x, y) {
  return {
    kind: 'thug', x, y, angle: 0, speed: 0, health: TUNING.thugHealth,
    shootCooldown: 1.5 + Math.random(), dead: false, alerted: false,
  };
}

export function makeHeli(x, y) {
  return { kind: 'heli', x, y, angle: 0, speed: 0, searchAngle: 0, shootCooldown: 2.5 };
}

// --- Player on foot -------------------------------------------------------
export function updatePlayerOnFoot(player, input, world, dt, state) {
  const T = TUNING;
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const running = input.run;
  const speed = running ? T.runSpeed : T.walkSpeed;
  player.moving = mx !== 0 || my !== 0;
  if (player.moving) {
    const len = Math.hypot(mx, my);
    player.x += (mx / len) * speed * dt;
    player.y += (my / len) * speed * dt;
    player.angle = Math.atan2(my, mx);
    if (resolveCircleCollision(world, player, T.playerRadius) || solidAt(world, player.x, player.y)) {
      player.x -= (mx / len) * speed * dt;
      player.y -= (my / len) * speed * dt;
    }
  }
  player.x = Math.max(TUNING.waterX + 16, Math.min(TUNING.worldWidth - 16, player.x));
  player.y = Math.max(16, Math.min(TUNING.worldHeight - 16, player.y));
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  // Aim at the mouse when shooting; otherwise face the walk direction.
  if (state.mouse.down || input.shoot) {
    player.angle = Math.atan2(state.mouse.worldY - player.y, state.mouse.worldX - player.x);
  }
}

// Punch: damages the nearest thug / cop / ped in range, in front of the player.
export function playerPunch(state) {
  const p = state.player;
  if (p.punchCooldown > 0 || !p.onFoot) return false;
  p.punchCooldown = TUNING.punchCooldown;
  let hitAny = false;
  const targets = [...state.thugs, ...state.cops];
  for (const t of targets) {
    if (t.dead) continue;
    const dx = t.x - p.x, dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < TUNING.punchRange + 14) {
      t.health -= TUNING.punchDamage;
      state.stats.punches += 1;
      addPopup(state, t.x, t.y - 26, `-${TUNING.punchDamage}`, '#ffffff');
      if (t.health <= 0) killActor(state, t);
      hitAny = true;
    }
  }
  return hitAny;
}

// Shoot: hitscan with a tracer + muzzle flash; consumes ammo.
export function playerShoot(state) {
  const p = state.player;
  if (p.shootCooldown > 0 || !p.onFoot || p.ammo <= 0) return false;
  p.shootCooldown = TUNING.pistolCooldown;
  p.ammo -= 1;
  state.stats.shots += 1;
  const angle = p.angle;
  const range = TUNING.pistolRange;
  let hit = null, hitD = range;
  const targets = [...state.thugs, ...state.cops];
  for (const t of targets) {
    if (t.dead) continue;
    const dx = t.x - p.x, dy = t.y - p.y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > range) continue;
    const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (perp < 20 && along < hitD) { hit = t; hitD = along; }
  }
  const endX = p.x + Math.cos(angle) * hitD;
  const endY = p.y + Math.sin(angle) * hitD;
  state.tracers.push({ x1: p.x, y1: p.y, x2: endX, y2: endY, life: TUNING.tracerLife });
  state.muzzle = { x: p.x + Math.cos(angle) * 20, y: p.y + Math.sin(angle) * 20, life: 0.07 };
  state.particles.push({
    x: state.muzzle.x, y: state.muzzle.y, vx: 0, vy: 0,
    life: 0.07, maxLife: 0.07, color: '#ffe9a8', size: 9,
  });
  if (hit) {
    hit.health -= TUNING.pistolDamage;
    state.stats.hits += 1;
    state.particles.push({
      x: endX, y: endY, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: '#ff5a4d', size: 6,
    });
    if (hit.health <= 0) killActor(state, hit);
    else if (hit.kind === 'thug') hit.alerted = true;
  }
  // Firing in public draws the law.
  raiseWanted(state, 0.4);
  if (state.sound) state.sound.shoot();
  return true;
}

export function killActor(state, actor) {
  actor.dead = true;
  addPopup(state, actor.x, actor.y - 26, actor.kind === 'thug' ? 'THUG DOWN +$40' : 'COP DOWN', '#ffb13c');
  if (actor.kind === 'thug') {
    state.cash += 40;
    state.stats.thugsDown += 1;
    raiseWanted(state, 0.6);
    maybeDropPickup(state, actor.x, actor.y);
  } else if (actor.kind === 'cop') {
    raiseWanted(state, 1);
    state.stats.copsDown += 1;
  }
  addCrashSparks(state, actor.x, actor.y);
}

export function maybeDropPickup(state, x, y) {
  if (Math.random() < 0.4) {
    state.pickups.push({
      kind: Math.random() < 0.5 ? 'health' : 'armour',
      x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30,
    });
  }
}

export function collectPickups(state) {
  const p = state.player;
  if (!p.onFoot) return;
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < TUNING.pickupRadius) {
      pk.taken = true;
      if (pk.kind === 'health') {
        p.health = Math.min(100, p.health + TUNING.healthPickupHeal);
        addPopup(state, p.x, p.y - 30, `+${TUNING.healthPickupHeal} HEALTH`, '#7ddc8a');
      } else {
        p.armour = Math.min(100, p.armour + TUNING.armourPickupAmount);
        addPopup(state, p.x, p.y - 30, `+${TUNING.armourPickupAmount} ARMOUR`, '#7db8dc');
      }
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);
}

// Damage the player, armour absorbing first.
export function damagePlayer(state, amount) {
  const p = state.player;
  const absorbed = Math.min(p.armour, amount);
  p.armour -= absorbed;
  p.health -= (amount - absorbed);
  if (p.health <= 0) {
    p.health = 0;
    state.playerDead = true;
  }
}

// --- Wanted ---------------------------------------------------------------
export function raiseWanted(state, amount) {
  state.wanted = Math.min(TUNING.wantedMax, state.wanted + amount);
  state.wantedWhole = Math.floor(state.wanted);
  state.lastSeenT = state.time;
}

export function updateWanted(state, dt) {
  const T = TUNING;
  // Wanted decays only while no cop can see the player.
  const seen = state.cops.some((c) => !c.dead && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 420)
    || (state.heli && Math.hypot(state.heli.x - state.player.x, state.heli.y - state.player.y) < 520);
  if (seen) state.lastSeenT = state.time;
  if (state.wanted > 0 && state.time - state.lastSeenT > T.wantedDecayDelay) {
    state.wantedDecayT += dt;
    if (state.wantedDecayT >= T.wantedDecayInterval) {
      state.wantedDecayT = 0;
      state.wanted = Math.max(0, state.wanted - 1);
      state.wantedWhole = Math.floor(state.wanted);
    }
  } else {
    state.wantedDecayT = 0;
  }
  // Keep the response matched to the stars.
  const wantFoot = state.wantedWhole >= T.starsForFootCops ? Math.min(3 + state.wantedWhole, 8) : 0;
  const wantCars = state.wantedWhole >= T.starsForPatrolCars ? Math.min(state.wantedWhole, 4) : 0;
  const wantHeli = state.wantedWhole >= T.starsForHeli ? 1 : 0;
  while (state.cops.filter((c) => !c.dead && !c.inCar).length < wantFoot) {
    const a = Math.random() * Math.PI * 2;
    state.cops.push(makeCop(
      state.player.x + Math.cos(a) * T.copSpawnDistance,
      state.player.y + Math.sin(a) * T.copSpawnDistance, false));
  }
  while (state.cops.filter((c) => !c.dead && c.inCar).length < wantCars) {
    const a = Math.random() * Math.PI * 2;
    const cop = makeCop(
      state.player.x + Math.cos(a) * (T.copSpawnDistance + 160),
      state.player.y + Math.sin(a) * (T.copSpawnDistance + 160), true);
    const car = { kind: 'car', x: cop.x, y: cop.y, angle: a, model: 'Interceptor', color: TUNING.colours.police, len: 48, wid: 23, speed: 0, health: 100, traffic: false, steer: 0, drift: 0, dead: false, targetSpeed: TUNING.copCarSpeed, police: true };
    cop.car = car;
    state.cars.push(car);
    state.cops.push(cop);
  }
  if (wantHeli && !state.heli) state.heli = makeHeli(state.player.x - 200, state.player.y - 300);
  if (!wantHeli) state.heli = null;
  if (state.heli) {
    const h = state.heli;
    const dx = state.player.x - h.x, dy = state.player.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    h.x += (dx / d) * TUNING.heliSpeed * dt;
    h.y += (dy / d) * TUNING.heliSpeed * dt;
    h.searchAngle = Math.atan2(dy, dx);
    h.shootCooldown -= dt;
    if (d < 380 && h.shootCooldown <= 0) {
      h.shootCooldown = 2.2;
      damagePlayer(state, TUNING.copShootDamage);
      state.tracers.push({ x1: h.x, y1: h.y, x2: state.player.x, y2: state.player.y, life: 0.08 });
    }
  }
}

// --- Police / thug AI -----------------------------------------------------
export function updateCops(state, dt) {
  const p = state.player;
  for (const cop of state.cops) {
    if (cop.dead) continue;
    const dx = p.x - cop.x, dy = p.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    if (cop.inCar && cop.car && !cop.car.dead) {
      const car = cop.car;
      const wantAngle = Math.atan2(dy, dx);
      let diff = wantAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      car.speed = Math.min(TUNING.copCarSpeed, car.speed + 420 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      cop.x = car.x; cop.y = car.y;
      if (d < 60) { // ram the player
        if (p.onFoot) damagePlayer(state, TUNING.copPunchDamage);
        car.speed *= 0.4;
      }
      resolveCircleCollision(state.world, car, car.len / 2);
    } else {
      const speed = TUNING.copFootSpeed;
      cop.x += (dx / d) * speed * dt;
      cop.y += (dy / d) * speed * dt;
      cop.shootCooldown -= dt;
      cop.punchCooldown = Math.max(0, cop.punchCooldown - dt);
      if (d < 34 && cop.punchCooldown <= 0) {
        cop.punchCooldown = 0.9;
        damagePlayer(state, TUNING.copPunchDamage);
      } else if (d < 300 && d > 90 && cop.shootCooldown <= 0) {
        cop.shootCooldown = 1.4;
        damagePlayer(state, TUNING.copShootDamage);
        state.tracers.push({ x1: cop.x, y1: cop.y, x2: p.x, y2: p.y, life: 0.08 });
      }
      resolveCircleCollision(state.world, cop, 13);
    }
  }
  state.cops = state.cops.filter((c) => !c.dead || c.inCar);
  // Drop corpses' cars out of the cop list cleanly.
  state.cops = state.cops.filter((c) => !(c.dead && !c.inCar));
}

export function updateThugs(state, dt) {
  const p = state.player;
  for (const thug of state.thugs) {
    if (thug.dead) continue;
    const dx = p.x - thug.x, dy = p.y - thug.y;
    const d = Math.hypot(dx, dy) || 1;
    thug.angle = Math.atan2(dy, dx);
    if (thug.alerted && d < 520) {
      thug.shootCooldown -= dt;
      if (d > 130) {
        thug.x += (dx / d) * 120 * dt;
        thug.y += (dy / d) * 120 * dt;
      }
      if (thug.shootCooldown <= 0) {
        thug.shootCooldown = 1.1 + Math.random() * 0.5;
        if (d < 480) {
          damagePlayer(state, TUNING.thugShootDamage);
          state.tracers.push({ x1: thug.x, y1: thug.y, x2: p.x, y2: p.y, life: 0.08 });
          if (state.sound) state.sound.enemyShoot();
        }
      }
      resolveCircleCollision(state.world, thug, 13);
    }
  }
}

// --- Pedestrians ----------------------------------------------------------
export function updatePeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (state.wantedWhole >= 2 && d < 220) {
      // Panic: run away from the player.
      ped.panic = 2;
      ped.fleeX = ped.x - p.x; ped.fleeY = ped.y - p.y;
    }
    if (ped.panic > 0) {
      ped.panic -= dt;
      const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
      ped.x += (ped.fleeX / len) * 150 * dt;
      ped.y += (ped.fleeY / len) * 150 * dt;
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
    } else {
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      ped.walkPhase += dt * 6;
      if (Math.random() < dt * 0.12) ped.angle += (Math.random() - 0.5) * 1.6;
      if (solidAt(state.world, ped.x, ped.y)) {
        ped.x -= Math.cos(ped.angle) * ped.speed * dt * 2;
        ped.y -= Math.sin(ped.angle) * ped.speed * dt * 2;
        ped.angle += Math.PI / 2;
      }
    }
    ped.x = Math.max(150, Math.min(TUNING.worldWidth - 40, ped.x));
    ped.y = Math.max(40, Math.min(TUNING.worldHeight - 40, ped.y));
  }
}

// --- Rendering ------------------------------------------------------------
export function drawPerson(ctx, x, y, angle, shirt, skin, isPlayer, armour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Body (shoulders) + head, top-down.
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(4, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22303c';
  ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, Math.PI * 2); ctx.fill(); // hair cap
  // Gun in hand when shooting.
  ctx.fillStyle = '#2c2f36';
  ctx.fillRect(8, -2, 12, 4);
  if (isPlayer) {
    ctx.strokeStyle = '#e8b13c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    if (armour > 0) {
      ctx.strokeStyle = '#7db8dc';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawHeli(ctx, heli, time) {
  const bob = Math.sin(time * 2.2) * 4;
  ctx.save();
  ctx.translate(heli.x, heli.y + bob);
  // Searchlight cone down toward the player.
  const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 260);
  grad.addColorStop(0, 'rgba(255,244,190,0.5)');
  grad.addColorStop(1, 'rgba(255,244,190,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, 0, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(4, 6, 26, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TUNING.colours.heli;
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 15, heli.angle, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#9aa5b1';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath(); ctx.arc(18, -4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
