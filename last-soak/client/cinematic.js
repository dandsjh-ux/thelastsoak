// The 60-second opening cinematic, played locally from a shared server start time.
// Built from the real manor scene with a scripted camera + HTML caption cards.
import * as THREE from 'three';
import { $, el, esc } from './ui/dom.js';
import { sfx } from './ui/sfx.js';
import { FLOOR_Y, ROAD } from './scene/manor.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const REACT = { clementine: '😤', barnaby: '💢', odette: '😰', pierre: '🍰?!', lulu: '😭', mochi: '💤', gus: '😬', hazel: '📸' };
const FAKE_SNIPS = ['…his {tea}…', '…{pond}… …kitchen.', '…the {garden door}…', '{cards}… …eleven.', '…{splash}…', '…{white} …', '…the {will}…', '…{pawprints}…'];
const END = 73; // keep in sync with T.CINEMATIC in server/game.js
const GRUDGE = { first: 1.0, every: 1.25 }; // one card per suspect: why they were angry with Mr. Dan
// Death scene beats, in seconds from the start of the 'found' shot.
const FOUND = { reveal: 1.0, walk: 1.3, walkMs: 2400, shock: 3.9, pullBack: 6.4 };

export class Cinematic {
  constructor(world, anchors, meta, portraits) {
    this.world = world;
    this.anchors = anchors;
    this.meta = meta;
    this.portraits = portraits;
    this.shots = meta.cinematic;
    this.running = false;
  }

  play(startLocal, onEnd) {
    this.startLocal = startLocal;
    this.onEnd = onEnd;
    this.running = true;
    this.cur = -1;
    this.fired = new Set();
    $('#cine').classList.remove('hidden');
    $('#cinePortraits').innerHTML = '';
    this.reset();
    this.world.onFrame = () => this.tick();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.world.onFrame = null;
    $('#cine').classList.add('hidden');
    this.reset();
    this.restore();
  }

  reset() {
    const w = this.world;
    w.tweens = [];
    for (const id of Object.keys(w.critters)) w.returnHome(id);
    this.anchors.clearAll();
    w.dan.group.visible = false;
    w.dan.setDizzy(false);
    w.dan.group.rotation.set(0, Math.PI / 4, 0);
    w.detective.group.visible = false;
    w.assistant.group.visible = false;
    w.policeCar.visible = false;
    for (const r of Object.values(w.rooms)) r.dark.material.opacity = 0;
    w.critters.mochi.setShock(false);
    this.fade(false, true);
    this.lantern?.removeFromParent();
    ['#cineClock', '#cineCard', '#cineTitle'].forEach((s) => $(s).classList.add('hidden'));
    $('#cineGrudges').innerHTML = '';
  }

  restore() {
    const w = this.world;
    w.detective.group.visible = true;
    w.assistant.group.visible = w.hasAssistant;
    w.placeDetective('foyer');
    w.policeCar.visible = true;
    w.parkCar();
    w.dan.group.visible = false;
  }

  /** Fade the screen to black (on) or back (off). */
  fade(on, instant = false) {
    const f = $('#cineFade');
    f.classList.toggle('instant', instant);
    f.classList.toggle('on', on);
  }

  /** How long the current shot lasts, in seconds. */
  shotLength(idx) {
    return (this.shots[idx + 1]?.at ?? END) - this.shots[idx].at;
  }

  once(key, fn) {
    if (this.fired.has(key)) return;
    this.fired.add(key);
    fn();
  }

  tick() {
    if (!this.running) return;
    const t = (performance.now() - this.startLocal) / 1000;
    if (t >= END) {
      this.stop();
      this.onEnd?.();
      return;
    }
    let idx = 0;
    for (let i = 0; i < this.shots.length; i++) if (t >= this.shots[i].at) idx = i;
    if (t < 0) return;
    if (idx !== this.cur) {
      this.cur = idx;
      const shot = this.shots[idx];
      const cap = $('#cineCaption');
      cap.style.opacity = shot.title ? 0 : 1;
      cap.textContent = shot.caption;
      const clock = $('#cineClock');
      clock.classList.toggle('hidden', !shot.clock);
      clock.textContent = shot.clock ? `🕰️ ${shot.clock}` : '';
      const card = $('#cineCard');
      card.classList.toggle('hidden', !shot.card);
      card.textContent = shot.card || '';
      $('#cineTitle').classList.toggle('hidden', !shot.title);
      this.enter(shot.shot, t - shot.at);
    }
    this.during(this.shots[idx].shot, t - this.shots[idx].at, t, this.shotLength(idx));
  }

  /** Set up the scene for a shot (also used when joining mid-cinematic). */
  enter(name, dt) {
    const w = this.world;
    const g = w.manor.garden;
    const foyer = w.rooms.foyer.center;
    const dan = w.dan;
    switch (name) {
      case 'night':
        w.focus(V(2.5, 0, 5), 0.85, true);
        w.focus(V(1, 0, 3), 1.1);
        dan.group.visible = true;
        dan.group.position.copy(foyer).add(V(0, 0, 0.5));
        dan.parts.headGroup.children.forEach((c) => (c.visible = true));
        break;
      case 'toast':
        dan.group.visible = true;
        dan.group.position.copy(foyer).add(V(0, 0, 0.5));
        dan.group.rotation.y = Math.PI / 4;
        w.focus(foyer.clone().add(V(0, 1, 0)), 2.6, dt > 0.5);
        break;
      case 'grudges':
        $('#cineGrudges').innerHTML = '';
        dan.group.visible = false;
        w.focus(V(1, 0, 3), 1.05, dt > 0.5);
        break;
      case 'soak': {
        $('#cineGrudges').innerHTML = '';
        dan.group.visible = true;
        dan.setDizzy(false);
        const from = V(0, FLOOR_Y - 0.26, 10.2);
        const to = g.rockPos.clone().add(V(-0.2, 0.05, 0.4));
        dan.group.position.copy(from);
        w.tween(dan, from, to, Math.max(200, 3000 - dt * 1000));
        w.focus(V(0.5, 0, 13.5), 2.0, dt > 0.5);
        break;
      }
      case 'found': {
        // Black first (the fade began at the end of the soak), then the reveal: Mr. Dan floating, Mochi arriving.
        this.fade(dt < FOUND.reveal, dt < FOUND.reveal);
        dan.group.visible = true;
        w.tweens = w.tweens.filter((x) => x.critter !== dan);
        dan.setDizzy(true);
        dan.group.position.copy(g.pondCenter).add(V(-0.8, -0.3, 0.2));
        dan.group.rotation.set(-Math.PI / 2 + 0.25, 0, 0.3);
        const mochi = w.critters.mochi;
        mochi.setShock(false);
        this.mochiFrom = V(0, FLOOR_Y - 0.26, 9.8);
        this.mochiTo = V(-0.6, 0, 12.3);
        mochi.group.position.copy(this.mochiFrom);
        mochi.group.rotation.y = Math.PI;
        this.lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshToonMaterial({ color: '#ffd27a', emissive: '#ffd27a', emissiveIntensity: 2 }));
        this.lantern.position.set(0.5, 0.9, 0.2);
        mochi.group.add(this.lantern);
        w.focus(V(-0.3, 0, 14.0), 2.3, true);
        break;
      }
      case 'lockdown':
        this.fade(false, true);
        this.lantern?.removeFromParent();
        w.critters.mochi.setShock(false);
        w.returnHome('mochi');
        w.focus(V(1.5, 0, 3), 1.15, dt > 0.5);
        for (const r of Object.values(w.rooms)) if (r.id !== 'foyer') r.dark.material.opacity = 0.72;
        break;
      case 'police':
        for (const r of Object.values(w.rooms)) r.dark.material.opacity = 0;
        this.showPortraits(true);
        // The car starts hidden inside the hill's tunnel and drives west along the road to the porch.
        this.carFrom = V(ROAD.from, 0, ROAD.z);
        this.carTo = V(ROAD.park, 0, ROAD.z);
        w.policeCar.visible = true;
        w.policeCar.position.copy(this.carFrom);
        w.policeCar.rotation.y = Math.PI;
        w.focus(V(13.4, 0, 0.6), 2.0, dt > 0.5);
        break;
      case 'snippets':
        $('#cinePortraits').innerHTML = '';
        w.detective.group.visible = true;
        w.assistant.group.visible = w.hasAssistant;
        w.tweens = w.tweens.filter((x) => x.critter !== w.detective && x.critter !== w.assistant);
        w.placeDetective('foyer');
        w.focus(V(0.5, 0, 0.5), 1.25, dt > 0.5);
        break;
      case 'accuse':
        this.anchors.clearAll();
        w.detective.group.visible = true;
        w.assistant.group.visible = w.hasAssistant;
        w.placeDetective('foyer');
        w.focus(w.rooms.foyer.center.clone().add(V(0, 1, 0)), 2.4, dt > 0.5);
        $('#cineClock').classList.remove('hidden');
        $('#cineClock').textContent = '⏱ 5:00';
        $('#cineCard').classList.remove('hidden');
        $('#cineCard').innerHTML = '<span class="accuse-demo">Rule 3 · <span class="btn accuse">🚨 ACCUSE</span></span>';
        break;
      case 'title':
        dan.group.visible = true;
        dan.setDizzy(true);
        dan.group.position.copy(g.pondCenter).add(V(-0.8, -0.3, 0.2));
        dan.group.rotation.set(-Math.PI / 2 + 0.25, 0, 0.3);
        w.focus(V(0, 0, 15.5), 2.0, dt > 0.5);
        this.anchors.clearAll();
        break;
    }
  }

  during(name, dt, t, len) {
    const w = this.world;
    const a = this.anchors;
    switch (name) {
      case 'toast': {
        const lines = ['📖 My cookbook!', '♨️ A grand spa!', '📜 And a new will!'];
        lines.forEach((l, i) => {
          if (dt > 0.3 + i * 1.0) this.once(`toast${i}`, () => {
            a.say('dan', esc(l), 'shout', 1000);
            w.dan.hop(400);
            sfx.pop();
          });
        });
        // equal reaction shots: 8 guests, ~0.8s each, starting at +3.2s
        const ids = this.meta.characters.map((c) => c.id);
        const k = Math.floor((dt - 3.2) / 0.85);
        if (k >= 0 && k < ids.length) this.once(`react${k}`, () => {
          const id = ids[k];
          w.focus(w.critters[id].group.position.clone().add(V(0.3, 1, 0.3)), 2.8);
          w.critters[id].hop(450);
          a.say(id, REACT[id], 'shout', 800);
          sfx.click();
        });
        break;
      }
      case 'grudges':
        (this.meta.grudges?.list ?? []).forEach((gr, i) => {
          if (dt > GRUDGE.first + i * GRUDGE.every) this.once(`grudge${i}`, () => this.addGrudge(gr));
        });
        break;
      case 'soak':
        if (dt > 3.1) this.once('sink', () => {
          w.dan.group.position.y = -0.15;
          a.say('dan', '♨️ ahhh…', '', 2400);
        });
        if (dt > len - 0.8) this.once('fadeOut', () => {
          a.clear('dan');
          this.fade(true);
        });
        break;
      case 'found': {
        const mochi = w.critters.mochi;
        if (dt > FOUND.reveal) this.once('fadeIn', () => this.fade(false));
        if (dt > FOUND.walk) this.once('walk', () => {
          const left = FOUND.walkMs - (dt - FOUND.walk) * 1000;
          if (left > 150) w.tween(mochi, this.mochiFrom, this.mochiTo, left);
          else mochi.group.position.copy(this.mochiTo);
        });
        if (dt > FOUND.shock) this.once('shock', () => {
          // She sees him: snap to a close-up of her face.
          w.tweens = w.tweens.filter((x) => x.critter !== mochi);
          mochi.walking = false;
          mochi.group.position.copy(this.mochiTo);
          mochi.group.rotation.y = Math.PI / 4;
          mochi.setShock(true);
          mochi.hop(450);
          w.focus(this.mochiTo.clone().add(V(0.1, 1.5, 0.1)), 6.5);
          w.shake = 0.18;
          a.say('mochi', 'NYAAA!', 'shout', 3000);
          sfx.sting();
        });
        if (dt > FOUND.pullBack) this.once('pullBack', () => {
          // Pull back so Mochi and Mr. Dan share the frame.
          w.focus(V(-0.6, 0.6, 13.6), 3.0);
        });
        break;
      }
      case 'lockdown': {
        const ids = this.meta.characters.map((c) => c.id);
        ids.forEach((id, i) => {
          if (dt > 0.6 + i * 0.6) this.once(`slam${i}`, () => {
            const room = this.meta.characters.find((c) => c.id === id).room;
            w.rooms[room].dark.material.opacity = 0;
            w.shake = 0.35;
            sfx.slam();
            this.addPortrait(id);
          });
        });
        break;
      }
      case 'police': {
        const DRIVE = 2.6;
        const k = THREE.MathUtils.clamp((dt - 0.2) / DRIVE, 0, 1);
        const e = 1 - Math.pow(1 - k, 3); // ease out: brakes at the porch
        const car = w.policeCar;
        const before = car.position.x;
        car.position.lerpVectors(this.carFrom, this.carTo, e);
        car.rotation.y = Math.PI; // nose (+x in the model) points west, the way it drives
        const moved = Math.abs(car.position.x - before);
        for (const wh of car.userData.wheels) wh.rotation.y -= moved / 0.22;
        if (dt > 0.1) this.once('siren', () => sfx.siren());
        // Out of the driver's door (the side facing the camera), then up the road to the porch.
        const hopOut = (critter, side, porchX, porchZ) => {
          const from = V(ROAD.park - 0.2, 0, ROAD.z + side * 1.05);
          const to = V(ROAD.porch + porchX, 0, ROAD.z + porchZ);
          critter.group.visible = true;
          critter.group.position.copy(from);
          critter.hop(400);
          w.tween(critter, from, to, 1300, false, () => (critter.group.rotation.y = Math.PI / 4));
        };
        if (dt > DRIVE + 0.35) this.once('hopout', () => {
          hopOut(w.detective, 1, 0.6, 0.45);
          sfx.pop();
        });
        if (w.hasAssistant && dt > DRIVE + 0.6) this.once('hopoutA', () => hopOut(w.assistant, -1, 1.4, -0.55));
        if (dt > DRIVE + 1.8) this.once('shout', () => {
          w.detective.hop(500);
          a.say('waffles', 'Nobody leaves! 🐾', 'shout', 2400);
          if (w.hasAssistant) a.say('biscuit', 'Nobody! 🐾', 'shout', 2000);
          sfx.pop();
        });
        break;
      }
      case 'snippets': {
        const ids = this.meta.characters.map((c) => c.id);
        const k = Math.floor(dt / 0.75);
        this.once(`snip${k}`, () => {
          const id = ids[(k * 3) % ids.length];
          a.say(id, `<span class="snip">${FAKE_SNIPS[k % FAKE_SNIPS.length].replace(/\{([^}]*)\}/g, '<span class="kw">$1</span>')}</span>`, 'snip', 1400);
        });
        break;
      }
      case 'title':
        void t;
        break;
    }
  }

  showPortraits(all) {
    const box = $('#cinePortraits');
    if (all && box.children.length < 8) {
      box.innerHTML = '';
      this.meta.characters.forEach((c) => this.addPortrait(c.id));
    }
  }

  /** One suspect's reason to dislike Mr. Dan, in simple words, plus a hop and a cross face in the house. */
  addGrudge(gr) {
    const c = this.meta.characters.find((x) => x.id === gr.id);
    if (!c) return;
    const liked = gr.id === 'mochi';
    $('#cineGrudges').append(el(`<div class="grudge ${liked ? 'liked' : ''}"><img class="portrait sm" src="${this.portraits[gr.id]}" alt="" />
      <div><b>${esc(c.name)}</b> <small>${esc(c.title)}</small><span>${esc(gr.text)}</span></div></div>`));
    this.world.critters[gr.id].hop(450);
    this.anchors.say(gr.id, liked ? '🥺' : '😠', 'shout', 1200);
    sfx.click();
  }

  addPortrait(id) {
    const box = $('#cinePortraits');
    if (box.querySelector(`[data-id="${id}"]`)) return;
    box.append(el(`<img class="portrait sm" data-id="${id}" src="${this.portraits[id]}" alt="${id}" />`));
  }
}
