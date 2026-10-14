// The Last Soak - authoritative room state machine.
// Lobby → Detective offer → Cinematic → Briefing → Investigation (accusation loops) → Reveal.
import crypto from 'node:crypto';
import { hearingRatio } from '../shared/layout.js';
import { maskLine, plain, cleanChat, fill } from './text.js';

export const T = {
  OFFER: 10_000,
  CINEMATIC: 60_000,
  BRIEFING: 90_000,
  ANSWER: 8_000,
  NPC_MIN: 2_000,
  NPC_MAX: 6_000,
  HUMAN_MIN: 2_000, // human answers are held until at least this long after the question
  NPC_TIMEOUT_CHANCE: 0.1,
  CLOCK_START: 300_000,
  CLOCK_WRONG: 120_000,
  CLOCK_RIGHT: 180_000,
  DETECTIVE_GRACE: 60_000,
  HOST_GRACE: 30_000,
  LOBBY_GRACE: 60_000,
  WHISPER_TOAST_GAP: 20_000,
  FAKE_WHISPER_MIN: 25_000,
  FAKE_WHISPER_MAX: 70_000,
  WALK_PER_CELL: 700,
};
// Tests can speed every timer up (e.g. SOAK_TIME_SCALE=0.05).
const SCALE = Number(process.env.SOAK_TIME_SCALE) || 1;
if (SCALE !== 1) for (const k of Object.keys(T)) if (k !== 'NPC_TIMEOUT_CHANCE') T[k] = Math.round(T[k] * SCALE);

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const parseTags = (s) => {
  const parts = s.split(/\s+/);
  return { star: parts.includes('★'), tag: parts.filter((p) => p !== '★') };
};

export class Game {
  constructor(code, scenario, hooks) {
    this.code = code;
    this.sc = scenario;
    this.hooks = hooks; // { send(player, event, data), onEmpty(game) }
    this.players = new Map(); // id -> player
    this.hostId = null;
    this.lastActivity = Date.now();
    this.resetToLobby();
  }

  // ───────────────────────────── players & seats ─────────────────────────────

  addPlayer(name) {
    const id = crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(18).toString('base64url');
    const now = Date.now();
    const p = { id, token, name, socket: null, connected: false, joinedAt: now, connectedSince: now, timers: {} };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    return p;
  }

  attach(player, socket) {
    const old = player.socket;
    if (old && old.id !== socket.id) {
      // One tab per seat: newest wins.
      old.emit('kicked', { reason: 'This seat was opened in another tab or device.' });
      old.data.playerId = null;
      setTimeout(() => old.disconnect(true), 50);
    }
    player.socket = socket;
    if (!player.connected) player.connectedSince = Date.now();
    player.connected = true;
    for (const k of Object.keys(player.timers)) clearTimeout(player.timers[k]);
    player.timers = {};
    this.touch();

    if (player.id === this.detectiveId && this.donut) this.endDonut();
    this.broadcast();
  }

  detach(player, socket) {
    if (player.socket !== socket) return; // an older tab, already replaced
    player.socket = null;
    player.connected = false;
    this.touch();

    if (this.phase === 'lobby') {
      player.timers.lobby = setTimeout(() => this.removePlayer(player.id), T.LOBBY_GRACE);
    } else {
      if (player.id === this.detectiveId && ['cinematic', 'briefing', 'investigation'].includes(this.phase)) this.startDonut();
      const seat = this.seatOf(player.id);
      if (seat && this.pending && this.pending.charId === seat.id && !this.pending.resolved && this.pending.human) {
        // Autopilot takes over mid-question.
        this.pending.human = false;
        this.scheduleAutoAnswer(seat, true);
      }
      if (this.phase === 'cinematic') this.checkSkip();
    }
    if (player.id === this.hostId) {
      player.timers.host = setTimeout(() => this.handOverHost(), T.HOST_GRACE);
    }
    if (![...this.players.values()].some((p) => p.connected)) this.hooks.onIdle?.(this);
    this.broadcast();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    for (const k of Object.keys(p.timers)) clearTimeout(p.timers[k]);
    this.players.delete(id);
    this.hooks.onRemoved?.(this, p);
    if (this.hostId === id) this.handOverHost();
    if (this.players.size === 0) return this.hooks.onEmpty(this);
    this.broadcast();
  }

  handOverHost() {
    const cur = this.players.get(this.hostId);
    if (cur && cur.connected) return;
    const next = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.connectedSince - b.connectedSince)[0];
    if (next) {
      this.hostId = next.id;
      this.toastAll(`${next.name} is now the host.`);
    } else if (!cur) {
      this.hostId = [...this.players.keys()][0] ?? null;
    }
    this.broadcast();
  }

  seatOf(playerId) {
    for (const s of this.seats.values()) if (s.playerId === playerId) return s;
    return null;
  }

  charInfo(id) {
    return this.sc.characters.find((c) => c.id === id);
  }

  roomCell(roomId) {
    return this.sc.rooms[roomId].cell;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  clearTimers() {
    for (const t of Object.values(this.timers || {})) clearTimeout(t);
    this.timers = {};
    if (this.pending) this.clearPendingTimers();
  }

  resetToLobby() {
    this.clearTimers();
    this.phase = 'lobby';
    this.detectiveId = null;
    this.variant = null;
    this.murderers = [];
    this.seats = new Map(
      this.sc.characters.map((c) => [c.id, { id: c.id, playerId: null, accused: false, usedSecret: false, confessed: false, answers: 0 }]),
    );
    this.offer = null;
    this.cinematic = null;
    this.briefing = null;
    this.clock = null;
    this.strikes = 0;
    this.detLoc = 'foyer';
    this.detArriveAt = 0;
    this.pending = null;
    this.logs = new Map(); // playerId -> entries
    this.calls = [];
    this.whispers = [];
    this.lastWhisperToast = 0;
    this.donut = null;
    this.result = null;
    this.seq = 0;
    // Drop anyone who left during the last game.
    for (const p of [...this.players.values()]) if (!p.connected && p.timers && !p.timers.lobby) {
      p.timers.lobby = setTimeout(() => this.removePlayer(p.id), T.LOBBY_GRACE);
    }
  }

  start(byId) {
    if (this.phase !== 'lobby') return 'Game already started.';
    if (byId !== this.hostId) return 'Only the host can start.';
    const humans = [...this.players.values()];
    if (humans.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players.`;
    if (humans.length > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players.`;
    this.phase = 'offer';
    this.offer = { order: shuffle(humans.map((p) => p.id)), idx: -1, endsAt: 0 };
    this.nextOffer();
    return null;
  }

  nextOffer() {
    const o = this.offer;
    o.idx++;
    // Skip players who have since left.
    while (o.idx < o.order.length && !this.players.has(o.order[o.idx])) o.idx++;
    if (o.idx >= o.order.length) {
      // Everyone declined: the last one offered gets it.
      const last = [...o.order].reverse().find((id) => this.players.has(id));
      return this.assignDetective(last);
    }
    o.endsAt = Date.now() + T.OFFER;
    clearTimeout(this.timers.offer);
    this.timers.offer = setTimeout(() => this.offerReply(o.order[o.idx], false), T.OFFER);
    this.broadcast();
  }

  offerReply(playerId, accept) {
    if (this.phase !== 'offer') return;
    const o = this.offer;
    if (o.order[o.idx] !== playerId) return;
    clearTimeout(this.timers.offer);
    const isLast = o.order.slice(o.idx + 1).every((id) => !this.players.has(id));
    if (accept || isLast) this.assignDetective(playerId);
    else this.nextOffer();
  }

  assignDetective(playerId) {
    this.detectiveId = playerId;
    this.offer = null;
    // Deal seats only now, so a quick decline can't hint at a murder card.
    const suspects = shuffle([...this.players.keys()].filter((id) => id !== playerId));
    this.variant = suspects.length >= 2 ? '2M' : '1M';
    this.murderers = this.sc.murderers[this.variant].slice();
    const others = shuffle(this.sc.characters.map((c) => c.id).filter((id) => !this.murderers.includes(id)));
    const order = [...this.murderers, ...others];
    suspects.forEach((pid, i) => {
      this.seats.get(order[i]).playerId = pid;
    });
    for (const p of this.players.values()) this.logs.set(p.id, []);
    this.phase = 'cinematic';
    this.cinematic = { startAt: Date.now() + 1500, skips: new Set() };
    this.timers.cinematic = setTimeout(() => this.startBriefing(), T.CINEMATIC + 1500);
    this.broadcast();
  }

  skipCinematic(playerId) {
    if (this.phase !== 'cinematic') return;
    this.cinematic.skips.add(playerId);
    this.checkSkip();
    this.broadcast();
  }

  checkSkip() {
    if (this.phase !== 'cinematic') return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length && connected.every((p) => this.cinematic.skips.has(p.id))) this.startBriefing();
  }

  startBriefing() {
    if (this.phase !== 'cinematic') return;
    clearTimeout(this.timers.cinematic);
    this.phase = 'briefing';
    this.briefing = { endsAt: Date.now() + T.BRIEFING };
    this.addCall('opening');
    this.timers.briefing = setTimeout(() => this.beginInvestigation(this.detectiveId), T.BRIEFING);
    this.broadcast();
  }

  beginInvestigation(byId) {
    if (this.phase !== 'briefing' || byId !== this.detectiveId) return;
    clearTimeout(this.timers.briefing);
    this.phase = 'investigation';
    this.setClock(T.CLOCK_START);
    if (this.variant === '1M') this.scheduleFakeWhisper();
    if (this.donut) {
      // Detective is away right as the clock starts: pause it straight away.
      this.pauseClock();
    }
    this.broadcast();
  }

  // ───────────────────────────── clock ─────────────────────────────

  setClock(ms) {
    clearTimeout(this.timers.clock);
    this.clock = { remaining: ms, endsAt: Date.now() + ms, paused: false };
    this.timers.clock = setTimeout(() => this.finish('timeout'), ms);
  }

  clockLeft() {
    if (!this.clock) return 0;
    return this.clock.paused ? this.clock.remaining : Math.max(0, this.clock.endsAt - Date.now());
  }

  pauseClock() {
    if (!this.clock || this.clock.paused) return;
    this.clock.remaining = this.clockLeft();
    this.clock.paused = true;
    clearTimeout(this.timers.clock);
  }

  resumeClock() {
    if (!this.clock || !this.clock.paused) return;
    this.setClock(this.clock.remaining);
  }

  startDonut() {
    if (this.donut) return;
    this.donut = { endsAt: Date.now() + T.DETECTIVE_GRACE };
    if (this.phase === 'investigation') this.pauseClock();
    this.timers.donut = setTimeout(() => this.finish('dropped'), T.DETECTIVE_GRACE);
    this.toastAll('The detective stepped out for a donut. 🍩');
  }

  endDonut() {
    clearTimeout(this.timers.donut);
    this.donut = null;
    if (this.phase === 'investigation') this.resumeClock();
    this.toastAll('The detective is back (with crumbs).');
  }

  // ───────────────────────────── investigation ─────────────────────────────

  goTo(byId, roomId) {
    if (this.phase !== 'investigation' || byId !== this.detectiveId) return;
    if (!this.sc.rooms[roomId] || roomId === this.detLoc) return;
    const from = this.roomCell(this.detLoc);
    const to = this.roomCell(roomId);
    const steps = Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
    const prev = this.detLoc;
    this.detLoc = roomId;
    this.detArriveAt = Date.now() + steps * T.WALK_PER_CELL;
    this.fxAll({ type: 'moved', from: prev, to: roomId, arriveAt: this.detArriveAt });
    const seat = [...this.seats.values()].find((s) => this.charInfo(s.id).room === roomId);
    if (seat && seat.playerId && !seat.accused) {
      const p = this.players.get(seat.playerId);
      const delay = Math.max(0, this.detArriveAt - Date.now());
      this.timers.knock = setTimeout(() => this.fx(p, { type: 'toast', text: 'The detective is here.', tone: 'detective' }), delay);
    }
    this.broadcast();
  }

  suspectInRoom(roomId) {
    return [...this.seats.values()].find((s) => this.charInfo(s.id).room === roomId) || null;
  }

  ask(byId, q) {
    if (this.phase !== 'investigation' || byId !== this.detectiveId || this.donut) return;
    if (this.pending && !this.pending.resolved) return;
    if (!Number.isInteger(q) || q < 0 || q >= this.sc.questions.length) return;
    if (Date.now() < this.detArriveAt - 100) return;
    const seat = this.suspectInRoom(this.detLoc);
    if (!seat || seat.accused) return;
    const owner = seat.playerId ? this.players.get(seat.playerId) : null;
    const now = Date.now();
    this.pending = {
      id: ++this.seq,
      charId: seat.id,
      q,
      askedAt: now,
      deadline: now + T.ANSWER,
      human: !!(owner && owner.connected),
      resolved: false,
      timers: {},
    };
    this.pending.timers.deadline = setTimeout(() => this.resolve(seat, null), T.ANSWER);
    if (!this.pending.human) this.scheduleAutoAnswer(seat, false);
    this.fxAll({ type: 'asked', charId: seat.id, q });
    this.broadcast();
  }

  /** Options for a seat's current question: 3 lines (+ confess for humans). */
  optionsFor(seat, q) {
    const set = this.dialogueFor(seat.id)[q];
    return set.map((o) => {
      const { star, tag } = parseTags(o.tags);
      const line = typeof o.line === 'string' ? o.line : o.line[this.variant];
      return { line, tags: tag, star };
    });
  }

  dialogueFor(charId) {
    const d = this.sc.dialogue[charId];
    return Array.isArray(d) ? d : d[this.variant];
  }

  scheduleAutoAnswer(seat, autopilot) {
    const p = this.pending;
    const isMurderer = this.murderers.includes(seat.id);
    // Real NPCs sometimes freeze up; autopilot seats behave the same way so they still seem human.
    if (!autopilot && Math.random() < T.NPC_TIMEOUT_CHANCE) return; // let the deadline produce "…uh…"
    const at = p.askedAt + rand(T.NPC_MIN, T.NPC_MAX);
    const delay = Math.max(300, Math.min(at, p.deadline - 200) - Date.now());
    clearTimeout(p.timers.auto);
    p.timers.auto = setTimeout(() => {
      const opts = this.optionsFor(seat, p.q);
      let idx = opts.findIndex((o) => o.star);
      if (isMurderer || idx < 0) idx = opts.findIndex((o) => o.tags.includes('L'));
      if (idx < 0) idx = opts.findIndex((o) => o.tags.includes('D'));
      if (idx < 0) idx = 0;
      this.resolve(seat, idx);
    }, delay);
  }

  answer(byId, choice) {
    const p = this.pending;
    if (!p || p.resolved || !p.human) return;
    const seat = this.seats.get(p.charId);
    if (seat.playerId !== byId) return;
    if (!(choice === 'confess' || (Number.isInteger(choice) && choice >= 0 && choice < 3))) return;
    if (p.chosen !== undefined) return;
    p.chosen = choice;
    clearTimeout(p.timers.deadline);
    // Hold fast answers a little so speed doesn't give away a human.
    const wait = Math.max(0, p.askedAt + T.HUMAN_MIN - Date.now());
    p.timers.hold = setTimeout(() => this.resolve(seat, choice), wait);
    this.broadcast();
  }

  clearPendingTimers() {
    for (const t of Object.values(this.pending.timers)) clearTimeout(t);
  }

  resolve(seat, choice) {
    const p = this.pending;
    if (!p || p.resolved || p.charId !== seat.id) return;
    this.clearPendingTimers();
    p.resolved = true;
    let line;
    let kind = 'answer';
    if (choice === null) {
      line = this.sc.timeout;
      kind = 'timeout';
    } else if (choice === 'confess') {
      line = this.sc.confess;
      kind = 'confess';
      seat.confessed = true;
    } else {
      const opt = this.optionsFor(seat, p.q)[choice];
      line = opt.line;
      if (opt.tags.includes('S')) seat.usedSecret = true;
    }
    seat.answers++;
    const charRoom = this.roomCell(this.charInfo(seat.id).room);
    for (const pl of this.players.values()) {
      let text;
      let full = true;
      if (pl.id === this.detectiveId || pl.id === seat.playerId) text = plain(line);
      else {
        const mine = this.seatOf(pl.id);
        if (!mine || mine.accused) text = plain(line);
        else {
          const ratio = hearingRatio(this.roomCell(this.charInfo(mine.id).room), charRoom);
          text = maskLine(line, ratio);
          full = false;
        }
      }
      const entry = { id: p.id, at: Date.now(), charId: seat.id, q: p.q, text, full, kind };
      this.log(pl, entry);
      this.fx(pl, { type: 'answered', ...entry });
    }
    this.broadcast();
  }

  log(player, entry) {
    if (!this.logs.has(player.id)) this.logs.set(player.id, []);
    const arr = this.logs.get(player.id);
    arr.push(entry);
    if (arr.length > 120) arr.shift();
  }

  accuse(byId, charId) {
    if (this.phase !== 'investigation' || byId !== this.detectiveId || this.donut) return;
    const seat = this.seats.get(charId);
    if (!seat || seat.accused) return;
    if (this.charInfo(charId).room !== this.detLoc) return;
    if (this.pending && !this.pending.resolved) {
      this.clearPendingTimers();
      this.pending.resolved = true;
    }
    seat.accused = true;
    const name = this.charInfo(charId).name;
    const guilty = this.murderers.includes(charId);
    const entry = { id: ++this.seq, at: Date.now(), charId, kind: 'accused', text: `${name} was taken to the station.` };
    for (const pl of this.players.values()) this.log(pl, entry);
    this.fxAll({ type: 'accused', charId });
    if (seat.playerId) {
      this.fx(this.players.get(seat.playerId), {
        type: 'toast',
        tone: 'station',
        text: "You've been taken to the station. You can hear everything clearly now.",
      });
    }
    if (guilty) {
      if (this.murderers.every((id) => this.seats.get(id).accused)) return this.finish('detective');
      this.setClock(T.CLOCK_RIGHT);
      this.addCall('correct', { name });
    } else {
      this.strikes++;
      if (this.strikes >= 2) return this.finish('strikes');
      this.setClock(T.CLOCK_WRONG);
      this.addCall('wrong', { name });
    }
    this.broadcast();
  }

  addCall(key, vars = {}) {
    const lines = this.sc.calls[key].map((l) => fill(l, vars));
    const call = { id: ++this.seq, key, lines, at: Date.now() };
    this.calls.push(call);
    const det = this.players.get(this.detectiveId);
    if (det) this.fx(det, { type: 'call', call });
  }

  // ───────────────────────────── whispers ─────────────────────────────

  canWhisper(playerId) {
    if (this.variant !== '2M' || !['briefing', 'investigation'].includes(this.phase)) return false;
    const seat = this.seatOf(playerId);
    return !!seat && this.murderers.includes(seat.id) && !seat.accused;
  }

  whisper(byId, raw) {
    if (!this.canWhisper(byId)) return;
    const pl = this.players.get(byId);
    const now = Date.now();
    if (pl.lastWhisper && now - pl.lastWhisper < 600) return;
    pl.lastWhisper = now;
    const text = cleanChat(raw);
    if (!text) return;
    const seat = this.seatOf(byId);
    const msg = { id: ++this.seq, from: seat.id, text, at: now };
    this.whispers.push(msg);
    if (this.whispers.length > 100) this.whispers.shift();
    for (const id of this.murderers) {
      const s = this.seats.get(id);
      if (s.playerId) this.fx(this.players.get(s.playerId), { type: 'whisper', msg });
    }
    if (this.phase === 'investigation') this.whisperToast();
    this.broadcast();
  }

  whisperToast() {
    const now = Date.now();
    if (now - this.lastWhisperToast < T.WHISPER_TOAST_GAP) return;
    this.lastWhisperToast = now;
    const det = this.players.get(this.detectiveId);
    if (det) this.fx(det, { type: 'toast', tone: 'whisper', text: 'You hear faint whispering somewhere in the mansion…' });
  }

  scheduleFakeWhisper() {
    clearTimeout(this.timers.fake);
    this.timers.fake = setTimeout(() => {
      if (this.phase !== 'investigation') return;
      if (!this.donut) this.whisperToast();
      this.scheduleFakeWhisper();
    }, rand(T.FAKE_WHISPER_MIN, T.FAKE_WHISPER_MAX));
  }

  // ───────────────────────────── ending ─────────────────────────────

  finish(outcome) {
    if (this.phase === 'reveal') return;
    const wasPlaying = ['cinematic', 'briefing', 'investigation'].includes(this.phase);
    if (!wasPlaying) return;
    this.pauseClock();
    const remaining = this.clockLeft();
    this.clearTimers();
    this.donut = null;
    if (outcome === 'detective') this.addCall('win');
    else if (outcome === 'strikes') this.addCall('loseStrikes');
    else if (outcome === 'timeout') this.addCall('loseTime');
    else if (outcome === 'dropped') this.addCall('dropped');
    const detWon = outcome === 'detective';
    const det = this.players.get(this.detectiveId);
    const chars = this.sc.characters.map((c) => {
      const s = this.seats.get(c.id);
      const pl = s.playerId ? this.players.get(s.playerId) : null;
      const murderer = this.murderers.includes(c.id);
      const badges = [];
      let won;
      if (murderer) {
        won = !detWon;
        if (won && !s.accused) badges.push('Perfect Crime');
      } else {
        won = detWon;
        if (pl && won && !s.usedSecret) badges.push('Secret Kept');
      }
      return {
        id: c.id,
        human: !!pl,
        playerName: pl ? pl.name : null,
        murderer,
        accused: s.accused,
        usedSecret: s.usedSecret,
        confessed: s.confessed,
        won: pl ? won : null,
        badges,
      };
    });
    this.result = {
      outcome,
      variant: this.variant,
      murderers: this.murderers,
      strikes: this.strikes,
      remaining,
      detective: {
        name: det ? det.name : '???',
        won: detWon,
        badges: detWon && this.strikes === 0 ? ['Clean Case'] : [],
      },
      chars,
      timeline: this.sc.timeline.filter((t) => !t.v || t.v === this.variant),
      finalCall: this.calls[this.calls.length - 1]?.lines ?? [],
    };
    this.phase = 'reveal';
    this.fxAll({ type: 'reveal' });
    this.broadcast();
  }

  playAgain(byId) {
    if (this.phase !== 'reveal' || byId !== this.hostId) return;
    for (const p of [...this.players.values()]) if (!p.connected) this.removePlayer(p.id);
    if (this.players.size === 0) return;
    this.resetToLobby();
    this.broadcast();
  }

  // ───────────────────────────── messaging ─────────────────────────────

  fx(player, data) {
    if (player && player.socket) player.socket.emit('fx', data);
  }

  fxAll(data) {
    for (const p of this.players.values()) this.fx(p, data);
  }

  toastAll(text) {
    this.fxAll({ type: 'toast', text });
  }

  broadcast() {
    for (const p of this.players.values()) if (p.socket) p.socket.emit('view', this.viewFor(p));
  }

  /** Everything this player is allowed to see — never another player's seat. */
  viewFor(p) {
    const now = Date.now();
    const seat = this.seatOf(p.id);
    const isDet = p.id === this.detectiveId;
    const v = {
      now,
      code: this.code,
      phase: this.phase,
      you: { id: p.id, name: p.name, isHost: p.id === this.hostId, role: isDet ? 'detective' : seat ? 'suspect' : null, charId: seat ? seat.id : null },
      players: [...this.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((x) => ({ id: x.id, name: x.name, connected: x.connected, isHost: x.id === this.hostId, isDetective: x.id === this.detectiveId })),
      limits: { min: MIN_PLAYERS, max: MAX_PLAYERS },
      chars: this.sc.characters.map((c) => ({ id: c.id, accused: this.seats.get(c.id).accused })),
    };
    if (this.phase === 'offer') {
      const o = this.offer;
      v.offer = { endsAt: o.endsAt, you: o.order[o.idx] === p.id, round: o.idx + 1, of: o.order.length };
    }
    if (this.phase === 'cinematic') {
      const connected = [...this.players.values()].filter((x) => x.connected).length;
      v.cinematic = { startAt: this.cinematic.startAt, skips: this.cinematic.skips.size, needed: connected, youSkipped: this.cinematic.skips.has(p.id) };
    }
    if (['briefing', 'investigation', 'reveal', 'cinematic'].includes(this.phase)) {
      v.detective = { name: this.players.get(this.detectiveId)?.name ?? '???', loc: this.detLoc, arriveAt: this.detArriveAt };
      v.log = this.logs.get(p.id) || [];
      if (seat) {
        const card = this.sc.cards[seat.id];
        v.card = card.role ? card : card[this.variant];
        v.card = { ...v.card, evening: v.card.evening.filter((e) => !e.v || e.v === this.variant) };
        v.accused = seat.accused;
        if (this.murderers.includes(seat.id) && this.variant === '2M') {
          v.partner = this.murderers.find((id) => id !== seat.id) || null;
          v.whisper = { enabled: this.canWhisper(p.id), log: this.whispers };
        }
      }
      if (isDet) v.calls = this.calls;
      v.clues = isDet ? this.sc.clues : undefined;
    }
    if (this.phase === 'briefing') v.briefing = { endsAt: this.briefing.endsAt };
    if (this.phase === 'investigation' || this.phase === 'reveal') {
      v.clock = { left: this.clockLeft(), paused: !this.clock || this.clock.paused, strikes: this.strikes };
    }
    if (this.donut) v.donut = { endsAt: this.donut.endsAt };
    if (this.pending && !this.pending.resolved && this.phase === 'investigation') {
      const pd = this.pending;
      v.pending = { id: pd.id, charId: pd.charId, q: pd.q, askedAt: pd.askedAt, deadline: pd.deadline };
      if (seat && seat.id === pd.charId && pd.human) {
        v.pending.options = this.optionsFor(seat, pd.q).map((o) => ({ line: plain(o.line), tags: o.tags }));
        v.pending.chosen = pd.chosen ?? null;
      }
    }
    if (this.phase === 'reveal') v.result = this.result;
    return v;
  }
}
