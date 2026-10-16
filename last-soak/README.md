# 🛁 The Last Soak

A cutesy isometric multiplayer whodunit for 2–8 players. One player is **Inspector Waffles** 🐶, who has
5 minutes to work out which of 8 animal suspects (some human, the rest NPCs) drowned **Mr. Dan** the
capybara in his own pond.

Built from `The Last Soak — Game Design Doc`: Node + Express + Socket.IO on the server, three.js + Vite on
the client. The art is all procedural toon-shaded primitives (no image assets): a floating dollhouse
diorama of Mossbottom Manor seen through an orthographic isometric camera.

## Run it

```bash
cd last-soak
npm install
npm run dev     # Vite on http://localhost:5173 + game server on :3001 (auto-restart)
npm test        # end-to-end server test (simulated 3-player and 2-player games)

npm run build   # bundle the client into dist/
npm start       # serve dist/ + Socket.IO on http://localhost:3000 (PORT overrides)
```

Open the page in several browser windows (or private windows: each one needs its own localStorage)
to play against yourself. `?fps=15` caps the frame rate on slow machines.

## Deploy to Render

The repo's root `render.yaml` has a `the-last-soak` web service with `rootDir: last-soak`
(build `npm install && npm run build`, start `npm start`, health check `/healthz`). Rooms live in memory,
so a restart or redeploy ends running games; players then see "The game was interrupted".

## What's in this first build

| Doc section | Status |
| --- | --- |
| Lobby, room codes, invite links, host start (2–8 players) | ✅ |
| Host picks roles in the lobby: lead detective, assistant detective, up to 2 murderers (or Random) | ✅ |
| Assistant detective (Constable Biscuit): follows the lead, asks questions, hears answers in full; only the lead walks and ACCUSEs | ✅ |
| Detective radio: the two detectives chat, every player can read it | ✅ |
| Case briefing card: why nobody liked Mr. Dan, who the detectives are, your own role | ✅ |
| Detective offer (10 s, random order, decline passes, last one is assigned), seats dealt after accepting | ✅ |
| 1-murderer (2 players) and 2-murderer (3+ players) versions, variant cards and lines | ✅ |
| 73 s opening cinematic from one server start time, all-players-skip, equal reaction shots, grudge cards, fade-to-black death scene, police car up the drive | ✅ |
| Story cards, opening phone call with the pond clues | ✅ |
| 3×3 isometric manor, click a room to walk in, clock keeps running | ✅ |
| 5 questions, 3 answers + Confess, tags visible only to the suspect, 8 s timer, "…uh…" timeout | ✅ |
| NPCs pick ★ lines after 2–6 s and freeze ~1 in 10; human answers held ≥ 2 s | ✅ |
| Server-side snippet masking (65 % / 50 % / 35 % / 100 % at the station), {key words} always heard | ✅ |
| ACCUSE with confirmation, strikes, clock resets (2:00 / 3:00), station spectators | ✅ |
| Whisper chat for 2 murderers (profanity filter, ≤ 1 detective toast / 20 s), fake toasts in 1-murderer games | ✅ |
| Reconnection: seat tokens, auto-rejoin, state snapshot, one tab per seat, suspect autopilot, detective donut pause, host handover, lobby seat hold | ✅ |
| Reveal: outcome, every role, human/NPC, secrets kept, badges, true timeline, play again | ✅ |
| Rotating culprits, Redis persistence | ⏳ (open issues in the doc) |

## Layout

```
server/index.js     Express + Socket.IO, room codes, seat tokens, public scenario endpoint
server/game.js      Authoritative state machine (offer → cinematic → briefing → investigation → reveal)
server/text.js      Snippet masking, profanity filter
shared/layout.js    Grid, hearing ratios, hallway paths (server + client)
scenarios/          the-last-soak.json: characters, cards, dialogue, calls, timeline, cinematic
client/scene/       three.js diorama: toon materials, manor + garden, animal characters, camera, portraits
client/cinematic.js Scripted opening cinematic
client/main.js      Socket client + HTML overlays (lobby, HUD, panels, phone, story cards, reveal)
test/smoke.js       End-to-end server test
```

Only a public slice of the scenario (`/api/scenario`: names, rooms, questions, cinematic captions)
reaches every browser. Story cards, answer options and masked snippets are sent per player, so the
detective's browser never learns which seats are human or who the murderers are.
