// End-to-end smoke test: boots the server with fast timers and plays a 3-player game.
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), SOAK_TIME_SCALE: '0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('listening') && r()));

function client(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, name, view: null, fx: [], token: null };
  s.on('view', (v) => (c.view = v));
  s.on('fx', (f) => c.fx.push(f));
  c.emit = (ev, data = {}) => new Promise((r) => s.emit(ev, data, r));
  return c;
}
async function until(fn, label, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await wait(20);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

let failed = false;
try {
  const A = client('Ada'), B = client('Bo'), C = client('Cy');
  await Promise.all([A, B, C].map((c) => new Promise((r) => c.s.on('connect', r))));
  const made = await A.emit('create', { name: 'Ada' });
  assert.ok(made.ok, 'create');
  A.token = made.token;
  for (const c of [B, C]) {
    const r = await c.emit('join', { name: c.name, code: made.code });
    assert.ok(r.ok, 'join');
    c.token = r.token;
  }
  assert.equal((await A.emit('join', { name: 'Bo', code: made.code })).ok, false, 'duplicate name rejected');
  await until(() => A.view?.players.length === 3, 'three players');
  assert.equal((await B.emit('start')).ok, false, 'non-host cannot start');
  assert.ok((await A.emit('start')).ok, 'start');

  // Detective offer: first offered declines, second accepts.
  const all = [A, B, C];
  await until(() => all.some((c) => c.view?.offer?.you), 'offer');
  const first = all.find((c) => c.view.offer.you);
  assert.equal(first.view.card, undefined, 'no seats dealt during offer');
  await first.emit('offerReply', { accept: false });
  await until(() => all.some((c) => c !== first && c.view?.offer?.you), 'second offer');
  const det = all.find((c) => c !== first && c.view.offer.you);
  await det.emit('offerReply', { accept: true });
  await until(() => det.view.phase === 'cinematic', 'cinematic');
  const sus = all.filter((c) => c !== det);
  const seats = sus.map((c) => c.view.you.charId).sort();
  assert.deepEqual(seats, ['barnaby', 'clementine'], 'both murderers dealt to humans in 3-player game');
  const detJson = JSON.stringify(det.view);
  for (const s of sus) assert.ok(!detJson.includes(s.view.you.charId === 'clementine' ? '"charId":"clementine"' : '"charId":"barnaby"'), 'detective view hides seats');
  assert.equal(det.view.card, undefined);

  // Everyone skips the cinematic.
  for (const c of all) await c.emit('skipCinematic');
  await until(() => det.view.phase === 'briefing', 'briefing');
  assert.ok(det.view.calls.length === 1 && det.view.calls[0].key === 'opening', 'opening call');
  const clem = sus.find((c) => c.view.you.charId === 'clementine');
  const barn = sus.find((c) => c.view.you.charId === 'barnaby');
  assert.equal(clem.view.card.role, 'MURDERER');
  assert.ok(clem.view.card.evening.some((e) => e.text.includes('Barnaby shoved')), '2M card text');
  assert.ok(barn.view.whisper, 'barnaby has whisper chat');
  await det.emit('beginInvestigation');
  await until(() => det.view.phase === 'investigation', 'investigation');
  assert.ok(det.view.clock.left > 25000 && det.view.clock.left <= 30000, 'clock 5:00 (scaled)');

  // Interrogate Clementine (human).
  await det.emit('goTo', { room: 'kitchen' });
  await until(() => det.view.detective.loc === 'kitchen', 'moved');
  await wait(det.view.detective.arriveAt - det.view.now + 50);
  await det.emit('ask', { q: 0 });
  await until(() => clem.view.pending?.options, 'options for clementine');
  assert.equal(clem.view.pending.options.length, 3);
  assert.equal(det.view.pending.options, undefined, 'detective never sees options');
  await clem.emit('answer', { choice: 1 });
  await until(() => det.fx.some((f) => f.type === 'answered'), 'detective hears answer');
  const heard = det.fx.find((f) => f.type === 'answered');
  assert.equal(heard.text, 'I brought Mr. Dan his tea at the pond, like every night. Then back to the kitchen.');
  const overheard = barn.fx.find((f) => f.type === 'answered');
  assert.ok(overheard && !overheard.full && overheard.text.includes('{tea}'), `barnaby hears snippet: ${overheard?.text}`);

  // Whisper chat + detective toast.
  await barn.emit('whisper', { text: 'stick to the shed story' });
  await until(() => clem.fx.some((f) => f.type === 'whisper'), 'whisper delivered');
  await until(() => det.fx.some((f) => f.type === 'toast' && /whispering/.test(f.text)), 'whisper toast');
  assert.ok(!det.fx.some((f) => f.type === 'whisper'), 'detective never gets whisper text');

  // NPC interrogation (Pierre).
  await det.emit('goTo', { room: 'music' });
  await wait(det.view.detective.arriveAt - Date.now() + 80);
  det.fx = [];
  await det.emit('ask', { q: 2 });
  await until(() => det.fx.some((f) => f.type === 'answered'), 'npc answers', 3000);
  const npc = det.fx.find((f) => f.type === 'answered');
  assert.ok(['He owed me three months of pay. Now I\'ll never see it.', '…uh…'].includes(npc.text), `npc line: ${npc.text}`);

  // Wrong accusation → strike, clock 2:00.
  await det.emit('accuse', { charId: 'pierre' });
  await until(() => det.view.clock.strikes === 1, 'strike');
  assert.ok(det.view.clock.left <= 12000 && det.view.clock.left > 10000, 'clock reset to 2:00 (scaled)');
  assert.equal(det.view.calls.at(-1).key, 'wrong');

  // Reconnect: Barnaby drops and comes back with his token.
  barn.s.disconnect();
  await wait(100);
  const barn2 = client('Bo');
  await new Promise((r) => barn2.s.on('connect', r));
  const re = await barn2.emit('hello', { token: barn.token });
  assert.ok(re.ok, 'rejoin');
  await until(() => barn2.view?.card?.role === 'MURDERER', 'snapshot on rejoin');
  assert.ok(barn2.view.whisper.log.length === 1, 'whisper history resent');
  assert.ok(barn2.view.log.length >= 2, 'snippet log resent');

  // One tab per seat.
  const barn3 = client('Bo');
  await new Promise((r) => barn3.s.on('connect', r));
  let kicked = false;
  barn2.s.on('kicked', () => (kicked = true));
  await barn3.emit('hello', { token: barn.token });
  await until(() => kicked, 'older tab kicked');

  // Unknown token after a restart.
  const ghost = client('x');
  await new Promise((r) => ghost.s.on('connect', r));
  const gr = await ghost.emit('hello', { token: 'nope' });
  assert.equal(gr.interrupted, true);
  ghost.s.close();

  // Correct accusations → detective wins.
  await det.emit('goTo', { room: 'kitchen' });
  await wait(det.view.detective.arriveAt - Date.now() + 50);
  await det.emit('accuse', { charId: 'clementine' });
  await until(() => det.view.calls.at(-1).key === 'correct', 'correct call');
  assert.ok(det.view.clock.left > 15000, 'clock reset to 3:00 (scaled)');
  await until(() => clem.view.whisper && !clem.view.whisper.enabled, 'accused murderer loses whisper');
  await det.emit('goTo', { room: 'shed' });
  await wait(det.view.detective.arriveAt - Date.now() + 50);
  await det.emit('accuse', { charId: 'barnaby' });
  await until(() => det.view.phase === 'reveal', 'reveal');
  const res = det.view.result;
  assert.equal(res.outcome, 'detective');
  assert.deepEqual(res.detective.badges, []);
  assert.equal(res.chars.find((c) => c.id === 'pierre').human, false);
  assert.ok(res.timeline.some((t) => t.text.includes('waits behind the hedge')));

  // Host restarts.
  assert.ok((await A.emit('playAgain')).ok);
  await until(() => A.view.phase === 'lobby', 'back to lobby');

  for (const c of [A, B, C, barn3]) c.s.close();
  console.log('✔ 3-player game (2 murderers) passed');

  // ── 2-player game: 1 murderer, fake whisper toasts, autopilot, donut timeout ──
  const D = client('Di'), E = client('Ed');
  await Promise.all([D, E].map((c) => new Promise((r) => c.s.on('connect', r))));
  const g2 = await D.emit('create', { name: 'Di' });
  D.token = g2.token;
  E.token = (await E.emit('join', { name: 'Ed', code: g2.code })).token;
  await D.emit('start');
  await until(() => D.view?.offer?.you || E.view?.offer?.you, 'offer 2p');
  const det2 = D.view.offer?.you ? D : E;
  const sus2 = det2 === D ? E : D;
  await det2.emit('offerReply', { accept: true });
  await until(() => sus2.view?.phase === 'cinematic', 'cinematic 2p');
  assert.equal(sus2.view.you.charId, 'clementine', 'the only human suspect is the murderer');
  assert.equal(sus2.view.whisper, undefined, 'no whisper chat with one murderer');
  assert.ok(!sus2.view.card.evening.some((e) => e.text.includes('Barnaby')), '1M card');
  for (const c of [D, E]) await c.emit('skipCinematic');
  await until(() => det2.view.phase === 'briefing', 'briefing 2p');
  await det2.emit('beginInvestigation');
  await until(() => det2.view.phase === 'investigation', 'investigation 2p');
  await until(() => det2.fx.some((f) => f.type === 'toast' && /whispering/.test(f.text)), 'fake whisper toast', 9000);

  // Clementine drops mid-question: autopilot answers with her first [L] line.
  await det2.emit('goTo', { room: 'kitchen' });
  await wait(det2.view.detective.arriveAt - Date.now() + 50);
  await det2.emit('ask', { q: 0 });
  await until(() => sus2.view.pending?.options, 'options 2p');
  sus2.s.disconnect();
  det2.fx = [];
  await until(() => det2.fx.some((f) => f.type === 'answered'), 'autopilot answer', 3000);
  assert.equal(det2.fx.find((f) => f.type === 'answered').text, "In my kitchen, all night. Pots don't scrub themselves, detective.");

  // Detective drops: clock pauses, then the case is dropped.
  const left = det2.view.clock.left;
  det2.s.disconnect();
  await wait(200);
  const sus3 = client('Ed');
  await new Promise((r) => sus3.s.on('connect', r));
  await sus3.emit('hello', { token: sus2.token });
  await until(() => sus3.view?.donut, 'donut banner');
  assert.ok(sus3.view.clock.paused && Math.abs(sus3.view.clock.left - left) < 1500, 'clock paused');
  await until(() => sus3.view.phase === 'reveal', 'case dropped', 9000);
  assert.equal(sus3.view.result.outcome, 'dropped');
  sus3.s.close();
  console.log('✔ 2-player game (1 murderer, autopilot, donut) passed');

  // ── 4-player game: host picks the lead, an assistant and one murderer ──
  const H = client('Hal'), L = client('Lee'), S = client('Sam'), I = client('Ivy');
  await Promise.all([H, L, S, I].map((c) => new Promise((r) => c.s.on('connect', r))));
  const g3 = await H.emit('create', { name: 'Hal' });
  for (const c of [L, S, I]) await c.emit('join', { name: c.name, code: g3.code });
  await until(() => H.view?.players.length === 4, 'four players');
  const pid = (c) => H.view.players.find((p) => p.name === c.name).id;
  assert.equal((await L.emit('setRole', { playerId: pid(L), role: 'lead' })).ok, false, 'only the host picks roles');
  assert.ok((await H.emit('setRole', { playerId: pid(L), role: 'lead' })).ok);
  assert.ok((await H.emit('setRole', { playerId: pid(S), role: 'assistant' })).ok);
  assert.ok((await H.emit('setRole', { playerId: pid(H), role: 'murderer' })).ok);
  assert.ok((await H.emit('setRole', { playerId: pid(I), role: 'murderer' })).ok);
  assert.ok((await H.emit('setRole', { playerId: pid(I), role: 'random' })).ok);
  await until(() => I.view.players.find((p) => p.name === 'Lee').pick === 'lead', 'lead pick is public');
  assert.equal(I.view.players.find((p) => p.name === 'Hal').pick, undefined, 'murderer pick hidden from other players');
  assert.equal(H.view.players.find((p) => p.name === 'Hal').pick, 'murderer', 'host sees the murderer pick');
  assert.ok((await H.emit('start')).ok, 'start with picks');
  await until(() => L.view?.phase === 'cinematic', 'straight to the cinematic (no offer)');
  assert.equal(L.view.you.role, 'detective');
  assert.equal(L.view.you.lead, true);
  assert.equal(S.view.you.role, 'detective');
  assert.equal(S.view.you.lead, false);
  assert.equal(S.view.you.charId, null, 'assistant has no suspect seat');
  assert.equal(H.view.you.charId, 'clementine', 'picked murderer gets the murder seat');
  assert.notEqual(I.view.you.charId, 'barnaby', 'one picked murderer → 1-murderer version');
  assert.equal(H.view.card.role, 'MURDERER');
  assert.equal(I.view.card.role, 'INNOCENT');
  assert.equal(I.view.assistant.name, 'Sam', 'everyone sees the assistant');
  assert.equal(I.view.detective.name, 'Lee', 'everyone sees the lead');
  for (const c of [H, L, S, I]) await c.emit('skipCinematic');
  await until(() => S.view.phase === 'briefing', 'briefing 4p');
  assert.ok(S.view.calls?.length === 1 && S.view.clues, 'assistant gets the call and clues');
  await S.emit('beginInvestigation');
  await wait(50);
  assert.equal(S.view.phase, 'briefing', 'only the lead hangs up');
  await L.emit('beginInvestigation');
  await until(() => S.view.phase === 'investigation', 'investigation 4p');

  // Radio: the detectives talk, everyone hears; suspects can't send.
  await S.emit('radio', { text: 'try the kitchen' });
  await until(() => I.fx.some((f) => f.type === 'radio' && f.msg.text === 'try the kitchen'), 'suspect hears the radio');
  assert.equal(I.view.radio.canSend, false);
  await I.emit('radio', { text: 'nope' });
  await wait(50);
  assert.equal(L.view.radio.log.length, 1, 'suspect radio ignored');

  // Assistant can't move or accuse, but can ask and hears answers in full.
  await S.emit('goTo', { room: 'kitchen' });
  await wait(50);
  assert.equal(L.view.detective.loc, 'foyer', 'assistant cannot walk the lead');
  await L.emit('goTo', { room: 'kitchen' });
  await wait(L.view.detective.arriveAt - Date.now() + 80);
  await S.emit('ask', { q: 2 });
  await until(() => H.view.pending?.options, 'assistant asked');
  await H.emit('answer', { choice: 0 });
  await until(() => S.fx.some((f) => f.type === 'answered'), 'assistant hears answer');
  assert.equal(S.fx.find((f) => f.type === 'answered').full, true);
  await S.emit('accuse', { charId: 'clementine' });
  await wait(50);
  assert.equal(L.view.chars.find((c) => c.id === 'clementine').accused, false, 'assistant cannot accuse');
  await L.emit('accuse', { charId: 'clementine' });
  await until(() => S.view.phase === 'reveal', 'reveal 4p');
  assert.equal(S.view.result.outcome, 'detective');
  assert.equal(S.view.result.detective.assistant, 'Sam');
  for (const c of [H, L, S, I]) c.s.close();
  console.log('✔ 4-player game (host-picked roles, assistant, radio) passed');
  console.log('✔ smoke test passed');
} catch (e) {
  failed = true;
  console.error('✘', e);
} finally {
  srv.kill();
  process.exit(failed ? 1 : 0);
}
