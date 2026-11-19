// SOLMAR story — twelve missions across three days in Solmar, with
// dialogue, objectives, timers, and the PASSED results screen.
// Mission types: drive, collect, chase, eliminate, survive.

import { dist, fmtTime, clamp } from './core.js';
import { TUNE } from './tuning.js';
import { spawnFoes } from './actors.js';
import { addFloat, addWanted, makeCar, explodeCar } from './vehicles.js';

export const MISSIONS = [
  {
    title: 'Welcome to Solmar', giver: 'Marco',
    brief: 'Marco: "Kid, you are new in Solmar. Take my sedan to the marina and pick up the package. Do not scratch the paint."',
    type: 'drive', target: { x: 2960, y: 2100 }, payout: 400, par: 120,
    hint: 'Drive to the yellow marker at the marina. Press F near a car to take it.',
  },
  {
    title: 'Beach Pickup', giver: 'Marco',
    brief: 'Marco: "Five crates washed up on the beach. The tide does not wait. Grab them all, on foot."',
    type: 'collect', count: 5, area: { x: 220, y: 1300, r: 420 }, payout: 600, par: 180,
    hint: 'Collect 5 crates on Solmar Beach. Walk over each crate to pick it up.',
  },
  {
    title: 'Runaway Wheels', giver: 'Lena',
    brief: 'Lena: "A thief took my sports car. Chase him down and wreck his ride. My car, not yours, understand?"',
    type: 'chase', target: { x: 2400, y: 500 }, payout: 800, par: 150,
    hint: 'Chase the red sports car and wreck it. Ram it or shoot it.',
  },
  {
    title: 'Plaza Trouble', giver: 'Marco',
    brief: 'Marco: "Four thugs are shaking down my shops at the plaza. Send them packing. Loud is fine."',
    type: 'eliminate', foes: 4, target: { x: 1800, y: 1000 }, payout: 900, par: 240,
    hint: 'Defeat 4 thugs at the plaza. Click to shoot, R to reload.',
  },
  {
    title: 'Sunset Delivery', giver: 'Lena',
    brief: 'Lena: "Hot cargo, cold nerves. Drive it to Ocean Blvd before the clock dies. Cops are watching tonight."',
    type: 'drive', target: { x: 1200, y: 1000 }, payout: 1000, par: 100, timed: true, limit: 100,
    hint: 'Reach the marker before the timer runs out. Fast driving pays.',
  },
  {
    title: 'Three Stops', giver: 'Benny',
    brief: 'Benny: "My garage owes three clients. Hit the checkpoints in order: beach, plaza, marina. My tools, my rules."',
    type: 'stops', stops: [{ x: 300, y: 700 }, { x: 1800, y: 1000 }, { x: 2960, y: 2260 }], payout: 1100, par: 240,
    hint: 'Visit the 3 checkpoints in order. Follow the yellow marker.',
  },
  {
    title: 'Night at the Plaza', giver: 'Marco',
    brief: 'Marco: "The crew that hit my shops is back, six strong, and they brought friends. Clear the plaza."',
    type: 'eliminate', foes: 6, target: { x: 1800, y: 1000 }, payout: 1300, par: 300,
    hint: 'Defeat 6 thugs at the plaza. Use cover and keep moving.',
  },
  {
    title: 'Tide of Crates', giver: 'Lena',
    brief: 'Lena: "Eight crates, one beach, one very dark night. Bring a flashlight and a fast pair of legs."',
    type: 'collect', count: 8, area: { x: 220, y: 1500, r: 500 }, payout: 1400, par: 240,
    hint: 'Collect 8 crates on the beach before the night ends.',
  },
  {
    title: 'Midnight Pursuit', giver: 'Benny',
    brief: 'Benny: "A courier van is running my parts across town. Stop it. The van is the target, the driver is not."',
    type: 'chase', target: { x: 600, y: 2000 }, payout: 1500, par: 180,
    hint: 'Chase the white van and wreck it before it escapes.',
  },
  {
    title: 'Heat Wave', giver: 'Marco',
    brief: 'Marco: "The police are all over the marina. Survive sixty seconds at three stars and walk away clean."',
    type: 'survive', seconds: 60, target: { x: 2960, y: 2260 }, payout: 1600, par: 60,
    hint: 'Survive 60 seconds with 3 wanted stars. Stay moving, stay alive.',
  },
  {
    title: 'Marina Siege', giver: 'Lena',
    brief: 'Lena: "Eight gunmen hold the marina, and their boss hides behind them. Take the docks back."',
    type: 'eliminate', foes: 8, boss: true, target: { x: 2960, y: 2260 }, payout: 1800, par: 360,
    hint: 'Defeat 8 gunmen and their boss at the marina.',
  },
  {
    title: 'King of Solmar', giver: 'Marco',
    brief: 'Marco: "Last job, kid. Three stops across the city, then the plaza. Finish this and Solmar is yours."',
    type: 'stops', stops: [{ x: 600, y: 500 }, { x: 2400, y: 1500 }, { x: 1800, y: 1000 }], payout: 2000, par: 300,
    hint: 'Visit the 3 checkpoints in order, then finish at the plaza.',
  },
];

export function missionDay(idx) {
  return idx < 4 ? 1 : idx < 8 ? 2 : 3;
}

export function missionMood(idx) {
  return idx < 4 ? 'golden' : idx < 8 ? 'sunset' : 'night';
}

export function startMission(G, idx, city, S) {
  const def = MISSIONS[idx];
  if (!def) return false;
  G.missionIdx = idx;
  G.mission = def;
  G.day = missionDay(idx);
  G.mood = missionMood(idx);
  G.missionTime = 0;
  G.missionLeft = def.limit || 0;
  G.shotsFired = 0;
  G.shotsHit = 0;
  G.carsDestroyed = 0;
  G.kills = 0;
  G.pickups = [];
  G.foes = [];
  G._chaseCar = null;
  G._stopsDone = 0;
  G._surviveLeft = def.seconds || 0;

  if (def.type === 'collect') {
    for (let i = 0; i < def.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * def.area.r;
      G.pickups.push({
        x: clamp(def.area.x + Math.cos(a) * r, 180, 3400),
        y: clamp(def.area.y + Math.sin(a) * r, 80, 2400),
        kind: 'crate', taken: false,
      });
    }
  }
  if (def.type === 'eliminate') {
    spawnFoes(G, def.target.x, def.target.y, def.foes, def.boss ? 120 : 100);
    if (def.boss) {
      const boss = G.foes[G.foes.length - 1];
      boss.hp = 260;
      boss.maxHp = 260;
      boss.color = '#5a1f8a';
      boss.speed = 150;
    }
  }
  if (def.type === 'chase') {
    const car = makeCar(def.target.x, def.target.y, Math.random() * Math.PI * 2, def.title.includes('van') ? 'van' : 'sport', def.title.includes('van') ? '#e8e8e8' : '#c94f42');
    car.driver = 'flee';
    car.speed = 260;
    car.hp = 220;
    G.cars.push(car);
    G._chaseCar = car;
  }
  if (def.type === 'survive') {
    addWanted(G, 55);
    G.player.x = def.target.x - 200;
    G.player.y = def.target.y - 100;
  }
  G.mode = 'brief';
  G.notice = 'MISSION: ' + def.title;
  G.noticeT = 3;
  if (S) S.missionOk();
  return true;
}

export function missionMarker(G) {
  const def = G.mission;
  if (!def) return null;
  if (def.type === 'drive' || def.type === 'eliminate' || def.type === 'survive') {
    return { x: def.target.x, y: def.target.y };
  }
  if (def.type === 'chase' && G._chaseCar && !G._chaseCar.dead) {
    return { x: G._chaseCar.x, y: G._chaseCar.y };
  }
  if (def.type === 'stops') {
    const s = def.stops[G._stopsDone || 0];
    return s ? { x: s.x, y: s.y } : null;
  }
  if (def.type === 'collect') {
    const next = G.pickups.find((p) => !p.taken);
    return next ? { x: next.x, y: next.y } : null;
  }
  return null;
}

export function missionProgressText(G) {
  const def = G.mission;
  if (!def) return '';
  if (def.type === 'collect') {
    const got = G.pickups.filter((p) => p.taken).length;
    return 'Crates ' + got + ' / ' + def.count;
  }
  if (def.type === 'eliminate') {
    const left = G.foes.length;
    return 'Thugs left: ' + left;
  }
  if (def.type === 'chase') {
    return G._chaseCar && !G._chaseCar.dead ? 'Wreck the getaway car!' : 'Target wrecked!';
  }
  if (def.type === 'stops') {
    return 'Stops ' + (G._stopsDone || 0) + ' / ' + def.stops.length;
  }
  if (def.type === 'survive') {
    return 'Survive: ' + Math.ceil(G._surviveLeft) + 's';
  }
  return 'Drive to the marker';
}

function finishMission(G, S) {
  const def = G.mission;
  const time = G.missionTime;
  const accuracy = G.shotsFired > 0 ? Math.round((G.shotsHit / G.shotsFired) * 100) : 100;
  const timeBonus = time <= def.par ? TUNE.missionParBonus : Math.max(0, TUNE.missionParBonus - Math.floor((time - def.par) * 5));
  const payout = def.payout + timeBonus;
  const stars = accuracy >= 70 && time <= def.par ? 5 : accuracy >= 50 && time <= def.par * 1.4 ? 4 : accuracy >= 30 ? 3 : 2;
  const oldLevel = G.level;
  G.money += payout;
  G.stats.earned += payout;
  G.stats.missionsDone++;
  G.respect += TUNE.respectPerMission;
  const newLevel = 1 + Math.floor(G.respect / 300);
  G.level = newLevel;
  G.passed = {
    mission: def.title,
    stars, payout, time: fmtTime(time), accuracy,
    carsDestroyed: G.carsDestroyed, levelUp: newLevel > oldLevel,
    next: MISSIONS[G.missionIdx + 1],
  };
  G.mode = 'passed';
  if (S) {
    S.missionOk();
    if (newLevel > oldLevel) S.levelUp();
  }
  addFloat(G, G.player.x, G.player.y - 40, 'MISSION PASSED +$' + payout, '#ffd94d');
}

export function failMission(G, reason, S) {
  G.failReason = reason;
  G.mode = 'failed';
  if (S) S.crash();
}

export function updateMission(G, dt, city, S) {
  const def = G.mission;
  if (!def || G.mode !== 'play') return;
  G.missionTime += dt;
  if (def.timed || def.limit) {
    G.missionLeft -= dt;
    if (G.missionLeft <= 0) {
      failMission(G, 'Out of time — the job fell through.', S);
      return;
    }
  }
  const p = G.player;
  if (def.type === 'drive') {
    if (dist(p.x, p.y, def.target.x, def.target.y) < 90) finishMission(G, S);
  } else if (def.type === 'collect') {
    for (const pk of G.pickups) {
      if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 40) {
        pk.taken = true;
        G.money += 25;
        if (S) S.pickup();
        addFloat(G, pk.x, pk.y - 20, '+$25', '#ffd94d');
      }
    }
    if (G.pickups.every((pk) => pk.taken)) finishMission(G, S);
  } else if (def.type === 'chase') {
    const car = G._chaseCar;
    if (car) {
      // The getaway driver flees along the roads.
      const away = Math.atan2(car.y - p.y, car.x - p.x);
      car.angle += clamp(((away - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.8 * dt, 1.8 * dt);
      car.speed = Math.min(car.speed + 120 * dt, 420);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 200, 3500);
      car.y = clamp(car.y, 60, 2540);
      if (car.hp <= 0 || car.dead) {
        G._chaseCar = null;
        finishMission(G, S);
      }
      // Escape if the player loses the tail for too long.
      G._chaseGap = dist(p.x, p.y, car.x, car.y) > 900 ? (G._chaseGap || 0) + dt : 0;
      if (G._chaseGap > 12) failMission(G, 'The target got away.', S);
    }
  } else if (def.type === 'eliminate') {
    if (G.foes.length === 0) finishMission(G, S);
  } else if (def.type === 'stops') {
    const s = def.stops[G._stopsDone || 0];
    if (s && dist(p.x, p.y, s.x, s.y) < 90) {
      G._stopsDone++;
      G.money += 100;
      if (S) S.pickup();
      addFloat(G, s.x, s.y - 24, 'STOP DONE +$100', '#ffd94d');
      if (G._stopsDone >= def.stops.length) finishMission(G, S);
    }
  } else if (def.type === 'survive') {
    G._surviveLeft -= dt;
    if (G._surviveLeft <= 0) {
      G.wanted = 0;
      G.wantedHeat = 0;
      finishMission(G, S);
    }
  }
}
