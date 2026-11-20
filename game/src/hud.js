// hud.js — everything drawn on top of the world: HUD, minimap, banners,
// menus, and the mission passed / failed screens. One job: the interface.
import { TUNING } from './tuning.js';
import { MISSIONS } from './story.js';

// --- HUD ------------------------------------------------------------------
export function drawHUD(ctx, state, viewW, viewH) {
  const p = state.player;
  const T = TUNING;
  // Top-left: health + armour bars.
  drawBar(ctx, 18, 18, 220, 16, p.health / 100, '#e84a3a', 'HEALTH');
  drawBar(ctx, 18, 40, 220, 12, p.armour / 100, '#7db8dc', 'ARMOUR');
  // Top-right: cash, respect, level.
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#7ddc8a';
  ctx.fillText(`$${state.cash.toLocaleString('en-US')}`, viewW - 18, 40);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#f5f0e6';
  ctx.fillText(`RESPECT ${state.respect}   LV ${state.level}   DAY ${state.day}/3`, viewW - 18, 62);
  // Wanted stars, top centre.
  drawStars(ctx, state.wantedWhole, viewW / 2, 34);
  // Speed + ammo, bottom-right.
  const speedKmh = state.playerCar && !p.onFoot ? Math.round(Math.abs(state.playerCar.speed) * 0.36) : 0;
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(p.onFoot ? 'ON FOOT' : `${speedKmh} km/h`, viewW - 18, viewH - 66);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(p.onFoot ? `PISTOL  ${p.ammo} rounds` : (state.playerCar ? `${state.playerCar.model}  ♥ ${Math.max(0, Math.round(state.playerCar.health))}` : ''), viewW - 18, viewH - 42);
  // Mission objective banner.
  if (state.mission && state.mission.phase === 'active') {
    const m = state.mission;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    ctx.fillRect(18, viewH - 108, 560, 58);
    ctx.fillStyle = '#e8b13c';
    ctx.fillRect(18, viewH - 108, 5, 58);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(m.def.title.toUpperCase(), 34, viewH - 84);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#d8d8d0';
    ctx.fillText(missionObjectiveLine(state), 34, viewH - 62);
    if (m.timer > 0) {
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = m.timer < 15 ? '#ff5a4d' : '#ffe9a8';
      ctx.textAlign = 'right';
      ctx.fillText(formatTime(m.timer), 566, viewH - 78);
      ctx.textAlign = 'left';
    }
  }
  // Floating cash popups.
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  for (const pop of state.popups) {
    const age = 1 - pop.life / T.popupLife;
    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, pop.x - state.camera.x, pop.y - state.camera.y - age * 30);
  }
  ctx.globalAlpha = 1;
  // Toast message.
  if (state.messageT > 0 && state.message) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,14,24,0.78)';
    const w = Math.min(900, ctx.measureText(state.message).width + 40);
    ctx.fillRect(viewW / 2 - w / 2, 74, w, 34);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '15px sans-serif';
    ctx.fillText(state.message, viewW / 2, 96);
  }
  // Minimap, bottom-left.
  drawMinimap(ctx, state, 18, viewH - 18 - T.minimapSize);
  // Controls hint.
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('WASD move/drive · E enter car · Click shoot · F punch · Space handbrake · M mission · P pause', 210, viewH - 24);
}

export function missionObjectiveLine(state) {
  const m = state.mission;
  if (!m) return '';
  const d = Math.round(Math.hypot(m.targetX - state.player.x, m.targetY - state.player.y));
  if (m.def.type === 'shootout') return `Clear the thugs — ${m.thugsLeft} left · ${d}m to ${m.targetLabel}`;
  if (m.def.type === 'chase') return `Wreck the rival car · ${d}m`;
  if (m.def.type === 'escape') return `Reach ${m.targetLabel} with 0 stars · ${d}m`;
  return `Go to ${m.targetLabel} · ${d}m`;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawBar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(10,14,24,0.7)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#33363e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 4, y + h - 3);
}

export function drawStars(ctx, count, cx, cy, showHeliLabel = true) {
  for (let i = 0; i < 5; i++) {
    const x = cx + (i - 2) * 34;
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = i < count ? '#ffd23c' : 'rgba(255,255,255,0.28)';
    ctx.fillText('★', x, cy + 8);
  }
  if (count >= 3 && showHeliLabel) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ff8a7a';
    ctx.fillText('HELICOPTER ACTIVE', cx, cy + 28);
  }
}

export function drawMinimap(ctx, state, x, y) {
  const T = TUNING;
  const size = T.minimapSize;
  const scale = T.minimapScale;
  ctx.fillStyle = 'rgba(10,14,24,0.78)';
  ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  // Water + sand + land.
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(x, y, T.waterX * scale, size);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x + T.waterX * scale, y, (T.beachX - T.waterX) * scale, size);
  ctx.fillStyle = '#5d7a45';
  ctx.fillRect(x + T.beachX * scale, y, size - T.beachX * scale, size);
  // Roads.
  ctx.fillStyle = 'rgba(220,220,210,0.5)';
  for (const rx of state.world.roadsV) ctx.fillRect(x + rx * scale - 1, y, 2, size);
  for (const ry of state.world.roadsH) ctx.fillRect(x, y + ry * scale - 1, size, 2);
  // Mission marker.
  if (state.mission && state.mission.phase === 'active') {
    const m = state.mission;
    const pulse = 4 + Math.sin(state.time * 4) * 2;
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.arc(x + m.targetX * scale, y + m.targetY * scale, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c98a00';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◆', x + m.targetX * scale, y + m.targetY * scale + 4);
  }
  // Police dots.
  ctx.fillStyle = '#5a8aff';
  for (const c of state.cops) {
    if (c.dead) continue;
    ctx.beginPath(); ctx.arc(x + c.x * scale, y + c.y * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Cars.
  ctx.fillStyle = '#e8e8e8';
  for (const car of state.cars) {
    if (car.dead || car.police) continue;
    ctx.fillRect(x + car.x * scale - 1.5, y + car.y * scale - 1.5, 3, 3);
  }
  // Player arrow.
  const px = x + state.player.x * scale, py = y + state.player.y * scale;
  ctx.fillStyle = '#e8b13c';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#e8b13c';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
  ctx.fillStyle = '#f5f0e6';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR', x + 2, y - 8);
}

// --- Menus ----------------------------------------------------------------
function panel(ctx, viewW, viewH, w, h) {
  ctx.fillStyle = 'rgba(8,12,22,0.82)';
  ctx.fillRect(viewW / 2 - w / 2, viewH / 2 - h / 2, w, h);
  ctx.strokeStyle = '#e8b13c';
  ctx.lineWidth = 3;
  ctx.strokeRect(viewW / 2 - w / 2, viewH / 2 - h / 2, w, h);
}

export function drawTitle(ctx, state, viewW, viewH) {
  // Golden-hour city already drawn behind; add a dusk gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, viewH);
  grad.addColorStop(0, 'rgba(20,16,40,0.25)');
  grad.addColorStop(1, 'rgba(20,16,40,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8b13c';
  ctx.font = 'bold 92px sans-serif';
  ctx.fillText('SOLMAR', viewW / 2, 190);
  ctx.fillStyle = '#f5f0e6';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('A SUN-SOAKED OPEN-WORLD CRIME STORY', viewW / 2, 228);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('12 missions · 3 days · steal cars · outrun the law · take the big score', viewW / 2, 248);
  panel(ctx, viewW, viewH, 560, 270);
  const cy = viewH / 2 - 150;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText(state.hasSave ? '▶  CONTINUE  (Enter)' : '▶  NEW GAME  (Enter)', viewW / 2, cy + 52);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#d8d8d0';
  ctx.fillText('WASD — move / drive      E — enter & steal cars', viewW / 2, cy + 96);
  ctx.fillText('Mouse — aim      Click — shoot      F — punch', viewW / 2, cy + 122);
  ctx.fillText('Space — handbrake drift      M — start mission      P — pause', viewW / 2, cy + 148);
  ctx.fillText('R — radio      H — headlights at night', viewW / 2, cy + 174);
  ctx.fillStyle = '#7ddc8a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`Cash $${state.cash} · Respect ${state.respect} · Level ${state.level} · ${nextMissionLine(state)}`, viewW / 2, cy + 218);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '13px sans-serif';
  ctx.fillText('An original game. No real city, no real people, no borrowed art or music.', viewW / 2, viewH - 26);
  drawStars(ctx, 2, viewW / 2, viewH - 64);
}

function nextMissionLine(state) {
  if (state.missionIndex >= MISSIONS.length) return 'Story complete';
  return `Next: ${MISSIONS[state.missionIndex].title}`;
}

export function drawPause(ctx, viewW, viewH) {
  ctx.fillStyle = 'rgba(8,12,22,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  panel(ctx, viewW, viewH, 480, 260);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('PAUSED', viewW / 2, viewH / 2 - 60);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#d8d8d0';
  ctx.fillText('P — resume      Enter — resume', viewW / 2, viewH / 2 - 10);
  ctx.fillText('M — start next mission      C — save game', viewW / 2, viewH / 2 + 20);
  ctx.fillText('Esc — back to title', viewW / 2, viewH / 2 + 50);
  ctx.fillStyle = '#7ddc8a';
  ctx.fillText(`Cash $${state.cash} · Missions done ${state.completed.length}/12`, viewW / 2, viewH / 2 + 90);
}

export function drawPassed(ctx, state, viewW, viewH) {
  const r = state.lastResult;
  if (!r) return;
  ctx.fillStyle = 'rgba(8,12,22,0.55)';
  ctx.fillRect(0, 0, viewW, viewH);
  panel(ctx, viewW, viewH, 620, 430);
  const cx = viewW / 2, top = viewH / 2 - 215;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ddc8a';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('MISSION PASSED', cx, top + 62);
  drawStars(ctx, r.stars, cx, top + 108, false); // result stars, no heli label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(r.title, cx, top + 158);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#d8d8d0';
  ctx.fillText(`Payout  $${r.payout.toLocaleString('en-US')}  (time bonus $${r.timeBonus})`, cx, top + 196);
  ctx.fillText(`Time  ${formatTime(r.time)}    Accuracy  ${r.accuracy}%    Cars destroyed  ${r.carsDestroyed}`, cx, top + 228);
  if (r.leveledUp) {
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`★ LEVEL UP — now Level ${state.level} ★`, cx, top + 266);
  }
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '17px sans-serif';
  ctx.fillText(r.next, cx, top + 306);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Enter — continue      M — next mission', cx, top + 352);
}

export function drawFailed(ctx, state, viewW, viewH) {
  const r = state.lastResult;
  if (!r) return;
  ctx.fillStyle = 'rgba(30,6,6,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  panel(ctx, viewW, viewH, 560, 300);
  const cx = viewW / 2, top = viewH / 2 - 150;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a4d';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('MISSION FAILED', cx, top + 62);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(r.title, cx, top + 106);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#d8d8d0';
  ctx.fillText(r.reason, cx, top + 142);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Enter — retry mission      Esc — back to title', cx, top + 196);
}
