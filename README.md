[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/angelomlbb07-cyber/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/angelomlbb07-cyber/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR

SOLMAR is a 2D top-down open-world crime game — a make.fun `gta6-01` entry.
You play a wheelman climbing the ranks of Solmar, a coastal city of beaches,
docks, neon streets, markets, hills and a casino, taking story jobs from
fixer Marisol Vega (and from Benny Torres and Dario Cruz along the way).

## The game

- **12 story missions** with time limits and cash payouts, from "First
  Wheels" through "Sunset Heist", "Casino Royale" and the finale "King of
  Solmar". Each mission has a briefing, a timer, named dialogue, and a
  PASSED panel that always dismisses — including after the final mission.
- **Open world:** drive and walk across Solmar's districts — beach, docks,
  downtown, market, hills, airfield and casino — with roads, landmarks,
  palms, signs and a day system (day 1–3) that changes the light.
- **Traffic and pedestrians:** cars and pedestrians fill the streets. Steal
  cars, drift around corners and score near-miss cash; wreckless driving
  draws attention.
- **Wanted level and police:** a 0–5 star wanted system. Cop cars pathfind
  and ram, foot cops chase, punch and bust, roadblocks appear at 3 stars,
  and a police helicopter hunts you from 2 stars up. Lose the heat or get
  BUSTED / WASTED.
- **Combat:** on-foot and drive-by gunplay with weapons and ammo, health and
  armour. Cops can kill you on foot — and WASTED triggers properly.
- **Progression:** earn cash and respect, level up your respect rank, and
  spend cash at Benny's Garage on turbo, armour, tyres and nitro upgrades.
- **HUD and minimap:** weapons and ammo, cash, health, armour, respect,
  wanted stars, district labels, mission counter and timer, and a live
  minimap.
- **Start screen and saving:** title menu, pause, and save/load so progress
  (missions, cash, respect, garage) survives between sessions. Restarting
  after finishing all 12 missions starts a clean new game.
- **Radio and sound:** four radio stations plus fully synthesized WebAudio
  sound effects — engine, sirens, gunfire, pickups — with no audio files
  and no network requests. The game runs entirely offline in a desktop
  browser.

## Play it

Requires Node.js 22 (standard library only, no dependencies, no build step):

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser.

## Layout

- `game/` — the game itself, plain static files: `game/index.html` plus
  `game/src/` with 14 ES modules (`audio`, `city`, `config`, `input`,
  `main`, `missions`, `player`, `police`, `random`, `render`, `save`,
  `shots`, `state`, `traffic`).
- `screenshots/` — the four entry screenshots (beach chase, title menu,
  on-foot combat, mission passed).
- `main.ts` — the program entry point: copies `game/` and `screenshots/`
  to the output directory and writes `dossier.json` with the vendored
  make.fun library.
- `serve.ts` — tiny static server for local play on port 8080.
- `vendor/makefun-game.ts` — vendored make.fun library used to build the
  dossier.

## License

MIT License — see [LICENSE](LICENSE).
