// The Last Soak - client entry: connects to the server and drives the scene + HTML overlays.
import { io } from 'socket.io-client';
import { World } from './scene/world.js';
import { makePortraits } from './scene/portraits.js';
import { Anchors } from './ui/anchors.js';
import { Cinematic } from './cinematic.js';
import { $, $$, esc, el, fmt, toast, modal, closeModal, hasModal, closeAllModals, snippet } from './ui/dom.js';
import { sfx } from './ui/sfx.js';

const SEAT_KEY = 'soak.seat';
const NAME_KEY = 'soak.name';
const store = {
  get(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
  del(k) {
    try { localStorage.removeItem(k); } catch {}
  },
};

const meta = await fetch('/api/scenario').then((r) => r.json());
const CH = Object.fromEntries(meta.characters.map((c) => [c.id, c]));
const portraits = makePortraits([...meta.characters.map((c) => c.id), 'dan', 'waffles', 'biscuit', 'prickles']);
const world = new World($('#scene'), meta);
const anchors = new Anchors(world, meta);
const cine = new Cinematic(world, anchors, meta, portraits);
$('#logoDan').src = portraits.dan;

let V = null; // latest view from the server
let recvAt = 0;
let offset = 0; // server clock - local clock
let kicked = false;
const seen = new Set(); // one-shot UI moments (story card, phone call…) per game
const serverNow = () => Date.now() + offset;
const isDet = () => V?.you.role === 'detective'; // lead or assistant
const isLead = () => isDet() && !!V?.you.lead;
const roomName = (id) => meta.rooms[id]?.name ?? id;
const P = (id, cls = '') => `<img class="portrait ${cls}" src="${portraits[id]}" alt="" />`;

// ───────────────────────────── connection ─────────────────────────────

const socket = io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 4000 });
const emit = (ev, data = {}) => new Promise((res) => socket.emit(ev, data, (r) => res(r || {})));

function overlay(text) {
  $('#overlay').classList.toggle('hidden', !text);
  if (text) $('#overlayText').innerHTML = text;
}

socket.on('connect', async () => {
  const seat = store.get(SEAT_KEY);
  if (!seat?.token) return overlay(null);
  overlay('Rejoining…');
  const r = await emit('hello', { token: seat.token });
  overlay(null);
  if (!r.ok) {
    store.del(SEAT_KEY);
    leaveToHome();
    if (r.interrupted) toast('The game was interrupted. Start a fresh one!', '', 5000);
  }
});

socket.on('disconnect', (reason) => {
  if (V && reason !== 'io server disconnect' && !kicked) overlay('Rejoining…');
});

socket.on('kicked', ({ reason }) => {
  kicked = true;
  overlay(`${esc(reason)}<br><br><button class="btn primary" onclick="location.reload()">Play in this tab</button>`);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected && !kicked) socket.connect();
});

socket.on('view', (v) => {
  const prev = V;
  V = v;
  recvAt = Date.now();
  offset = v.now - recvAt;
  render(prev, v);
});

socket.on('fx', (f) => onFx(f));

// ───────────────────────────── home + lobby ─────────────────────────────

$('#nameInput').value = store.get(NAME_KEY) || '';
const params = new URLSearchParams(location.search);
if (params.get('room')) $('#codeInput').value = params.get('room').toUpperCase().slice(0, 4);

function nameOrErr() {
  const n = $('#nameInput').value.trim();
  if (!n) {
    $('#homeErr').textContent = 'Pick a name first!';
    $('#nameInput').focus();
    return null;
  }
  store.set(NAME_KEY, n);
  return n;
}

async function enter(r) {
  if (!r.ok) {
    $('#homeErr').textContent = r.error || 'Something went wrong.';
    return;
  }
  $('#homeErr').textContent = '';
  store.set(SEAT_KEY, { code: r.code, token: r.token });
  history.replaceState(null, '', `?room=${r.code}`);
}

$('#createBtn').onclick = async () => {
  sfx.unlock();
  const name = nameOrErr();
  if (name) enter(await emit('create', { name }));
};
$('#joinBtn').onclick = async () => {
  sfx.unlock();
  const name = nameOrErr();
  const code = $('#codeInput').value.trim().toUpperCase();
  if (!name) return;
  if (code.length !== 4) return ($('#homeErr').textContent = 'Enter the 4-letter room code.');
  enter(await emit('join', { name, code }));
};
$('#codeInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('#joinBtn').click());
$('#nameInput').addEventListener('keydown', (e) => e.key === 'Enter' && ($('#codeInput').value ? $('#joinBtn') : $('#createBtn')).click());

$('#leaveBtn').onclick = () => leave();
$('#startBtn').onclick = async () => {
  sfx.unlock();
  const r = await emit('start');
  if (!r.ok) toast(r.error);
};
$('#copyLink').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${V.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Invite link copied!');
  } catch {
    toast(url, '', 8000);
  }
};

async function leave() {
  await emit('leave');
  store.del(SEAT_KEY);
  leaveToHome();
}

function leaveToHome() {
  V = null;
  seen.clear();
  cine.stop();
  closeAllModals();
  anchors.clearAll();
  history.replaceState(null, '', location.pathname);
  show('home');
  for (const id of Object.keys(world.critters)) world.returnHome(id);
  world.setAssistant(false);
  world.placeDetective('foyer');
  world.overview();
  renderTags();
}

function show(screen) {
  $('#home').classList.toggle('hidden', screen !== 'home');
  $('#lobby').classList.toggle('hidden', screen !== 'lobby');
  const game = screen === 'game';
  $('#hud').classList.toggle('hidden', !game);
  $('#panel').classList.toggle('hidden', !game);
  if (!game) {
    $('#logPanel').classList.add('hidden');
    $('#whisperPanel').classList.add('hidden');
    $('#radioPanel').classList.add('hidden');
    $('#banner').classList.add('hidden');
  }
  $('#reveal')?.classList.toggle('hidden', screen !== 'reveal');
}

const PICK_LABEL = { random: '🎲 Random', lead: '🔎 Lead detective', assistant: '🕵️ Assistant detective', murderer: '🔪 Murderer' };

function renderLobby(v) {
  show('lobby');
  $('#lobbyCode').textContent = v.code;
  const host = v.you.isHost;
  // The host picks roles; everyone else sees the detective picks (murderer picks stay secret).
  const pickCell = (p) => {
    if (host) {
      return `<select class="pick" data-player="${p.id}" aria-label="Role for ${esc(p.name)}">${Object.entries(PICK_LABEL)
        .map(([k, label]) => `<option value="${k}" ${(p.pick || 'random') === k ? 'selected' : ''}>${label}</option>`)
        .join('')}</select>`;
    }
    return p.pick === 'lead' || p.pick === 'assistant' ? `<span class="pickx">${PICK_LABEL[p.pick]}</span>` : '';
  };
  $('#playerList').innerHTML = v.players
    .map((p) => `<li class="${p.connected ? '' : 'off'}"><span class="dot"></span><span class="pname">${esc(p.name)}${p.id === v.you.id ? ' <small>(you)</small>' : ''}</span>${pickCell(p)}<span class="tagx">${p.isHost ? '👑 host' : p.connected ? '' : 'reconnecting…'}</span></li>`)
    .join('');
  $('#playerList').querySelectorAll('select.pick').forEach((sel) => (sel.onchange = async () => {
    const r = await emit('setRole', { playerId: sel.dataset.player, role: sel.value });
    if (!r.ok) {
      toast(r.error);
      renderLobby(V);
    }
  }));
  const n = v.players.length;
  const hostP = v.players.find((p) => p.isHost);
  const picks = v.players.map((p) => p.pick).filter(Boolean);
  $('#startBtn').classList.toggle('hidden', !host);
  $('#startBtn').disabled = n < v.limits.min || n > v.limits.max;
  $('#lobbyHint').textContent = host
    ? n < v.limits.min
      ? `Waiting for at least ${v.limits.min} players… share the code!`
      : `${n} players. Choose roles (up to 2 detectives and 2 murderers), or leave them on 🎲 Random.${picks.includes('lead') ? '' : ' A random player gets offered the lead detective badge.'}`
    : `Waiting for ${hostP?.name ?? 'the host'} to start… (${n}/${v.limits.max})`;
}

// ───────────────────────────── main render ─────────────────────────────

function render(prev, v) {
  const phaseChanged = !prev || prev.phase !== v.phase || prev.code !== v.code;
  if (v.phase === 'lobby') {
    if (phaseChanged) {
      seen.clear();
      cine.stop();
      closeAllModals();
      anchors.clearAll();
      for (const id of Object.keys(world.critters)) world.returnHome(id);
      world.setAssistant(false);
      world.placeDetective('foyer');
      world.overview();
      $('#reveal')?.remove();
    }
    renderLobby(v);
    renderTags();
    return;
  }

  if (v.phase === 'reveal') {
    cine.stop();
    closeModal('offer');
    renderReveal(v);
    syncWorld(v);
    return;
  }

  show('game');
  // The cinematic decides when the assistant appears; outside it they show whenever there is one.
  if (cine.running) world.hasAssistant = !!v.assistant;
  else world.setAssistant(!!v.assistant);
  syncWorld(v);

  if (v.phase === 'offer') renderOffer(v);
  else closeModal('offer');

  if (v.phase === 'cinematic') {
    if (!cine.running && !seen.has('cine')) {
      seen.add('cine');
      cine.play(performance.now() + (v.cinematic.startAt - serverNow()), () => {});
    }
    $('#hud').classList.add('hidden');
    $('#panel').classList.add('hidden');
    const b = $('#skipBtn');
    b.textContent = v.cinematic.youSkipped ? `Waiting… ${v.cinematic.skips}/${v.cinematic.needed}` : `Skip ⏭ ${v.cinematic.skips ? `${v.cinematic.skips}/${v.cinematic.needed}` : ''}`;
    b.disabled = v.cinematic.youSkipped;
  } else if (cine.running) cine.stop();

  if (v.phase === 'briefing' || v.phase === 'investigation') {
    if (!seen.has('camera')) {
      seen.add('camera');
      if (v.you.charId) world.focusRoom(CH[v.you.charId].room);
      else world.overview();
      if (!isDet() && window.innerWidth > 640) $('#logPanel').classList.remove('hidden');
    }
    if (v.phase === 'briefing' && !seen.has('brief')) {
      seen.add('brief');
      // Everyone first sees who the detectives are and what their own role is.
      openRoles(v, () => {
        if (!V || V.phase === 'reveal' || V.phase === 'lobby') return;
        if (V.card) openStoryCard(V, true);
        if (isDet() && V.calls?.length && V.phase === 'briefing') openCall(V.calls[0], true);
      });
    }
    if (v.phase === 'investigation' && isDet()) closeModal('phone-opening');
  }

  renderHud(v);
  renderPanel(v);
  renderLog(v);
  renderWhisper(v);
  renderRadio(v);
  renderTags();
}

/** Make the 3D scene agree with the view (handles rejoin and missed fx). */
function syncWorld(v) {
  for (const c of v.chars) {
    const k = world.critters[c.id];
    if (c.accused && !k.atStation) world.sendToStation(c.id, false);
    if (!c.accused && k.atStation) world.returnHome(c.id);
  }
  if (v.detective && !cine.running) {
    if (world.detLoc !== v.detective.loc) {
      const left = v.detective.arriveAt - serverNow();
      if (left > 150) world.moveDetective(v.detective.loc, left);
      else world.placeDetective(v.detective.loc);
    }
  }
  // Question bubbles for anyone who (re)joined mid-question.
  if (v.pending && !anchors.bubbles.waffles._detach) {
    anchors.say('waffles', esc(meta.questions[v.pending.q].text), 'q', 0);
    anchors.say(v.pending.charId, '<span class="dots"><span>•</span><span>•</span><span>•</span></span>', '', 0);
  }
}

function renderTags() {
  for (const c of meta.characters) {
    const accused = V?.chars?.find((x) => x.id === c.id)?.accused;
    const mine = V?.you?.charId === c.id;
    anchors.setTag(c.id, `${accused ? '🚓 ' : ''}${mine ? '⭐ ' : ''}${c.name}`, mine ? 'you' : '');
  }
  const detName = V?.detective?.name;
  anchors.setTag('waffles', detName ? `🔎 ${detName}` : 'Insp. Waffles', 'det');
  const asstName = V?.assistant?.name;
  anchors.setTag('biscuit', asstName ? `🕵️ ${asstName}` : 'Const. Biscuit', 'det');
}

// ───────────────────────────── offer ─────────────────────────────

function renderOffer(v) {
  const o = v.offer;
  $('#hud').classList.add('hidden');
  $('#panel').classList.add('hidden');
  const banner = $('#banner');
  if (!o.you) {
    closeModal('offer');
    banner.classList.remove('hidden');
    banner.textContent = '🔎 Finding a detective…';
    return;
  }
  banner.classList.add('hidden');
  if (hasModal('offer') && $('[data-key="offer"]').dataset.round === String(o.round)) return;
  sfx.ring();
  const m = modal(
    'offer',
    `<div class="offer">
      <div class="phone ringing" style="background:none"><div class="caller">${P('waffles', 'lg')}<div><h2>Be the detective?</h2>
      <small>Chief Inspector Prickles needs someone to crack the case of Mr. Dan's last soak.</small></div></div></div>
      <div class="count" id="offerCount">10</div>
      <div class="actions"><button class="btn ghost" id="offerNo">No thanks</button><button class="btn primary big" id="offerYes">🐶 I'll take the case!</button></div>
    </div>`,
    { dismissable: false },
  );
  m.el.dataset.round = String(o.round);
  $('#offerYes').onclick = () => emit('offerReply', { accept: true });
  $('#offerNo').onclick = () => emit('offerReply', { accept: false });
}

// ───────────────────────────── HUD ─────────────────────────────

function renderHud(v) {
  $('#hudCode').textContent = v.code;
  const who = $('#hudWho');
  if (isDet()) who.innerHTML = isLead() ? (v.assistant ? '🔎 You are the lead detective' : '🔎 You are the detective') : '🕵️ You are the assistant detective';
  else if (v.you.charId) who.innerHTML = `⭐ You are ${esc(CH[v.you.charId].name)}`;
  else who.textContent = '';
  $('#strikes').textContent = v.clock ? `${'❌'.repeat(v.clock.strikes)}${'⚪'.repeat(Math.max(0, 2 - v.clock.strikes))}` : '';
  $('#btnLog').classList.toggle('hidden', !v.log);
  const banner = $('#banner');
  if (v.donut) {
    banner.classList.remove('hidden');
    banner.dataset.kind = 'donut';
  } else if (v.phase === 'briefing' && !isDet()) {
    banner.classList.remove('hidden');
    banner.dataset.kind = 'briefing';
  } else banner.classList.add('hidden');
}

$('#btnOverview').onclick = () => {
  if (Math.abs(world.goal.zoom - 1) < 0.01 && V?.you.charId) world.focusRoom(CH[V.you.charId].room);
  else if (Math.abs(world.goal.zoom - 1) < 0.01 && isDet()) world.focusRoom(V.detective.loc);
  else world.overview();
};
$('#btnLog').onclick = () => $('#logPanel').classList.toggle('hidden');
$('#btnMute').onclick = () => ($('#btnMute').textContent = sfx.toggle() ? '🔇' : '🔊');
$('#btnMute').textContent = sfx.muted ? '🔇' : '🔊';
$$('[data-close]').forEach((b) => (b.onclick = () => $(`#${b.dataset.close}`).classList.add('hidden')));

let lastSec = -1;
function tickUi() {
  requestAnimationFrame(tickUi);
  if (!V) return;
  const elapsed = Date.now() - recvAt;
  if (V.clock) {
    const left = V.clock.paused ? V.clock.left : Math.max(0, V.clock.left - elapsed);
    const c = $('#clock');
    c.textContent = fmt(left);
    c.classList.toggle('low', !V.clock.paused && left < 30000 && V.phase === 'investigation');
    c.classList.toggle('paused', V.clock.paused);
    const s = Math.ceil(left / 1000);
    if (s !== lastSec && s <= 10 && s > 0 && !V.clock.paused && V.phase === 'investigation') sfx.tick();
    lastSec = s;
  } else if (V.phase === 'briefing') $('#clock').textContent = '5:00';
  const banner = $('#banner');
  if (banner.dataset.kind === 'donut' && V.donut) banner.textContent = `🍩 The detective stepped out for a donut… (${fmt(V.donut.endsAt - serverNow())})`;
  if (banner.dataset.kind === 'briefing' && V.briefing) banner.textContent = `📞 The detective is on the phone with the Chief… (starts in ≤ ${fmt(V.briefing.endsAt - serverNow())})`;
  const oc = $('#offerCount');
  if (oc && V.offer) oc.textContent = Math.max(0, Math.ceil((V.offer.endsAt - serverNow()) / 1000));
  const bar = $('#answerBar');
  if (bar && V.pending) {
    const k = Math.max(0, (V.pending.deadline - serverNow()) / (V.pending.deadline - V.pending.askedAt));
    bar.style.width = `${k * 100}%`;
    bar.style.backgroundPosition = `${k * 100}% 0`;
    const lab = $('#answerSecs');
    if (lab) lab.textContent = Math.max(0, Math.ceil((V.pending.deadline - serverNow()) / 1000));
  }
}
tickUi();

// ───────────────────────────── bottom panel ─────────────────────────────

let arriveTimer = null;
function renderPanel(v) {
  const panel = $('#panel');
  if (v.phase === 'briefing') {
    panel.innerHTML = isDet()
      ? `<div class="who">${P(isLead() ? 'waffles' : 'biscuit')}<div class="grow"><h3>${isLead() ? 'Inspector Waffles' : 'Constable Biscuit'}</h3><p>${isLead() ? 'Finish the call with the Chief to start the clock.' : `Listen in on the call. ${esc(v.detective.name)} starts the clock.`}</p></div>
         <button class="btn" data-act="roles">📋<span class="lbl"> Roles</span></button><button class="btn" data-act="call">📞 Phone</button></div>`
      : suspectWho(v, 'Read your story card. The investigation starts when the detective hangs up.');
    bindPanel();
    return;
  }
  if (v.phase !== 'investigation') return;
  if (isDet()) renderDetectivePanel(v);
  else renderSuspectPanel(v);
  bindPanel();
}

function suspectWho(v, status) {
  const c = CH[v.you.charId];
  return `<div class="who">${P(c.id)}<div class="grow"><h3>You are ${esc(c.name)}</h3><p>${esc(c.title)} · ${esc(roomName(c.room))}</p></div>
    <button class="btn small" data-act="roles" title="Roles">📋</button>
    <button class="btn small" data-act="story">📜 My story</button>
    ${v.radio ? '<button class="btn small" data-act="radio" title="Detective radio">📻</button>' : ''}
    ${v.whisper ? '<button class="btn small" data-act="whisper">🤫</button>' : ''}</div>
    <p class="status">${status}</p>`;
}

function renderDetectivePanel(v) {
  const panel = $('#panel');
  const loc = v.detective.loc;
  const walking = serverNow() < v.detective.arriveAt;
  clearTimeout(arriveTimer);
  if (walking) arriveTimer = setTimeout(() => V && renderPanel(V), v.detective.arriveAt - serverNow() + 30);
  const suspect = meta.characters.find((c) => c.room === loc);
  const lead = isLead();
  const me = lead ? 'waffles' : 'biscuit';
  const caseBtn = `<button class="btn small" data-act="case">📋<span class="lbl"> Case file</span></button>${v.radio ? '<button class="btn small" data-act="radio" title="Detective radio">📻</button>' : ''}`;
  if (walking) {
    panel.innerHTML = `<div class="who">${P(me)}<div class="grow"><h3>Walking to the ${esc(roomName(loc))}…</h3><p>The clock keeps ticking!</p></div>${caseBtn}</div>`;
    return;
  }
  if (!suspect) {
    const hint = lead ? 'Tap a room to walk in and question its suspect.' : `You follow ${esc(v.detective.name)}. Use the 📻 radio to suggest a room.`;
    panel.innerHTML = `<div class="who">${P(me)}<div class="grow"><h3>The Foyer</h3><p>${hint}</p></div>${caseBtn}</div>`;
    return;
  }
  const accused = v.chars.find((c) => c.id === suspect.id).accused;
  if (accused) {
    panel.innerHTML = `<div class="who">${P(suspect.id)}<div class="grow"><h3>${esc(roomName(loc))}</h3><p>${esc(suspect.name)} is already at the station. 🚓</p></div>${caseBtn}</div>`;
    return;
  }
  const busy = !!v.pending;
  const paused = !!v.donut;
  // Only the lead detective can arrest; the assistant can still ask questions.
  const accuseBtn = lead ? `<button class="btn accuse" data-act="accuse" ${busy || paused ? 'disabled' : ''}>🚨 ACCUSE</button>` : '';
  const idle = lead ? 'Pick a question. Tap another room to move on.' : `Pick a question. Only ${esc(v.detective.name)} can ACCUSE or change rooms.`;
  panel.innerHTML = `
    <div class="who">${P(suspect.id)}<div class="grow"><h3>${esc(suspect.name)}</h3><p>${esc(suspect.title)} · ${esc(roomName(loc))}</p></div>
      ${caseBtn}${accuseBtn}</div>
    <div class="qgrid">${meta.questions.map((q, i) => `<button class="btn" data-q="${i}" title="${esc(q.text)}" ${busy || paused ? 'disabled' : ''}>${['📍', '👀', '🥂', '🪶', '🤔'][i]} ${esc(q.short)}</button>`).join('')}</div>
    <p class="status">${busy ? `${esc(suspect.name)} is thinking…` : idle}</p>`;
}

function renderSuspectPanel(v) {
  const panel = $('#panel');
  const me = v.you.charId;
  const p = v.pending;
  if (p && p.charId === me && p.options) {
    const tagName = { T: 'Truth', L: 'Lie', D: 'Dodge', S: 'Secret!' };
    const chips = (tags) => `<span class="tags">${tags.map((t) => `<span class="tagc tag-${t}" title="${tagName[t]}">${t}</span>`).join('')}</span>`;
    const chosen = p.chosen;
    panel.innerHTML = `<div class="answer-panel">
      <h4>🔎 “${esc(meta.questions[p.q].text)}” <small>(<span id="answerSecs">8</span>s)</small></h4>
      <div class="timerbar"><i id="answerBar"></i></div>
      <div class="opts">
        ${p.options.map((o, i) => `<button class="opt ${chosen === i ? 'chosen' : ''}" data-choice="${i}" ${chosen !== null ? 'disabled' : ''}>${chips(o.tags)}<span>${esc(o.line)}</span></button>`).join('')}
        <button class="opt confess ${chosen === 'confess' ? 'chosen' : ''}" data-choice="confess" ${chosen !== null ? 'disabled' : ''}><span class="tags"><span class="tagc tag-C">!</span></span><span>Confess: “Fine! It was me! I did it!”</span></button>
      </div>
      <p class="status">${chosen !== null ? 'Answer locked in…' : '<b>[S]</b> lines cost your <b>Secret Kept</b> badge. Confessing is not an arrest.'}</p></div>`;
    return;
  }
  let status;
  if (v.accused) status = "🚓 You're at the station. You hear everything clearly now, but you can't answer.";
  else if (p) status = p.charId === me ? '🔎 The detective is waiting for you…' : `🔎 The detective is questioning ${esc(CH[p.charId].name)}…`;
  else if (v.detective.loc === CH[me].room) status = '🔎 <b>The detective is here.</b>';
  else status = `🔎 The detective is in the ${esc(roomName(v.detective.loc))}.`;
  panel.innerHTML = suspectWho(v, status);
}

function bindPanel() {
  const panel = $('#panel');
  panel.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
    sfx.click();
    emit('ask', { q: Number(b.dataset.q) });
  }));
  panel.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => {
    sfx.click();
    const c = b.dataset.choice;
    emit('answer', { choice: c === 'confess' ? 'confess' : Number(c) });
  }));
  panel.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    sfx.click();
    const act = b.dataset.act;
    if (act === 'story') openStoryCard(V, false);
    if (act === 'whisper') $('#whisperPanel').classList.toggle('hidden');
    if (act === 'radio') $('#radioPanel').classList.toggle('hidden');
    if (act === 'roles') openRoles(V);
    if (act === 'case') openCaseFile(V);
    if (act === 'call') openCall(V.calls[0], V.phase === 'briefing');
    if (act === 'accuse') confirmAccuse(V);
  }));
}

function confirmAccuse(v) {
  if (!isLead()) return;
  const suspect = meta.characters.find((c) => c.room === v.detective.loc);
  if (!suspect) return;
  const m = modal(
    'accuse',
    `<div style="text-align:center">${P(suspect.id, 'lg')}<h2>Accuse ${esc(suspect.name)} of murder?</h2><p>This can't be undone.</p>
      <div class="actions" style="justify-content:center"><button class="btn" data-dismiss>Not yet</button><button class="btn accuse" id="doAccuse">🚨 ACCUSE</button></div></div>`,
  );
  $('#doAccuse', m.el).onclick = () => {
    m.close();
    emit('accuse', { charId: suspect.id });
  };
}

// ───────────────────────────── log + whisper ─────────────────────────────

let logCount = -1;
function renderLog(v) {
  $('#logTitle').textContent = isDet() ? '📒 Case notes' : '👂 Overheard';
  const list = $('#logList');
  const log = v.log || [];
  if (log.length === logCount && list.children.length) return;
  logCount = log.length;
  list.innerHTML = log.length
    ? log
        .map((e) => {
          if (e.kind === 'accused') return `<li class="sys">🚓 ${esc(e.text)}</li>`;
          const c = CH[e.charId];
          const text = e.full ? `“${esc(e.text)}”` : `“${snippet(e.text)}”`;
          return `<li><div class="q">🔎 → ${esc(c.name)}: ${esc(meta.questions[e.q].text)}</div><div class="a">${P(c.id, 'sm')}<span>${text}</span></div></li>`;
        })
        .join('')
    : `<li class="q" style="color:var(--ink-soft)">${isDet() ? 'Answers you hear will be noted here.' : "Snippets of every interrogation drift through the walls. They'll show up here."}</li>`;
  list.scrollTop = list.scrollHeight;
}

let whisperCount = -1;
function renderWhisper(v) {
  const panel = $('#whisperPanel');
  if (!v.whisper) {
    panel.classList.add('hidden');
    return;
  }
  $('#partnerName').textContent = v.partner ? CH[v.partner].name : '';
  const input = $('#whisperInput');
  input.disabled = !v.whisper.enabled;
  input.placeholder = v.whisper.enabled ? 'Only your partner can read this…' : 'No whispering from the station.';
  if (!seen.has('whisperOpen') && v.whisper.enabled && window.innerWidth > 640) {
    seen.add('whisperOpen');
    panel.classList.remove('hidden');
  }
  if (v.whisper.log.length === whisperCount) return;
  whisperCount = v.whisper.log.length;
  $('#whisperList').innerHTML = v.whisper.log.map((m) => `<li class="${m.from === v.you.charId ? 'me' : ''}"><b>${esc(CH[m.from].name)}:</b> ${esc(m.text)}</li>`).join('');
  $('#whisperList').scrollTop = 1e6;
}

$('#whisperForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('#whisperInput').value.trim();
  if (!t) return;
  emit('whisper', { text: t });
  $('#whisperInput').value = '';
};

let radioCount = -1;
function renderRadio(v) {
  const panel = $('#radioPanel');
  if (!v.radio) {
    panel.classList.add('hidden');
    return;
  }
  const input = $('#radioInput');
  const form = $('#radioForm');
  form.classList.toggle('hidden', !isDet());
  input.disabled = !v.radio.canSend;
  input.placeholder = isLead() ? `Talk to ${v.assistant.name}… (everyone can hear)` : `Talk to ${v.detective.name}… (everyone can hear)`;
  $('#radioNote').textContent = isDet() ? 'Everyone can hear the radio.' : 'You can listen in on the detectives.';
  if (!seen.has('radioOpen') && window.innerWidth > 640 && ['briefing', 'investigation'].includes(v.phase)) {
    seen.add('radioOpen');
    panel.classList.remove('hidden');
  }
  if (v.radio.log.length === radioCount) return;
  radioCount = v.radio.log.length;
  $('#radioList').innerHTML = v.radio.log.length
    ? v.radio.log.map((m) => `<li class="${m.from} ${isDet() && (m.from === 'lead') === isLead() ? 'me' : ''}">${P(m.from === 'lead' ? 'waffles' : 'biscuit', 'sm')}<span><b>${esc(m.name)}:</b> ${esc(m.text)}</span></li>`).join('')
    : `<li class="empty">${isDet() ? 'Share ideas with your partner here.' : 'Nothing on the radio yet.'}</li>`;
  $('#radioList').scrollTop = 1e6;
}

$('#radioForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('#radioInput').value.trim();
  if (!t) return;
  emit('radio', { text: t });
  $('#radioInput').value = '';
};

// ───────────────────────────── roles ─────────────────────────────

/** Who's who: the detectives (everyone sees them) and this player's own role. */
function openRoles(v, onClose) {
  const lead = v.detective?.name ?? '???';
  const asst = v.assistant?.name;
  let mine;
  if (isLead()) {
    mine = `${P('waffles', 'lg')}<div><small>Your role</small><h2>${asst ? 'Lead detective' : 'Detective'}</h2>
      <p>You are <b>Inspector Waffles</b>. Walk the manor, ask questions and find out who did it. <b>Only you can ACCUSE.</b>${asst ? ` ${esc(asst)} is your assistant. Talk on the 📻 radio. Everyone can hear it!` : ''}</p></div>`;
  } else if (isDet()) {
    mine = `${P('biscuit', 'lg')}<div><small>Your role</small><h2>Assistant detective</h2>
      <p>You are <b>Constable Biscuit</b>. You follow ${esc(lead)} and hear every answer clearly. You can ask questions too. Talk to ${esc(lead)} on the 📻 radio. <b>Only ${esc(lead)} can ACCUSE.</b> Everyone can hear the radio!</p></div>`;
  } else if (v.you.charId) {
    const c = CH[v.you.charId];
    const bad = v.card?.role === 'MURDERER';
    mine = `${P(c.id, 'lg')}<div><small>Your role</small><h2>${esc(c.name)} <span class="role ${bad ? 'bad' : ''}">${bad ? '🔪 MURDERER' : '😇 INNOCENT'}</span></h2>
      <p>${bad
        ? `You did it. Don't get caught!${v.partner ? ` Your partner in crime is <b>${esc(CH[v.partner].name)}</b>. Use the 🤫 whisper chat. Only the two of you can read it.` : ''}`
        : 'You did not do it. Answer the detectives, but try to keep your secret.'}</p></div>`;
  }
  const m = modal(
    'roles',
    `<div class="storycard roles">
      <h2 style="margin:0 0 6px">📋 Case briefing</h2>
      ${meta.grudges ? `<h4>Why nobody liked Mr. Dan</h4><p>${esc(meta.grudges.intro)}</p>
        <ul class="why">${meta.grudges.list.map((g) => `<li>${P(g.id, 'sm')}<span><b>${esc(CH[g.id].name)}:</b> ${esc(g.text)}</span></li>`).join('')}</ul>` : ''}
      <h4>The detectives</h4>
      <div class="team">
        <div class="member">${P('waffles')}<div><b>${esc(lead)}</b><small>🔎 ${asst ? 'Lead detective' : 'Detective'} · Inspector Waffles</small></div></div>
        ${asst ? `<div class="member">${P('biscuit')}<div><b>${esc(asst)}</b><small>🕵️ Assistant detective · Constable Biscuit</small></div></div>` : ''}
      </div>
      <p class="hint">Everyone else is a suspect. The detectives don't know which suspects are players.</p>
      ${mine ? `<h4>You</h4><div class="head mine">${mine}</div>` : ''}
      <div class="actions"><button class="btn primary" data-dismiss>Got it</button></div>
    </div>`,
    { onClose },
  );
  return m;
}

// ───────────────────────────── cards + phone ─────────────────────────────

function openStoryCard(v, first) {
  const c = CH[v.you.charId];
  const card = v.card;
  const bad = card.role === 'MURDERER';
  const m = modal(
    'story',
    `<div class="storycard">
      <div class="head">${P(c.id, 'lg')}<div><small>${first ? 'You are…' : 'Your story card'}</small><h2>${esc(c.name)}</h2>
        <span class="role ${bad ? 'bad' : ''}">${bad ? '🔪 MURDERER' : '😇 INNOCENT'}</span> <small>${esc(c.title)} · ${esc(roomName(c.room))}</small></div></div>
      <h4>Who you are</h4><p>${esc(card.who)}</p>
      <h4>You and Mr. Dan</h4><p>${esc(card.withDan)}</p>
      <h4>Your evening</h4><ul>${card.evening.map((e) => `<li><b>${esc(e.time)}</b><span>${esc(e.text)}</span></li>`).join('')}</ul>
      ${card.secret ? `<div class="secret">🤫 <b>Your secret [S]:</b> ${esc(card.secret)}</div>` : ''}
      ${card.watchOut ? `<h4>Watch out</h4><p>${esc(card.watchOut)}</p>` : ''}
      <h4>Goal</h4><p>${esc(card.goal)}</p>
      ${card.gossip ? `<h4>Useful gossip</h4><p>${esc(card.gossip)}</p>` : ''}
      ${v.partner ? `<div class="secret">🤝 <b>Your partner in crime:</b> ${esc(CH[v.partner].name)}. Use the 🤫 whisper chat to keep your stories straight.</div>` : ''}
      <h4>The toast (everyone knows)</h4><div class="toast-list"><ol>${meta.toast.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div class="actions"><button class="btn primary" data-dismiss>Got it</button></div>
    </div>`,
  );
  return m;
}

function openCall(call, opening) {
  if (!call) return;
  sfx.ring();
  const key = opening ? 'phone-opening' : 'phone';
  const m = modal(
    key,
    `<div class="phone"><div class="caller ringing">${P('prickles', 'lg')}<div><small>📞 Incoming call…</small><h2>Chief Inspector Prickles</h2></div></div>
      <div class="lines" id="callLines"></div>
      <div class="actions">${opening && isLead() ? '<button class="btn primary big" id="hangUp">☎️ Hang up & start the clock</button>' : '<button class="btn primary" data-dismiss>☎️ Hang up</button>'}</div></div>`,
    { dismissable: !(opening && isLead()) },
  );
  const box = $('#callLines', m.el);
  const caller = $('.caller', m.el);
  let i = 0;
  const next = () => {
    if (!box.isConnected || i >= call.lines.length) {
      caller?.classList.remove('ringing');
      if (opening && box.isConnected) box.append(el(`<div class="clues">${(V.clues || []).map((c) => `<div>${c.icon} ${esc(c.clue)}</div>`).join('')}</div>`));
      return;
    }
    box.append(el(`<div class="line">${esc(call.lines[i++])}</div>`));
    box.lastElementChild.scrollIntoView({ block: 'nearest' });
    sfx.pop();
    setTimeout(next, 1700);
  };
  setTimeout(next, seen.has(`call${call.id}`) ? 0 : 900);
  seen.add(`call${call.id}`);
  const hang = $('#hangUp', m.el);
  if (hang) hang.onclick = () => {
    m.close();
    emit('beginInvestigation');
  };
}

function openCaseFile(v) {
  modal(
    'case',
    `<div class="phone"><div class="caller">${P('waffles', 'lg')}<div><small>Case file</small><h2>The Last Soak</h2></div></div>
      <h4 style="margin:12px 0 4px">Clues at the pond</h4>
      <div class="clues">${(v.clues || []).map((c) => `<div>${c.icon} ${esc(c.clue)}</div>`).join('')}</div>
      <h4 style="margin:12px 0 4px">The toast</h4>
      <div class="clues">${meta.toast.map((t, i) => `<div>${['📖', '♨️', '📜'][i]} ${esc(t)}</div>`).join('')}</div>
      <h4 style="margin:12px 0 4px">Calls from the Chief</h4>
      <div class="lines">${(v.calls || []).flatMap((c) => c.lines).map((l) => `<div class="line">${esc(l)}</div>`).join('')}</div>
      <div class="actions"><button class="btn primary" data-dismiss>Back to work</button></div></div>`,
  );
}

// ───────────────────────────── fx ─────────────────────────────

function onFx(f) {
  if (!V) return;
  switch (f.type) {
    case 'moved':
      world.moveDetective(f.to, f.arriveAt - serverNow());
      anchors.clear('waffles');
      sfx.step();
      if (isDet()) f.to === 'foyer' ? world.overview() : world.focusRoom(f.to);
      break;
    case 'asked':
      anchors.say('waffles', esc(meta.questions[f.q].text), 'q', 0);
      anchors.say(f.charId, '<span class="dots"><span>•</span><span>•</span><span>•</span></span>', '', 0);
      world.detective.talk(1200);
      sfx.pop();
      if (V.you.charId === f.charId) {
        // Get anything out of the way of the answer buttons.
        closeModal('story');
        closeModal('roles');
        sfx.ring();
      }
      break;
    case 'answered': {
      const html = f.full ? esc(f.text) : snippet(f.text);
      anchors.say(f.charId, html, f.full ? '' : 'snip', 7000);
      setTimeout(() => anchors.clear('waffles'), 1200);
      world.critters[f.charId].talk(1600);
      if (f.kind === 'confess') world.critters[f.charId].hop(500);
      sfx.pop();
      break;
    }
    case 'accused':
      anchors.clear('waffles');
      anchors.say(f.charId, '😱', 'shout', 1500);
      world.sendToStation(f.charId, true);
      sfx.siren();
      break;
    case 'toast':
      toast(f.text, f.tone || '');
      if (f.tone === 'whisper') sfx.whisper();
      if (f.tone === 'detective') world.critters[V.you.charId]?.hop(400);
      break;
    case 'call':
      if (f.call.key !== 'opening' && !['win', 'loseStrikes', 'loseTime', 'dropped'].includes(f.call.key)) openCall(f.call, false);
      break;
    case 'radio':
      if ($('#radioPanel').classList.contains('hidden') && !(isDet() && (f.msg.from === 'lead') === isLead())) toast(`📻 ${f.msg.name}: ${f.msg.text}`, 'radio');
      break;
    case 'whisper':
      if (f.msg.from !== V.you.charId) {
        sfx.whisper();
        if ($('#whisperPanel').classList.contains('hidden')) toast(`🤫 ${CH[f.msg.from].name}: ${f.msg.text}`, 'whisper');
      }
      break;
    case 'reveal':
      break;
  }
}

// ───────────────────────────── reveal ─────────────────────────────

function renderReveal(v) {
  show('reveal');
  let scr = $('#reveal');
  if (scr && scr.dataset.done === v.code + v.result.outcome) return;
  scr?.remove();
  const r = v.result;
  const heads = {
    detective: ['🎉 Case closed!', 'The detective caught every murderer.'],
    strikes: ['🦹 The murderers got away!', 'Two wrong arrests. Off to the Turnip Market, Waffles.'],
    timeout: ["⌛ Time's up!", "The lawyers arrived. The murderers got away."],
    dropped: ['🍩 Case dropped.', "The detective never came back from the donut shop."],
  }[r.outcome];
  const meWon = isDet() ? r.detective.won : r.chars.find((c) => c.id === v.you.charId)?.won;
  meWon ? sfx.good() : sfx.bad();
  const culprits = r.murderers.map((id) => CH[id].name).join(' and ');
  scr = el(`<section id="reveal" class="screen"><div class="card reveal-card">
    <h1>${heads[0]}</h1>
    <p class="sub">${esc(heads[1])} ${meWon === undefined ? '' : meWon ? '<b>You win!</b>' : '<b>You lose.</b>'}</p>
    <div class="phone card" style="box-shadow:none;border-width:2px"><div class="caller">${P('prickles', 'sm')}<div><small>Chief Inspector Prickles</small></div></div>
      <div class="lines">${r.finalCall.map((l) => `<div class="line">${esc(l)}</div>`).join('')}</div></div>
    <h2 style="text-align:center;margin:14px 0 8px">Whodunit: ${esc(culprits)} 🦆${r.murderers.length > 1 ? '🦡' : ''}</h2>
    <div class="reveal-grid">
      <div class="rc">${P('waffles')}<h4>Inspector Waffles</h4><div class="meta">${esc(r.detective.name)} · ${r.detective.assistant ? 'lead detective' : 'detective'}</div>
        <div><span class="badge ${r.detective.won ? 'win' : 'lose'}">${r.detective.won ? 'Won' : 'Lost'}</span>${r.detective.badges.map((b) => `<span class="badge">🏅 ${esc(b)}</span>`).join('')}</div>
        <div class="meta">${r.strikes} strike${r.strikes === 1 ? '' : 's'}</div></div>
      ${r.detective.assistant ? `<div class="rc">${P('biscuit')}<h4>Constable Biscuit</h4><div class="meta">${esc(r.detective.assistant)} · assistant detective</div>
        <div><span class="badge ${r.detective.won ? 'win' : 'lose'}">${r.detective.won ? 'Won' : 'Lost'}</span></div></div>` : ''}
      ${r.chars
        .map((c) => `<div class="rc ${c.murderer ? 'guilty' : ''}">${P(c.id)}<h4>${esc(CH[c.id].name)}</h4>
          <div class="meta">${c.human ? `👤 ${esc(c.playerName)}` : '🤖 NPC'} · ${c.murderer ? '🔪 murderer' : 'innocent'}</div>
          <div class="meta">${c.accused ? '🚓 accused' : 'never accused'}${c.human && !c.murderer ? ` · ${c.usedSecret ? '🫢 spilled their secret' : '🤐 kept their secret'}` : ''}${c.confessed ? ' · confessed!' : ''}</div>
          <div>${c.won === null ? '' : `<span class="badge ${c.won ? 'win' : 'lose'}">${c.won ? 'Won' : 'Lost'}</span>`}${c.badges.map((b) => `<span class="badge">🏅 ${esc(b)}</span>`).join('')}</div></div>`)
        .join('')}
    </div>
    <div class="timeline"><h3 style="margin:0 0 6px">What really happened</h3><ol>${r.timeline.map((t) => `<li><b>${esc(t.time)}</b><span>${esc(t.text)} <i>(${esc(t.who)})</i></span></li>`).join('')}</ol></div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="revealLeave">Leave</button>
      ${v.you.isHost ? '<button class="btn primary big" id="playAgain">🔁 Play again</button>' : '<span class="hint">Waiting for the host…</span>'}</div>
  </div></section>`);
  scr.dataset.done = v.code + r.outcome;
  document.body.append(scr);
  $('#revealLeave').onclick = () => leave();
  $('#playAgain')?.addEventListener('click', () => emit('playAgain'));
  $('#hud').classList.add('hidden');
  $('#panel').classList.add('hidden');
  closeAllModals();
}

$('#skipBtn').onclick = () => emit('skipCinematic');
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// Room clicks (lead detective only).
world.canPick = () => !!V && V.phase === 'investigation' && isLead() && !V.pending && !V.donut && serverNow() >= V.detective.arriveAt;
world.onRoomClick = (id) => {
  if (id !== V.detective.loc) emit('goTo', { room: id });
};

window.__soak = { world, anchors, portraits, cine }; // handy for debugging in the console

// Gentle idle camera on the home screen.
world.overview(true);
renderTags();
