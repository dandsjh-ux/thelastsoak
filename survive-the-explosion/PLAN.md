# Survive The Explosion: game plan

A single-player three.js browser game for upper primary and lower secondary
students (about ages 10 to 14). Students build defences around a small house,
then watch an explosion hit it. The game teaches how much more powerful each
kind of explosion is, which threats each one makes (fragments, shockwave,
heat, radiation), and which materials stop which threat.

Content rules: simple, clear English (short sentences, B1 level). Facts stay at
the level of comparative power and safety (blast radius, how materials hold
up). Nothing about how explosives are made. Cartoon tone: nobody is hurt on
screen. A capybara family lives in the house; if the house is not safe the
result is "Not safe this time!", never injury or death.

## Tech

- Folder `survive-the-explosion/` in the repo. Vite + `three` (same versions as
  `last-soak/`). Plain ES modules, no framework. No server: `npm run build`
  makes a static `dist/` (vite `base: './'`).
- `npm test` runs `node --test test/` against the pure simulation (no three.js
  imports in `src/sim/` or `src/data/`).
- Must run well on tablets: low-poly, `setPixelRatio(min(devicePixelRatio, 2))`,
  one shadow-casting directional light (1024 map), no post-processing.
- Fonts: Google Fonts "Fredoka" (like The Last Soak). Fallback system-ui.
- `localStorage` only for progress (stars, unlocked levels, teacher unlock);
  every access wrapped in try/catch.

## File layout and owners

```
index.html, src/style.css, src/main.js          Worker B (client)
src/input.js                                    Worker B
src/scene/world.js   renderer, sky, ground, yard, house, lights          B
src/scene/player.js  builder character, movement, third-person camera   B
src/scene/build.js   grid, ghost preview, placing/removing blocks        B
src/scene/explosion.js  flash, fireball, shockwave ring, smoke,
                         debris flying (driven by sim result)             B
src/ui/*.js          screens and HUD (DOM overlay)                       B
src/data/materials.js, levels.js, facts.js (glossary, quiz)              Worker A
src/sim/grid.js      grid constants and helpers (shared)                 Worker A
src/sim/blast.js     simulateBlast()                                     Worker A
test/sim.test.js     balance tests                                       Worker A
README.md                                                                B
```

## World and grid (src/sim/grid.js)

Units are metres. Ground plane y = 0.

```js
export const GRID = 20;          // 20 x 20 cells, cell = 1 m
export const CELL = 1;
export const MAX_STACK = 3;      // blocks stack up to 3 high (layer 0,1,2), each 1 m tall
export const HOUSE = { gx0: 8, gz0: 8, size: 4, height: 3 }; // cells 8..11 x 8..11
export function cellToWorld(gx, gz) -> { x: gx - GRID/2 + 0.5, z: gz - GRID/2 + 0.5 }
export function worldToCell(x, z) -> { gx, gz } (floored; may be out of range)
export function inGrid(gx, gz) -> boolean
export function isHouseCell(gx, gz) -> boolean
export function canBuildAt(level, gx, gz) -> boolean
   // inGrid, not a house cell, and not within level.blast.clearRadius metres
   // of a point blast (cell centre distance). Far blasts have no clear zone.
```

The house is centred on the origin (world x and z from -2 to +2). North is -z.
The door is on the south side (+z), facing away from the blast.

## Data (src/data)

### Threats

```js
export const THREATS = {
  fragments: { id, name: 'Fragments', icon: '🔩', short: 'Small pieces of metal that fly out very fast.' },
  blast:     { id, name: 'Shockwave', icon: '💨', short: 'A wall of pushed air that hits like a giant hand.' },
  heat:      { id, name: 'Heat flash', icon: '🔥', short: 'A burst of light and heat that can start fires.' },
  radiation: { id, name: 'Radiation', icon: '☢️', short: 'Invisible energy that can make people sick. Thick, heavy materials block it.' },
};
```

### Materials (src/data/materials.js)

`export const MATERIALS = [ ... ]`, ordered by the level that unlocks them.
Each entry:

```js
{ id, name, emoji, color: 0xRRGGBB, cost, unlockLevel /* 1..3 */,
  kind: 'block' | 'upgrade',             // block = placed on yard grid; upgrade = one-off house upgrade
  // resistance per threat, 0..10 (shown to students as 0..5 bars, rounded half)
  resist: { blast, fragments, heat, radiation },
  hp,                                    // blast strength before breaking (block only)
  fact }                                 // one simple sentence
```

Starting list (Worker A may tune numbers to pass the balance tests, but keep
the order of strength realistic):

| unlock | id | name | cost | idea |
| --- | --- | --- | --- | --- |
| 1 | pillow | Pillows | 2 | Funny and useless. Soft things do not stop fragments. |
| 1 | cardboard | Cardboard boxes | 3 | Very weak. Fragments go straight through. |
| 1 | wood | Wooden planks | 5 | OK vs small fragments, burns, weak vs shockwave. |
| 1 | sandbag | Sandbags | 8 | Great vs fragments (sand soaks up energy), OK vs blast. |
| 1 | brick | Bricks | 10 | Good all round, but brittle in a strong shockwave. |
| 2 | water | Water barrels | 12 | Water absorbs fragments and heat. |
| 2 | concrete | Concrete blocks | 16 | Strong and heavy. Good vs blast. |
| 2 | steel | Steel plates | 22 | Best vs fragments, strong vs blast, thin so weak vs radiation. |
| 2 | windows (upgrade) | Board up windows | 20 | Stops glass breaking; helps vs blast and heat. |
| 3 | earth | Packed earth | 10 | Cheap, heavy, very good vs radiation and blast. |
| 3 | thickconcrete | Thick concrete | 30 | Very strong vs everything. |
| 3 | lead | Lead sheets | 40 | Best vs radiation, expensive. |
| 3 | foil | Reflective foil | 6 | Reflects the heat flash. Nothing else. |
| 3 | basement (upgrade) | Basement shelter | 150 | Underground room. Huge help vs radiation and blast. |
| 3 | roof (upgrade) | Earth on the roof | 80 | Blocks radiation from above. |

### Levels (src/data/levels.js)

`export const LEVELS = [ grenade, tnt, nuke ]`, each:

```js
{ id: 1, key: 'grenade', name: 'Level 1: Hand grenade', difficulty: 'Easy',
  icon: '💣', budget: 100,
  tntKg: 0.2,                        // TNT-equivalent, for the comparison chart
  blast: { type: 'point', x: 0, z: -7, clearRadius: 1.5 }   // world coords, ground level
     //  or { type: 'far', dirX: 0, dirZ: 1, distanceM: 3000 } (wave travels toward +z, from the north)
  threats: { fragments: 6, blast: 2 },   // threat power at the yard (sim units)
  waveSpeed: 25,                     // visual metres/second for timing debris
  facts: [ 'short', 'simple', 'sentences' ],
  winTip: '...', loseTips: { fragments: '...', blast: '...', heat: '...', radiation: '...' },
}
```

- Level 1, Hand grenade (Easy). Point blast 5 m north of the house wall.
  Threats: fragments (main), small shockwave. Budget about 100.
- Level 2, TNT (Medium): a big box of TNT, 25 kg, about 125 grenades.
  Point blast about 6 m north of the house wall. Threats: blast (main),
  fragments/debris. Budget about 300.
- Level 3, Nuclear bomb (Hard): 15 kilotons (the size of the Hiroshima bomb),
  3 km away to the north. Far blast (parallel wave). Threats: heat, blast,
  radiation. Budget about 700. Text must say: close to a nuclear bomb nothing
  can survive; our house is 3 km away.

### Facts (src/data/facts.js)

- `GLOSSARY`: about 12 words with a one-sentence meaning: explosion,
  explosive, fragment, debris, shockwave, blast radius, pressure, heat flash,
  radiation, shelter, absorb, durable, fragile.
- `QUIZ[levelId]`: 3 multiple-choice questions each, 3 options, one correct,
  plus a one-line explanation. Simple English.
- `COMPARE`: rows for the power chart (log scale): grenade 0.2 kg, TNT 25 kg,
  nuclear 15,000,000 kg, with friendly lines: "TNT box = about 125 grenades",
  "Nuclear bomb = about 75 million grenades".
- Fact lines to use (accurate, kept simple):
  - Grenade: most danger comes from fragments; very dangerous within about
    5 m, still dangerous up to about 15 m; sandbags are great at stopping
    fragments.
  - TNT: scientists measure other explosions in "tonnes of TNT"; the
    shockwave moves faster than sound; it can smash windows and knock down
    walls; heavy, thick materials and distance help most; twice as far away
    is much weaker.
  - Nuclear: energy comes from splitting atoms; Hiroshima 1945 was about
    15,000 tonnes of TNT; it makes a flash of heat and light, a huge
    shockwave and radiation; thick concrete, earth and basements block
    radiation; "Go in, stay in, tune in" is the official safety advice; many
    people died in 1945, and this is why countries work to stop nuclear
    weapons.

## Simulation (src/sim/blast.js), pure JS, deterministic

```js
export function simulateBlast(level, placements, upgrades = []) -> Result
// placements: [{ gx, gz, layer, materialId }]   layer 0..2
// upgrades:   ['windows', 'basement', 'roof']   (upgrade material ids bought)

Result = {
  survived: boolean,
  safety: 0..100,                        // overall score shown to students
  stars: 0..3,                           // 0 if not survived; 3 if safety >= 90 and >= 20% budget left etc.
  threats: { [threatId]: { incoming, reached, blockedPct /*0..100*/, safe: boolean } },  // only the level's threats
  broken: [{ index /* into placements */, time /* s after blast */, vx, vy, vz }],   // blocks that break, for animation
  houseDamage: 0..1,                     // drives visual damage (windows, roof, walls)
  tips: [string],                        // 1-2 simple tips for the threats that got through
  spent: number,                         // coins used
}
```

Model (Worker A owns the detail, these are the requirements):

- Target points: points spread over the house's outer walls and roof
  (for example the 4 x 4 footprint at heights 0.5, 1.5, 2.5).
- Point blast: for each threat, cast a ray from the blast point (y = 0.3) to
  each target point. March in small steps; collect, in order, each distinct
  block the ray passes through (cell + layer = floor(y)). Power falls with
  distance (fragments roughly 1/d, blast roughly 1/d^2, both clamped so near
  is not infinite).
- Far blast: rays are parallel along (dirX, dirZ), starting from the grid edge.
  Heat comes slightly from above (the fireball is high), so tall walls matter.
- Passing a block: the block reduces the energy by its resistance for that
  threat. For the `blast` threat, if the incoming blast energy is greater than
  the block's `hp`, the block breaks (goes into `broken`, once) and lets more
  through. Broken blocks are still counted for the rays already processed in
  order; keep it deterministic.
- Radiation (level 3 only): comes from all around, not just the blast side.
  Shielding = average over 16 directions of the radiation resistance of
  blocks within 4 cells of the house in that direction, plus roof and
  basement upgrades. So walls on one side are not enough.
- Upgrades: `windows` cuts blast and heat reaching the house; `basement`
  cuts radiation and blast a lot; `roof` cuts radiation.
- A threat is `safe` when `reached` is under the level threshold. Survived
  means all threats safe.
- `broken[].time` = distance from blast / level.waveSpeed (far blast: distance
  from the north grid edge / waveSpeed + 2 s for the flash first).
  Velocities point away from the blast, upward, scaled by excess energy.

### Balance tests (test/sim.test.js), all must pass

1. Every level: an empty yard does NOT survive.
2. Level 1: a 2-high sandbag wall, 6 wide, between the blast and the house,
   within budget, survives. The same wall of cardboard does not. Pillows do
   not.
3. Level 2: the best affordable sandbag-only wall does not survive; a wall
   of concrete and steel within budget survives.
4. Level 3: a full ring of walls with no basement does not survive
   (radiation); basement + roof + an earth/concrete wall on the north side
   within budget survives.
5. Determinism: the same input gives the same output.
6. Every material's cost, every level's budget, and the costs used in the
   winning builds respect the budget.
7. `canBuildAt` rejects house cells, out-of-grid cells and the clear zone.

## Client (Worker B)

### Game flow (src/main.js state machine)

`title -> levelSelect -> briefing -> build -> countdown -> explosion -> results -> quiz -> (next briefing | final)`

1. Title: big "Survive The Explosion" logo with a cartoon house, buttons:
   Play, How to play, Words to know (glossary).
2. Level select: 3 cards (Easy grenade, Medium TNT, Hard nuclear), stars
   earned, locked until the previous one is passed. "Teacher mode: unlock all
   levels" switch on the How to play screen (saved).
3. Briefing card: icon, name, "How strong is it?" log-scale bar chart from
   `COMPARE` (highlight the current one), 3 facts, the level's threats with
   icons and short text, "New materials!" list, Start building.
4. Build phase (third person):
   - The builder (cute low-poly character with a hard hat) walks around the
     yard. Camera follows behind and above; orbit and zoom.
   - Target cell = the cell about 1.3 m in front of the builder, shown with a
     ghost block of the selected material (green if allowed, red if not).
     Clicking or tapping a buildable cell within 6 m of the builder also
     places there.
   - Place on an occupied cell stacks up to 3 high. Remove takes the top
     block and refunds its cost.
   - Inventory bar at the bottom: material cards (colour swatch + emoji,
     name, cost, mini bars for each threat in the level). Locked future
     materials are not shown. Upgrades show as toggle cards.
   - Top bar: level name, coins left, threat icons. A "?" opens the selected
     material's fact.
   - The blast point is marked with a cartoon icon (grenade/TNT box on the
     ground, or for the nuke a sign "Bomb 3 km this way ⬆" on the north
     fence, plus a far horizon marker). Show a faint danger-radius circle for
     point blasts.
   - "Ready!" button starts the countdown. "Clear all" button with refund.
5. Countdown 3, 2, 1. The builder runs into the house. Camera moves to a
   wide cinematic view showing the blast side.
6. Explosion visuals by type:
   - Grenade: small flash, puff of smoke, spark fragments (fast small
     particles) flying out in all directions.
   - TNT: big orange fireball, expanding shockwave ring on the ground, dust
     cloud, camera shake.
   - Nuclear: white screen flash, orange heat tint, a cartoon mushroom cloud
     rising on the north horizon, then (after about 2 s) a dust wall sweeping
     across from the north, strong camera shake.
   - Broken blocks fly with gravity and spin using `result.broken` timing and
     velocities. House damage by `houseDamage`: windows crack/shatter
     (> 0.2), roof tiles fly (> 0.5), walls tilt or fall cartoon-style when not
     survived. Never show people hurt.
7. Results overlay: "You survived! 🎉" or "Not safe this time!", safety %,
   stars, per-threat rows ("🔩 Fragments: 96% blocked ✅"), which materials
   broke, 1 to 2 tips, buttons: Try again (keeps the build), Quick quiz
   (only after surviving), Level select.
8. Quiz: 3 questions, tap an answer, see right/wrong and the explanation.
   Then "Next level" (unlocks it) or, after level 3, a Final screen: "What
   we learned" summary with the comparison chart and the glossary.

### Controls

| Action | Keyboard / mouse | Touch (tablet) |
| --- | --- | --- |
| Walk | WASD / arrow keys (relative to camera) | joystick, bottom left |
| Place block | Space or Enter, or click a cell | Place button, or tap a cell |
| Remove top block | X or Backspace, or right-click | Remove button |
| Pick material | 1-9, or click a card | tap a card |
| Turn camera | Q / E, or drag with the mouse | drag on the right side of the screen |
| Zoom | mouse wheel, Z / X | pinch |
| Ready | R | Ready! button |

Touch buttons are at least 56 px, use `pointer` events, `touch-action: none`
on the canvas, and the layout works in landscape and portrait on an iPad
(1024 x 768) and on a phone.

### Look

Bright cartoon style: soft sky gradient, green grass yard with a low picket
fence around the 20 x 20 grid, faint grid lines while building, a cosy
4 x 4 m house (cream walls, red roof, windows, door on the south side),
a capybara family visible through a window (simple shapes), a few trees
outside the fence. Soft shadows. UI: rounded white cards, big friendly
buttons, Fredoka font, emoji icons.

## Done when

- `npm test` passes; `npm run build` succeeds.
- In a built preview (Chromium, swiftshader) all three levels can be played
  through with keyboard and with simulated touch; no console errors.
- Language on every screen is simple and clear.
