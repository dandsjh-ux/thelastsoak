// Deterministic blast simulation. Pure JS: no three.js, no DOM, no Math.random.
//
// Model in short:
//  * Target points are spread over the house faces that look toward the blast, and over the roof.
//  * Point blast: one ray from the blast (y = 0.3) to every target point.
//    Far blast: parallel rays, going back from every target point toward the bomb.
//  * A ray collects every distinct block it passes (cell + layer). Each block lets through
//    (1 - resist/10) of the threat energy.
//  * Shockwave: each block feels a load. If the load is above its hp, the block breaks, it
//    soaks up `hp` of energy, and the rest goes on. Blocks are handled from the blast outward.
//    The shockwave also bends around walls, so it never drops below DIFFRACTION_FLOOR.
//  * Fragments and heat arrive first, so they see the blocks before any of them break.
//  * Radiation comes from all around (16 directions), plus from above (roof) and below (basement).

import { GRID, HOUSE, MAX_STACK, canBuildAt, cellToWorld } from './grid.js';
import { THREATS, getMaterial, materialsForLevel } from '../data/materials.js';

export const TUNING = {
  REF_DISTANCE: 5, // threat powers in levels.js are measured at this distance (m)
  MIN_DISTANCE: 1.5, // distance is clamped so that near is never infinite
  STEP: 0.05, // ray marching step (m)
  MIN_TRANSMIT: 0.02,
  DIFFRACTION_FLOOR: 0.15, // the shockwave always bends around a little
  HEAT_RISE: 0.2, // far blast: the fireball is high, so heat rays come down at about 11 degrees
  BLAST_RISE: 0.08,
  FRAGMENT_SCATTER: 0.7, // fragments fly in many directions: also test rays 25% of the distance to each side
  ROOF_WEIGHT: 3, // total weight of the 9 roof points (each of the 12 wall points weighs 1)
  ROOF_BLAST: 0.5, // the shockwave glances over the roof, so it pushes less there
  WINDOWS: { blast: 0.75, heat: 0.75 },
  BASEMENT: { blast: 0.6, radiation: 0.2 },
  ROOF: { radiation: 0.2, heatOnRoof: 0.5 },
  RADIATION_SIDE_WEIGHT: 0.6, // the rest comes from above
  RADIATION_REACH_CELLS: 4,
  FAR_FLASH_DELAY: 2, // seconds
};

const T = TUNING;
const WALL_HEIGHTS = [0.5, 1.5, 2.5];
const WALL_OFFSETS = [-1.5, -0.5, 0.5, 1.5];
const ROOF_XY = [-1.5, 0, 1.5];
const ROOF_Y = 3.05;
const FACES = [
  { nx: 0, nz: -1 }, // north
  { nx: 0, nz: 1 }, // south
  { nx: -1, nz: 0 }, // west
  { nx: 1, nz: 0 }, // east
];
const UPGRADE_IDS = ['windows', 'basement', 'roof'];

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const transmitOf = (mat, threat) => Math.max(T.MIN_TRANSMIT, 1 - mat.resist[threat] / 10);

// ---------- world -------------------------------------------------------

function buildWorld(level, placements) {
  const blocks = []; // { index, gx, gz, layer, mat, cx, cy, cz }
  const map = new Map();
  let spent = 0;
  (placements || []).forEach((p, index) => {
    if (!p) return;
    const mat = getMaterial(p.materialId);
    if (!mat || mat.kind !== 'block') return;
    if (!Number.isInteger(p.layer) || p.layer < 0 || p.layer >= MAX_STACK) return;
    if (!canBuildAt(level, p.gx, p.gz)) return;
    const key = (p.layer * GRID + p.gz) * GRID + p.gx;
    if (map.has(key)) return;
    const c = cellToWorld(p.gx, p.gz);
    const b = { index, gx: p.gx, gz: p.gz, layer: p.layer, mat, cx: c.x, cy: p.layer + 0.5, cz: c.z, pass: null, broken: false };
    map.set(key, b);
    blocks.push(b);
    spent += mat.cost;
  });
  const columns = new Set(blocks.map((b) => b.gz * GRID + b.gx));
  return { blocks, map, columns, spent };
}

// Distinct blocks along a straight segment, in order from the start.
function marchRay(world, x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.ceil(len / T.STEP));
  const out = [];
  out.over = false; // true if the ray flew over a column that has blocks
  let last = -1;
  const half = GRID / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + dy * t;
    const layer = Math.floor(y);
    const gx = Math.floor(x0 + dx * t + half);
    const gz = Math.floor(z0 + dz * t + half);
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) continue;
    if (layer < 0 || layer >= MAX_STACK) {
      if (layer >= MAX_STACK && world.columns.has(gz * GRID + gx)) out.over = true;
      continue;
    }
    const key = (layer * GRID + gz) * GRID + gx;
    if (key === last) continue;
    last = key;
    const b = world.map.get(key);
    if (b) { if (!out.includes(b)) out.push(b); }
    else if (world.columns.has(gz * GRID + gx)) out.over = true;
  }
  return out;
}

// Far blast: go from a point back toward the bomb, rising with `rise` metres per metre.
function farRay(world, level, x, y, z, rise) {
  const { dirX, dirZ } = level.blast;
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / len, uz = dirZ / len;
  const L = GRID * 1.5;
  // start of the ray is far away (list is returned from the bomb side to the house)
  return marchRay(world, x - ux * L, y + rise * L, z - uz * L, x, y, z);
}

// ---------- targets -----------------------------------------------------

function sourceDirection(level) {
  // unit vector from the house centre toward the bomb
  const b = level.blast;
  if (b.type === 'point') {
    const l = Math.hypot(b.x, b.z) || 1;
    return { x: b.x / l, z: b.z / l };
  }
  const l = Math.hypot(b.dirX, b.dirZ) || 1;
  return { x: -b.dirX / l, z: -b.dirZ / l };
}

function buildTargets(level) {
  const src = sourceDirection(level);
  const half = HOUSE.size / 2;
  const targets = [];
  for (const f of FACES) {
    if (f.nx * src.x + f.nz * src.z <= 0.3) continue;
    for (const off of WALL_OFFSETS) {
      for (const y of WALL_HEIGHTS) {
        targets.push({
          x: f.nx !== 0 ? f.nx * (half - 0.01) : off,
          z: f.nz !== 0 ? f.nz * (half - 0.01) : off,
          y, w: 1, roof: false,
        });
      }
    }
  }
  const rw = T.ROOF_WEIGHT / 9;
  for (const rx of ROOF_XY) for (const rz of ROOF_XY) targets.push({ x: rx, z: rz, y: ROOF_Y, w: rw, roof: true });
  return targets;
}

// ---------- threat power ------------------------------------------------

function incomingAt(level, threat, d) {
  const power = level.threats[threat];
  if (level.blast.type !== 'point') return power;
  const k = threat === 'blast' ? 2 : threat === 'fragments' ? 1 : 2;
  return power * Math.pow(T.REF_DISTANCE / Math.max(d, T.MIN_DISTANCE), k);
}

function rayFor(world, level, threat, tgt) {
  const b = level.blast;
  if (b.type === 'point') {
    return marchRay(world, b.x, 0.3, b.z, tgt.x, tgt.y, tgt.z);
  }
  const rise = threat === 'heat' ? T.HEAT_RISE : T.BLAST_RISE;
  return farRay(world, level, tgt.x, tgt.y, tgt.z, rise);
}

function distToBlast(level, x, z) {
  const b = level.blast;
  if (b.type === 'point') return Math.hypot(x - b.x, z - b.z);
  // far blast: distance in the direction of travel is irrelevant for power
  return T.REF_DISTANCE;
}

// ---------- shockwave: breaking blocks ----------------------------------

function evaluateBlocks(level, world) {
  const b = level.blast;
  const broken = [];
  const state = new Map(); // block -> 0 (working) | 1 (done)
  const far = b.type !== 'point';
  const len = far ? Math.hypot(b.dirX, b.dirZ) || 1 : 1;
  const ux = far ? b.dirX / len : 0, uz = far ? b.dirZ / len : 0;

  const alongOf = (blk) => (far ? blk.cx * ux + blk.cz * uz : -Math.hypot(blk.cx - b.x, blk.cz - b.z));
  const order = world.blocks.slice().sort((p, q) => {
    const a = far ? alongOf(p) : -alongOf(p);
    const c = far ? alongOf(q) : -alongOf(q);
    return a - c || p.index - q.index;
  });

  function evalBlock(blk) {
    if (state.has(blk)) return;
    state.set(blk, 0);
    let front;
    if (far) front = farRay(world, level, blk.cx, blk.cy, blk.cz, T.BLAST_RISE);
    else front = marchRay(world, b.x, 0.3, b.z, blk.cx, blk.cy, blk.cz);
    let factor = 1;
    for (const f of front) {
      if (f === blk) continue;
      if (!state.has(f)) evalBlock(f);
      if (f.pass !== null) factor *= f.pass;
    }
    const d = far ? T.REF_DISTANCE : Math.hypot(blk.cx - b.x, blk.cz - b.z);
    const load = incomingAt(level, 'blast', d) * factor;
    if (load > blk.mat.hp) {
      blk.broken = true;
      blk.pass = Math.max(T.MIN_TRANSMIT, (load - blk.mat.hp) / load);
      const excess = (load - blk.mat.hp) / load;
      let dx, dz;
      if (far) { dx = ux; dz = uz; } else {
        const l = Math.hypot(blk.cx - b.x, blk.cz - b.z) || 1;
        dx = (blk.cx - b.x) / l; dz = (blk.cz - b.z) / l;
      }
      const speed = 4 + 10 * excess;
      let t;
      if (far) {
        // distance from the grid edge on the bomb side, then the flash comes first
        const proj = blk.cx * ux + blk.cz * uz;
        const proj0 = -(GRID / 2) * (Math.abs(ux) + Math.abs(uz));
        t = (proj - proj0) / level.waveSpeed + T.FAR_FLASH_DELAY;
      } else {
        t = Math.hypot(blk.cx - b.x, blk.cz - b.z) / level.waveSpeed;
      }
      broken.push({
        index: blk.index,
        time: r2(t),
        vx: r2(dx * speed),
        vy: r2(3 + 0.5 * speed),
        vz: r2(dz * speed),
        _name: blk.mat.name,
      });
    } else {
      blk.pass = transmitOf(blk.mat, 'blast');
    }
    state.set(blk, 1);
  }
  for (const blk of order) evalBlock(blk);
  broken.sort((p, q) => p.time - q.time || p.index - q.index);
  return broken;
}

// ---------- per threat reach on the house -------------------------------

function rayThreat(world, level, threat, targets, upgrades) {
  const point = level.blast.type === 'point';
  let incomingSum = 0, reachedSum = 0, wSum = 0;
  let open = 0, openOver = 0, openAround = 0;
  const hitCount = new Map();
  for (const base of targets) {
    // fragments scatter sideways a little, so we test three rays per target
    const variants = [{ s: 0, w: 1 }];
    if (threat === 'fragments' && point) {
      variants.push({ s: -T.FRAGMENT_SCATTER, w: 1 }, { s: T.FRAGMENT_SCATTER, w: 1 });
    }
    const vsum = variants.reduce((a, v) => a + v.w, 0);
    for (const v of variants) {
      const w = (base.w * v.w) / vsum;
      let tgt = base;
      let d = T.REF_DISTANCE;
      if (point) {
        const bx = level.blast.x, bz = level.blast.z;
        d = Math.hypot(base.x - bx, base.z - bz);
        if (v.s !== 0) {
          const px = -(base.z - bz) / d, pz = (base.x - bx) / d;
          tgt = { ...base, x: base.x + px * v.s * d, z: base.z + pz * v.s * d };
          d = Math.hypot(tgt.x - bx, tgt.z - bz);
        }
      }
      let inc = incomingAt(level, threat, d);
      if (threat === 'blast' && base.roof) inc *= T.ROOF_BLAST;
      const list = rayFor(world, level, threat, tgt);
      let f = 1;
      for (const blk of list) {
        f *= threat === 'blast' ? blk.pass : transmitOf(blk.mat, threat);
        hitCount.set(blk.mat, (hitCount.get(blk.mat) || 0) + w);
      }
      if (threat === 'blast') f = Math.max(f, T.DIFFRACTION_FLOOR);
      let extra = 1;
      if (threat === 'blast' && upgrades.has('windows')) extra *= T.WINDOWS.blast;
      if (threat === 'blast' && upgrades.has('basement')) extra *= T.BASEMENT.blast;
      if (threat === 'heat' && upgrades.has('windows')) extra *= T.WINDOWS.heat;
      if (threat === 'heat' && base.roof && upgrades.has('roof')) extra *= T.ROOF.heatOnRoof;
      incomingSum += inc * w;
      reachedSum += inc * f * extra * w;
      wSum += w;
      if (list.length === 0) {
        open += w;
        if (list.over) openOver += w; else openAround += w;
      }
    }
  }
  return {
    incoming: incomingSum / wSum,
    reached: reachedSum / wSum,
    openFrac: open / wSum,
    openOver, openAround,
    hitCount,
  };
}

function radiationReach(world, level, upgrades) {
  const power = level.threats.radiation;
  const dirs = 16;
  const lo = HOUSE.gx0 - T.RADIATION_REACH_CELLS;
  const hi = HOUSE.gx0 + HOUSE.size - 1 + T.RADIATION_REACH_CELLS;
  let sum = 0, covered = 0;
  const hitCount = new Map();
  for (let i = 0; i < dirs; i++) {
    const a = (i / dirs) * Math.PI * 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    const maxR = (HOUSE.size / 2 + T.RADIATION_REACH_CELLS) * 1.5;
    let t = 0;
    let hit = false;
    for (const y of WALL_HEIGHTS) {
      const list = marchRay(world, 0, y, 0, ux * maxR, y, uz * maxR)
        .filter((b) => b.gx >= lo && b.gx <= hi && b.gz >= lo && b.gz <= hi);
      let f = 1;
      for (const blk of list) {
        f *= transmitOf(blk.mat, 'radiation');
        hitCount.set(blk.mat, (hitCount.get(blk.mat) || 0) + 1);
      }
      if (list.length) hit = true;
      t += f;
    }
    sum += t / WALL_HEIGHTS.length;
    if (hit) covered++;
  }
  const side = sum / dirs;
  const top = upgrades.has('roof') ? T.ROOF.radiation : 1;
  let f = T.RADIATION_SIDE_WEIGHT * side + (1 - T.RADIATION_SIDE_WEIGHT) * top;
  if (upgrades.has('basement')) f *= T.BASEMENT.radiation;
  return { incoming: power, reached: power * f, coverage: covered / dirs, hitCount };
}

// ---------- tips --------------------------------------------------------

function bestFor(level, threat, filter) {
  let best = null, bestScore = -1;
  for (const m of materialsForLevel(level.id)) {
    if (m.kind !== 'block') continue;
    if (filter && !filter(m)) continue;
    const score = m.resist[threat] / Math.sqrt(m.cost);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  return best;
}
function bestHp(level) {
  let best = null, bestScore = -1;
  for (const m of materialsForLevel(level.id)) {
    if (m.kind !== 'block' || m.id === 'foil') continue;
    const score = m.hp / Math.sqrt(m.cost);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  return best;
}

const NOUN = {
  fragments: 'Fragments',
  blast: 'The shockwave',
  heat: 'The heat flash',
  radiation: 'Radiation',
};

function specificTip(level, threat, info, world, brokenList, upgrades) {
  const blocks = world.blocks;
  const lname = (m) => m.name.toLowerCase();
  if (threat === 'radiation') {
    if (blocks.length && info.coverage < 0.9) {
      return 'Radiation comes from all around. Walls on one side are not enough. Build all around the house.';
    }
    if (!upgrades.has('basement')) return 'A basement shelter helps a lot against radiation. Earth on the roof helps too.';
    if (!upgrades.has('roof')) return 'Radiation also comes from above. Put earth on the roof.';
    return 'Use thick, heavy blocks like earth or thick concrete. Lead is best against radiation.';
  }
  if (!blocks.length || info.openFrac > 0.95) return null; // base tip says: build a wall
  if (threat === 'blast' && brokenList.length) {
    const counts = {};
    for (const b of brokenList) counts[b._name] = (counts[b._name] || 0) + 1;
    const worst = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : 1))[0];
    const best = bestHp(level);
    return `Your ${worst.toLowerCase()} broke in the shockwave. Use heavy blocks like ${lname(best)}, or build farther from the blast.`;
  }
  if (info.openFrac > 0.2) {
    let tall = 0;
    for (const b of blocks) tall = Math.max(tall, b.layer + 1);
    if (tall < MAX_STACK && info.openOver >= info.openAround) {
      return `${NOUN[threat]} flew over your wall. It is only ${tall} block${tall === 1 ? '' : 's'} high. Stack blocks ${tall === 1 ? '2 or 3' : '3'} high.`;
    }
    return `${NOUN[threat]} went around your wall. Make the wall wider.`;
  }
  const best = bestFor(level, threat);
  let top = null, topN = -1;
  for (const [m, n] of info.hitCount) if (n > topN || (n === topN && m.id < top.id)) { top = m; topN = n; }
  if (best && top && top.id !== best.id) {
    return `${NOUN[threat]} went through your ${lname(top)}. Try ${lname(best)} instead.`;
  }
  if (threat === 'heat' && !upgrades.has('roof')) return 'Heat also hits the roof. Earth on the roof helps.';
  return 'Make the wall thicker. Two rows stop more than one.';
}

// ---------- main --------------------------------------------------------

export function simulateBlast(level, placements, upgrades = []) {
  const world = buildWorld(level, placements);
  const ups = new Set();
  let spent = world.spent;
  for (const id of upgrades || []) {
    if (!UPGRADE_IDS.includes(id) || ups.has(id)) continue;
    ups.add(id);
    spent += getMaterial(id).cost;
  }

  const brokenFull = level.threats.blast ? evaluateBlocks(level, world) : [];
  const targets = buildTargets(level);
  const limits = level.limits || {};
  const threatsOut = {};
  const infos = {};

  for (const threat of Object.keys(level.threats)) {
    let info;
    if (threat === 'radiation') info = radiationReach(world, level, ups);
    else info = rayThreat(world, level, threat, targets, ups);
    infos[threat] = info;
    const limit = limits[threat] != null ? limits[threat] : level.threats[threat] * 0.2;
    const incoming = info.incoming;
    const reached = info.reached;
    const blockedPct = incoming > 0 ? clamp(Math.round(100 * (1 - reached / incoming)), 0, 100) : 100;
    threatsOut[threat] = {
      incoming: r2(incoming),
      reached: r2(reached),
      blockedPct,
      safe: reached <= limit,
      limit,
    };
    info.ratio = reached / limit;
  }

  const ids = Object.keys(threatsOut);
  const scores = ids.map((id) => {
    const q = infos[id].ratio;
    return q <= 1 ? 100 - 10 * q : Math.max(0, 90 - 40 * (q - 1));
  });
  const minScore = Math.min(...scores);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const safety = Math.round(0.5 * minScore + 0.5 * meanScore);

  const overBudget = spent > level.budget;
  const survived = ids.every((id) => threatsOut[id].safe) && !overBudget;
  const worstRatio = Math.max(...ids.map((id) => infos[id].ratio));

  // Stars: 1 = the house is safe. +1 = very safe (safety 92 or more). +1 = thrifty (spent at most 80% of the budget).
  let stars = 0;
  if (survived) {
    stars = 1;
    if (safety >= 92) stars++;
    if (spent <= level.budget * 0.8) stars++;
  }

  let houseDamage;
  if (survived) houseDamage = Math.min(0.2, worstRatio * 0.2);
  else houseDamage = 0.4 + 0.6 * clamp((worstRatio - 1) / 2, 0, 1);
  houseDamage = r2(Math.max(0, Math.min(1, houseDamage)));

  // tips
  const tips = [];
  if (!survived) {
    if (overBudget) tips.push('You spent more than your budget. Take some blocks away.');
    const bad = ids.filter((id) => !threatsOut[id].safe).sort((a, b) => infos[b].ratio - infos[a].ratio || (a < b ? -1 : 1));
    if (bad.length) {
      const first = bad[0];
      const spec = specificTip(level, first, infos[first], world, brokenFull, ups);
      const base = level.loseTips[first];
      if (spec) { tips.push(spec); if (base && tips.length < 2 && bad.length === 1) tips.push(base); }
      else if (base) tips.push(base);
      if (bad.length > 1 && tips.length < 2) {
        const second = bad[1];
        const t2 = level.loseTips[second];
        if (t2) tips.push(t2);
      }
      // Glass is the weak spot: point students at the windows upgrade when it would help.
      const windowsOpen = materialsForLevel(level.id).some((m) => m.id === 'windows') && !ups.has('windows');
      if (windowsOpen && (bad.includes('blast') || bad.includes('heat'))) {
        const tip = 'Board up the windows! Glass breaks very easily in a shockwave.';
        if (tips.length >= 2) tips[1] = tip; else tips.push(tip);
      }
    }
  }

  return {
    survived,
    safety: clamp(safety, 0, 100),
    stars,
    threats: threatsOut,
    broken: brokenFull.map(({ _name, ...rest }) => rest),
    houseDamage,
    tips: tips.slice(0, 2),
    spent,
  };
}

export { THREATS };
