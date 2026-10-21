# Survive The Explosion

A single-player 3D browser game for students about 10 to 14 years old. Build a shelter around a small house, then watch an explosion hit it. The game teaches how much stronger each kind of explosion is, which dangers it makes (fragments, shockwave, heat, radiation), and which materials stop which danger.

Everything is cartoon style. Nobody is hurt: a capybara family lives in the house, and a failed shelter is "Not safe this time!". The text is written in simple English for language learners.

## Play

1. Pick a level (Hand grenade, TNT, Nuclear bomb). Levels unlock one after the other.
2. Read the briefing: how strong the explosion is, the dangers, and the new materials.
3. Walk around the yard and place blocks with your coins. Stack them up to 3 high.
4. Press **Ready!** and watch. Then read the result and do the quick quiz.

### Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk | WASD or arrow keys (relative to the camera) | joystick, bottom left |
| Place block | Space, Enter, or click a square | Place button, or tap a square |
| Remove top block | X, Backspace, or right-click | Remove button |
| Pick material | 1 to 9, Tab, or click a card | tap a card |
| Turn camera | Q / E, or drag | drag with one finger |
| Zoom | mouse wheel, or Z / C | pinch |
| Ready | R | Ready! button |

Note: the plan listed Z / X for zoom, but X is "remove", so zoom out is **C**.

Upgrade cards (Board up windows, Basement, Earth on the roof) are switches: tap to turn on or off.
Teacher mode (How to play screen) unlocks all levels. Progress is saved in `localStorage` (stars and unlocked levels only).

## Run

```
npm install
npm run dev        # development
npm run build      # static site in dist/ (base './', works from any folder)
npm run preview    # serve dist/
npm test           # simulation tests (no three.js)
```

## Code map

```
index.html, src/main.js     state machine: title, levelSelect, briefing, build, countdown, explosion, results, quiz, final
src/input.js                keyboard, mouse, touch, joystick, pinch (no three.js)
src/scene/world.js          renderer, sky, lawn, fence, house (damage animation), blast markers
src/scene/player.js         builder character, acceleration and collision, third-person camera rig
src/scene/build.js          placed blocks (per-material look), ghost preview, stacking
src/scene/explosion.js      pooled particles, fireball, shockwave ring, mushroom cloud, dust wall, flying blocks
src/ui/*.js                 DOM screens, HUD, saved progress
src/sim, src/data           pure simulation and game data (no rendering)
```

Rendering is kept light for tablets: low-poly shapes, `setPixelRatio(min(dpr, 2))`, one shadow-casting light (1024 map), instanced particles, no post-processing.

## Testing helper

`window.__game` exposes a small debug API: `state`, `level`, `result`, `coins`, `blocks`,
`placeBlock(gx, gz, materialId)`, `toggleUpgrade(id)`, `ready()`, `skipToResults()`, `startLevel(id)`,
`goto(name)`, `advance(seconds)` (runs the game clock without waiting), `tryAgain()`.

## Deploy to Render

`render.yaml` at the repo root has a `survive-the-explosion` **static site** service (root `survive-the-explosion/`, build `npm install && npm run build`, publish `dist/`). In Render, sync the Blueprint (or choose **New → Blueprint** and select this repo) and Render creates the site. No server is needed, and static sites do not sleep like free web services.
