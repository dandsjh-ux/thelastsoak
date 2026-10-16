// The Last Soak - web server: Express serves the Vite build, Socket.IO runs the rooms.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Game, MAX_PLAYERS } from './game.js';
import { cleanName } from './text.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const scenario = JSON.parse(fs.readFileSync(path.join(root, 'scenarios/the-last-soak.json'), 'utf8'));

const games = new Map(); // code -> Game
const byToken = new Map(); // token -> { game, player }

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: games.size }));
// Public slice of the scenario only: no dialogue, cards, murderers or timeline ever reach the browser this way.
const publicScenario = (({ title, rooms, characters, questions, toast, opening, cinematic, victim, detective, assistant, boss, grudges }) => ({
  title, rooms, characters, questions, toast, opening, cinematic, victim, detective, assistant, boss, grudges,
}))(scenario);
app.get('/api/scenario', (_req, res) => res.json(publicScenario));

const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: 'index.html' }));
} else {
  app.get('/', (_req, res) => res.type('text').send('Client not built. Run `npm run build`, or `npm run dev` for the Vite dev server.'));
}

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000, cors: { origin: true } });

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (games.has(code));
  return code;
}

function createGame() {
  const code = newCode();
  const game = new Game(code, scenario, {
    onEmpty: (g) => {
      g.clearTimers();
      games.delete(g.code);
    },
    onRemoved: (_g, p) => byToken.delete(p.token),
  });
  games.set(code, game);
  return game;
}

// Rooms nobody has touched in a while are cleaned up.
setInterval(() => {
  const now = Date.now();
  for (const g of games.values()) {
    const anyone = [...g.players.values()].some((p) => p.connected);
    if (!anyone && now - g.lastActivity > 15 * 60_000) {
      g.clearTimers();
      for (const p of g.players.values()) byToken.delete(p.token);
      games.delete(g.code);
    }
  }
}, 60_000).unref();

const reply = (ack, data) => {
  if (typeof ack === 'function') ack(data);
};

io.on('connection', (socket) => {
  const ctx = () => {
    const id = socket.data.playerId;
    const game = socket.data.code && games.get(socket.data.code);
    if (!id || !game) return {};
    const player = game.players.get(id);
    return player ? { game, player } : {};
  };

  function seat(game, player, ack) {
    socket.data.playerId = player.id;
    socket.data.code = game.code;
    game.attach(player, socket);
    reply(ack, { ok: true, code: game.code, token: player.token });
  }

  socket.on('hello', ({ token } = {}, ack) => {
    const found = typeof token === 'string' && byToken.get(token);
    if (!found || !games.has(found.game.code)) return reply(ack, { ok: false, interrupted: !!token });
    seat(found.game, found.player, ack);
  });

  socket.on('create', ({ name } = {}, ack) => {
    const n = cleanName(name);
    if (!n) return reply(ack, { ok: false, error: 'Pick a name first.' });
    leaveCurrent();
    const game = createGame();
    const player = game.addPlayer(n);
    byToken.set(player.token, { game, player });
    seat(game, player, ack);
  });

  socket.on('join', ({ name, code } = {}, ack) => {
    const n = cleanName(name);
    if (!n) return reply(ack, { ok: false, error: 'Pick a name first.' });
    const game = games.get(String(code || '').toUpperCase().trim());
    if (!game) return reply(ack, { ok: false, error: 'No game with that code.' });
    if (game.phase !== 'lobby') return reply(ack, { ok: false, error: 'That game has already started.' });
    if (game.players.size >= MAX_PLAYERS) return reply(ack, { ok: false, error: 'That game is full (8 players).' });
    if ([...game.players.values()].some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      return reply(ack, { ok: false, error: 'Someone in that game already has that name.' });
    }
    leaveCurrent();
    const player = game.addPlayer(n);
    byToken.set(player.token, { game, player });
    seat(game, player, ack);
  });

  function leaveCurrent() {
    const { game, player } = ctx();
    if (!game) return;
    if (game.phase === 'lobby') game.removePlayer(player.id);
    else game.detach(player, socket);
    socket.data.playerId = null;
    socket.data.code = null;
  }

  socket.on('leave', (_d, ack) => {
    leaveCurrent();
    reply(ack, { ok: true });
  });

  const on = (event, fn) =>
    socket.on(event, (data, ack) => {
      const { game, player } = ctx();
      if (!game) return reply(ack, { ok: false, error: 'Not in a game.' });
      try {
        const err = fn(game, player, data || {});
        reply(ack, err ? { ok: false, error: err } : { ok: true });
      } catch (e) {
        console.error(`[${event}]`, e);
        reply(ack, { ok: false, error: 'Server error.' });
      }
    });

  on('setRole', (g, p, d) => g.setRole(p.id, String(d.playerId), String(d.role)));
  on('start', (g, p) => g.start(p.id));
  on('offerReply', (g, p, d) => g.offerReply(p.id, !!d.accept));
  on('skipCinematic', (g, p) => g.skipCinematic(p.id));
  on('beginInvestigation', (g, p) => g.beginInvestigation(p.id));
  on('goTo', (g, p, d) => g.goTo(p.id, String(d.room)));
  on('ask', (g, p, d) => g.ask(p.id, Number(d.q)));
  on('answer', (g, p, d) => g.answer(p.id, d.choice === 'confess' ? 'confess' : Number(d.choice)));
  on('accuse', (g, p, d) => g.accuse(p.id, String(d.charId)));
  on('whisper', (g, p, d) => g.whisper(p.id, d.text));
  on('radio', (g, p, d) => g.radioSay(p.id, d.text));
  on('playAgain', (g, p) => g.playAgain(p.id));

  socket.on('disconnect', () => {
    const { game, player } = ctx();
    if (game) game.detach(player, socket);
  });
});

server.listen(PORT, () => console.log(`The Last Soak listening on http://localhost:${PORT}`));

export { server, io };
