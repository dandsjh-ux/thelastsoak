# 🐰 Word Chase

> Also in this repo: **[The Last Soak](last-soak/README.md)**, a cutesy isometric multiplayer whodunit (`last-soak/`).

A cute multiplayer 3D tag game built with **three.js** where players run around a cartoon neighbourhood collecting words that fit a category (Year 5/6 vocabulary), while dodging the tagger.

![style](https://img.shields.io/badge/three.js-r186-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-green)

## Gameplay

- **Lobby:** enter your name, pick a colour and a character (bear, bunny, cat, pup, chick), then join any active game from the list (or join mid-game if the host allows it) or host your own. Minimum **2 players**.
- **Words:** each round has a category (e.g. *Action Verbs*, *Sports*, *Feelings*, *Space*, *Maths Words*, 16 built-in categories, or the host's own custom word list). Words are spread evenly across the whole map using stratified sampling, so there are no empty areas, and they include distractors from other categories.
  - Correct word: **+points**; distractor: **−points**. Collected words respawn in the same area.
- **Tagger:** one player is the tagger (red party hat + ring) and runs faster. Tagging a runner gives the tagger points; the runner loses points and respawns far away with brief immunity. **The tagger switches every round**, so everyone gets a turn.
- **Runners** can **dash** (with a cooldown) and **hide inside houses** (the tagger can't see them indoors), but every *N* seconds (default 12, adjustable) the tagger gets a **reveal pulse**: arrows point at every runner, with light beams and minimap pings.
- **Power-ups** (distributed evenly, with equal numbers of each type): ⚡ speed boost, 🛡️ shield (blocks one tag), ✨ blink (teleport forward).
- End-of-round results show which words each player collected (correct vs. distractor) plus examples of words that fit the category, which is handy for discussing afterwards.

### Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `WASD` / arrow keys | joystick |
| Dash (runners) | `Shift` / `Space` | 💨 button |
| Blink | `F` | ✨ button |
| Orbit camera | drag with left or right mouse button, `Q` / `E` | drag the right side of the screen |
| Zoom | mouse wheel, `Z` / `X` (or `+` / `−`) | pinch |
| Tilt camera | drag up/down, `T` / `G` | drag up/down |
| Camera presets (close-up / normal / far / top-down) | `C` | 👁️ button |
| Camera behind you | `V` | 🎯 button |
| Show/hide key help | `H` | |

On-screen camera buttons (⟲ ⟳ ＋ － ⤒ ⤓ 👁️ 🎯) also work with the mouse.

## Host settings

The host can change these in the waiting room (everyone sees them live): round length, tagger turns per player, runner head start, map size, max players, late joining, category mode (random rotation / fixed / custom list), word density, distractor %, word respawn delay, tagger speed bonus, dash cooldown, house hiding on/off, **reveal pulse interval**, pulse duration, respawn immunity, power-up amount/duration/types, and all point values.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm test           # end-to-end server smoke test (2 simulated players)
```

## Deploy to Render

1. Push this repo to GitHub.
2. In Render choose **New → Blueprint** and select the repo (it uses `render.yaml`), **or** create a **Web Service** manually:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/healthz`
3. Render provides `PORT` automatically; WebSockets work out of the box.

> Free Render instances sleep when idle, so the first visit after a while may take ~30s to wake up. All game state lives in memory, so restarting the service ends any running games.

## Project layout

```
server/index.js    Express static server + Socket.IO lobby/rooms
server/game.js     Authoritative game logic (rounds, words, power-ups, tagging, pulses)
server/words.js    Year 5/6 vocabulary categories (no word appears in two categories)
shared/map.js      Deterministic neighbourhood generator + collision (used by server AND client)
shared/settings.js Host settings schema/validation + shared physics constants
public/            three.js client (world, characters, items, effects, HUD, input)
test/smoke.js      Automated multiplayer smoke test
```
