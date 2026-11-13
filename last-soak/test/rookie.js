// Rookie Mode checks: the Year 6 scenario must play exactly like the standard one
// (same structure, tags, timings, key words), and its text must stay simple.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeT, MODES, MODE_INFO } from '../shared/strings.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scenarios');
const std = JSON.parse(fs.readFileSync(path.join(dir, 'the-last-soak.json'), 'utf8'));
const rk = JSON.parse(fs.readFileSync(path.join(dir, 'the-last-soak.rookie.json'), 'utf8'));

const braces = (s) => (s.match(/\{[^}]+\}/g) || []).length;
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
const balanced = (s) => (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length && !/\{[^}]*\{/.test(s);

// ── 1. Same game: structure, ids, timings, tags ──────────────────────────────
assert.deepEqual(Object.keys(rk.rooms), Object.keys(std.rooms), 'same rooms');
for (const id of Object.keys(std.rooms)) assert.deepEqual(rk.rooms[id].cell, std.rooms[id].cell, `room ${id} keeps its cell`);
assert.equal(rk.characters.length, std.characters.length);
std.characters.forEach((c, i) => {
  const r = rk.characters[i];
  assert.deepEqual([r.id, r.species, r.room], [c.id, c.species, c.room], `character ${c.id} keeps id, species and room`);
});
assert.deepEqual(rk.murderers, std.murderers, 'same murderers');
assert.deepEqual([rk.victim, rk.detective, rk.assistant, rk.boss].map((x) => x.id), [std.victim, std.detective, std.assistant, std.boss].map((x) => x.id));
assert.equal(rk.questions.length, std.questions.length, '5 questions');
assert.equal(rk.toast.length, std.toast.length, '3 announcements');
assert.equal(rk.clues.length, std.clues.length);
rk.clues.forEach((c, i) => assert.equal(c.icon, std.clues[i].icon, 'clue icons match'));
assert.deepEqual(rk.grudges.list.map((g) => g.id), std.grudges.list.map((g) => g.id), 'grudges in the same order');
assert.ok(braces(rk.confess) > 0 && balanced(rk.confess), 'confess line keeps key words');
assert.equal(rk.timeout, std.timeout);

// Calls: same keys, same line counts, same {name} placeholders.
assert.deepEqual(Object.keys(rk.calls), Object.keys(std.calls));
for (const k of Object.keys(std.calls)) {
  assert.equal(rk.calls[k].length, std.calls[k].length, `call ${k}: same number of lines`);
  rk.calls[k].forEach((l, i) => assert.equal(placeholders(l), placeholders(std.calls[k][i]), `call ${k}[${i}] keeps its placeholders`));
}

// Cinematic: identical timing, shots, clocks, rule cards.
assert.equal(rk.cinematic.length, std.cinematic.length);
std.cinematic.forEach((s, i) => {
  const r = rk.cinematic[i];
  assert.deepEqual([r.at, r.shot, r.clock, r.card, r.title], [s.at, s.shot, s.clock, s.card, s.title], `cinematic shot ${i} keeps its timing`);
});

// Timeline: same events, same times, same version tags.
assert.equal(rk.timeline.length, std.timeline.length);
std.timeline.forEach((s, i) => assert.deepEqual([rk.timeline[i].time, rk.timeline[i].v], [s.time, s.v], `timeline ${i}`));

// Story cards: same fields, same times, same versions; Rookie Mode adds a one-line motive.
assert.deepEqual(Object.keys(rk.cards), Object.keys(std.cards));
const cardOf = (cards, id, v) => (cards[id].role ? cards[id] : cards[id][v]);
for (const id of Object.keys(std.cards)) {
  for (const v of std.cards[id].role ? [null] : ['1M', '2M']) {
    const a = cardOf(std.cards, id, v);
    const b = cardOf(rk.cards, id, v);
    assert.equal(b.role, a.role, `${id} ${v ?? ''}: same role`);
    assert.equal(!!b.secret, !!a.secret, `${id}: secret on both or neither`);
    assert.equal(!!b.watchOut, !!a.watchOut, `${id}: watchOut on both or neither`);
    assert.equal(!!b.gossip, !!a.gossip, `${id}: gossip on both or neither`);
    assert.ok(b.motive && b.motive.length > 5, `${id} ${v ?? ''}: Rookie card states a clear motive`);
    assert.deepEqual(b.evening.map((e) => [e.time, e.v]), a.evening.map((e) => [e.time, e.v]), `${id}: same evening events`);
  }
}

// Dialogue: same tags, same ★ choices, same T/L/D/S mix, key words kept, per-version lines kept.
let lines = 0;
const dlg = (d, id, v) => (Array.isArray(d[id]) ? d[id] : d[id][v]);
for (const id of Object.keys(std.dialogue)) {
  for (const v of Array.isArray(std.dialogue[id]) ? [null] : ['1M', '2M']) {
    const A = dlg(std.dialogue, id, v);
    const B = dlg(rk.dialogue, id, v);
    assert.equal(B.length, 5, `${id}: 5 questions`);
    A.forEach((set, q) => {
      assert.equal(B[q].length, 3, `${id} q${q}: 3 answers`);
      set.forEach((o, i) => {
        const r = B[q][i];
        assert.equal(r.tags, o.tags, `${id} ${v ?? ''} q${q} #${i}: same tags`);
        assert.equal(typeof r.line, typeof o.line, `${id} q${q} #${i}: same line type`);
        for (const ver of typeof o.line === 'string' ? [null] : ['1M', '2M']) {
          const a = ver ? o.line[ver] : o.line;
          const b = ver ? r.line[ver] : r.line;
          assert.ok(typeof b === 'string' && b.length > 0, `${id} q${q} #${i}: has text`);
          assert.ok(balanced(b), `${id} q${q} #${i}: balanced braces in "${b}"`);
          assert.equal(braces(b) > 0, braces(a) > 0, `${id} q${q} #${i}: key words kept in "${b}"`);
          lines++;
        }
      });
    });
  }
}

// ── 2. Simple language ───────────────────────────────────────────────────────
// Narrative = story cards, calls, captions, timeline, clues. Dialogue = what suspects say.
const NO_TEXT = new Set(['id', 'icon', 'species', 'room', 'shot', 'at', 'v', 'time', 'tags', 'role', 'mode', 'short', 'who', 'title', 'name', 'cell']);
const collect = (o, key, out) => {
  if (typeof o === 'string') {
    if (!NO_TEXT.has(key)) out.push(o.replace(/[{}]/g, ''));
  } else if (Array.isArray(o)) o.forEach((x) => collect(x, key, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) collect(v, k, out);
  return out;
};
const dialogueOf = (sc) => collect(sc.dialogue, '', []);
const narrativeOf = (sc) => {
  const { dialogue, cards, timeline, ...rest } = sc;
  // card/timeline `who` lines are labels, not prose; cards use "who" as a description, so collect them by hand.
  const out = collect({ ...rest, cards, timeline: timeline.map((t) => ({ text: t.text })) }, '', []);
  for (const c of Object.values(cards)) for (const x of c.role ? [c] : Object.values(c)) out.push(x.who);
  return out;
};
const sentences = (strs) =>
  strs
    .flatMap((s) => s.replace(/\b(Mr|Mrs|Insp|Const)\./g, '$1').split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
const wordCount = (s) => s.split(/\s+/).filter((w) => /\w/.test(w)).length;
const stats = (strs) => {
  const ss = sentences(strs);
  const counts = ss.map(wordCount);
  return {
    n: ss.length,
    avg: counts.reduce((a, b) => a + b, 0) / counts.length,
    over15: counts.filter((c) => c > 15).length,
    max: Math.max(...counts),
    longest: ss[counts.indexOf(Math.max(...counts))],
  };
};
// Rough syllable count: only used to compare the two versions with each other.
const syllables = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) || []).length);
const longWordTypes = (strs) => new Set(strs.join(' ').split(/[^A-Za-z]+/).filter((w) => w.length > 5 && syllables(w) >= 3).map((w) => w.toLowerCase()));

const sN = stats(narrativeOf(std));
const rN = stats(narrativeOf(rk));
const sD = stats(dialogueOf(std));
const rD = stats(dialogueOf(rk));
const sL = longWordTypes([...narrativeOf(std), ...dialogueOf(std)]);
const rL = longWordTypes([...narrativeOf(rk), ...dialogueOf(rk)]);
const row = (name, s) => `${name.padEnd(20)} ${String(s.n).padStart(4)} sentences · avg ${s.avg.toFixed(1)} words · ${s.over15} over 15 words · longest ${s.max}`;
console.log(row('Standard narrative', sN));
console.log(row('Rookie narrative', rN));
console.log(row('Standard dialogue', sD));
console.log(row('Rookie dialogue', rD));
console.log(`Long words (3+ syllables): Standard ${sL.size}, Rookie ${rL.size}`);

assert.ok(rN.avg < sN.avg, 'Rookie story text has shorter sentences on average');
assert.ok(rN.over15 <= sN.over15 / 3, `Rookie has far fewer long sentences (${rN.over15} vs ${sN.over15})`);
assert.ok(rN.max <= 20, `no Rookie story sentence over 20 words: "${rN.longest}"`);
assert.ok(rD.max <= 16, `no Rookie dialogue line over 16 words: "${rD.longest}"`);
assert.ok(rD.avg <= sD.avg + 0.5, 'Rookie dialogue is no wordier than Standard');
assert.ok(rL.size < sL.size, 'Rookie uses fewer long words');

// Words and idioms a Year 6 reader should not meet. Every one of these appears in the standard text.
const HARD = [
  'skimming', 'disinherited', 'ledgers', 'auditors', 'groundskeeper', 'sub-clauses', 'preservation', 'moults', 'entirely', 'tell-all',
  'accountant', 'journalist', 'charitable', 'speculate', 'paved', 'paving', 'retire', 'bells', 'screwed', 'pooch', 'shears', 'calico',
  'barrel-chested', 'precise', 'tawny', 'lilac', 'chewing', 'water under the bridge', 'to a fault', 'point paws',
];
const lower = [...narrativeOf(rk), ...dialogueOf(rk)].join('\n').toLowerCase();
for (const w of HARD) assert.ok(!lower.includes(w), `Rookie text should not use "${w}"`);
// Personality survives the simplifying: each voice keeps a signature phrase.
const voices = { 'Odette is pompous': 'perfectly reasonable', 'Pierre is French': 'monsieur', 'Gus is a sailor': 'matey', 'Hazel is a reporter': 'no comment', 'Clementine loves her kitchen': 'ladles' };
for (const [who, phrase] of Object.entries(voices)) assert.ok(lower.includes(phrase), `${who}: keeps "${phrase}"`);

// ── 3. In-code text ──────────────────────────────────────────────────────────
const ts = makeT('standard');
const tr = makeT('rookie');
assert.deepEqual(MODES, ['standard', 'rookie']);
assert.ok(MODE_INFO.rookie.label.includes('Rookie Mode'));
assert.match(tr('whisperToast'), /whispering/, 'whisper toast keeps the word the tests and players look for');
assert.notEqual(tr('stationToast'), ts('stationToast'));
assert.equal(ts('missing-key'), 'missing-key', 'unknown keys come back as the key (easy to spot)');
for (const key of ['lobbyHintHost', 'briefingBanner']) assert.notEqual(tr(key, 3, false, '1:00'), ts(key, 3, false, '1:00'), `${key} differs`);
assert.ok(tr('briefingBanner', '1:00').includes('1:00') && !tr('briefingBanner', '1:00').includes('≤'), 'no ≤ symbol in Rookie text');

console.log(`✔ Rookie Mode: ${lines} dialogue lines match the standard game, text is simpler`);
