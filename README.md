# SOLMAR — A Sun-Soaked Open-World Crime Story

[![make.fun build](https://img.shields.io/badge/make.fun-build-passing-brightgreen)](https://make.fun/bounty/gta6-01)
[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-gta6--01-blue)](https://make.fun/bounty/gta6-01)
[![make.fun entry](https://img.shields.io/badge/make.fun-entry-SOLMAR-orange)](https://make.fun/bounty/gta6-01)

A complete 2D top-down open-world crime game, built for the make.fun
**gta6-01 "Make GTA 6"** bounty. An original fictional coastal city —
no Rockstar names, characters, art, music, or map.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD move / drive · E enter & steal cars · Mouse aim, click shoot ·
F punch · Space handbrake drift · Shift run · M start mission ·
R radio · P pause · C save.

## What is in the game

- **Open city**: beach, marina, downtown, plaza, suburbs; day/night cycle
  with golden hour and night headlights; pedestrians and dense traffic.
- **Driving**: arcade car physics, handbrake drift and near-miss cash,
  car damage, Benny's Garage repairs.
- **Wanted 0–5 stars**: foot cops at 1 star, patrol cars at 2+,
  police helicopter with searchlight at 2+, wanted decays when you
  break line of sight.
- **Combat**: pistol with tracers and muzzle flash, punching, thugs who
  return fire, health / armour pickups.
- **Story**: 12 missions across 3 days — drive-to, chase, shootout,
  timed delivery, escape — with payouts, respect, levels, and a
  Mission PASSED screen (stars, time, accuracy, cars destroyed).
- **HUD**: health / armour, cash, wanted stars, speed, minimap with
  mission marker and police dots, objective banner, cash popups.
- **Sound**: fully synthesised WebAudio — engine hum, gunshots, sirens,
  and a radio with 4 procedural stations. No audio files.

## Layout

- `game/src/tuning.js` — every constant
- `game/src/world.js` — city generation, collision, lighting
- `game/src/vehicles.js` — car physics, traffic AI, stealing
- `game/src/actors.js` — player, peds, police, helicopter, combat
- `game/src/story.js` — 12 missions, progression
- `game/src/hud.js` — HUD, minimap, menus
- `game/src/sound.js` — WebAudio synth + radio
- `game/src/keys.js` — keyboard / mouse input
- `game/src/boot.js` — startup, main loop, state machine
- `game/src/core.js` — shared state, camera, save/load
- `main.ts` — builds `/output` (game + screenshots + dossier.json)
- `serve.ts` — dev static server (HEAD support, `--host`, logging)

## Screenshots

`1-beach.jpg` golden-hour beach chase · `2-title.jpg` title menu ·
`3-combat.jpg` night plaza shootout · `4-passed.jpg` Mission PASSED.

MIT licensed. Built fresh in one recorded session for gta6-01 round 8.
