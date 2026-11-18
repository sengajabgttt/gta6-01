# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sengajabgttt/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sengajabgttt/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR** — an original open-world crime game in the spirit of GTA 6, built as a
2D top-down canvas game with plain files and no build step, no external
libraries, and no network loads. Everything is original: the city, the
characters, the vehicles, the story, the art, and the sound (WebAudio
synthesized, no audio files).

You are Jax Moreno, a wheelman in the sun-soaked coastal city of Solmar.
Your sister's garage owes $8,000 to a fixer. Work four story missions to
pay it off: a timed delivery, stealing the Comet GT sports car by the pier,
a shootout with three collectors, and ramming an armored van on Ocean Drive
to grab the cash — then lose the cops and get home. After the story, free
roam continues with taxi fares.

Systems: a city to explore on foot and by car (road grid, beach, pier,
park, garage), traffic and pedestrians, cars to steal and drive, a wanted
level (0–5 stars) with police cars and on-foot cops who chase, ram, and
try to bust you, on-foot and drive-by combat (pistol, punch), a HUD with
cash, health, wanted stars and a live minimap, a start screen, mission
briefs, and saves via localStorage. Traffic keeps to its lane, overtakes
slow cars, and clears its own jams; police back off for a few seconds
after a hard ram instead of shredding your car.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no
dependencies beyond Node 22 for the static server (the game itself is
plain HTML/JS and runs from any static file server).

## Controls

- **W A S D / arrows** — move on foot, drive the car
- **Shift** — sprint on foot
- **E** — enter / exit a car
- **Mouse** — aim; **click** — shoot; **R** — reload; **F** — punch
- **Space** — handbrake; **H** — horn; **M** — mute; **Esc / P** — pause

## Play it headless

The rules module (`game/src/world.js`) is framework-free and imports cleanly
in Node. A scripted autopilot plays all four missions and checks the whole
story end to end; see the build notes in the repo history.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1c6jcmp6&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
