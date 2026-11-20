# SOLMAR — An Original Open-World Crime Game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/angelomlbb07-cyber/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/angelomlbb07-cyber/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR** is a 2D top-down open-world crime game set in an original coastal
city: beach, marina, downtown, a plaza with a fountain, and quiet suburbs.
Sun, sand and bad decisions. No Rockstar names, characters, art, music or
map — the city, the story and every name in it are original.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Plain static files under `game/` — no build step, no network requests.
Every script, image and font is a file under `game/` or a `data:` URI.

## The game

- **12 story missions across 3 days** — taxi, repo/delivery, chase, combat
  and heist jobs for Marisol Vega, with Benny's Garage on the side.
  Mission banners, objectives with distance, timers, dialogue with
  portraits, payouts and respect rewards.
- **A city to explore on foot and by car** — traffic, pedestrians drawn as
  visible people, labelled buildings (MOTEL SOL, PALM MART, Marina Bay
  Bank, CORAL CASINO), a pier, a beach and the Coral Plaza fountain.
- **Wanted level 0–5 stars** — foot cops at 1 star, patrol cars at 2+,
  a police helicopter with a searchlight at 2+. Heat decays when you
  break line of sight.
- **Arcade driving** — handbrake drift, nitro, near-miss cash, car damage
  and wrecks. **Combat** — pistol and SMG with tracers, muzzle flashes
  and ammo. **Progression** — respect levels, armour, garage repairs
  and upgrades, save/load via localStorage (Continue shows your day,
  cash and mission).
- **Four procedural radio stations** synthesized live with WebAudio —
  no audio files. Day/night cycle with a golden hour and sunset.
- **HUD + minimap** — cash, stars, HP/armour/respect, radio, mission
  counter and timer, district and flavour line.

## Controls

WASD drive/walk · SPACE handbrake · MOUSE aim · CLICK shoot · E action
(enter car, crack vault) · SHIFT nitro · 1/2 weapons · R reload ·
M radio · ESC pause · F5 quick save.

## Code

One job per file, named for what it does:

| File | Job |
|---|---|
| `game/src/tuning.js` | All constants and balance numbers |
| `game/src/world.js` | City generation: districts, roads, buildings, beach, pier, plaza |
| `game/src/vehicles.js` | Car physics, traffic, stealing, collisions |
| `game/src/actors.js` | Player, pedestrians, cops, helicopter, wanted level, combat |
| `game/src/story.js` | 12 missions, dialogue, objectives, progression |
| `game/src/hud.js` | HUD, minimap, title menu, passed panel, toasts |
| `game/src/sound.js` | WebAudio radio stations and sound effects |
| `game/src/keys.js` | Keyboard and mouse input |
| `game/src/boot.js` | Game loop, screen state machine, screenshot staging |
| `game/src/core.js` | Game state, save/load, step and render orchestration |

`main.ts` hands the game in with `buildDossier` from
`vendor/makefun-game.ts` (the kit's copy, unchanged). `serve.ts` is a
Node-stdlib static server for local play. Built for the make.fun
[gta6-01 "Make GTA 6"](https://make.fun/bounty/gta6-01) competition.
