import { test } from 'node:test';
import assert from 'node:assert/strict';

import { simulateBlast } from '../src/sim/blast.js';
import {
  GRID, HOUSE, MAX_STACK, cellToWorld, worldToCell, inGrid, isHouseCell, canBuildAt,
} from '../src/sim/grid.js';
import { MATERIALS, THREATS, getMaterial, materialsForLevel } from '../src/data/materials.js';
import { LEVELS, getLevel } from '../src/data/levels.js';
import { GLOSSARY, QUIZ, COMPARE } from '../src/data/facts.js';

const [L1, L2, L3] = LEVELS;

// ---- helpers ----------------------------------------------------------

// A straight wall along x on row gz, from gx0 to gx1, `layers` high, `rows` rows thick (toward +gz).
function wall({ gz, gx0, gx1, layers, mat, rows = 1 }) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let layer = 0; layer < layers; layer++) {
      for (let gx = gx0; gx <= gx1; gx++) out.push({ gx, gz: gz + r, layer, materialId: mat });
    }
  }
  return out;
}

// A square ring of blocks around the house (ring cells lo..hi, the house is left empty).
function ring(lo, hi, layers, mat) {
  const out = [];
  for (let layer = 0; layer < layers; layer++) {
    for (let gx = lo; gx <= hi; gx++) {
      for (let gz = lo; gz <= hi; gz++) {
        if (isHouseCell(gx, gz)) continue;
        if (gx > lo && gx < hi && gz > lo && gz < hi) continue;
        out.push({ gx, gz, layer, materialId: mat });
      }
    }
  }
  return out;
}

const costOf = (placements, upgrades = []) =>
  placements.reduce((a, p) => a + getMaterial(p.materialId).cost, 0) +
  upgrades.reduce((a, id) => a + getMaterial(id).cost, 0);

// Winning builds used in the tests (also checked against the budgets).
const L1_WIN = wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'sandbag' }); // 12 sandbags, 96 coins
const L2_WIN = [
  ...wall({ gz: 5, gx0: 7, gx1: 12, layers: 1, mat: 'steel' }), // bottom row: steel
  ...wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'concrete' }).filter((p) => p.layer === 1),
]; // 6 steel + 6 concrete, plus boards on the windows
const L2_UPGRADES = ['windows'];
const L3_UPGRADES = ['basement', 'roof'];
const L3_WIN = wall({ gz: 7, gx0: 6, gx1: 13, layers: 3, mat: 'earth' }); // 24 earth, 240 coins

// ---- data sanity ------------------------------------------------------

test('materials: order of strength is realistic', () => {
  const r = (id, t) => getMaterial(id).resist[t];
  const hp = (id) => getMaterial(id).hp;
  for (const t of ['blast', 'fragments']) {
    assert.ok(r('pillow', t) < r('cardboard', t) || r('pillow', t) === r('cardboard', t));
    assert.ok(r('cardboard', t) < r('wood', t), `cardboard < wood vs ${t}`);
    assert.ok(r('wood', t) < r('brick', t), `wood < brick vs ${t}`);
  }
  assert.ok(hp('pillow') < hp('cardboard') && hp('cardboard') < hp('wood') && hp('wood') < hp('brick'));
  // sandbag is excellent vs fragments, steel is the best
  assert.ok(r('sandbag', 'fragments') >= 9 && r('sandbag', 'fragments') > r('brick', 'fragments'));
  for (const m of MATERIALS.filter((m) => m.kind === 'block' && m.id !== 'steel')) {
    assert.ok(r('steel', 'fragments') >= m.resist.fragments, `steel >= ${m.id} vs fragments`);
  }
  // radiation: lead best, thick concrete and earth next, steel is thin
  for (const m of MATERIALS.filter((m) => m.kind === 'block' && m.id !== 'lead')) {
    assert.ok(r('lead', 'radiation') >= m.resist.radiation, `lead >= ${m.id} vs radiation`);
  }
  for (const id of ['earth', 'thickconcrete', 'concrete']) {
    assert.ok(r(id, 'radiation') > r('brick', 'radiation'));
    assert.ok(r(id, 'radiation') > r('steel', 'radiation'));
  }
  // foil only helps with heat
  const foil = getMaterial('foil');
  assert.equal(foil.resist.heat, 10);
  assert.ok(foil.resist.blast <= 1 && foil.resist.fragments <= 1 && foil.resist.radiation <= 1);
  // everything has a sensible shape
  for (const m of MATERIALS) {
    assert.ok(m.id && m.name && m.emoji && m.fact && Number.isInteger(m.color));
    assert.ok([1, 2, 3].includes(m.unlockLevel));
    assert.ok(m.kind === 'block' || m.kind === 'upgrade');
    for (const t of Object.keys(THREATS)) {
      assert.ok(m.resist[t] >= 0 && m.resist[t] <= 10, `${m.id} ${t}`);
    }
  }
  assert.deepEqual(MATERIALS.map((m) => m.unlockLevel), [...MATERIALS.map((m) => m.unlockLevel)].sort());
  assert.equal(materialsForLevel(1).length, 5);
  assert.equal(materialsForLevel(2).length, 9);
  assert.equal(materialsForLevel(3).length, MATERIALS.length);
  assert.equal(getLevel(2), L2);
});

test('levels: shape, danger radius and text', () => {
  assert.equal(LEVELS.length, 3);
  LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.ok(l.budget > 0 && l.tntKg > 0 && l.waveSpeed > 0);
    assert.ok(l.facts.length >= 3);
    assert.ok(l.winTip);
    for (const t of Object.keys(THREATS)) assert.ok(l.loseTips[t], `${l.key} loseTip ${t}`);
    for (const t of Object.keys(l.threats)) assert.ok(l.limits[t] > 0, `${l.key} limit ${t}`);
    if (l.blast.type === 'point') assert.ok(l.dangerRadius > 0 && l.dangerRadiusOuter > l.dangerRadius);
  });
  assert.equal(L1.blast.type, 'point');
  assert.equal(L3.blast.type, 'far');
  assert.ok(L3.facts.join(' ').includes('nothing can survive'));
  assert.ok(L3.facts.join(' ').includes('Go in, stay in, tune in'));
});

test('facts: glossary, quiz and comparison', () => {
  assert.ok(GLOSSARY.length >= 12);
  for (const g of GLOSSARY) assert.ok(g.word && g.meaning);
  for (const id of [1, 2, 3]) {
    assert.equal(QUIZ[id].length, 3);
    for (const q of QUIZ[id]) {
      assert.equal(q.options.length, 3);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 3);
      assert.ok(q.q && q.explain);
    }
  }
  assert.deepEqual(COMPARE.map((c) => c.kg), [0.2, 25, 15000000]);
  assert.ok(COMPARE[1].line.includes('125 grenades'));
  assert.ok(COMPARE[2].line.includes('75 million grenades'));
});

// ---- 1. empty yard ----------------------------------------------------

test('every level: an empty yard does not survive', () => {
  for (const level of LEVELS) {
    const r = simulateBlast(level, []);
    assert.equal(r.survived, false, level.key);
    assert.equal(r.stars, 0);
    assert.equal(r.spent, 0);
    assert.ok(r.houseDamage > 0.5, `${level.key} house damage ${r.houseDamage}`);
    assert.ok(r.tips.length >= 1 && r.tips.length <= 2);
    assert.deepEqual(Object.keys(r.threats).sort(), Object.keys(level.threats).sort());
  }
});

// ---- 2. level 1 -------------------------------------------------------

test('level 1: a 2-high sandbag wall, 6 wide, survives; cardboard and pillows do not', () => {
  assert.equal(L1_WIN.length, 12);
  assert.ok(costOf(L1_WIN) <= L1.budget);
  const win = simulateBlast(L1, L1_WIN);
  assert.equal(win.survived, true, JSON.stringify(win.threats));
  assert.ok(win.stars >= 1);
  assert.ok(win.threats.fragments.blockedPct >= 85);
  assert.ok(win.houseDamage <= 0.2);
  assert.equal(win.spent, 96);
  assert.deepEqual(win.broken, []);

  const cardboard = simulateBlast(L1, L1_WIN.map((p) => ({ ...p, materialId: 'cardboard' })));
  assert.equal(cardboard.survived, false);
  assert.ok(cardboard.broken.length > 0 || !cardboard.threats.fragments.safe);
  const pillows = simulateBlast(L1, L1_WIN.map((p) => ({ ...p, materialId: 'pillow' })));
  assert.equal(pillows.survived, false);
  assert.equal(pillows.threats.fragments.safe, false);
  const wood = simulateBlast(L1, L1_WIN.map((p) => ({ ...p, materialId: 'wood' })));
  assert.equal(wood.survived, false);
});

test('level 1: needs thought (about 10 to 14 sandbags, placed well)', () => {
  const cheap = simulateBlast(L1, wall({ gz: 5, gx0: 8, gx1: 11, layers: 1, mat: 'sandbag' }));
  assert.equal(cheap.survived, false); // 1 high: fragments go over
  assert.ok(cheap.tips.join(' ').toLowerCase().includes('high'), cheap.tips.join(' '));
  const small = simulateBlast(L1, wall({ gz: 5, gx0: 9, gx1: 10, layers: 2, mat: 'sandbag' }));
  assert.equal(small.survived, false); // too narrow
  const nextToHouse = simulateBlast(L1, wall({ gz: 7, gx0: 7, gx1: 12, layers: 2, mat: 'sandbag' }));
  assert.equal(nextToHouse.survived, false); // fragments fly over a wall that is too close to the house
  const ten = simulateBlast(L1, wall({ gz: 5, gx0: 8, gx1: 12, layers: 2, mat: 'sandbag' }));
  assert.equal(ten.survived, true); // 10 sandbags is enough
  assert.ok(costOf(wall({ gz: 5, gx0: 8, gx1: 12, layers: 2, mat: 'sandbag' })) <= L1.budget);
  // the whole budget of cardboard or pillows cannot save the house
  const cb = [];
  for (let gx = 5; gx < 15 && cb.length < 33; gx++) for (let layer = 0; layer < 3; layer++) cb.push({ gx, gz: 5, layer, materialId: 'cardboard' });
  assert.ok(costOf(cb) <= L1.budget);
  assert.equal(simulateBlast(L1, cb).survived, false);
  // careless: bricks over budget do not count
  const bricks = wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'brick' });
  const br = simulateBlast(L1, bricks);
  assert.ok(costOf(bricks) > L1.budget);
  assert.equal(br.survived, false);
  assert.ok(br.tips.join(' ').toLowerCase().includes('budget'));
});

test('level 1 and 2: a sensible wall on the WRONG side (south) does not survive', () => {
  // South is away from the blast: +z. Same shapes as the winning walls, mirrored to the far side of the house.
  const south1 = wall({ gz: 13, gx0: 7, gx1: 12, layers: 2, mat: 'sandbag' });
  const r1 = simulateBlast(L1, south1);
  assert.equal(r1.survived, false);
  assert.equal(r1.threats.fragments.blockedPct, 0);
  assert.ok(r1.tips.length > 0);

  const south2 = [
    ...wall({ gz: 13, gx0: 7, gx1: 12, layers: 1, mat: 'steel' }),
    ...wall({ gz: 13, gx0: 7, gx1: 12, layers: 2, mat: 'concrete' }).filter((p) => p.layer === 1),
  ];
  assert.ok(costOf(south2, L2_UPGRADES) <= L2.budget);
  const r2 = simulateBlast(L2, south2, L2_UPGRADES);
  assert.equal(r2.survived, false);
  assert.equal(simulateBlast(L2, south2).threats.blast.blockedPct, 0); // the wall blocks nothing
  // east and west sides do not help either
  const east = wall({ gz: 7, gx0: 13, gx1: 13, layers: 3, mat: 'sandbag', rows: 6 });
  assert.equal(simulateBlast(L1, east).survived, false);
});

// ---- 3. level 2 -------------------------------------------------------

test('level 2: concrete and steel within budget survive', () => {
  assert.ok(costOf(L2_WIN, L2_UPGRADES) <= L2.budget, `cost ${costOf(L2_WIN, L2_UPGRADES)}`);
  const r = simulateBlast(L2, L2_WIN, L2_UPGRADES);
  assert.equal(r.survived, true, JSON.stringify(r.threats));
  assert.ok(r.stars >= 1);
  // without the boards on the windows, the same wall is not enough
  assert.equal(simulateBlast(L2, L2_WIN).survived, false);
  // concrete alone, 2 high and 6 wide, also works with boarded windows; thin materials do not
  const concrete = simulateBlast(L2, wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'concrete' }), L2_UPGRADES);
  assert.equal(concrete.survived, true);
  const wood = simulateBlast(L2, wall({ gz: 5, gx0: 7, gx1: 12, layers: 3, mat: 'wood', rows: 2 }));
  assert.equal(wood.survived, false);
  assert.ok(wood.broken.length > 0);
});

test('level 2: the best affordable sandbag-only wall does not survive', () => {
  let tried = 0;
  let best = Infinity;
  for (const gz of [4, 5, 6, 7]) {
    for (const rows of [1, 2, 3]) {
      for (const layers of [1, 2, 3]) {
        for (const width of [2, 4, 6, 8, 10]) {
          for (const windows of [false, true]) {
            const gx0 = 10 - width / 2;
            const pl = wall({ gz, gx0, gx1: gx0 + width - 1, layers, mat: 'sandbag', rows: Math.min(rows, 8 - gz + 1) });
            const ups = windows ? ['windows'] : [];
            if (costOf(pl, ups) > L2.budget) continue;
            tried++;
            const r = simulateBlast(L2, pl, ups);
            const q = Math.max(r.threats.blast.reached / L2.limits.blast, r.threats.fragments.reached / L2.limits.fragments);
            best = Math.min(best, q);
            assert.equal(r.survived, false, `sandbags gz${gz} rows${rows} layers${layers} width${width} windows${windows}`);
          }
        }
      }
    }
  }
  assert.ok(tried > 50, `tried ${tried}`);
  assert.ok(best > 1);
  // sandbags are fine against fragments, though. The shockwave is the problem.
  const sb = simulateBlast(L2, wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'sandbag', rows: 2 }));
  assert.equal(sb.threats.fragments.safe, true);
  assert.equal(sb.threats.blast.safe, false);
  assert.ok(sb.broken.length > 0);
  assert.ok(sb.tips.join(' ').toLowerCase().includes('broke'), sb.tips.join(' '));
});

// ---- 4. level 3 -------------------------------------------------------

test('level 3: a full ring of walls with no basement does not survive (radiation)', () => {
  for (const mat of ['earth', 'concrete']) {
    const pl = ring(7, 12, 3, mat);
    for (const ups of [[], ['roof'], ['roof', 'windows']]) {
      if (costOf(pl, ups) > L3.budget) continue;
      const r = simulateBlast(L3, pl, ups);
      assert.equal(r.threats.radiation.safe, false, `${mat} ring ${ups}`);
      assert.equal(r.survived, false);
    }
  }
  const earthRing = ring(7, 12, 3, 'earth');
  assert.ok(costOf(earthRing) <= L3.budget);
  const r = simulateBlast(L3, earthRing);
  assert.ok(r.tips.join(' ').toLowerCase().includes('basement'), r.tips.join(' '));
});

test('level 3: basement + roof + an earth wall on the north side survives', () => {
  const cost = costOf(L3_WIN, L3_UPGRADES);
  assert.ok(cost <= L3.budget, `cost ${cost}`);
  const r = simulateBlast(L3, L3_WIN, L3_UPGRADES);
  assert.equal(r.survived, true, JSON.stringify(r.threats));
  assert.ok(r.stars >= 1);
  assert.equal(r.spent, cost);
  // concrete works too
  const conc = wall({ gz: 7, gx0: 7, gx1: 12, layers: 3, mat: 'concrete' });
  assert.ok(costOf(conc, L3_UPGRADES) <= L3.budget);
  assert.equal(simulateBlast(L3, conc, L3_UPGRADES).survived, true);
  // the same wall without the basement, or without the roof, fails (radiation)
  assert.equal(simulateBlast(L3, L3_WIN, ['roof']).survived, false);
  assert.equal(simulateBlast(L3, L3_WIN, ['basement']).survived, false);
  assert.equal(simulateBlast(L3, L3_WIN).survived, false);
  // upgrades with no wall are not enough
  assert.equal(simulateBlast(L3, [], ['basement', 'roof', 'windows']).survived, false);
  // a low wall does not stop the heat flash
  const low = wall({ gz: 7, gx0: 6, gx1: 13, layers: 1, mat: 'earth' });
  assert.equal(simulateBlast(L3, low, L3_UPGRADES).survived, false);
  // foil helps against heat only
  const foilOnly = simulateBlast(L3, wall({ gz: 7, gx0: 6, gx1: 13, layers: 3, mat: 'foil' }));
  assert.ok(foilOnly.threats.heat.blockedPct > 50);
  assert.ok(foilOnly.threats.radiation.blockedPct === 0);
  assert.ok(foilOnly.threats.blast.blockedPct < 20);
  // a wall on the south side does not help
  const south = wall({ gz: 13, gx0: 6, gx1: 13, layers: 3, mat: 'earth' });
  assert.equal(simulateBlast(L3, south, L3_UPGRADES).survived, false);
});

// ---- 5. determinism, shape --------------------------------------------

test('determinism: the same input gives the same output', () => {
  for (const [level, pl, ups] of [[L1, L1_WIN, []], [L2, L2_WIN, L2_UPGRADES], [L3, L3_WIN, L3_UPGRADES]]) {
    const a = simulateBlast(level, pl, ups);
    const b = simulateBlast(level, pl.map((p) => ({ ...p })), [...ups]);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  }
  const x = simulateBlast(L2, wall({ gz: 5, gx0: 7, gx1: 12, layers: 3, mat: 'sandbag', rows: 2 }));
  const y = simulateBlast(L2, wall({ gz: 5, gx0: 7, gx1: 12, layers: 3, mat: 'sandbag', rows: 2 }));
  assert.deepEqual(x, y);
});

test('Result shape and broken blocks', () => {
  const pl = wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'cardboard' });
  const r = simulateBlast(L1, pl);
  assert.equal(typeof r.survived, 'boolean');
  assert.ok(r.safety >= 0 && r.safety <= 100);
  assert.ok([0, 1, 2, 3].includes(r.stars));
  assert.ok(r.houseDamage >= 0 && r.houseDamage <= 1);
  assert.ok(Array.isArray(r.tips) && r.tips.every((t) => typeof t === 'string'));
  assert.equal(r.spent, costOf(pl));
  for (const t of Object.values(r.threats)) {
    assert.ok(t.incoming >= t.reached);
    assert.ok(t.blockedPct >= 0 && t.blockedPct <= 100);
    assert.equal(typeof t.safe, 'boolean');
  }
  assert.ok(r.broken.length > 0);
  const seen = new Set();
  for (const b of r.broken) {
    assert.ok(Number.isInteger(b.index) && b.index >= 0 && b.index < pl.length);
    assert.ok(!seen.has(b.index));
    seen.add(b.index);
    assert.ok(b.time >= 0);
    assert.ok(b.vz > 0, 'blocks fly away from the blast (south)');
    assert.ok(b.vy > 0);
    assert.ok(Number.isFinite(b.vx));
  }
  // sorted by time
  for (let i = 1; i < r.broken.length; i++) assert.ok(r.broken[i].time >= r.broken[i - 1].time);
  // far blast: flash first, so times are above 2 s
  const big = simulateBlast(L3, wall({ gz: 4, gx0: 6, gx1: 13, layers: 3, mat: 'foil' }));
  assert.ok(big.broken.length > 0);
  assert.ok(big.broken.every((b) => b.time >= 2));
  // invalid placements are ignored
  const bad = simulateBlast(L1, [
    { gx: 9, gz: 9, layer: 0, materialId: 'sandbag' }, // house
    { gx: -1, gz: 3, layer: 0, materialId: 'sandbag' }, // outside
    { gx: 9, gz: 3, layer: 0, materialId: 'sandbag' }, // clear zone
    { gx: 9, gz: 5, layer: 3, materialId: 'sandbag' }, // too high
    { gx: 9, gz: 5, layer: 0, materialId: 'nonsense' },
    { gx: 9, gz: 5, layer: 0, materialId: 'basement' }, // upgrade, not a block
  ]);
  assert.equal(bad.spent, 0);
  // upgrades are counted once
  assert.equal(simulateBlast(L3, [], ['roof', 'roof', 'nonsense']).spent, 80);
});

test('stars: 1 = safe, +1 = very safe (92+), +1 = thrifty (80% of budget or less)', () => {
  const lean = wall({ gz: 5, gx0: 8, gx1: 12, layers: 2, mat: 'sandbag' }); // 10 sandbags, 80 coins
  const r = simulateBlast(L1, lean);
  assert.equal(r.survived, true);
  assert.ok(r.spent <= L1.budget * 0.8);
  assert.ok(r.safety >= 92, `safety ${r.safety}`);
  assert.equal(r.stars, 3);
  // 12 sandbags: safe and very safe, but not thrifty
  const fat = simulateBlast(L1, L1_WIN);
  assert.equal(fat.stars, 2);
  // 3 stars are possible on every level
  assert.equal(simulateBlast(L2, L2_WIN, L2_UPGRADES).stars >= 2, true);
  const l2three = simulateBlast(L2, wall({ gz: 5, gx0: 7, gx1: 12, layers: 2, mat: 'concrete' }), L2_UPGRADES);
  assert.equal(l2three.stars, 3);
  const l3 = simulateBlast(L3, wall({ gz: 5, gx0: 8, gx1: 11, layers: 3, mat: 'earth', rows: 2 }), ['basement', 'roof', 'windows']);
  assert.equal(l3.survived, true);
  assert.equal(l3.stars, 3);
  // not safe = 0 stars
  assert.equal(simulateBlast(L1, []).stars, 0);
});

// ---- 6. budgets -------------------------------------------------------

test('costs and budgets are consistent', () => {
  for (const m of MATERIALS) assert.ok(m.cost > 0 && Number.isInteger(m.cost));
  assert.deepEqual(LEVELS.map((l) => l.budget), [100, 300, 700]);
  assert.ok(costOf(L1_WIN) <= L1.budget);
  assert.ok(costOf(L2_WIN, L2_UPGRADES) <= L2.budget);
  assert.ok(costOf(L3_WIN, L3_UPGRADES) <= L3.budget);
  // every material that is not an upgrade can be afforded at least once
  for (const l of LEVELS) for (const m of materialsForLevel(l.id)) assert.ok(m.cost <= l.budget);
  // going over budget never survives
  const over = wall({ gz: 5, gx0: 5, gx1: 14, layers: 3, mat: 'sandbag' });
  assert.ok(costOf(over) > L1.budget);
  assert.equal(simulateBlast(L1, over).survived, false);
});

// ---- 7. grid ----------------------------------------------------------

test('canBuildAt rejects house cells, out-of-grid cells and the clear zone', () => {
  assert.equal(GRID, 20);
  assert.equal(MAX_STACK, 3);
  for (let gx = HOUSE.gx0; gx < HOUSE.gx0 + HOUSE.size; gx++) {
    for (let gz = HOUSE.gz0; gz < HOUSE.gz0 + HOUSE.size; gz++) {
      assert.equal(isHouseCell(gx, gz), true);
      for (const l of LEVELS) assert.equal(canBuildAt(l, gx, gz), false);
    }
  }
  assert.equal(isHouseCell(7, 8), false);
  for (const l of LEVELS) {
    assert.equal(canBuildAt(l, -1, 5), false);
    assert.equal(canBuildAt(l, 5, -1), false);
    assert.equal(canBuildAt(l, GRID, 5), false);
    assert.equal(canBuildAt(l, 5, GRID), false);
    assert.equal(canBuildAt(l, 0.5, 5), false);
    assert.equal(canBuildAt(l, 0, 0), l.blast.type === 'far' || true);
  }
  // clear zone around the point blasts
  for (const l of [L1, L2]) {
    const { gx, gz } = worldToCell(l.blast.x, l.blast.z);
    assert.equal(canBuildAt(l, gx, gz), false);
    assert.equal(canBuildAt(l, gx - 1, gz), false);
    assert.equal(canBuildAt(l, gx, gz + 1), false);
    // just outside the clear radius it is allowed
    let allowed = 0, rejected = 0;
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        if (isHouseCell(x, z)) continue;
        const c = cellToWorld(x, z);
        const d = Math.hypot(c.x - l.blast.x, c.z - l.blast.z);
        assert.equal(canBuildAt(l, x, z), d >= l.blast.clearRadius, `${l.key} ${x},${z} d=${d}`);
        if (d >= l.blast.clearRadius) allowed++; else rejected++;
      }
    }
    assert.ok(allowed > 200 && rejected > 5);
  }
  // far blast: no clear zone, so the north edge is open
  assert.equal(canBuildAt(L3, 10, 0), true);
  assert.equal(canBuildAt(L3, 0, 0), true);
  assert.equal(canBuildAt(L3, 19, 19), true);
  // conversions
  assert.deepEqual(cellToWorld(10, 10), { x: 0.5, z: 0.5 });
  assert.deepEqual(cellToWorld(0, 0), { x: -9.5, z: -9.5 });
  assert.deepEqual(worldToCell(0.4, -0.1), { gx: 10, gz: 9 });
  assert.equal(inGrid(19, 19), true);
  assert.equal(inGrid(20, 0), false);
});
