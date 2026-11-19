// SOLMAR actors — the player on foot, pedestrians, enemy gunmen, the
// police helicopter, bullets, muzzle flashes and particles.

import { WORLD_W, WORLD_H, clamp, dist, angleTo, angleDiff, pushOutOfRect, mulberry32 } from './core.js';
import { TUNE } from './tuning.js';
import { isOnRoad, isWater } from './world.js';
import { addWanted, addFloat, explodeCar, nearestCar } from './vehicles.js';

export function spawnPeds(G, city, n) {
  const rng = mulberry32(99);
  while (G.peds.length < n) {
    const x = 320 + rng() * (WORLD_W - 420);
    const y = 80 + rng() * (WORLD_H - 160);
    if (dist(x, y, G.player.x, G.player.y) < 320) continue;
    if (isWater(x, y, city)) continue;
    G.peds.push({
      x, y, angle: rng() * Math.PI * 2,
      speed: 45 + rng() * 35, r: 12,
      color: ['#e07a5f', '#81b29a', '#f2cc8f', '#6d9dc5', '#c08497'][Math.floor(rng() * 5)],
      flee: 0, walkT: rng() * 4,
    });
  }
}

export function updatePeds(G, dt, city) {
  for (const p of G.peds) {
    if (p.flee > 0) {
      p.flee -= dt;
      const a = Math.atan2(p.y - G.player.y, p.x - G.player.x);
      p.x += Math.cos(a) * 190 * dt;
      p.y += Math.sin(a) * 190 * dt;
    } else {
      p.walkT -= dt;
      if (p.walkT <= 0) {
        p.walkT = 2 + Math.random() * 4;
        p.angle = Math.random() * Math.PI * 2;
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
    }
    p.x = clamp(p.x, 300, WORLD_W - 40);
    p.y = clamp(p.y, 40, WORLD_H - 40);
    if (isWater(p.x, p.y, city)) {
      p.x = clamp(p.x, 300, WORLD_W - 40);
      p.angle += Math.PI;
    }
    for (const b of city.buildings) {
      if (p.x < b.x - 30 || p.x > b.x + b.w + 30 || p.y < b.y - 30 || p.y > b.y + b.h + 30) continue;
      pushOutOfRect(p, b);
    }
  }
  // Keep the streets populated.
  if (G.peds.length < TUNE.maxPeds) spawnPeds(G, city, TUNE.maxPeds);
}

export function drawPeds(ctx, G, cam, view) {
  for (const p of G.peds) {
    if (p.x < cam.x - 30 || p.x > cam.x + view.w + 30 || p.y < cam.y - 30 || p.y > cam.y + view.h + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 3, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function spawnFoes(G, x, y, n, hp) {
  for (let i = 0; i < n; i++) {
    G.foes.push({
      x: x + (Math.random() - 0.5) * 160,
      y: y + (Math.random() - 0.5) * 160,
      angle: 0, r: 14, hp: hp || 100, maxHp: hp || 100,
      speed: 120 + Math.random() * 40,
      fireCd: 1 + Math.random(), burst: 0,
      color: '#8a2f2f',
    });
  }
}

export function updateFoes(G, dt, city, S) {
  for (const f of G.foes) {
    if (f.hp <= 0) continue;
    const d = dist(f.x, f.y, G.player.x, G.player.y);
    f.angle = angleTo(f.x, f.y, G.player.x, G.player.y);
    if (d > 260) {
      f.x += Math.cos(f.angle) * f.speed * dt;
      f.y += Math.sin(f.angle) * f.speed * dt;
    } else if (d < 140) {
      f.x -= Math.cos(f.angle) * f.speed * 0.6 * dt;
      f.y -= Math.sin(f.angle) * f.speed * 0.6 * dt;
    }
    for (const b of city.buildings) {
      if (f.x < b.x - 30 || f.x > b.x + b.w + 30 || f.y < b.y - 30 || f.y > b.y + b.h + 30) continue;
      pushOutOfRect(f, b);
    }
    f.fireCd -= dt;
    if (f.fireCd <= 0 && d < 520) {
      f.fireCd = 1.1 + Math.random() * 0.9;
      fireBullet(G, f.x, f.y, f.angle + (Math.random() - 0.5) * 0.22, false, S);
      if (S) S.foeShot();
    }
  }
  G.foes = G.foes.filter((f) => f.hp > 0);
}

export function drawFoes(ctx, G, cam, view) {
  for (const f of G.foes) {
    if (f.x < cam.x - 30 || f.x > cam.x + view.w + 30 || f.y < cam.y - 30 || f.y > cam.y + view.h + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(f.x + 2, f.y + 3, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(f.x, f.y - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    // Gun barrel + health bar.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x + Math.cos(f.angle) * 22, f.y + Math.sin(f.angle) * 22);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.fillRect(f.x - 14, f.y - 24, 28, 5);
    ctx.fillStyle = '#ff5a4d';
    ctx.fillRect(f.x - 14, f.y - 24, 28 * (f.hp / f.maxHp), 5);
  }
}

export function fireBullet(G, x, y, angle, friendly, S) {
  G.bullets.push({
    x, y, angle,
    vx: Math.cos(angle) * TUNE.bulletSpeed,
    vy: Math.sin(angle) * TUNE.bulletSpeed,
    life: TUNE.bulletRange / TUNE.bulletSpeed,
    friendly,
  });
  // Muzzle flash.
  for (let i = 0; i < 4; i++) {
    G.parts.push({
      x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20,
      vx: Math.cos(angle + (Math.random() - 0.5)) * 260,
      vy: Math.sin(angle + (Math.random() - 0.5)) * 260,
      life: 0.12, max: 0.12, size: 3 + Math.random() * 3,
      color: '#ffd94d',
    });
  }
  if (friendly) {
    G.shotsFired++;
    if (S) S.shot();
  }
}

export function updateBullets(G, dt, city, S) {
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Walls stop bullets.
    for (const bd of city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) {
        b.life = 0;
        G.parts.push({
          x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, max: 0.2, size: 4, color: '#c9c9c9',
        });
        break;
      }
    }
    if (b.life <= 0) continue;
    if (b.friendly) {
      for (const f of G.foes) {
        if (f.hp <= 0) continue;
        if (dist(b.x, b.y, f.x, f.y) < 18) {
          f.hp -= TUNE.pistolDamage;
          b.life = 0;
          G.shotsHit++;
          addFloat(G, f.x, f.y - 22, '-' + TUNE.pistolDamage, '#ff8a7a');
          if (f.hp <= 0) {
            G.kills++;
            addWanted(G, TUNE.wantedPerKill);
            G.money += 40;
            addFloat(G, f.x, f.y - 34, '+$40', '#ffd94d');
            for (let i = 0; i < 10; i++) {
              G.parts.push({
                x: f.x, y: f.y,
                vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300,
                life: 0.4, max: 0.4, size: 4, color: '#c94f42',
              });
            }
          }
          break;
        }
      }
      // Shooting a car damages it.
      if (b.life > 0) {
        for (const c of G.cars) {
          if (c.dead || c.driver === 'player') continue;
          if (dist(b.x, b.y, c.x, c.y) < 26) {
            c.hp -= TUNE.pistolDamage;
            b.life = 0;
            if (c.hp <= 0) explodeCar(G, c, S);
            break;
          }
        }
      }
      // Shooting a pedestrian is a crime.
      if (b.life > 0) {
        for (const p of G.peds) {
          if (dist(b.x, b.y, p.x, p.y) < 16) {
            b.life = 0;
            p.flee = 6;
            addWanted(G, TUNE.wantedPerShot);
            break;
          }
        }
      }
    } else {
      // Enemy fire: the player, or their car, takes the hit.
      const p = G.player;
      const target = p.onFoot ? { x: p.x, y: p.y, r: 16 } : { x: p.x, y: p.y, r: 26 };
      if (dist(b.x, b.y, target.x, target.y) < target.r) {
        b.life = 0;
        hurtPlayer(G, TUNE.foeDamage, S);
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

export function hurtPlayer(G, dmg, S) {
  const p = G.player;
  if (p.hurtT > 0) return;
  p.hurtT = 0.5;
  let left = dmg;
  if (G.armour > 0) {
    const absorbed = Math.min(G.armour, left);
    G.armour -= absorbed;
    left -= absorbed;
  }
  G.health -= left;
  if (G.health <= 0) {
    G.health = 0;
    G.mode = 'over';
  }
}

export function updatePlayerOnFoot(G, dt, city, S) {
  const p = G.player;
  const keys = G.keys;
  let mx = 0;
  let my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  const len = Math.hypot(mx, my) || 1;
  const running = keys.ShiftLeft || keys.ShiftRight;
  const speed = running ? TUNE.runSpeed : TUNE.walkSpeed;
  p.moving = mx !== 0 || my !== 0;
  p.x += (mx / len) * speed * dt * (p.moving ? 1 : 0);
  p.y += (my / len) * speed * dt * (p.moving ? 1 : 0);
  p.x = clamp(p.x, 170, WORLD_W - 40);
  p.y = clamp(p.y, 40, WORLD_H - 40);
  // Aim at the mouse (world coordinates).
  p.aim = Math.atan2(G.mouse.wy - p.y, G.mouse.wx - p.x);
  p.angle = p.aim;
  // Collide with buildings.
  for (const b of city.buildings) {
    if (p.x < b.x - 30 || p.x > b.x + b.w + 30 || p.y < b.y - 30 || p.y > b.y + b.h + 30) continue;
    pushOutOfRect(p, b);
  }
  // Shooting.
  p.fireCd -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const take = Math.min(24 - G.ammo, G.reserveAmmo);
      G.ammo += take;
      G.reserveAmmo -= take;
    }
  }
  if (G.mouse.down && p.fireCd <= 0 && p.reloadT <= 0) {
    if (G.ammo > 0) {
      G.ammo--;
      p.fireCd = 0.16;
      fireBullet(G, p.x + Math.cos(p.aim) * 20, p.y + Math.sin(p.aim) * 20, p.aim, true, S);
      addWanted(G, TUNE.wantedPerShot * 0.4);
      // Nearby pedestrians flee from gunfire.
      for (const ped of G.peds) {
        if (dist(ped.x, ped.y, p.x, p.y) < 300) ped.flee = 4;
      }
    } else if (G.reserveAmmo > 0) {
      p.reloadT = 1.1;
    }
  }
  if (keys.KeyR && G.ammo < 24 && G.reserveAmmo > 0 && p.reloadT <= 0) {
    p.reloadT = 1.1;
  }
  if (p.hurtT > 0) p.hurtT -= dt;
  if (S) S.setEngine(0, false);
}

export function updateParticles(G, dt) {
  for (const pt of G.parts) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
  }
  G.parts = G.parts.filter((pt) => pt.life > 0);
  for (const f of G.floats) {
    f.y -= 34 * dt;
    f.life -= dt;
  }
  G.floats = G.floats.filter((f) => f.life > 0);
}

export function drawBullets(ctx, G) {
  for (const b of G.bullets) {
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

export function drawParticles(ctx, G) {
  for (const pt of G.parts) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  for (const f of G.floats) {
    ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 17px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

export function drawPlayer(ctx, G) {
  const p = G.player;
  if (!p.onFoot) return;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(p.x + 2, p.y + 3, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body: teal jacket, dark jeans.
  ctx.fillStyle = '#1f8a7a';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 3, 6, 0, Math.PI * 2);
  ctx.fill();
  // Gun barrel toward the aim.
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.aim) * 24, p.y + Math.sin(p.aim) * 24);
  ctx.stroke();
  if (p.hurtT > 0) {
    ctx.strokeStyle = 'rgba(255,60,40,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawHeli(ctx, G, cam, view) {
  const h = G.heli;
  if (!h) return;
  if (h.x < cam.x - 120 || h.x > cam.x + view.w + 120 || h.y < cam.y - 120 || h.y > cam.y + view.h + 120) return;
  // Searchlight cone onto the player.
  ctx.fillStyle = 'rgba(255, 250, 200, 0.10)';
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(G.player.x - 60, G.player.y - 40);
  ctx.lineTo(G.player.x + 60, G.player.y + 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(h.x + 3, h.y + 4, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2b2e';
  ctx.beginPath();
  ctx.ellipse(h.x, h.y, 24, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  const rot = G.time * 22;
  ctx.beginPath();
  ctx.moveTo(h.x - Math.cos(rot) * 34, h.y - Math.sin(rot) * 34);
  ctx.lineTo(h.x + Math.cos(rot) * 34, h.y + Math.sin(rot) * 34);
  ctx.stroke();
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('POLICE', h.x, h.y - 18);
  ctx.textAlign = 'left';
}
