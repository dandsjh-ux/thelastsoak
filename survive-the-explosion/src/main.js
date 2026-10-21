import * as THREE from 'three';
import './style.css';
import { createWorld } from './scene/world.js';
import { Player, CameraRig } from './scene/player.js';
import { BuildManager } from './scene/build.js';
import { Effects } from './scene/explosion.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import {
  titleScreen, howToScreen, glossaryScreen, levelSelectScreen, briefingScreen,
  resultsPanel, quizScreen, finalScreen,
} from './ui/screens.js';
import { loadProgress, setStars, getStars, isUnlocked } from './ui/progress.js';
import { LEVELS } from './data/levels.js';
import { MATERIALS, getMaterial } from './data/materials.js';
import { simulateBlast } from './sim/blast.js';
import { GRID, MAX_STACK, HOUSE, cellToWorld, worldToCell, inGrid } from './sim/grid.js';

loadProgress();
try {
  if ((navigator.maxTouchPoints || 0) > 0 && (window.matchMedia('(any-pointer: coarse)').matches || window.matchMedia('(hover: none)').matches || 'ontouchstart' in window) && !window.matchMedia('(pointer: fine) and (hover: hover)').matches) document.body.classList.add('touch');
} catch (e) { /* ignore */ }

const canvas = document.getElementById('game');
const screensEl = document.getElementById('screens');
const hudRoot = document.getElementById('hud-root');
const flashEl = document.getElementById('flash');
const tintEl = document.getElementById('tint');

const world = createWorld(canvas);
const rig = new CameraRig(world.camera);
const player = new Player(world.scene);
const build = new BuildManager(world.scene);
const fx = new Effects(world, rig);
const input = new Input(canvas, null);

const MAX_REACH = 6;

const G = {
  state: 'title',
  levelIdx: 0,
  level: LEVELS[0],
  selected: 'sandbag',
  upgrades: new Set(),
  result: null,
  records: null,
  quizLevel: 0,
  countdown: null,
  stateTime: 0,
};

// ------------------------------------------------------------ HUD
const hud = new Hud(hudRoot, {
  menu: () => goLevels(),
  clear: () => clearAll(),
  place: () => placeAtTarget(),
  remove: () => removeAtTarget(),
  ready: () => ready(),
  pick: (id) => pickMaterial(id),
});
// joystick lives inside the HUD
input._makeJoystick(hud.joyHost);

function spent() {
  let s = 0;
  for (const r of build.blocks.values()) s += getMaterial(r.materialId).cost;
  for (const u of G.upgrades) s += getMaterial(u).cost;
  return s;
}
const coinsLeft = () => G.level.budget - spent();

function refreshHud() {
  const left = coinsLeft();
  hud.setCoins(left, G.level.budget);
  hud.setAffordable(left);
}

// ------------------------------------------------------------ screens
let currentScreen = null;
function showScreen(el) {
  hideScreen();
  currentScreen = el;
  screensEl.append(el);
}
function hideScreen() {
  if (currentScreen) currentScreen.remove();
  currentScreen = null;
}

function setState(name) {
  G.state = name;
  G.stateTime = 0;
  document.body.dataset.state = name;
  input.enabled = name === 'build';
  input.camEnabled = name === 'build';
  hud.show(name === 'build' || name === 'countdown');
  hud.setEnabled(name === 'build');
}

function goTitle() {
  setState('title');
  rig.orbit();
  showScreen(titleScreen({
    onPlay: () => goLevels(),
    onHow: () => showHow(),
    onWords: () => showWords('title'),
  }));
}
function showHow() {
  setState('title');
  showScreen(howToScreen({ onBack: goTitle }));
}
function showWords(from) {
  setState('title');
  showScreen(glossaryScreen({ onBack: () => (from === 'final' ? goFinal() : goTitle()) }));
}
function goLevels() {
  resetScene();
  setState('levelSelect');
  rig.orbit();
  showScreen(levelSelectScreen({ onPick: (lv) => goBriefing(lv.id - 1), onBack: goTitle }));
}
function goBriefing(idx) {
  G.levelIdx = idx;
  G.level = LEVELS[idx];
  resetScene();
  startLevelData();
  setState('briefing');
  rig.orbit();
  showScreen(briefingScreen({ level: G.level, onStart: () => startBuild(true), onBack: goLevels }));
}

function startLevelData() {
  G.upgrades.clear();
  build.setLevel(G.level);
  world.setLevelMarkers(G.level);
  hud.setLevel(G.level);
  const blocks = MATERIALS.filter((m) => m.unlockLevel <= G.level.id && m.kind === 'block');
  G.selected = (blocks.find((m) => m.id === 'sandbag') || blocks[0]).id;
  hud.select(G.selected);
  for (const m of MATERIALS) if (m.kind === 'upgrade') hud.setUpgrade(m.id, false);
  refreshHud();
}

function resetScene() {
  fx.reset();
  world.resetHouse();
  const recs = G.records;
  if (recs) { build.reattach(recs); G.records = null; }
  player.reset();
  setScreenFx(0, 0);
}

function startBuild(fresh) {
  hideScreen();
  if (fresh) {
    player.reset(-1.0, 6.5, Math.PI);
    rig.yaw = 0; rig.pitch = 0.72; rig.dist = 12;
  } else {
    player.reset(player.pos.x, player.pos.y, player.facing);
  }
  rig.follow(player, true);
  setState('build');
  hud.showFact(false);
  refreshHud();
  if (fresh) hud.toast('Walk around and build a wall to protect the house!');
}

// ------------------------------------------------------------ building
function pickMaterial(id) {
  const m = getMaterial(id);
  if (!m) return false;
  if (m.kind === 'upgrade') return toggleUpgrade(id);
  G.selected = id;
  hud.select(id);
  return true;
}

function toggleUpgrade(id) {
  const m = getMaterial(id);
  if (!m || m.kind !== 'upgrade' || m.unlockLevel > G.level.id) return false;
  if (G.upgrades.has(id)) {
    G.upgrades.delete(id);
    hud.toast(`${m.name} removed. +${m.cost} coins`);
  } else {
    if (m.cost > coinsLeft()) { hud.toast(`Not enough coins for ${m.name}.`, 'warn'); return false; }
    G.upgrades.add(id);
    hud.toast(`${m.name} added! ${m.fact}`, 'good');
  }
  hud.setUpgrade(id, G.upgrades.has(id));
  refreshHud();
  return true;
}

function playerTooClose(gx, gz) {
  const c = cellToWorld(gx, gz);
  const cx = Math.max(c.x - 0.5, Math.min(player.pos.x, c.x + 0.5));
  const cz = Math.max(c.z - 0.5, Math.min(player.pos.y, c.z + 0.5));
  return Math.hypot(player.pos.x - cx, player.pos.y - cz) < 0.42 && build.height(gx, gz) === 0;
}

// returns null if ok, or a message
function whyNot(gx, gz, materialId) {
  if (!inGrid(gx, gz)) return 'That is outside the yard.';
  const why = build.checkPlace(gx, gz);
  if (why) {
    if (G.level.blast.type === 'point') {
      // more specific message for the danger zone
      const c = cellToWorld(gx, gz);
      if (Math.hypot(c.x - G.level.blast.x, c.z - G.level.blast.z) < (G.level.blast.clearRadius || 0)) return 'Too close to the bomb. Build further away.';
    }
    if (gx >= HOUSE.gx0 && gx < HOUSE.gx0 + HOUSE.size && gz >= HOUSE.gz0 && gz < HOUSE.gz0 + HOUSE.size) return 'This is the house. Build around it.';
    return why;
  }
  const m = getMaterial(materialId);
  if (m.cost > coinsLeft()) return 'Not enough coins for this block.';
  if (playerTooClose(gx, gz)) return 'Step back first!';
  return null;
}

function placeAt(gx, gz, materialId = G.selected, quiet = false) {
  if (G.state !== 'build') return false;
  const why = whyNot(gx, gz, materialId);
  if (why) { if (!quiet) hud.toast(why, 'warn'); return false; }
  build.add(gx, gz, materialId, true);
  refreshHud();
  return true;
}
function removeAt(gx, gz) {
  if (G.state !== 'build') return false;
  const rec = build.removeTop(gx, gz);
  if (!rec) { hud.toast('Nothing to remove here.', 'warn'); return false; }
  refreshHud();
  hud.toast(`Removed ${getMaterial(rec.materialId).name}. +${getMaterial(rec.materialId).cost} coins`);
  return true;
}
function placeAtTarget() { const c = player.targetCell(); return placeAt(c.gx, c.gz); }
function removeAtTarget() {
  const c = player.targetCell();
  // if the front cell is empty, try the nearest occupied neighbour in front
  return removeAt(c.gx, c.gz);
}
function clearAll() {
  if (G.state !== 'build') return;
  const n = build.blocks.size;
  build.clear();
  G.upgrades.clear();
  for (const m of MATERIALS) if (m.kind === 'upgrade') hud.setUpgrade(m.id, false);
  refreshHud();
  hud.toast(n ? 'All cleared. Coins are back!' : 'Nothing to clear.');
}

// ------------------------------------------------------------ taps on the canvas
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPt = new THREE.Vector3();
input.onTap = (cx, cy, button) => {
  if (G.state !== 'build') return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, world.camera);
  let cell = null;
  const hits = raycaster.intersectObjects(build.group.children, false).filter((h2) => h2.object.isMesh);
  if (hits.length) {
    const p = hits[0].object.position;
    cell = worldToCell(p.x, p.z);
  } else if (raycaster.ray.intersectPlane(groundPlane, hitPt)) {
    cell = worldToCell(hitPt.x, hitPt.z);
  }
  if (!cell || !inGrid(cell.gx, cell.gz)) return;
  const c = cellToWorld(cell.gx, cell.gz);
  if (Math.hypot(c.x - player.pos.x, c.z - player.pos.y) > MAX_REACH) { hud.toast('Too far! Walk closer (6 m).', 'warn'); return; }
  if (button === 2) removeAt(cell.gx, cell.gz);
  else placeAt(cell.gx, cell.gz);
};

input.on('place', () => placeAtTarget());
input.on('remove', () => removeAtTarget());
input.on('ready', () => ready());
input.on('material', (i) => { const m = hud.list && hud.list[i]; if (m) pickMaterial(m.id); });
input.on('nextMaterial', () => {
  const blocks = hud.list.filter((m) => m.kind === 'block');
  const i = blocks.findIndex((m) => m.id === G.selected);
  pickMaterial(blocks[(i + 1) % blocks.length].id);
});
input.on('escape', () => { if (G.state === 'build') goLevels(); });

// ------------------------------------------------------------ countdown + explosion
const SHOTS = {
  grenade: { pos: [14, 5.5, 0], look: [0, 1.3, -3.5] },
  tnt: { pos: [22, 8.5, 5], look: [0, 2, -4] },
  nuke: { pos: [5.5, 3.3, 13.5], look: [0, 28, -95] },
};
function shotFor(level) { return SHOTS[level.key] || SHOTS.grenade; }

function ready() {
  if (G.state !== 'build') return false;
  setState('countdown');
  hud.show(false);
  G.countdown = { t: 0, n: 4, walkT: 0 };
  const s = shotFor(G.level);
  rig.fly(s.pos, s.look, 2.4);
  return true;
}

function updateCountdown(dt) {
  const c = G.countdown;
  c.t += dt;
  // builder walks to the door and goes inside
  const doorX = -1.0, doorZ = 2.55;
  if (player.group.visible) {
    const dx = doorX - player.pos.x, dz = doorZ - player.pos.y;
    const d = Math.hypot(dx, dz);
    if (d < 0.35 || c.t > 2.2) { player.group.visible = false; player.vel.set(0, 0); }
    else player.update(dt, dx / d, dz / d, build.isBlocked.bind(build));
  }
  const n = 3 - Math.floor(c.t / 0.85);
  if (n !== c.n) {
    c.n = n;
    hud.count(n > 0 ? String(n) : '');
  }
  if (c.t >= 3 * 0.85 + 0.3) startExplosion();
}

function evaluate() {
  return simulateBlast(G.level, build.placements(), [...G.upgrades]);
}

function startExplosion() {
  hud.count('');
  setState('explosion');
  G.result = evaluate();
  G.records = build.records();
  fx.start(G.level, G.result, G.records);
}

function brokenSummary() {
  const counts = {};
  for (const b of G.result.broken || []) {
    const rec = G.records && G.records[b.index];
    if (!rec) continue;
    const n = getMaterial(rec.materialId).name;
    counts[n] = (counts[n] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([n, c]) => `${c} × ${n}`);
  return parts.length ? parts.join(', ') : '';
}

function showResults() {
  const r = G.result;
  setState('results');
  if (r.survived) setStars(G.level.id, r.stars);
  hud.show(false);
  showScreen(resultsPanel({
    level: G.level, result: r, brokenSummary: brokenSummary(),
    hasNext: G.levelIdx < LEVELS.length - 1,
    onTry: () => tryAgain(),
    onQuiz: () => goQuiz(),
    onLevels: () => goLevels(),
  }));
}

function tryAgain() {
  fx.reset();
  world.resetHouse();
  if (G.records) { build.reattach(G.records); G.records = null; }
  player.reset(-1.0, 6.5, Math.PI);
  rig.yaw = 0; rig.pitch = 0.72; rig.dist = 12;
  setScreenFx(0, 0);
  startBuild(false);
  player.reset(-1.0, 6.5, Math.PI);
  rig.follow(player, true);
}

function goQuiz() {
  setState('quiz');
  showScreen(quizScreen({
    level: G.level,
    onDone: () => {
      if (G.levelIdx < LEVELS.length - 1) goBriefing(G.levelIdx + 1);
      else goFinal();
    },
  }));
}
function goFinal() {
  setState('final');
  rig.orbit();
  resetScene();
  const total = LEVELS.reduce((s, l) => s + getStars(l.id), 0);
  showScreen(finalScreen({ totalStars: total, onWords: () => showWords('final'), onLevels: () => goLevels() }));
}

function setScreenFx(flash, tint) {
  flashEl.style.opacity = flash.toFixed(3);
  tintEl.style.opacity = tint.toFixed(3);
}

// ------------------------------------------------------------ debug / test API
function skipToResults() {
  if (G.state === 'explosion' || G.state === 'countdown' || G.state === 'build') {
    if (G.state !== 'explosion') {
      hud.count('');
      G.result = evaluate();
      G.records = build.records();
    }
    fx.finishInstant();
    world.applyDamage(G.result.houseDamage, G.result.survived, null, true);
    const broken = new Set((G.result.broken || []).map((b) => b.index));
    G.records.forEach((rec, i) => { if (broken.has(i)) rec.mesh.visible = false; });
    setScreenFx(0, 0);
    showResults();
    return true;
  }
  return false;
}
window.__game = {
  get state() { return G.state; },
  get level() { return G.level.id; },
  get result() { return G.result; },
  get coins() { return coinsLeft(); },
  get player() { return { x: player.pos.x, z: player.pos.y, facing: player.facing }; },
  get blocks() { return build.placements(); },
  get upgrades() { return [...G.upgrades]; },
  ready() { return ready(); },
  skipToResults,
  placeBlock(gx, gz, materialId) {
    const prev = G.selected;
    const ok = placeAt(gx, gz, materialId || G.selected, true);
    G.selected = prev;
    return ok;
  },
  removeBlock(gx, gz) { return removeAt(gx, gz); },
  toggleUpgrade(id) { return toggleUpgrade(id); },
  selectMaterial(id) { return pickMaterial(id); },
  startLevel(id, skipBriefing = true) { goBriefing(id - 1); if (skipBriefing) startBuild(true); return G.state; },
  goto(name) { return { title: goTitle, levels: goLevels, how: showHow, words: () => showWords('title'), final: goFinal, quiz: goQuiz }[name](); },
  evaluate,
  tryAgain,
  isUnlocked,
  walkTo(x, z) { player.pos.set(x, z); },
  camera: () => ({ x: world.camera.position.x, y: world.camera.position.y, z: world.camera.position.z }),
};

// ------------------------------------------------------------ frame loop
function resize() {
  const w = window.innerWidth, h2 = window.innerHeight;
  world.resize(w, h2);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

function tick(dt) {
  G.stateTime += dt;
  if (G.state === 'build') {
    const mv = input.move();
    const cam = input.consumeCamera(dt);
    rig.applyInput(cam);
    const f = rig.forward(), r = rig.right();
    player.update(dt, f.x * mv.y + r.x * mv.x, f.z * mv.y + r.z * mv.x, build.isBlocked.bind(build));
    rig.update(dt, player);
    const c = player.targetCell();
    const why = inGrid(c.gx, c.gz) ? whyNot(c.gx, c.gz, G.selected) : 'out';
    build.showGhost(c.gx, c.gz, G.selected, !why);
  } else {
    build.hideGhost();
    if (G.state === 'countdown') updateCountdown(dt);
    else if (G.state === 'explosion') {
      if (fx.done || G.stateTime > 20) showResults();
    }
    rig.update(dt, player);
  }
  build.update(dt);
  fx.update(dt);
  if (G.state === 'explosion' || fx.screenFx.flash > 0 || fx.screenFx.tint > 0) setScreenFx(fx.screenFx.flash, fx.screenFx.tint);
  world.setGridVisible(G.state === 'build');
  world.setShift(G.state === 'title' ? 0.2 : 0);
  world.update(dt);
}

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  world.renderer.render(world.scene, world.camera);
  requestAnimationFrame(frame);
}
// test helper: run the game clock forward without waiting (30 steps per second)
window.__game.advance = (sec) => { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30); };

goTitle();
requestAnimationFrame(frame);
