// hud.js — everything drawn on top of the world: the HUD, minimap, title
// menu, mission-passed panel, dialogue, toasts and floating score text.
// One job: the interface. Two defects this file exists to never repeat:
// F4 (banner text overflowing its panel — text is measured and wrapped) and
// F5 (briefing toast overlapping the cash panel — the toast sits at y>=150
// and is never drawn while the passed panel is up).

import { VIEW, fmtMoney, fmtClock, fmtTimer, stars, clamp, dist } from './tuning.js';
import { districtAt, skyFor } from './world.js';
import { currentObjectiveText, missionRating, nextMissionPreview, MISSIONS } from './story.js';

// Wrap text to fit maxWidth; returns lines. Used for the objective banner
// (F4) and every dialogue box so nothing ever overflows its panel.
export function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function panel(ctx, x, y, w, h, fill = 'rgba(12,14,22,0.82)') {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.stroke();
}

// Marisol Vega's portrait: sun-gold hair, warm skin, drawn, not an image.
export function drawPortrait(ctx, x, y, r, name) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#f0c8a0'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.fillStyle = '#3a2a1a'; // hair
  ctx.beginPath(); ctx.arc(x, y - r * 0.25, r * 0.95, Math.PI, 0); ctx.fill();
  ctx.fillRect(x - r, y - r * 0.4, r * 0.35, r * 1.1);
  ctx.fillRect(x + r * 0.65, y - r * 0.4, r * 0.35, r * 1.1);
  ctx.fillStyle = '#20242e'; // eyes
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.05, r * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.05, r * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a04a3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y + r * 0.35, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(name, x, y + r + 14);
}

export function drawMinimap(ctx, state) {
  const W = 208, H = 150;
  const x = VIEW.width - W - 14, y = 14;
  panel(ctx, x, y, W, H, 'rgba(12,14,22,0.78)');
  const sx = W / 3600, sy = H / 2600;
  const px = x + state.player.x * sx, py = y + state.player.y * sy;
  // Sea + beach + roads, simplified.
  ctx.fillStyle = '#2f7fb8'; ctx.fillRect(x + 4, y + 4, 260 * sx, H - 8);
  ctx.fillStyle = '#e8cf96'; ctx.fillRect(x + 4 + 260 * sx, y + 4, 170 * sx, H - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let gx = 520; gx < 3600; gx += 320) ctx.fillRect(x + gx * sx, y + 4, 2, H - 8);
  for (let gy = 120; gy < 2600; gy += 320) ctx.fillRect(x + 4, y + gy * sy, W - 8, 2);
  // Fountain / plaza.
  ctx.fillStyle = '#4aa8d8';
  ctx.beginPath(); ctx.arc(x + 1810 * sx, y + 1270 * sy, 4, 0, Math.PI * 2); ctx.fill();
  // Mission target marker (gold !).
  const m = state.mission;
  if (!m.finished && m.target) {
    const tx = x + m.target.x * sx, ty = y + m.target.y * sy;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20242e'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('!', tx, ty + 4);
  }
  // Player arrow.
  ctx.save();
  ctx.translate(px, py); ctx.rotate(state.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left';
  ctx.fillText('SOLMAR', x + 8, y + H - 8);
  ctx.fillStyle = '#ffd94a'; ctx.textAlign = 'right';
  ctx.fillText('N', x + W - 8, y + 16);
}

export function drawHud(ctx, state) {
  const p = state.player;
  const d = districtAt(state.world, p.x, p.y);
  const sky = skyFor(state.clock);
  ctx.textBaseline = 'alphabetic';
  // --- cash / wanted panel (top left) ---
  panel(ctx, 14, 14, 300, 122);
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'left';
  ctx.fillText(fmtMoney(state.cash), 28, 50);
  ctx.fillStyle = state.wanted > 0 ? '#ff5a5a' : '#8a8a9a';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(stars(state.wanted), 28, 82);
  ctx.fillStyle = '#fff'; ctx.font = '15px Arial';
  ctx.fillText('DAY ' + state.day + '  ·  ' + fmtClock(state.clock) + '  ·  ' + sky.label, 28, 108);
  ctx.fillText(d.name, 28, 130 - 0); // district sits just under the panel edge
  // --- district flavour line (under the cash panel, clear of the toast) ---
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'italic 13px Arial';
  ctx.fillText(d.flavour, 16, 156);
  // --- health / armour / respect bar (left, below flavour) ---
  // Bars start at x=110 so the labels never run into them (the old x=90
  // clipped the armour number under the bar in the staged screenshots).
  panel(ctx, 14, 168, 300, 74);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial';
  ctx.fillText('HP ' + Math.round(p.health), 26, 192);
  ctx.fillStyle = '#3a3a44'; ctx.fillRect(110, 180, 190, 10);
  ctx.fillStyle = p.health > 30 ? '#5ac86a' : '#ff5a5a';
  ctx.fillRect(110, 180, 190 * clamp(p.health / 100, 0, 1), 10);
  ctx.fillStyle = '#fff';
  ctx.fillText('ARMOUR ' + Math.round(p.armour), 26, 216);
  ctx.fillStyle = '#3a3a44'; ctx.fillRect(110, 204, 190, 10);
  ctx.fillStyle = '#6aa8e8';
  ctx.fillRect(110, 204, 190 * clamp(p.armour / 100, 0, 1), 10);
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 13px Arial';
  ctx.fillText('RESPECT LV ' + state.respectLevel + '  ·  ' + state.respect + ' pts', 26, 234);
  // --- mission banner (top centre, measured + wrapped — F4) ---
  // The passed panel owns the centre of the screen, so the banner and its
  // timer stay hidden while it is up.
  const m = state.mission;
  if (!m.finished && state.screen !== 'passed') {
    const mission = MISSIONS[m.index];
    ctx.font = 'bold 17px Arial';
    const title = 'MISSION ' + (m.index + 1) + '/12 — ' + mission.name;
    const objLines = wrapText(ctx, currentObjectiveText(state), 700);
    const bannerH = 34 + objLines.length * 20 + 8;
    const bw = 760;
    panel(ctx, (VIEW.width - bw) / 2, 14, bw, bannerH);
    ctx.fillStyle = '#ffd94a'; ctx.textAlign = 'center';
    ctx.fillText(title, VIEW.width / 2, 40);
    ctx.fillStyle = '#fff'; ctx.font = '15px Arial';
    objLines.forEach((ln, i) => ctx.fillText(ln, VIEW.width / 2, 62 + i * 20));
    // Timer + distance under the banner.
    ctx.fillStyle = m.timer < 30 ? '#ff5a5a' : '#fff';
    ctx.font = 'bold 16px Arial';
    const target = m.target;
    const distText = target ? Math.round(dist(p.x, p.y, target.x, target.y)) + ' m' : '';
    ctx.fillText(fmtTimer(m.timer) + (distText ? '   ·   ' + distText : ''), VIEW.width / 2, 14 + bannerH + 20);
    ctx.textAlign = 'left';
  }
  // --- weapon + radio (bottom left) ---
  // Panel widened to 360 and the controls line shortened: the old 300 px
  // panel clipped "[Shift] nitro" off the right edge in the screenshots.
  panel(ctx, 14, VIEW.height - 96, 360, 82);
  const gunName = p.weapon === 'smg' ? 'SMG' : 'PISTOL';
  const ammo = p.weapon === 'smg' ? p.ammoSmg + '/' + p.reserveSmg : p.ammoPistol + '/' + p.reservePistol;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial';
  ctx.fillText(gunName + '  ' + ammo + (p.reloadTimer > 0 ? '  RELOADING…' : '') + '   ·   SHIFT nitro', 28, VIEW.height - 66);
  const station = state.radio.stations[state.radio.station];
  ctx.fillStyle = '#ffd94a'; ctx.font = '15px Arial';
  ctx.fillText('♪ ' + station.name + ' · ' + station.genre, 28, VIEW.height - 40);
  ctx.fillStyle = '#c8c8d8'; ctx.font = '13px Arial';
  ctx.fillText('[1/2] weapon  ·  R reload  ·  M radio  ·  E action', 28, VIEW.height - 22);
  // --- speedometer (bottom right) ---
  const speedKmh = p.car ? Math.round(Math.abs(p.car.speed) * 0.28) : 0;
  panel(ctx, VIEW.width - 214, VIEW.height - 96, 200, 82);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'right';
  ctx.fillText(speedKmh + '', VIEW.width - 40, VIEW.height - 52);
  ctx.font = '13px Arial'; ctx.fillStyle = '#c8c8d8';
  ctx.fillText('km/h', VIEW.width - 40, VIEW.height - 32);
  ctx.textAlign = 'left';
  if (p.car) {
    ctx.fillStyle = '#fff'; ctx.font = '13px Arial';
    ctx.fillText(p.car.type.name, VIEW.width - 200, VIEW.height - 52);
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(VIEW.width - 200, VIEW.height - 44, 120, 7);
    ctx.fillStyle = p.car.damage > 55 ? '#ff5a5a' : '#5ac86a';
    ctx.fillRect(VIEW.width - 200, VIEW.height - 44, 120 * clamp(1 - p.car.damage / 100, 0, 1), 7);
    ctx.fillStyle = '#c8c8d8'; ctx.font = '12px Arial';
    ctx.fillText('CAR ' + Math.round(100 - p.car.damage) + '%', VIEW.width - 200, VIEW.height - 26);
  }
  // --- minimap ---
  drawMinimap(ctx, state);
  // --- floating score text ---
  ctx.textAlign = 'center';
  for (const f of state.floats) {
    ctx.globalAlpha = clamp(f.t, 0, 1);
    ctx.fillStyle = f.color; ctx.font = 'bold 20px Arial';
    ctx.fillText(f.text, f.x - state.camera.x, f.y - state.camera.y - (1.2 - f.t) * 30);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  // --- briefing toast: y>=150 so it clears the cash panel (F5), and NEVER
  // while the passed panel is up. ---
  if (state.toast && state.toast.t > 0 && state.screen !== 'passed' && !m.passed) {
    const tw = 640;
    panel(ctx, (VIEW.width - tw) / 2, 168, tw, 46, 'rgba(12,14,22,0.78)');
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 14px Arial';
    ctx.fillText(state.toast.speaker + ':', (VIEW.width - tw) / 2 + 16, 188);
    ctx.fillStyle = '#fff'; ctx.font = '14px Arial';
    const msg = state.toast.text.length > 72 ? state.toast.text.slice(0, 72) + '…' : state.toast.text;
    ctx.fillText(msg, (VIEW.width - tw) / 2 + 16, 208);
  }
  // --- dialogue box (bottom centre, with portrait) ---
  if (state.dialogue && state.dialogue.t > 0 && state.screen === 'play') {
    const dw = 620, dh = 74;
    panel(ctx, (VIEW.width - dw) / 2, VIEW.height - 190, dw, dh);
    drawPortrait(ctx, (VIEW.width - dw) / 2 + 40, VIEW.height - 190 + 37, 24, '');
    // drawPortrait leaves textAlign centred for its own caption — the
    // dialogue lines need left alignment, or they centre on x+76 and run
    // under the portrait (seen in the staged beach/combat shots).
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 14px Arial';
    ctx.fillText(state.dialogue.speaker, (VIEW.width - dw) / 2 + 76, VIEW.height - 166);
    ctx.fillStyle = '#fff'; ctx.font = '14px Arial';
    const lines = wrapText(ctx, state.dialogue.text, dw - 100);
    lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, (VIEW.width - dw) / 2 + 76, VIEW.height - 144 + i * 18));
  }
  // --- hurt flash ---
  if (state.events.hurtFlash > 0) {
    ctx.fillStyle = 'rgba(255,40,40,' + (state.events.hurtFlash * 0.8) + ')';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

// --- title screen ---------------------------------------------------------
// Sunset backdrop: the sun disc and palm silhouettes are drawn BEHIND the
// menu panel and kept to the left/right margins — they never cross the
// buttons or the SOLMAR wordmark.

export function drawTitleScreen(ctx, state) {
  // Sunset sky gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, '#2a1a4a');
  grad.addColorStop(0.45, '#c85a6a');
  grad.addColorStop(0.75, '#ff9a4a');
  grad.addColorStop(1, '#ffd98a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Sun disc — low, to the LEFT of the menu, never behind the wordmark.
  ctx.fillStyle = '#fff0b0';
  ctx.beginPath(); ctx.arc(180, 300, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,176,0.35)';
  ctx.beginPath(); ctx.arc(180, 300, 130, 0, Math.PI * 2); ctx.fill();
  // Sea band.
  ctx.fillStyle = '#3a6a9a';
  ctx.fillRect(0, 560, VIEW.width, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 8; i++) ctx.fillRect(60 + i * 160, 600 + (i % 3) * 40, 90, 3);
  // Palm silhouettes at the far left and far right margins only.
  ctx.fillStyle = 'rgba(20,16,32,0.85)';
  for (const [px, s] of [[60, 1.1], [1200, 1.3], [1140, 0.9]]) {
    ctx.save(); ctx.translate(px, 620); ctx.scale(s, s);
    ctx.fillRect(-4, -160, 8, 160);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, -160);
      ctx.quadraticCurveTo(Math.cos(a) * 70, -160 + Math.sin(a) * 40, Math.cos(a) * 95, -160 + Math.sin(a) * 60 + 18);
      ctx.quadraticCurveTo(Math.cos(a) * 30, -160 + Math.sin(a) * 20, 0, -160);
      ctx.fill();
    }
    ctx.restore();
  }
  // Menu panel — centred, opaque, everything inside it.
  const pw = 640, ph = 560, px = (VIEW.width - pw) / 2, py = 96;
  panel(ctx, px, py, pw, ph, 'rgba(12,14,22,0.92)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 74px Arial';
  ctx.fillText('SOLMAR', VIEW.width / 2, py + 92);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Arial';
  ctx.fillText('AN ORIGINAL OPEN-WORLD CRIME GAME', VIEW.width / 2, py + 122);
  ctx.fillStyle = '#ffd94a'; ctx.font = 'italic 15px Arial';
  ctx.fillText('SUN, SAND AND BAD DECISIONS', VIEW.width / 2, py + 146);
  ctx.fillStyle = '#c8c8d8'; ctx.font = '14px Arial';
  ctx.fillText('Marisol Vega has work for you. Twelve jobs. Three days. One city.', VIEW.width / 2, py + 176);
  // Buttons.
  const save = state.save;
  const buttons = [
    'NEW GAME',
    save ? 'CONTINUE — DAY ' + save.day + ', ' + fmtMoney(save.cash) + ', MISSION ' + (save.missionIndex + 1) + '/12' : 'CONTINUE — NO SAVE YET',
    'HOW TO PLAY',
    'MISSIONS',
  ];
  buttons.forEach((b, i) => {
    const by = py + 210 + i * 58;
    const active = state.menuIndex === i;
    ctx.fillStyle = active ? '#ffd94a' : 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(px + 90, by, pw - 180, 44, 8); ctx.fill();
    ctx.fillStyle = active ? '#20242e' : '#fff';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(b, VIEW.width / 2, by + 29);
  });
  ctx.fillStyle = '#c8c8d8'; ctx.font = '13px Arial';
  ctx.fillText('WASD drive / walk · SPACE handbrake · MOUSE aim · CLICK shoot · E action', VIEW.width / 2, py + 210 + 4 * 58 + 8);
  ctx.fillText('SHIFT nitro · 1/2 weapons · R reload · M radio · ESC pause · F5 save', VIEW.width / 2, py + 210 + 4 * 58 + 28);
  ctx.textAlign = 'left';
}

// --- mission passed -------------------------------------------------------

export function drawPassedScreen(ctx, state) {
  const passed = state.mission.passed;
  if (!passed) return;
  ctx.fillStyle = 'rgba(8,10,18,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const pw = 680, ph = 540, px = (VIEW.width - pw) / 2, py = 110;
  panel(ctx, px, py, pw, ph, 'rgba(12,14,22,0.96)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 40px Arial';
  ctx.fillText('MISSION PASSED', VIEW.width / 2, py + 58);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial';
  ctx.fillText('— ' + passed.name + ' —', VIEW.width / 2, py + 90);
  // Star row.
  ctx.fillStyle = '#ffd94a'; ctx.font = '34px Arial';
  ctx.fillText(stars(passed.rating.stars), VIEW.width / 2, py + 136);
  // Stats.
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial';
  ctx.fillText('PAYOUT  ' + fmtMoney(passed.payout), VIEW.width / 2, py + 180);
  ctx.font = '16px Arial'; ctx.fillStyle = '#d8d8e8';
  const mins = Math.floor(passed.rating.timeUsed / 60);
  const secs = passed.rating.timeUsed % 60;
  ctx.fillText('TIME ' + mins + ':' + String(secs).padStart(2, '0') + '    ·    ACCURACY ' + passed.rating.accuracy + '%', VIEW.width / 2, py + 212);
  ctx.fillText('CARS DESTROYED ' + passed.carsDestroyed + '    ·    CARS STOLEN ' + passed.carsStolen + '    ·    TAKEDOWNS ' + passed.kills, VIEW.width / 2, py + 240);
  // Respect + level up.
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 20px Arial';
  ctx.fillText('RESPECT +' + passed.respect + (passed.levelUp ? '  →  LV ' + passed.level + '  ★ LEVEL UP!' : '  →  LV ' + passed.level), VIEW.width / 2, py + 276);
  // Next job, with portrait.
  const next = nextMissionPreview(state);
  if (next) {
    panel(ctx, px + 40, py + 306, pw - 80, 108, 'rgba(255,255,255,0.08)');
    drawPortrait(ctx, px + 84, py + 360, 30, '');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 14px Arial';
    ctx.fillText('Marisol Vega — NEXT JOB', px + 130, py + 332);
    ctx.fillStyle = '#fff'; ctx.font = '15px Arial';
    ctx.fillText(next.name, px + 130, py + 356);
    ctx.fillStyle = '#c8c8d8'; ctx.font = '14px Arial';
    ctx.fillText('Reward ' + fmtMoney(next.payout) + '  ·  Wanted ' + next.wanted + ' star' + (next.wanted === 1 ? '' : 's'), px + 130, py + 380);
    ctx.textAlign = 'center';
  } else {
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 18px Arial';
    ctx.fillText('ALL 12 MISSIONS COMPLETE — SOLMAR IS YOURS', VIEW.width / 2, py + 360);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 17px Arial';
  ctx.fillText('PRESS ENTER TO CONTINUE', VIEW.width / 2, py + 470);
  ctx.fillStyle = '#8a8a9a'; ctx.font = '13px Arial';
  ctx.fillText('Progress saved — pick up where you left off any time.', VIEW.width / 2, py + 498);
  ctx.textAlign = 'left';
}

// --- pause / wasted / busted / how-to / missions ---------------------------

export function drawPauseScreen(ctx, state) {
  ctx.fillStyle = 'rgba(8,10,18,0.7)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const pw = 520, ph = 380, px = (VIEW.width - pw) / 2, py = 200;
  panel(ctx, px, py, pw, ph, 'rgba(12,14,22,0.96)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 34px Arial';
  ctx.fillText('PAUSED', VIEW.width / 2, py + 56);
  const items = ['RESUME', 'SAVE & QUIT TO TITLE', 'RESTART MISSION'];
  items.forEach((b, i) => {
    const by = py + 96 + i * 56;
    const active = state.menuIndex === i;
    ctx.fillStyle = active ? '#ffd94a' : 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(px + 70, by, pw - 140, 42, 8); ctx.fill();
    ctx.fillStyle = active ? '#20242e' : '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(b, VIEW.width / 2, by + 28);
  });
  ctx.fillStyle = '#c8c8d8'; ctx.font = '14px Arial';
  ctx.fillText('Day ' + state.day + ' · ' + fmtMoney(state.cash) + ' · Mission ' + (state.mission.index + 1) + '/12', VIEW.width / 2, py + 300);
  ctx.textAlign = 'left';
}

export function drawOverScreen(ctx, state, kind) {
  ctx.fillStyle = kind === 'wasted' ? 'rgba(60,8,8,0.78)' : 'rgba(8,12,50,0.78)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'wasted' ? '#ff5a5a' : '#6aa8e8';
  ctx.font = 'bold 72px Arial';
  ctx.fillText(kind === 'wasted' ? 'WASTED' : 'BUSTED', VIEW.width / 2, 330);
  ctx.fillStyle = '#fff'; ctx.font = '18px Arial';
  ctx.fillText(kind === 'wasted'
    ? 'The streets of Solmar got the better of you. Fine: $100.'
    : 'The Solmar PD caught up with you. Fine: $150. Heat cleared.', VIEW.width / 2, 380);
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 17px Arial';
  ctx.fillText('PRESS ENTER TO GET BACK OUT THERE', VIEW.width / 2, 440);
  ctx.textAlign = 'left';
}

export function drawHowTo(ctx, state) {
  ctx.fillStyle = 'rgba(8,10,18,0.88)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const pw = 640, ph = 520, px = (VIEW.width - pw) / 2, py = 130;
  panel(ctx, px, py, pw, ph, 'rgba(12,14,22,0.96)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 30px Arial';
  ctx.fillText('HOW TO PLAY', VIEW.width / 2, py + 50);
  ctx.fillStyle = '#fff'; ctx.font = '16px Arial'; ctx.textAlign = 'left';
  const lines = [
    'WASD / arrows — drive or walk',
    'SPACE — handbrake (drift for cash)',
    'MOUSE — aim · CLICK — shoot',
    'E — enter/exit car, pick up, crack vault',
    'SHIFT — nitro boost',
    '1 / 2 — pistol / SMG · R — reload',
    'M — change radio station · ESC — pause',
    'F5 — quick save · F9 — quick load',
    '',
    'Steal cars, run missions for Marisol Vega,',
    'and watch the stars: at 2 the helicopter comes.',
    'Benny\'s Garage repairs and upgrades your ride.',
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, px + 60, py + 96 + i * 28));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 16px Arial';
  ctx.fillText('PRESS ESC TO GO BACK', VIEW.width / 2, py + ph - 24);
  ctx.textAlign = 'left';
}

export function drawMissionsList(ctx, state) {
  ctx.fillStyle = 'rgba(8,10,18,0.88)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const pw = 640, ph = 560, px = (VIEW.width - pw) / 2, py = 110;
  panel(ctx, px, py, pw, ph, 'rgba(12,14,22,0.96)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 30px Arial';
  ctx.fillText('MISSIONS — 12 JOBS, 3 DAYS', VIEW.width / 2, py + 50);
  ctx.font = '15px Arial'; ctx.textAlign = 'left';
  MISSIONS.forEach((mis, i) => {
    const y = py + 84 + i * 36;
    const done = i < state.mission.index || state.mission.finished;
    const current = i === state.mission.index && !state.mission.finished;
    ctx.fillStyle = current ? '#ffd94a' : done ? '#5ac86a' : '#c8c8d8';
    ctx.fillText((done ? '✓ ' : current ? '► ' : '·  ') + (i + 1) + '. ' + mis.name + ' — Day ' + mis.day, px + 50, y);
    ctx.fillStyle = '#8a8a9a';
    ctx.textAlign = 'right';
    ctx.fillText(fmtMoney(mis.payout), px + pw - 50, y);
    ctx.textAlign = 'left';
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 16px Arial';
  ctx.fillText('PRESS ESC TO GO BACK', VIEW.width / 2, py + ph - 24);
  ctx.textAlign = 'left';
}
