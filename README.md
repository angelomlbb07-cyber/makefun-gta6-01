# SOLMAR

[![make.fun](https://make.fun/badge/competition/gta6-01)](https://make.fun/bounty/gta6-01)
[![make.fun](https://make.fun/badge/entry/gta6-01)](https://make.fun/bounty/gta6-01)
[![make.fun](https://make.fun/badge/leaderboard/gta6-01)](https://make.fun/bounty/gta6-01)

An original 2D top-down open-world crime game for the make.fun **gta6-01**
bounty ("Make GTA 6"). No Rockstar material anywhere: our own city, names,
story, art, sounds and music.

## The game

Play as **Marco Solis** in the sun-soaked coastal city of **Solmar**. Work
12 story missions for fixer **Marisol Vega**, steal cars, outrun the police
as the wanted level rises, and own the city.

- **Open world**: streets grid, Palmline Beach with sea and palms, Marina
  Docks, Neon Row, Old Solmar, Hillcrest — on foot and by car.
- **Traffic and pedestrians** (pedestrians flee gunfire and the police).
- **Cars to steal and drive**: driver bails, car HP, handbrake drifts,
  nitro, taxi fares.
- **Wanted level**: police cars that pathfind and ram, foot cops that chase,
  punch and bust, roadblocks at 3 stars, a police helicopter with a
  searchlight at 2+ stars, heat that decays when you lay low.
- **12 story missions** with a visible counter, mission timer, briefing
  toasts, and a mission-passed screen with payout and stats (time, accuracy,
  cars destroyed/stolen, rating).
- **Combat**: fists, pistol and SMG with ammo, muzzle flash and tracers.
- **HUD with a live minimap**: cash, wanted stars, health, armour, respect
  level, clock, district label and flavour line, objective banner,
  speedometer with car name, waypoint arrow and distance, radio station.
- **Start screen and saving**: title menu (New Game / Continue / How to
  Play / Missions), pause, BUSTED/WASTED screens, localStorage autosave
  after each mission.
- **Progression**: mission payouts, drift and near-miss cash, Benny's Garage
  upgrades (Turbo, Armour, Tyres, Nitro), day 1–3, respect levels, 4 radio
  stations.
- **Sound**: synthesized WebAudio only — engine, sirens, gunshots, radio
  music. No audio files, no network requests.

## Controls

WASD / arrows — drive or walk · E — enter a car / hold to crack a safe ·
F — shoot or punch · Q — switch weapon · R — reload · Shift — nitro ·
Space — handbrake · C — change radio · P — pause · M — mute.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Static files under `game/`, no build step, no network requests. The entry
program is `main.ts` (Node 22, standard library only).

## Layout

- `game/src/` — 14 modules, one job each: `config`, `random`, `state`,
  `city`, `audio`, `input`, `player`, `traffic`, `police`, `missions`,
  `save`, `render`, `shots`, `main`.
- `game/index.html` — the page that loads the game.
- `screenshots/` — 4 screenshots of the game itself: beach chase (cover),
  title menu, on-foot combat, mission passed.
- `main.ts` — builds `/output` (game + screenshots + dossier.json).
- `serve.ts` — local static server for development.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.
