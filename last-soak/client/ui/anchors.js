// HTML name tags, room labels and speech bubbles pinned to 3D objects.
import * as THREE from 'three';
import { $, el, esc } from './dom.js';

export class Anchors {
  constructor(world, meta) {
    this.world = world;
    this.root = $('#anchors');
    this.tags = {};
    this.bubbles = {};
    this.timers = {};
    const all = { ...world.critters, dan: world.dan, waffles: world.detective, biscuit: world.assistant };
    this.objs = all;
    for (const [id, k] of Object.entries(all)) {
      const name = id === 'dan' ? meta.victim.name : id === 'waffles' ? 'Insp. Waffles' : id === 'biscuit' ? 'Const. Biscuit' : meta.characters.find((c) => c.id === id).name;
      const tag = el(`<div class="anchor"><div class="nametag">${esc(name)}</div></div>`);
      this.root.append(tag);
      world.anchor(tag, k.group, 2.05);
      this.tags[id] = tag.firstElementChild;
      const b = el('<div class="anchor"><div class="bubble-wrap"></div></div>');
      b.style.display = 'none';
      this.root.append(b);
      this.bubbles[id] = b;
    }
    for (const r of Object.values(world.rooms)) {
      const o = new THREE.Object3D();
      o.position.copy(r.center).add(new THREE.Vector3(1.3, 0.05, -1.8));
      world.scene.add(o);
      const lab = el(`<div class="anchor"><div class="roomtag">${esc(meta.rooms[r.id].name)}</div></div>`);
      this.root.append(lab);
      world.anchor(lab, o, 0);
    }
  }

  setTag(id, text, cls = '') {
    const t = this.tags[id];
    t.textContent = text;
    t.className = `nametag ${cls}`;
  }

  /** Show a speech bubble over a character for ms (0 = until replaced/cleared). */
  say(id, html, cls = '', ms = 6000) {
    const wrap = this.bubbles[id];
    if (!wrap) return;
    clearTimeout(this.timers[id]);
    wrap.firstElementChild.innerHTML = `<div class="bubble ${cls}">${html}</div>`;
    if (!wrap._detach) wrap._detach = this.world.anchor(wrap, this.objs[id].group, 2.15);
    if (ms) this.timers[id] = setTimeout(() => this.clear(id), ms);
  }

  clear(id) {
    const wrap = this.bubbles[id];
    if (!wrap) return;
    clearTimeout(this.timers[id]);
    wrap._detach?.();
    wrap._detach = null;
    wrap.style.display = 'none';
  }

  clearAll() {
    Object.keys(this.bubbles).forEach((id) => this.clear(id));
  }
}
