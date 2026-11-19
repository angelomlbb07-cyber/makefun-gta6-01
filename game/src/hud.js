// SOLMAR hud — everything drawn over the world: health and armour,
// money, wanted stars, the minimap, objectives, radio, dialogue, the
// title screen, pause menu, and the MISSION PASSED panel.

import { WORLD_W, WORLD_H, fmtTime, money, clamp } from './core.js';
import { RADIO_STATIONS, MOOD_TINTS } from './tuning.js';
import { missionMarker, missionProgressText } from './story.js';
import { AVENUES, STREETS } from './world.js';

function bar(ctx, x, y, w, h, frac, fill, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4);
}

export function drawHUD(ctx, G, city) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Top-left: health, armour, cash, level.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(14, 14, 250, 96);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 24, 34);
  bar(ctx, 100, 22, 150, 14, G.health / 100, '#4fc94f');
  ctx.fillText('ARMOUR', 24, 56);
  bar(ctx, 100, 44, 150, 14, G.armour / 100, '#6db7e8');
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = '#7dff8a';
  ctx.fillText(money(G.money), 24, 86);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('LVL ' + G.level + '  •  RESPECT ' + G.respect, 130, 86);

  // Top-right: wanted stars, day + mood, clock.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(W - 264, 14, 250, 66);
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < G.wanted ? '#ffd94d' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', W - 250 + i * 34, 44);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('DAY ' + G.day + '  •  ' + (MOOD_TINTS[G.mood] ? MOOD_TINTS[G.mood].label : G.mood), W - 250, 66);

  // Mission objective strip, top centre.
  if (G.mission) {
    ctx.font = 'bold 16px Arial';
    const text = G.mission.title.toUpperCase() + '  —  ' + missionProgressText(G);
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W / 2 - tw / 2 - 14, 14, tw + 28, 34);
    ctx.fillStyle = '#ffd94d';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, 37);
    ctx.textAlign = 'left';
    if (G.missionLeft > 0) {
      ctx.fillStyle = G.missionLeft < 20 ? '#ff6a5a' : '#fff';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(fmtTime(G.missionLeft), W / 2, 74);
      ctx.textAlign = 'left';
    }
  }

  // Bottom-left: minimap.
  const mw = 200;
  const mh = 146;
  const mx = 14;
  const my = H - mh - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#3f6b38';
  ctx.fillRect(mx, my, mw, mh);
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(mx, my, 150 * sx, mh);
  ctx.fillStyle = '#4a4a52';
  for (const ax of AVENUES) ctx.fillRect(mx + ax * sx - 2, my, 4, mh);
  for (const sy2 of STREETS) ctx.fillRect(mx, my + sy2 * sy - 2, mw, 4);
  ctx.fillStyle = '#b9a98a';
  ctx.beginPath();
  ctx.arc(mx + 1800 * sx, my + 1000 * sy, 8, 0, Math.PI * 2);
  ctx.fill();
  // Mission marker.
  const mk = missionMarker(G);
  if (mk) {
    const pulse = 6 + Math.sin(G.time * 5) * 2;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(mx + mk.x * sx, my + mk.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx + mk.x * sx, my + mk.y * sy, pulse + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Cops on the minimap.
  ctx.fillStyle = '#5a9dff';
  for (const c of G.cops) {
    ctx.beginPath();
    ctx.arc(mx + c.x * sx, my + c.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  ctx.save();
  ctx.translate(mx + G.player.x * sx, my + G.player.y * sy);
  ctx.rotate(G.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('SOLMAR', mx + 4, my + mh + 2 - 0);
  void city;

  // Bottom-right: ammo, radio.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(W - 264, H - 64, 250, 50);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px Arial';
  ctx.fillText('AMMO  ' + G.ammo + ' / ' + G.reserveAmmo, W - 250, H - 40);
  ctx.fillStyle = G.radioOn ? '#ffd94d' : 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('♪ ' + RADIO_STATIONS[G.radio].name + (G.radioOn ? '' : ' (MUTED)'), W - 250, H - 22);

  // Bottom-centre: controls hint.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('WASD move / drive   •   F enter car   •   Click shoot   •   R reload   •   Q radio   •   Esc pause', W / 2, H - 18);
  ctx.textAlign = 'left';

  // Notice banner.
  if (G.noticeT > 0) {
    ctx.globalAlpha = clamp(G.noticeT, 0, 1);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(G.notice, W / 2, 130);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

export function drawWorldMarker(ctx, G, city) {
  // In-world objective marker: a tall beacon + ring on the ground.
  const mk = missionMarker(G);
  if (!mk || G.mode !== 'play') return;
  const bob = Math.sin(G.time * 3) * 6;
  ctx.strokeStyle = 'rgba(255, 217, 77, 0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(mk.x, mk.y, 46, 20, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 217, 77, 0.25)';
  ctx.beginPath();
  ctx.ellipse(mk.x, mk.y, 46, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createLinearGradient(mk.x, mk.y - 160 + bob, mk.x, mk.y);
  grad.addColorStop(0, 'rgba(255,217,77,0)');
  grad.addColorStop(1, 'rgba(255,217,77,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(mk.x - 5, mk.y - 160 + bob, 10, 160);
  // Pickups.
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = '#a87c4a';
    ctx.fillRect(pk.x - 12, pk.y - 12, 24, 24);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 3;
    ctx.strokeRect(pk.x - 12, pk.y - 12, 24, 24);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('$', pk.x, pk.y + 5);
    ctx.textAlign = 'left';
  }
}

export function drawTitle(ctx, G, save) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(8, 14, 34, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 92px Arial';
  ctx.fillText('SOLMAR', W / 2, 220);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('A 2D OPEN-WORLD CRIME STORY  •  DAY 1–3  •  12 MISSIONS', W / 2, 268);
  ctx.fillStyle = '#7dff8a';
  ctx.font = '20px Arial';
  ctx.fillText('Beach chases. Plaza shootouts. Marina sieges. Steal it. Drive it. Survive it.', W / 2, 306);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial';
  if (save) {
    ctx.fillText('ENTER — CONTINUE  (Day ' + save.day + ', ' + money(save.money) + ')', W / 2, 420);
    ctx.font = '20px Arial';
    ctx.fillText('N — NEW GAME', W / 2, 458);
  } else {
    ctx.fillText('ENTER — START NEW GAME', W / 2, 420);
  }
  ctx.font = '17px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('WASD move & drive  •  Mouse aim, Click shoot  •  F enter / exit car  •  R reload  •  Q radio  •  Esc pause', W / 2, 540);
  ctx.fillText('Missions, wanted stars, police chases, drift & near-miss cash, save with S in pause menu.', W / 2, 568);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '15px Arial';
  ctx.fillText('An original game. Solmar, its people and its story are invented — no real city, no borrowed game.', W / 2, 640);
  ctx.textAlign = 'left';
}

export function drawBrief(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const bw = 760;
  const bh = 300;
  const bx = W / 2 - bw / 2;
  const by = H / 2 - bh / 2;
  ctx.fillStyle = '#14141c';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, bw, bh);
  const m = G.mission;
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('MISSION ' + (G.missionIdx + 1) + ' / 12 — ' + m.title.toUpperCase(), bx + 28, by + 48);
  ctx.fillStyle = '#fff';
  ctx.font = '19px Arial';
  wrapText(ctx, m.brief, bx + 28, by + 88, bw - 56, 26);
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 17px Arial';
  ctx.fillText('OBJECTIVE: ' + m.hint, bx + 28, by + 218);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('PAYOUT ' + money(m.payout) + '   •   PAR ' + fmtTime(m.par) + '   •   DAY ' + G.day, bx + 28, by + 252);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('Press ENTER to start the job', W / 2, by + bh - 18);
  ctx.textAlign = 'left';
}

export function drawPassed(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, W, H);
  const p = G.passed;
  const bw = 620;
  const bh = 480;
  const bx = W / 2 - bw / 2;
  const by = H / 2 - bh / 2;
  ctx.fillStyle = '#101018';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 44px Arial';
  ctx.fillText('MISSION PASSED', W / 2, by + 66);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 40px Arial';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < p.stars ? '★' : '☆';
  ctx.fillText(stars, W / 2, by + 122);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 21px Arial';
  const rows = [
    ['MISSION', p.mission],
    ['PAYOUT', '+' + money(p.payout)],
    ['TIME', p.time],
    ['ACCURACY', p.accuracy + '%'],
    ['CARS DESTROYED', String(p.carsDestroyed)],
  ];
  let ry = by + 168;
  for (const [k, v] of rows) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(k, bx + 36, ry);
    ctx.fillStyle = k === 'PAYOUT' ? '#7dff8a' : '#fff';
    ctx.fillText(v, bx + 260, ry);
    ry += 34;
  }
  if (p.levelUp) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★ LEVEL UP — YOU ARE NOW LEVEL ' + G.level + ' ★', W / 2, ry + 12);
    ctx.textAlign = 'left';
    ry += 40;
  }
  if (p.next) {
    ctx.fillStyle = '#7dff8a';
    ctx.font = '18px Arial';
    ctx.fillText('NEXT JOB: ' + p.next.title + ' — ' + p.next.giver + ' is waiting.', bx + 36, ry + 14);
  } else {
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 19px Arial';
    ctx.fillText('That was the last job. Solmar is yours, kid.', bx + 36, ry + 14);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px Arial';
  ctx.fillText('Press ENTER for the next mission', W / 2, by + bh - 20);
  ctx.textAlign = 'left';
}

export function drawFailed(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6a5a';
  ctx.font = 'bold 46px Arial';
  ctx.fillText('MISSION FAILED', W / 2, H / 2 - 40);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText(G.failReason, W / 2, H / 2 + 4);
  ctx.fillText('Press ENTER to retry the mission', W / 2, H / 2 + 44);
  ctx.textAlign = 'left';
}

export function drawGameOver(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(20,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6a5a';
  ctx.font = 'bold 64px Arial';
  ctx.fillText('WASTED', W / 2, H / 2 - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText('Solmar is unforgiving. Your crew still believes in you.', W / 2, H / 2 + 24);
  ctx.fillText('Press ENTER to retry from the last checkpoint', W / 2, H / 2 + 58);
  ctx.textAlign = 'left';
}

export function drawBusted(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,30,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a9dff';
  ctx.font = 'bold 64px Arial';
  ctx.fillText('BUSTED', W / 2, H / 2 - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText('The Solmar police took $200 in fines and let you go. Stay low for a while.', W / 2, H / 2 + 24);
  ctx.fillText('Press ENTER to keep playing', W / 2, H / 2 + 58);
  ctx.textAlign = 'left';
}

export function drawPaused(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px Arial';
  ctx.fillText('PAUSED', W / 2, H / 2 - 80);
  ctx.font = '20px Arial';
  ctx.fillText('Esc — resume      S — save game      Q — next radio station', W / 2, H / 2 - 30);
  ctx.fillText('R — restart mission      T — quit to title', W / 2, H / 2 + 4);
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('Progress saves to this browser (localStorage).', W / 2, H / 2 + 44);
  ctx.textAlign = 'left';
}

export function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}
