// Chibi animal characters, built from toon primitives. Front of every character is +z.
import * as THREE from 'three';
import { G, mesh, toon, outline } from './toon.js';

const INK = '#2b2233';
const BLUSH = toon('#ff9fb4', { transparent: true, opacity: 0.75 });

function eye(x, y, z, size = 0.075) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(G.sphere(size, 12, 10), INK, 0, 0, 0, { s: [1, 1.15, 0.7], shadow: false }));
  g.add(mesh(G.sphere(size * 0.36, 8, 6), '#ffffff', size * 0.35, size * 0.4, size * 0.55, { shadow: false }));
  return g;
}

/**
 * Base chibi body: big head, round body, stubby feet and arms.
 * Returns parts so species decorators can recolour / add bits.
 */
function base({ body, head = body, belly = null, feet = body, arms = body, headY = 1.22, headR = 0.5, eyeY = 0.04, eyeGap = 0.17, eyeZ = 0.43 }) {
  const rig = new THREE.Group();
  const parts = { rig };
  parts.body = outline(mesh(G.sphere(0.5), body, 0, 0.55, 0, { s: [0.95, 0.95, 0.85] }));
  rig.add(parts.body);
  if (belly) rig.add(mesh(G.sphere(0.36), belly, 0, 0.5, 0.22, { s: [1, 1.05, 0.6] }));
  parts.headGroup = new THREE.Group();
  parts.headGroup.position.y = headY;
  rig.add(parts.headGroup);
  parts.head = outline(mesh(G.sphere(headR, 24, 18), head, 0, 0, 0));
  parts.headGroup.add(parts.head);
  parts.eyes = [eye(-eyeGap, eyeY, eyeZ), eye(eyeGap, eyeY, eyeZ)];
  parts.eyes.forEach((e) => parts.headGroup.add(e));
  parts.headGroup.add(mesh(G.sphere(0.08, 10, 8), BLUSH, -0.29, -0.1, 0.38, { s: [1.2, 0.7, 0.5], shadow: false }));
  parts.headGroup.add(mesh(G.sphere(0.08, 10, 8), BLUSH, 0.29, -0.1, 0.38, { s: [1.2, 0.7, 0.5], shadow: false }));
  parts.feet = [mesh(G.sphere(0.17, 12, 8), feet, -0.2, 0.08, 0.12, { s: [1, 0.6, 1.3] }), mesh(G.sphere(0.17, 12, 8), feet, 0.2, 0.08, 0.12, { s: [1, 0.6, 1.3] })];
  parts.feet.forEach((f) => rig.add(f));
  parts.arms = [mesh(G.sphere(0.14, 10, 8), arms, -0.45, 0.62, 0.08, { s: [0.9, 1.3, 0.9] }), mesh(G.sphere(0.14, 10, 8), arms, 0.45, 0.62, 0.08, { s: [0.9, 1.3, 0.9] })];
  parts.arms.forEach((a) => rig.add(a));
  return parts;
}

function smile(parts, y = -0.12, z = 0.47, w = 0.07) {
  parts.headGroup.add(mesh(G.torus(w, 0.016, Math.PI), INK, 0, y, z, { r: [0, 0, Math.PI], shadow: false }));
}

// ───────────────────────── species ─────────────────────────

const BUILDERS = {
  duck(p) {
    const b = base({ body: '#fffdf8', feet: '#ffa53b' });
    b.headGroup.add(mesh(G.sphere(0.2, 14, 10), '#ffa53b', 0, -0.1, 0.46, { s: [1.15, 0.45, 0.9] }));
    b.rig.add(mesh(G.cone(0.14, 0.3, 8), '#fffdf8', 0, 0.75, -0.45, { r: [-2.2, 0, 0] }));
    if (p.chef) {
      b.headGroup.add(mesh(G.cyl(0.26, 0.24, 0.26), '#ffffff', 0, 0.5, -0.02));
      b.headGroup.add(mesh(G.sphere(0.3, 14, 10), '#ffffff', 0, 0.72, -0.02, { s: [1.1, 0.7, 1.1] }));
      b.rig.add(mesh(G.box(0.62, 0.5, 0.1, 0.05), '#f6b6c8', 0, 0.5, 0.39, { r: [-0.1, 0, 0] }));
    }
    return b;
  },
  badger(p) {
    const b = base({ body: '#7d8291', head: '#f4f0e6', feet: '#3b3a44', arms: '#7d8291', eyeZ: 0.5 });
    for (const s of [-1, 1]) {
      b.headGroup.add(mesh(G.sphere(0.2, 16, 12), '#3b3a44', s * 0.19, 0.1, 0.1, { s: [0.7, 0.75, 2.2], r: [0.3, 0, 0] }));
      b.headGroup.add(mesh(G.sphere(0.11, 10, 8), '#3b3a44', s * 0.33, 0.36, -0.05));
    }
    b.eyes.forEach((e) => e.children[1].scale.setScalar(1.4));
    b.headGroup.add(mesh(G.sphere(0.07, 10, 8), INK, 0, -0.06, 0.5));
    smile(b, -0.17, 0.45, 0.05);
    if (p.overalls) {
      b.rig.add(mesh(G.sphere(0.5), '#6f9a5a', 0, 0.48, 0.02, { s: [0.98, 0.7, 0.88] }));
      b.headGroup.add(mesh(G.cyl(0.62, 0.62, 0.05, 20), '#e8c25a', 0, 0.38, 0, { r: [-0.15, 0, 0] }));
      b.headGroup.add(mesh(G.cyl(0.28, 0.33, 0.25, 16), '#e8c25a', 0, 0.5, -0.03, { r: [-0.15, 0, 0] }));
      b.headGroup.add(mesh(G.cyl(0.335, 0.335, 0.07, 16), '#d9574b', 0, 0.42, -0.03, { r: [-0.15, 0, 0] }));
    }
    return b;
  },
  owl(p) {
    const b = base({ body: '#b07a4a', belly: '#ecd3a8', feet: '#e8a23a', arms: '#9a6738', eyeGap: 0.18 });
    for (const s of [-1, 1]) {
      b.headGroup.add(mesh(G.sphere(0.17, 14, 10), '#fff6e1', s * 0.18, 0.04, 0.38, { s: [1, 1, 0.45] }));
      b.headGroup.add(mesh(G.cone(0.1, 0.28, 6), '#9a6738', s * 0.3, 0.48, -0.02, { r: [0, 0, -s * 0.4] }));
      b.headGroup.add(mesh(G.torus(0.13, 0.018), '#c99a2e', s * 0.18, 0.04, 0.49, { shadow: false }));
    }
    b.eyes.forEach((e) => (e.position.z = 0.48));
    b.headGroup.add(mesh(G.cyl(0.02, 0.02, 0.1), '#c99a2e', 0, 0.04, 0.5, { r: [0, 0, Math.PI / 2], shadow: false }));
    b.headGroup.add(mesh(G.cone(0.06, 0.16, 8), '#e8a23a', 0, -0.12, 0.47, { r: [Math.PI, 0, 0] }));
    if (p.ledger) b.rig.add(mesh(G.box(0.3, 0.38, 0.08, 0.03), '#3f6e8c', 0.42, 0.55, 0.25, { r: [0, -0.4, 0.2] }));
    return b;
  },
  frog(p) {
    const b = base({ body: '#7cc66b', head: '#7cc66b', feet: '#62a956', eyeY: 0.3, eyeGap: 0.22, eyeZ: 0.3 });
    b.head.scale.set(1.18, 0.82, 1);
    for (const s of [-1, 1]) b.headGroup.add(outline(mesh(G.sphere(0.17, 14, 10), '#7cc66b', s * 0.22, 0.3, 0.16)));
    b.headGroup.add(mesh(G.torus(0.16, 0.02, Math.PI), INK, 0, -0.04, 0.47, { r: [0, 0, Math.PI], shadow: false }));
    if (p.jacket) {
      b.rig.add(mesh(G.sphere(0.5), '#7b4fa0', 0, 0.56, -0.01, { s: [1.0, 0.92, 0.9] }));
      b.rig.add(mesh(G.cone(0.14, 0.32, 3), '#fff7ea', 0, 0.78, 0.42, { r: [Math.PI, 0, 0] }));
      b.arms.forEach((a) => (a.material = toon('#7b4fa0')));
    }
    return b;
  },
  rabbit(p) {
    const b = base({ body: '#fbf0f2', feet: '#fbf0f2' });
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.18, 0.42, -0.04);
      ear.rotation.z = -s * 0.15;
      ear.add(outline(mesh(G.capsule(0.11, 0.5), '#fbf0f2', 0, 0.32, 0)));
      ear.add(mesh(G.capsule(0.06, 0.4, 0), '#ffb8c9', 0, 0.32, 0.06, { shadow: false }));
      b.headGroup.add(ear);
    }
    b.headGroup.add(mesh(G.sphere(0.05, 10, 8), '#ff8fa9', 0, -0.05, 0.49));
    smile(b, -0.13, 0.46, 0.04);
    b.rig.add(mesh(G.sphere(0.16, 12, 10), '#ffffff', 0, 0.45, -0.45));
    if (p.bow) {
      for (const s of [-1, 1]) b.headGroup.add(mesh(G.cone(0.12, 0.2, 8), '#ff6fa8', 0.18 + s * 0.11, 0.45, 0.12, { r: [0, 0, s * Math.PI / 2] }));
      b.headGroup.add(mesh(G.sphere(0.06, 8, 6), '#ff6fa8', 0.18, 0.45, 0.12));
    }
    return b;
  },
  cat(p) {
    const b = base({ body: '#fffaf0', feet: '#fffaf0' });
    b.headGroup.add(mesh(G.sphere(0.3, 14, 10), '#f4a259', -0.24, 0.2, 0.08, { s: [1, 0.9, 1.1] }));
    b.headGroup.add(mesh(G.sphere(0.24, 14, 10), '#3d3a42', 0.27, 0.24, -0.05, { s: [1, 0.85, 1.1] }));
    b.rig.add(mesh(G.sphere(0.25, 14, 10), '#f4a259', 0.2, 0.62, -0.2));
    for (const [s, c] of [[-1, '#f4a259'], [1, '#3d3a42']]) {
      b.headGroup.add(outline(mesh(G.cone(0.15, 0.3, 4), c, s * 0.28, 0.44, 0, { r: [0, Math.PI / 4, -s * 0.25] })));
      b.headGroup.add(mesh(G.cone(0.08, 0.16, 4), '#ffb8c9', s * 0.27, 0.42, 0.06, { r: [0, Math.PI / 4, -s * 0.25], shadow: false }));
    }
    b.headGroup.add(mesh(G.cone(0.04, 0.05, 3), '#ff8fa9', 0, -0.05, 0.5, { r: [Math.PI, 0, 0] }));
    smile(b, -0.12, 0.46, 0.04);
    const tail = mesh(G.capsule(0.07, 0.6), '#f4a259', 0.2, 0.55, -0.48, { r: [-0.8, 0, -0.5] });
    b.rig.add(tail);
    if (p.apron) b.rig.add(mesh(G.box(0.55, 0.45, 0.1, 0.05), '#9fd3e8', 0, 0.48, 0.38, { r: [-0.1, 0, 0] }));
    return b;
  },
  penguin(p) {
    const b = base({ body: '#2f3548', head: '#2f3548', belly: '#fffdf8', feet: '#ffa53b', arms: '#2f3548' });
    b.headGroup.add(mesh(G.sphere(0.36, 16, 12), '#fffdf8', 0, -0.06, 0.2, { s: [1.05, 0.85, 0.85] }));
    b.eyes.forEach((e) => (e.position.z = 0.5));
    b.headGroup.add(mesh(G.cone(0.08, 0.2, 8), '#ffa53b', 0, -0.1, 0.56, { r: [Math.PI / 2, 0, 0] }));
    if (p.captain) {
      b.headGroup.add(mesh(G.cyl(0.4, 0.36, 0.2), '#ffffff', 0, 0.48, -0.02, { r: [-0.12, 0, 0] }));
      b.headGroup.add(mesh(G.cyl(0.37, 0.37, 0.07), '#23283a', 0, 0.38, 0.0, { r: [-0.12, 0, 0] }));
      b.headGroup.add(mesh(G.box(0.4, 0.04, 0.22, 0.02), '#23283a', 0, 0.36, 0.36, { r: [0.25, 0, 0] }));
      b.headGroup.add(mesh(G.sphere(0.06, 8, 6), '#f2c94c', 0, 0.48, 0.36));
    }
    return b;
  },
  squirrel(p) {
    const b = base({ body: '#c8763f', belly: '#f6dfbf', feet: '#a85f30', arms: '#a85f30' });
    b.headGroup.add(mesh(G.sphere(0.24, 14, 10), '#f6dfbf', 0, -0.12, 0.3, { s: [1.1, 0.7, 0.8] }));
    for (const s of [-1, 1]) b.headGroup.add(outline(mesh(G.cone(0.11, 0.3, 6), '#c8763f', s * 0.27, 0.46, 0, { r: [0, 0, -s * 0.2] })));
    b.headGroup.add(mesh(G.sphere(0.05, 8, 6), INK, 0, -0.06, 0.5));
    const tail = new THREE.Group();
    tail.position.set(0, 0.35, -0.45);
    const pts = [[0, 0, 0, 0.26], [0, 0.35, -0.2, 0.3], [0, 0.75, -0.25, 0.32], [0, 1.1, -0.1, 0.28], [0, 1.3, 0.12, 0.2]];
    for (const [x, y, z, r] of pts) tail.add(outline(mesh(G.sphere(r, 14, 10), '#d98447', x, y, z)));
    b.rig.add(tail);
    b.tail = tail;
    if (p.camera) {
      b.rig.add(mesh(G.box(0.34, 0.22, 0.16, 0.04), '#3b3a44', 0, 0.62, 0.42));
      b.rig.add(mesh(G.cyl(0.07, 0.07, 0.1), '#9ab', 0, 0.62, 0.52, { r: [Math.PI / 2, 0, 0] }));
      b.headGroup.add(mesh(G.box(0.3, 0.12, 0.04, 0.02), '#ffffff', -0.08, 0.3, 0.35, { r: [0.3, 0, 0.3] }));
      b.headGroup.add(mesh(G.box(0.24, 0.05, 0.03, 0.01), '#d33', -0.08, 0.32, 0.37, { r: [0.3, 0, 0.3] }));
    }
    return b;
  },
  capybara(p) {
    const b = base({ body: '#a9774f', head: '#a9774f', feet: '#8a5d3b', arms: '#8a5d3b', eyeY: 0.13, eyeGap: 0.2, eyeZ: 0.49 });
    b.headGroup.remove(b.head);
    b.head = outline(mesh(G.box(0.7, 0.62, 0.86, 0.26), '#a9774f', 0, 0, 0.05));
    b.headGroup.add(b.head);
    b.headGroup.add(mesh(G.box(0.5, 0.36, 0.2, 0.12), '#8f6141', 0, -0.1, 0.42));
    for (const s of [-1, 1]) {
      b.headGroup.add(mesh(G.sphere(0.03, 6, 6), INK, s * 0.08, -0.04, 0.53));
      b.headGroup.add(mesh(G.sphere(0.08, 10, 8), '#8a5d3b', s * 0.3, 0.34, -0.2, { s: [1, 0.8, 0.6] }));
    }
    b.eyes.forEach((e) => e.scale.setScalar(0.85));
    if (p.yuzu) {
      b.headGroup.add(mesh(G.sphere(0.17, 14, 10), '#ffd23f', 0, 0.45, 0, { s: [1, 0.9, 1] }));
      b.headGroup.add(mesh(G.sphere(0.06, 8, 6), '#6bb05a', 0.05, 0.6, 0, { s: [1.6, 0.5, 0.8] }));
    }
    if (p.towel) b.headGroup.add(mesh(G.box(0.6, 0.12, 0.5, 0.06), '#9fd3e8', 0, 0.34, -0.05));
    return b;
  },
  corgi(p) {
    const b = base({ body: '#f0a04b', head: '#f0a04b', belly: '#fffaf0', feet: '#fffaf0', arms: '#f0a04b' });
    b.headGroup.add(mesh(G.sphere(0.27, 14, 10), '#fffaf0', 0, -0.12, 0.28, { s: [1.15, 0.75, 0.85] }));
    b.headGroup.add(mesh(G.sphere(0.06, 8, 6), INK, 0, -0.04, 0.53));
    smile(b, -0.16, 0.48, 0.05);
    for (const s of [-1, 1]) {
      b.headGroup.add(outline(mesh(G.cone(0.17, 0.4, 4), '#f0a04b', s * 0.3, 0.48, 0, { r: [0, Math.PI / 4, -s * 0.3] })));
      b.headGroup.add(mesh(G.cone(0.09, 0.24, 4), '#ffd6c2', s * 0.29, 0.44, 0.07, { r: [0, Math.PI / 4, -s * 0.3], shadow: false }));
    }
    b.rig.add(mesh(G.sphere(0.12, 10, 8), '#fffaf0', 0, 0.45, -0.45));
    if (p.police) {
      b.headGroup.add(mesh(G.cyl(0.33, 0.3, 0.18), '#2d4a8a', 0, 0.44, -0.04, { r: [-0.12, 0, 0] }));
      b.headGroup.add(mesh(G.box(0.36, 0.04, 0.2, 0.02), '#1d2b52', 0, 0.36, 0.3, { r: [0.25, 0, 0] }));
      b.headGroup.add(mesh(G.sphere(0.055, 8, 6), '#f2c94c', 0, 0.46, 0.3));
      b.rig.add(mesh(G.cyl(0.47, 0.47, 0.06, 18), '#2d4a8a', 0, 0.8, 0, { s: [1, 1, 0.9] }));
    }
    return b;
  },
  hedgehog() {
    const b = base({ body: '#c9a27c', head: '#f2dcc0', feet: '#8a6a4e', arms: '#8a6a4e' });
    const up = new THREE.Vector3(0, 1, 0);
    for (let row = 0; row < 3; row++) {
      const elev = 0.15 + row * 0.5;
      const n = 9 - row * 2;
      for (let i = 0; i < n; i++) {
        const az = Math.PI * (0.55 + (i / (n - 1 || 1)) * 0.9) + (row % 2) * 0.1; // around the back of the head
        const dir = new THREE.Vector3(Math.cos(elev) * Math.sin(az) * -1, Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
        const spike = mesh(G.cone(0.11, 0.38, 6), '#6b4a34', dir.x * 0.5, dir.y * 0.5, dir.z * 0.5);
        spike.quaternion.setFromUnitVectors(up, dir);
        b.headGroup.add(spike);
      }
    }
    b.headGroup.add(mesh(G.sphere(0.06, 8, 6), INK, 0, -0.04, 0.52));
    b.headGroup.add(mesh(G.torus(0.06, 0.015, Math.PI), INK, 0, -0.18, 0.45, { shadow: false }));
    for (const s of [-1, 1]) b.headGroup.add(mesh(G.box(0.15, 0.03, 0.02, 0.01), INK, s * 0.17, 0.17, 0.46, { r: [0, 0, s * 0.35], shadow: false }));
    return b;
  },
};

export const LOOKS = {
  clementine: { species: 'duck', chef: true },
  barnaby: { species: 'badger', overalls: true },
  odette: { species: 'owl', ledger: true },
  pierre: { species: 'frog', jacket: true },
  lulu: { species: 'rabbit', bow: true },
  mochi: { species: 'cat', apron: true },
  gus: { species: 'penguin', captain: true },
  hazel: { species: 'squirrel', camera: true },
  dan: { species: 'capybara', yuzu: true },
  waffles: { species: 'corgi', police: true },
  prickles: { species: 'hedgehog' },
};

/** A living character: idle bob, blinking, talking squash, hops, X-eyes. */
export class Critter {
  constructor(id) {
    const look = LOOKS[id];
    this.id = id;
    this.parts = BUILDERS[look.species](look);
    this.group = new THREE.Group();
    this.group.add(this.parts.rig);
    this.group.userData.critter = this;
    this.phase = Math.random() * 10;
    this.talkUntil = 0;
    this.hopUntil = 0;
    this.walking = false;
    this.nextBlink = 1 + Math.random() * 3;
    this.headAnchor = new THREE.Object3D();
    this.headAnchor.position.y = 2.15;
    this.group.add(this.headAnchor);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);
  }

  talk(ms = 1400) {
    this.talkUntil = performance.now() + ms;
  }

  hop(ms = 500) {
    this.hopStart = performance.now();
    this.hopUntil = this.hopStart + ms;
  }

  setDizzy(on) {
    // X eyes for poor Mr. Dan.
    const hg = this.parts.headGroup;
    if (on && !this.xEyes) {
      this.xEyes = new THREE.Group();
      for (const e of this.parts.eyes) {
        e.visible = false;
        for (const r of [0.8, -0.8]) this.xEyes.add(mesh(G.box(0.16, 0.035, 0.03, 0.01), INK, e.position.x, e.position.y, e.position.z + 0.03, { r: [0, 0, r], shadow: false }));
      }
      hg.add(this.xEyes);
    } else if (!on && this.xEyes) {
      hg.remove(this.xEyes);
      this.xEyes = null;
      this.parts.eyes.forEach((e) => (e.visible = true));
    }
  }

  update(t, dt) {
    const rig = this.parts.rig;
    const now = performance.now();
    const speed = this.walking ? 12 : 2;
    const bob = Math.sin(t * speed + this.phase);
    rig.position.y = this.walking ? Math.abs(bob) * 0.12 : bob * 0.015;
    rig.rotation.z = this.walking ? bob * 0.08 : Math.sin(t * 0.9 + this.phase) * 0.025;
    let sy = 1 + Math.sin(t * 2 + this.phase) * 0.012;
    if (now < this.talkUntil) {
      const k = Math.sin(now * 0.025);
      sy += k * 0.05;
      this.parts.headGroup.rotation.x = -0.05 + k * 0.05;
    } else this.parts.headGroup.rotation.x *= 0.9;
    if (now < this.hopUntil) {
      const k = (now - this.hopStart) / (this.hopUntil - this.hopStart);
      rig.position.y += Math.sin(k * Math.PI) * 0.45;
    }
    rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    if (this.parts.tail) this.parts.tail.rotation.x = Math.sin(t * 2.5 + this.phase) * 0.1;
    this.nextBlink -= dt;
    const blinking = this.nextBlink < 0.12;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 4;
    for (const e of this.parts.eyes) e.scale.y = blinking ? 0.15 : 1;
  }
}
