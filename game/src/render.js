// Drawing only: the city, its cars and people, the HUD with its minimap, and the menus.
// The canvas fills the window; the game draws in a 1280x800 logical view and the camera
// follows the player through the world. Nothing here changes the game state. v2 adds sunset
// and night lighting, lit windows, headlight and searchlight cones, district tints, building
// signs, beach props, a circular speedometer, weapon and radio HUD, and the mission-passed
// and garage screens.

import { BLOCK_H, BLOCK_W, COLS, DISTRICT_FILL, DISTRICT_FLAVOUR, districtAt, GARAGE_UPGRADES, PALETTE, RADIO, ROAD_W, ROWS, VIEW, FONT, WEAPONS } from './config.js';
import { clamp, dist } from './random.js';
import { currentMission, currentObjective, currentTarget, MISSIONS } from './missions.js';
import { SAND_Y, WATER_Y as SEA_Y, blockAt, roadAt } from './city.js';
import { respectLevel } from './player.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

// Bigger than v1 (172x126): the minimap must survive the contact-sheet shrink, and its
// SOLMAR label now sits INSIDE the box so it can never clip off the right edge.
const MINIMAP = { x: 1064, y: 16, w: 200, h: 146 };

/** Time-of-day light: warm sunset glow and night dark, from the game clock. */
export function lightLevel(state) {
  const m = state.clockMinutes % 1440;
  if (m < 360) return { warm: 0, dark: 0.5 };
  if (m < 480) return { warm: 0.25, dark: 0.25 };
  if (m < 960) return { warm: 0, dark: 0 };
  if (m < 1140) return { warm: ((m - 960) / 180) * 0.5, dark: ((m - 960) / 180) * 0.25 };
  return { warm: 0.12, dark: 0.5 };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / VIEW.width, h / VIEW.height);
    view.w = VIEW.width * view.scale;
    view.h = VIEW.height * view.scale;
    view.x = (w - view.w) / 2;
    view.y = (h - view.h) / 2;
  }

  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawWorld(state) {
    const { city, traffic, player, police, particles } = state;
    const cam = state.camera;
    const scale = view.scale * cam.zoom;
    const cx = VIEW.width / 2 - cam.x * scale;
    const cy = VIEW.height / 2 - cam.y * scale;
    ctx.setTransform(scale, 0, 0, scale, view.x + cx + (cam.shakeX || 0), view.y + cy + (cam.shakeY || 0));

    // Ground, sand, sea.
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, city.width, city.height);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, SAND_Y, city.width, SEA_Y - SAND_Y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, SEA_Y, city.width, city.height - SEA_Y);
    ctx.fillStyle = PALETTE.waterDeep;
    const wave = Math.floor(state.time * 1.2) % 2;
    for (let y = SEA_Y + 18 + wave * 12; y < city.height - 8; y += 34) {
      ctx.fillRect(0, y, city.width, 5);
    }
    // The boat at the marina.
    ctx.save();
    ctx.translate(745, 2790);
    ctx.fillStyle = '#f0ead8';
    roundRect(-34, -12, 68, 24, 10);
    ctx.fill();
    ctx.fillStyle = '#2c4a8a';
    ctx.fillRect(-8, -26, 16, 16);
    ctx.restore();

    // District ground tints: each district gets its own wash so Downtown, Marina Bay,
    // Coral Heights, Old Town, the Docks and Beachfront read differently at a glance.
    for (const block of city.blocks) {
      ctx.fillStyle = DISTRICT_FILL[block.district] || PALETTE.ground;
      ctx.fillRect(block.x, block.y, block.w, block.h);
    }

    // Parks.
    for (const block of city.blocks) {
      if (block.type !== 'park') continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.fillStyle = PALETTE.parkDark;
      ctx.fillRect(block.x + 12, block.y + 12, block.w - 24, block.h - 24);
    }
    // Docks ground.
    for (const block of city.blocks) {
      if (block.type !== 'docks') continue;
      ctx.fillStyle = '#9a8a6a';
      ctx.fillRect(block.x, block.y, block.w, block.h);
    }

    // Sidewalks then roads.
    for (const y of city.hRoads) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, y - 45 - 12, city.width, 114);
    }
    for (const x of city.vRoads) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(x - 45 - 12, 0, 114, city.height);
    }
    for (const y of city.hRoads) {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(0, y - 45, city.width, 90);
    }
    for (const x of city.vRoads) {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(x - 45, 0, 90, city.height);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const y of city.hRoads) {
      for (let x = 20; x < city.width; x += 64) ctx.fillRect(x, y - 2, 30, 4);
    }
    for (const x of city.vRoads) {
      for (let y = 20; y < city.height; y += 64) ctx.fillRect(x - 2, y, 4, 30);
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(245, 239, 226, 0.75)';
    for (const x of city.vRoads) {
      for (const y of city.hRoads) {
        for (let k = -2; k <= 2; k += 1) ctx.fillRect(x + k * 12 - 3, y - 45, 6, 14);
      }
    }

    // Buildings with long afternoon shadows, roof signs, and lit windows after dark.
    const light = lightLevel(state);
    for (const b of city.buildings) {
      const sh = 8 + b.height * 4;
      ctx.fillStyle = 'rgba(20, 14, 8, 0.22)';
      ctx.fillRect(b.x + sh, b.y + sh + 4, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = PALETTE.glass;
      ctx.fillRect(b.x + b.w / 2 - 10, b.y + b.h / 2 - 7, 20, 14);
      if (b.height >= 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(b.x + 12, b.y + 12, 18, 12);
        ctx.fillRect(b.x + b.w - 30, b.y + b.h - 24, 18, 12);
      }
      // Lit windows at dusk and night: a few warm squares per building, picked by position.
      if (light.dark > 0.15) {
        ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
        if ((b.x * 7 + b.y * 13) % 3 !== 0) ctx.fillRect(b.x + 10, b.y + 10, 12, 9);
        if ((b.x * 5 + b.y * 11) % 4 !== 0) ctx.fillRect(b.x + b.w - 26, b.y + b.h - 24, 12, 9);
      }
      // Roof sign: the building advertises itself (MOTEL PALMERA, TACOS 24H, ...).
      if (b.sign && b.w >= 70) {
        ctx.font = font(10, true);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(20, 14, 8, 0.55)';
        ctx.fillText(b.sign, b.x + b.w / 2 + 1, b.y + b.h / 2 + 4);
        ctx.fillStyle = '#fff3d0';
        ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 3);
      }
    }
    // Trees, palms, dock containers.
    for (const t of city.trees) {
      if (t.container) {
        ctx.fillStyle = ['#b8543c', '#3c7ab8', '#5a8a4a'][Math.floor(t.x) % 3];
        ctx.fillRect(t.x - 14, t.y - 7, 28, 14);
        continue;
      }
      if (t.palm) {
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
        ctx.fillStyle = '#4a9a4a';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = '#3f7a3a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5da24f';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Beach props: umbrellas, the lifeguard tower, and the hotel pool.
    for (const prop of city.props || []) {
      if (prop.kind === 'umbrella') {
        ctx.fillStyle = '#8a6a45';
        ctx.fillRect(prop.x - 1, prop.y - 2, 2, 14);
        ctx.fillStyle = prop.color;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y - 2, 13, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y - 2, 13, Math.PI * 1.25, Math.PI * 1.6);
        ctx.fill();
      } else if (prop.kind === 'tower') {
        ctx.strokeStyle = '#f5efe2';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(prop.x - 12, prop.y + 18);
        ctx.lineTo(prop.x - 6, prop.y - 8);
        ctx.moveTo(prop.x + 12, prop.y + 18);
        ctx.lineTo(prop.x + 6, prop.y - 8);
        ctx.stroke();
        ctx.fillStyle = '#e8452c';
        ctx.fillRect(prop.x - 16, prop.y - 20, 32, 14);
        ctx.fillStyle = '#f5efe2';
        ctx.fillRect(prop.x - 16, prop.y - 20, 32, 4);
      } else if (prop.kind === 'pool') {
        ctx.fillStyle = '#2f9db8';
        ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
        ctx.fillStyle = '#7fd4e8';
        ctx.fillRect(prop.x + 8, prop.y + 8, prop.w - 16, prop.h - 16);
      }
    }

    // Mission target beacon.
    const target = currentTarget(state);
    if (target) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      ctx.fillStyle = 'rgba(242, 194, 48, 0.16)';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 90 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 46 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = font(15, true);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#241f1a';
      ctx.fillText(target.name, target.x + 1, target.y - 58);
      ctx.fillStyle = '#f2c230';
      ctx.fillText(target.name, target.x, target.y - 59);
    }

    // Cars.
    for (const car of traffic.cars) drawCar(state, car);
    // Headlight cones after dark: the player's car and every police car throw light ahead.
    if (lightLevel(state).dark > 0.15) {
      const cone = (x, y, angle) => {
        ctx.fillStyle = 'rgba(255, 233, 168, 0.13)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x + Math.cos(angle) * 230, y + Math.sin(angle) * 230, 46, angle - 0.24, angle + 0.24);
        ctx.closePath();
        ctx.fill();
      };
      if (player.car) cone(player.car.x, player.car.y, player.car.angle);
      for (const cop of police.copCars) cone(cop.x, cop.y, cop.angle);
    }
    // Pedestrians.
    for (const ped of traffic.peds) drawPed(state, ped);
    // Foot cops.
    for (const cop of police.footCops) drawFootCop(state, cop);
    // Player.
    if (player.onFoot) drawPlayerOnFoot(state);
    else if (player.car) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.arc(player.car.x, player.car.y, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(player.car.x, player.car.y, 42, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Police helicopter: searchlight cone on the player, rotor spinning, shadow below.
    if (police.heli && police.heli.active) {
      const heli = police.heli;
      ctx.fillStyle = 'rgba(20, 14, 8, 0.25)';
      ctx.beginPath();
      ctx.ellipse(player.x, player.y, 34, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 233, 168, 0.16)';
      ctx.beginPath();
      ctx.moveTo(heli.x, heli.y);
      ctx.lineTo(player.x - 42, player.y - 30);
      ctx.lineTo(player.x + 42, player.y + 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 233, 168, 0.28)';
      ctx.beginPath();
      ctx.arc(player.x, player.y, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(heli.x, heli.y);
      ctx.rotate(heli.angle);
      ctx.fillStyle = '#1f3a6e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c4a8a';
      ctx.fillRect(-34, -3, 16, 6);
      ctx.fillStyle = '#9fd4e8';
      ctx.beginPath();
      ctx.arc(12, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 239, 226, 0.8)';
      ctx.lineWidth = 3;
      const rotor = state.time * 22;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rotor) * 34, Math.sin(rotor) * 34);
      ctx.lineTo(-Math.cos(rotor) * 34, -Math.sin(rotor) * 34);
      ctx.stroke();
      ctx.restore();
      ctx.font = font(11, true);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5efe2';
      ctx.fillText('SOLMAR PD AIR 1', heli.x, heli.y - 34);
    }
    // Punch burst.
    if (player.onFoot && player.punchTimer > 0.28) {
      const px = player.x + Math.cos(player.angle) * 34;
      const py = player.y + Math.sin(player.angle) * 34;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8452c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Particles: tracers are lines, everything else is a fading dot.
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      if (p.tracer) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCar(state, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(20, 14, 8, 0.25)';
    roundRect(-car.len / 2 + 4, -car.wid / 2 + 5, car.len, car.wid, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(-car.len / 2, -car.wid / 2, car.len, car.wid, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-car.len / 2 + 8, -car.wid / 2 + 3, car.len - 16, 4);
    ctx.fillStyle = PALETTE.glass;
    ctx.fillRect(-6, -car.wid / 2 + 3, 12, car.wid - 6);
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(-car.len / 2 + 2, -car.wid / 2 - 2, 10, 4);
    ctx.fillRect(-car.len / 2 + 2, car.wid / 2 - 2, 10, 4);
    ctx.fillRect(car.len / 2 - 12, -car.wid / 2 - 2, 10, 4);
    ctx.fillRect(car.len / 2 - 12, car.wid / 2 - 2, 10, 4);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(car.len / 2 - 2, -car.wid / 2 + 5, 3, 0, Math.PI * 2);
    ctx.arc(car.len / 2 - 2, car.wid / 2 - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#241f1a';
      ctx.fillRect(-8, -6, 16, 5);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-8, -6, 16, 2);
    }
    if (car.kind === 'police') {
      ctx.fillStyle = '#f5efe2';
      ctx.fillRect(-14, -car.wid / 2, 28, car.wid);
      ctx.fillStyle = PALETTE.glass;
      ctx.fillRect(-6, -car.wid / 2 + 3, 12, car.wid - 6);
      const flash = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d7bff';
      ctx.fillRect(-4, -car.wid / 2 - 3, 8, 5);
      ctx.fillStyle = flash ? '#2d7bff' : '#ff2d2d';
      ctx.fillRect(-4, car.wid / 2 - 2, 8, 5);
    }
    if (car.kind === 'sports') {
      ctx.fillStyle = '#1c1a18';
      ctx.fillRect(-car.len / 2 - 2, -car.wid / 2 + 2, 6, car.wid - 4);
    }
    ctx.restore();
    // Smoke from a wrecked car.
    if (car.hp < 40 && !car.playerDriven) {
      ctx.fillStyle = 'rgba(120, 110, 100, 0.5)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, 8 + Math.sin(state.time * 7) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(state, ped) {
    const bob = ped.state === 'walk' ? Math.sin(state.time * 8 + ped.x) * 2 : 0;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(20, 14, 8, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, bob * 0.4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFootCop(state, cop) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.fillStyle = 'rgba(20, 14, 8, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c4a8a';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(cop.angle) * 3, Math.sin(cop.angle) * 3 - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(-5, -9, 10, 4);
    ctx.restore();
  }

  function drawPlayerOnFoot(state) {
    const { player } = state;
    const bob = player.speed > 0 ? Math.sin(state.time * 12) * 2 : 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(20, 14, 8, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // White ring so Marco reads at contact-sheet size, not as a red dot.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e8452c';
    ctx.beginPath();
    ctx.arc(0, bob * 0.4, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.arc(Math.cos(player.angle) * 5, Math.sin(player.angle) * 5 - 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241f1a';
    ctx.fillRect(Math.cos(player.angle) * 10 - 2, Math.sin(player.angle) * 10 - 2, 4, 4);
    // The gun in his hand, when he is carrying one.
    if (player.ammo > 0 || player.weapon) {
      ctx.fillStyle = '#1c1a18';
      ctx.fillRect(Math.cos(player.angle) * 16 - 3, Math.sin(player.angle) * 16 - 2, 9, 4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Name label above the player, readable even when shrunk.
    ctx.font = font(12, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20, 14, 8, 0.7)';
    ctx.fillText('MARCO', player.x + 1, player.y - 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MARCO', player.x, player.y - 27);
  }

  function drawMinimap(state) {
    const { city, player, police } = state;
    const sx = MINIMAP.w / city.width;
    const sy = MINIMAP.h / city.height;
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(MINIMAP.x - 6, MINIMAP.y - 6, MINIMAP.w + 12, MINIMAP.h + 12);
    ctx.beginPath();
    ctx.rect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    ctx.clip();
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(MINIMAP.x, MINIMAP.y + SEA_Y * sy, MINIMAP.w, MINIMAP.h - SEA_Y * sy);
    ctx.fillStyle = '#3a3a3a';
    for (const y of city.hRoads) ctx.fillRect(MINIMAP.x, MINIMAP.y + y * sy - 1, MINIMAP.w, 3);
    for (const x of city.vRoads) ctx.fillRect(MINIMAP.x + x * sx - 1, MINIMAP.y, 3, MINIMAP.h);
    ctx.fillStyle = '#5da24f';
    for (const block of city.blocks) {
      if (block.type === 'park') ctx.fillRect(MINIMAP.x + block.x * sx, MINIMAP.y + block.y * sy, block.w * sx, block.h * sy);
    }
    const target = currentTarget(state);
    if (target) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(MINIMAP.x + target.x * sx, MINIMAP.y + target.y * sy, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of police.copCars) {
      ctx.fillStyle = '#ff2d2d';
      ctx.beginPath();
      ctx.arc(MINIMAP.x + car.x * sx, MINIMAP.y + car.y * sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const taxi = state.missions.taxi;
    if (taxi.phase !== 'idle') {
      const t = taxi.phase === 'pickup' ? taxi.from : taxi.to;
      if (t) {
        ctx.fillStyle = '#58b368';
        ctx.beginPath();
        ctx.arc(MINIMAP.x + t.x * sx, MINIMAP.y + t.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(MINIMAP.x + player.x * sx, MINIMAP.y + player.y * sy);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(245, 239, 226, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(MINIMAP.x - 6, MINIMAP.y - 6, MINIMAP.w + 12, MINIMAP.h + 12);
    // The label sits INSIDE the minimap box now, so it can never clip off the edge.
    ctx.fillStyle = 'rgba(24, 20, 16, 0.65)';
    ctx.fillRect(MINIMAP.x, MINIMAP.y + MINIMAP.h - 18, MINIMAP.w, 18);
    text('SOLMAR', MINIMAP.x + MINIMAP.w / 2, MINIMAP.y + MINIMAP.h - 5, 12, '#f5efe2', 'center', true);
  }

  function drawHud(state) {
    const { player, police } = state;
    // Top-left: cash, stars, health, armour, respect — one panel, room to breathe.
    ctx.fillStyle = PALETTE.panel;
    roundRect(14, 14, 300, 122, 10);
    ctx.fill();
    text(`$${Math.floor(player.cash).toLocaleString('en-US')}`, 28, 48, 30, PALETTE.gold, 'left', true);
    let stars = '';
    for (let s = 0; s < 3; s += 1) stars += s < police.stars ? '★' : '☆';
    text(stars, 28, 82, 24, police.stars > 0 ? '#ff5a4d' : PALETTE.muted, 'left', true);
    text('HP', 150, 60, 11, PALETTE.muted, 'left', true);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(150, 66, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = player.health > 40 ? '#58b368' : '#e8452c';
    roundRect(150, 66, Math.max(0, 150 * player.health / 100), 12, 6);
    ctx.fill();
    text('ARMOUR', 28, 104, 11, PALETTE.muted, 'left', true);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(110, 92, 90, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#7fb8d9';
    roundRect(110, 92, Math.max(0, 90 * (player.armour || 0) / 100), 12, 6);
    ctx.fill();
    text(`RESPECT LV ${respectLevel(player)}`, 214, 104, 12, PALETTE.gold, 'left', true);

    // Mission timer + drift / near-miss bonus, under the cash panel.
    if (state.missions.timer > 0 && currentMission(state)) {
      const t = Math.ceil(state.missions.timer);
      text(`⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 28, 162, 18, PALETTE.gold, 'left', true);
    }
    if (state.scoreToastTimer > 0 && state.scoreToast) {
      text(state.scoreToast, 28, 190, 18, '#ffd94d', 'left', true);
    }

    // Clock + street + district in their own measured pill: the text is sized to the pill,
    // never the pill to the text, so nothing can clip ("olmar" in v1).
    const minutes = Math.floor(state.clockMinutes) % (24 * 60);
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const clock = `DAY ${state.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // Street + district are derived live from where the player stands, so the pill is
    // right even in staged scenes (which never run the live updateStreet step): on the
    // sand it is Ocean Front · Beachfront, on a road the road's name, else the block.
    const onSand = player.y > SAND_Y;
    const road = roadAt(state.city, player.x, player.y);
    const col = clamp(Math.floor((player.x - ROAD_W) / (BLOCK_W + ROAD_W)), 0, COLS - 1);
    const row = clamp(Math.floor((player.y - ROAD_W) / (BLOCK_H + ROAD_W)), 0, ROWS - 1);
    const district = onSand ? 'Beachfront' : districtAt(col, row);
    // Off the road there is no street name: show the district once, not twice.
    const streetLine = onSand ? 'Ocean Front · Beachfront'
      : road ? `${road.name} · ${district}` : district;
    ctx.font = font(24, true);
    const cw = ctx.measureText(clock).width;
    ctx.font = font(14, false);
    const sw = ctx.measureText(streetLine).width;
    const pillW = Math.max(cw, sw) + 48;
    ctx.fillStyle = PALETTE.panel;
    roundRect((VIEW.width - pillW) / 2, 10, pillW, 66, 10);
    ctx.fill();
    text(clock, VIEW.width / 2, 40, 24, PALETTE.text, 'center', true);
    text(streetLine, VIEW.width / 2, 64, 14, PALETTE.muted, 'center');

    drawMinimap(state);

    // District name + flavour line under the minimap, right-aligned inside the frame.
    text(district.toUpperCase(), VIEW.width - 16, MINIMAP.y + MINIMAP.h + 26, 14, PALETTE.text, 'right', true);
    text(DISTRICT_FLAVOUR[district] || '', VIEW.width - 16, MINIMAP.y + MINIMAP.h + 44, 11, PALETTE.muted, 'right');

    // Radio: station + track, under the district line.
    const station = RADIO[state.radio.station % RADIO.length];
    text(`♪ ${station.name} — ${station.tracks[state.radio.track % station.tracks.length]}`, VIEW.width - 16, MINIMAP.y + MINIMAP.h + 66, 12, PALETTE.gold, 'right');

    // Objective banner.
    ctx.fillStyle = PALETTE.panel;
    const obj = currentObjective(state);
    ctx.font = font(17, true);
    const ow = Math.min(760, ctx.measureText(obj).width + 36);
    roundRect((VIEW.width - ow) / 2, VIEW.height - 86, ow, 40, 10);
    ctx.fill();
    text(obj, VIEW.width / 2, VIEW.height - 58, 17, PALETTE.text, 'center', true);

    // Toast (briefing / reward), wrapped to two lines so it never runs under the minimap.
    // Hidden while the MISSION PASSED panel is up: the two would stack on each other.
    if (state.missions.toastTimer > 0 && state.missions.toast && state.missions.passedTimer <= 0) {
      ctx.font = font(18, false);
      const words = state.missions.toast.split(' ');
      const lines = [''];
      for (const word of words) {
        const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
        if (ctx.measureText(test).width > 820 && lines[lines.length - 1]) lines.push(word);
        else lines[lines.length - 1] = test;
      }
      const shown = lines.slice(0, 2);
      const tw = Math.min(860, Math.max(...shown.map((l) => ctx.measureText(l).width)) + 40);
      const th = 18 + shown.length * 26 + 16;
      ctx.fillStyle = 'rgba(24, 20, 16, 0.9)';
      roundRect((VIEW.width - tw) / 2, 108, tw, th, 10);
      ctx.fill();
      for (let index = 0; index < shown.length; index += 1) {
        text(shown[index], VIEW.width / 2, 108 + 30 + index * 26, 18, PALETTE.gold, 'center');
      }
    }

    // Vault progress.
    if (state.missions.holdTimer > 0) {
      ctx.fillStyle = PALETTE.panel;
      roundRect(VIEW.width / 2 - 130, VIEW.height - 150, 260, 26, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      roundRect(VIEW.width / 2 - 126, VIEW.height - 146, 252 * (state.missions.holdTimer / 3), 18, 6);
      ctx.fill();
      text('Cracking the vault…', VIEW.width / 2, VIEW.height - 160, 14, PALETTE.text, 'center', true);
    }

    // Context hint.
    const hint = state.hint || '';
    if (hint) text(hint, 24, VIEW.height - 24, 15, PALETTE.muted, 'left');

    // Weapon + ammo, bottom-left above the hint.
    const w = WEAPONS[player.weapon];
    text(`${w.name}  ${player.ammo}/${player.reserve}`, 24, VIEW.height - 52, 19, PALETTE.gold, 'left', true);
    text('Q switch · R reload · F fire', 24, VIEW.height - 76, 12, PALETTE.muted, 'left');

    // Circular speedometer, bottom-right: gauge arc, big speed, car name, nitro bar.
    if (!player.onFoot && player.car) {
      const car = player.car;
      const topSpeed = 430 * (1 + 0.12 * (state.garage ? state.garage.engine : 0));
      const frac = clamp(Math.abs(car.speed) / topSpeed, 0, 1);
      const kmh = Math.round(Math.abs(car.speed) * 0.45);
      const gx = VIEW.width - 92;
      const gy = VIEW.height - 96;
      text(car.name || 'Car', VIEW.width - 24, gy - 78, 15, PALETTE.text, 'right', true);
      ctx.fillStyle = PALETTE.panel;
      ctx.beginPath();
      ctx.arc(gx, gy, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(gx, gy, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(gx, gy, 52, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      text(String(kmh), gx, gy + 8, 30, PALETTE.text, 'center', true);
      text('km/h', gx, gy + 30, 12, PALETTE.muted, 'center');
      if (state.garage && state.garage.nitro > 0) {
        text('NITRO', gx, gy + 78, 11, '#ff9a2c', 'center', true);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        roundRect(gx - 40, gy + 84, 80, 8, 4);
        ctx.fill();
        ctx.fillStyle = '#ff9a2c';
        roundRect(gx - 40, gy + 84, 80 * (state.garage.nitroMeter / 100), 8, 4);
        ctx.fill();
      }
      const maxHp = car.maxHp || 100;
      if (car.hp < maxHp) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        roundRect(gx - 62, gy - 96, 124, 10, 5);
        ctx.fill();
        ctx.fillStyle = car.hp > 40 ? '#58b368' : '#e8452c';
        roundRect(gx - 62, gy - 96, 124 * car.hp / maxHp, 10, 5);
        ctx.fill();
      }
    }

    // Off-screen waypoint arrow.
    const target = currentTarget(state);
    if (target) {
      const cam = state.camera;
      const scale = view.scale * cam.zoom;
      const sx = view.x + VIEW.width / 2 + (target.x - cam.x) * scale;
      const sy = view.y + VIEW.height / 2 + (target.y - cam.y) * scale;
      const onScreen = sx > 60 && sx < window.innerWidth - 60 && sy > 60 && sy < window.innerHeight - 60;
      if (!onScreen) {
        const ax = clamp(sx, 70, window.innerWidth - 70);
        const ay = clamp(sy, 120, window.innerHeight - 120);
        const a = Math.atan2(sy - VIEW.height / 2 * view.scale - view.y, sx - VIEW.width / 2 * view.scale - view.x);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.fillStyle = '#f2c230';
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const d = Math.round(dist(player.x, player.y, target.x, target.y));
        text(`${d}m`, ax, ay + 30, 14, '#f2c230', 'center', true);
      }
    }

    // Wanted flash.
    if (police.stars >= 2) {
      ctx.fillStyle = `rgba(232, 69, 44, ${0.05 + Math.sin(state.time * 4) * 0.03})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  /** Sunset glow and night dark over the world (screen space, under the HUD). */
  function drawLightTint(state) {
    const light = lightLevel(state);
    if (light.warm > 0) {
      ctx.fillStyle = `rgba(255, 140, 40, ${light.warm * 0.22})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (light.dark > 0) {
      ctx.fillStyle = `rgba(8, 10, 40, ${light.dark * 0.5})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = 150 + lines.length * 32 + 64;
    const x = (VIEW.width - 620) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = 'rgba(12, 10, 8, 0.82)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, y, 620, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(x, y, 620, height, 14);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 74, 46, PALETTE.text, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + 128 + index * 32, 19, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 20, accent || PALETTE.gold, 'center', true);
  }

  function drawTitle(state, ui) {
    const items = ui.menuItems;
    const lines = [
      'An open-world crime story — drive, steal, escape.',
      'Twelve story missions over 3 days. Traffic, police, a helicopter,',
      'guns, garage upgrades, radio and saves — one sun-soaked city.',
      '',
    ];
    const height = 150 + lines.length * 32 + 64 + items.length * 40;
    const x = (VIEW.width - 620) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = 'rgba(12, 10, 8, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, y, 620, height, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(x, y, 620, height, 14);
    ctx.stroke();
    text('SOLMAR', VIEW.width / 2, y + 92, 72, PALETTE.gold, 'center', true);
    text('an open-world crime story', VIEW.width / 2, y + 128, 20, PALETTE.text, 'center');
    for (let index = 0; index < items.length; index += 1) {
      const iy = y + 168 + index * 40;
      const selected = index === ui.menuIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(242, 194, 48, 0.18)';
        roundRect(x + 60, iy - 26, 500, 36, 8);
        ctx.fill();
      }
      text(`${selected ? '▶ ' : ''}${items[index]}`, VIEW.width / 2, iy, 22, selected ? PALETTE.gold : PALETTE.text, 'center', selected);
    }
    const fy = y + 168 + items.length * 40 + 8;
    text('WASD drive & walk · E enter car · F fire · Q switch gun · Shift run · Space handbrake', VIEW.width / 2, fy + 18, 15, PALETTE.muted, 'center');
    text('An original game: its own city, names and story.', VIEW.width / 2, fy + 44, 15, PALETTE.muted, 'center');
    text('Enter or click to choose · ↑ ↓ to move', VIEW.width / 2, y + height - 24, 16, PALETTE.gold, 'center');
  }

  function drawHowTo() {
    drawPanel('How to play', [
      'WASD / arrows — walk and drive · Shift — run / nitro (with the kit)',
      'E — get in / out of a car, hold E to crack the vault',
      'F or click — fire the gun (punch when the magazine is empty)',
      'Q — switch pistol / SMG · R — reload · C — change radio station',
      'G — open Benny\'s Garage at the garage (upgrades cost cash)',
      'P / Esc — pause · M — sound on / off',
      'Follow the yellow marker. Lose the cops at the Safehouse.',
      'Drift with the handbrake and thread traffic for bonus cash.',
      'Progress saves after every mission.',
    ], 'Press Enter or click to go back', PALETTE.gold);
  }

  function drawMissions(state) {
    const lines = [];
    for (let index = 0; index < MISSIONS.length; index += 1) {
      const done = index < state.missions.index || state.missions.finished;
      const current = index === state.missions.index && !state.missions.finished;
      lines.push(`${done ? '✓' : current ? '▶' : '·'} Mission ${index + 1} — ${MISSIONS[index].title}`);
    }
    lines.push('');
    lines.push(`Cash earned so far: $${Math.floor(state.player.cash)} · Day ${state.day} · Respect LV ${respectLevel(state.player)}`);
    drawPanel('Missions', lines, 'Press Enter or click to go back', PALETTE.gold);
  }

  /** MISSION PASSED: payout, time, accuracy, cars destroyed/stolen, star rating. */
  function drawPassed(state) {
    const p = state.missions.passed;
    if (!p) return;
    const stars = '★'.repeat(p.rating) + '☆'.repeat(4 - p.rating);
    const mm = Math.floor(p.time / 60);
    const ss = String(p.time % 60).padStart(2, '0');
    const lines = [
      `${p.title} — Mission ${p.index + 1} of ${MISSIONS.length}`,
      '',
      `PAYOUT  +$${p.payout.toLocaleString('en-US')}`,
      `TIME  ${mm}:${ss}   ·   ACCURACY  ${p.accuracy}%`,
      `CARS DESTROYED  ${p.carsDestroyed}   ·   CARS STOLEN  ${p.carsStolen}`,
      `MAX WANTED  ${'★'.repeat(p.maxWanted)}${'☆'.repeat(3 - p.maxWanted)}`,
      '',
      stars,
    ];
    drawPanel('MISSION PASSED', lines, 'The city is yours, Marco — keep driving', PALETTE.gold);
  }

  /** Benny's Garage: buy upgrades with cash; they change the car you drive. */
  function drawGarage(state) {
    const g = state.garage;
    const lines = [`Cash $${Math.floor(state.player.cash)} — upgrades stay on your car`, ''];
    for (let index = 0; index < GARAGE_UPGRADES.length; index += 1) {
      const up = GARAGE_UPGRADES[index];
      const level = g[up.key];
      const maxed = level >= up.prices.length;
      const price = maxed ? 'MAX' : `$${up.prices[level]}`;
      const pips = '●'.repeat(level) + '○'.repeat(up.prices.length - level);
      const mark = index === g.selected ? '▶ ' : '   ';
      lines.push(`${mark}${up.name} ${pips} — ${price} · ${up.desc}`);
    }
    lines.push('');
    lines.push('Nitro: hold Shift while driving. Engine, armour and tyres apply at once.');
    drawPanel("BENNY'S GARAGE", lines, '↑ ↓ select · Enter buy · Esc close', PALETTE.gold);
  }

  function drawPause(state, ui) {
    const items = ui.pauseItems;
    const missionNo = Math.min(MISSIONS.length, state.missions.index + 1);
    const lines = [`Cash $${Math.floor(state.player.cash)} · Mission ${missionNo} of ${MISSIONS.length} · Day ${state.day}`, ''];
    const height = 150 + lines.length * 32 + 64 + items.length * 40;
    const x = (VIEW.width - 620) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = 'rgba(12, 10, 8, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, y, 620, height, 14);
    ctx.fill();
    text('Paused', VIEW.width / 2, y + 74, 44, PALETTE.text, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + 128 + index * 32, 18, PALETTE.muted, 'center');
    }
    for (let index = 0; index < items.length; index += 1) {
      const iy = y + 128 + lines.length * 32 + 10 + index * 40;
      const selected = index === ui.pauseIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(242, 194, 48, 0.18)';
        roundRect(x + 60, iy - 26, 500, 36, 8);
        ctx.fill();
      }
      text(`${selected ? '▶ ' : ''}${items[index]}`, VIEW.width / 2, iy, 22, selected ? PALETTE.gold : PALETTE.text, 'center', selected);
    }
    text('Enter or click to choose', VIEW.width / 2, y + height - 24, 16, PALETTE.gold, 'center');
  }

  function drawOver(state, kind) {
    const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
    const lines = kind === 'busted'
      ? ['The Solmar PD caught up with you.', `Fine paid: $${150}. The mission restarts.`]
      : ['Marco went down in the streets of Solmar.', `Hospital bill: $${100}. The mission restarts.`];
    drawPanel(title, lines, 'Press Enter to get back out there', '#e8452c');
  }

  function draw(state, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#241f1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawWorld(state);
      // Back to screen space for the panels: the world transform must not leak into the HUD.
      ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
      if (ui.showHowTo) drawHowTo();
      else if (ui.showMissions) drawMissions(state);
      else drawTitle(state, ui);
      return;
    }
    drawWorld(state);
    // Back to screen space for the HUD and overlays.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawLightTint(state);
    drawHud(state);
    if (state.missions.passedTimer > 0 && state.missions.passed) drawPassed(state);
    else if (state.garage.open) drawGarage(state);
    if (screen === SCREEN_PAUSED) drawPause(state, ui);
    else if (screen === SCREEN_OVER) drawOver(state, ui.overKind);
  }

  /** Convert a mouse position in client pixels to logical view coordinates. */
  function toLogical(clientX, clientY) {
    const ratio = canvas.width / window.innerWidth;
    return {
      x: (clientX * ratio - view.x) / view.scale,
      y: (clientY * ratio - view.y) / view.scale,
    };
  }

  /** The clickable rows of the current menu, in logical view coordinates. */
  function menuHitAreas(screen, ui) {
    if (screen === SCREEN_TITLE) {
      if (ui.showHowTo || ui.showMissions) return [];
      const height = 150 + 4 * 32 + 64 + ui.menuItems.length * 40;
      const y = (VIEW.height - height) / 2;
      return ui.menuItems.map((item, index) => ({
        index, x: 390, y: y + 168 + index * 40 - 26, w: 500, h: 36,
      }));
    }
    if (screen === SCREEN_PAUSED) {
      const height = 150 + 2 * 32 + 64 + ui.pauseItems.length * 40;
      const y = (VIEW.height - height) / 2;
      return ui.pauseItems.map((item, index) => ({
        index, x: 390, y: y + 202 + index * 40 - 26, w: 500, h: 36,
      }));
    }
    return [];
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view, toLogical, menuHitAreas };
}
