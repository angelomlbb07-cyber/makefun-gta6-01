# SOLMAR — A 2D Open-World Crime Story

![Make GTA 6](https://make.fun/badge/gta6-01.svg)
![Rank](https://make.fun/badge/gta6-01/angelomlbb07-cyber/makefun-gta6-01/rank.svg)
![Reward](https://make.fun/badge/gta6-01/angelomlbb07-cyber/makefun-gta6-01/reward.svg)

An original 2D top-down open-world crime game, built for the
[Make GTA 6](https://make.fun/bounty/gta6-01) bounty on make.fun.
Solmar is a sun-soaked coastal city of our own invention — its beach,
marina, plaza, streets, people and story are all original.

## Play it

Serve the `game/` folder with any static server and open
`game/index.html` in desktop Chrome. No build step, no network request:

```sh
node serve.ts
# then open http://localhost:8080
```

## What is in the game

- **A city to explore** — Solmar Beach, the marina docks, the plaza
  fountain, five avenues, four streets, traffic and pedestrians.
- **On foot and by car** — walk, run, steal cars, drive with drift and
  near-miss cash, wreck cars in chases.
- **12 story missions over 3 days** — golden hour, sunset and night,
  with dialogue, objectives, timers, and a MISSION PASSED panel
  (stars, payout, time, accuracy, cars destroyed, level up).
- **Combat** — pistol with tracers and muzzle flashes, enemy gunmen,
  health and armour.
- **Wanted system** — 5 stars, police cars that chase and ram, a
  police helicopter at 2+ stars, BUSTED fines.
- **HUD + minimap** — health, armour, money, level and respect,
  mission objective, timer, wanted stars, and a live minimap.
- **Radio** — 4 stations of synthesized WebAudio music (Q to change,
  M to mute), plus engine, gunshot, crash and pickup sounds.
- **Save / load** — progress saves to the browser (localStorage);
  continue from the title screen.
- **Benny's Garage, pause menu, title screen** — the full loop.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Shift | Run |
| Mouse + click | Aim and shoot |
| F | Enter / exit car |
| R | Reload |
| Q | Next radio station |
| M | Mute radio |
| Esc | Pause |

## Screenshots

1. Golden-hour beach chase — near miss and drift cash, police behind.
2. Title menu.
3. Night combat at the plaza.
4. Mission PASSED — 5 stars, $1,800 payout, 2 cars destroyed, level up.

## Tech

Plain JavaScript ES modules under `game/src/`, no libraries, no build
step. `main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with
the vendored make.fun library.

## License

MIT — see `LICENSE`.

---

Built on [make.fun](https://make.fun) — join with my referral code
**zeyxtczn**: https://make.fun/r/zeyxtczn
