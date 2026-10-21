// Explosion visuals: flash, fireball, shockwave ring, smoke, sparks, mushroom cloud,
// dust wall, flying blocks. Driven by the level and the sim result. All cartoon style.
import * as THREE from 'three';
import { HOUSE, GRID } from '../sim/grid.js';

const rand = (a, b) => a + Math.random() * (b - a);
const HALF = GRID / 2;

// ---------------------------------------------------------------- particles (instanced)
class Particles {
  constructor(scene, material, count, detail = 1) {
    this.n = count;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, detail ? 16 : 6, detail ? 12 : 4), material, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.c0 = new Float32Array(count * 3);
    this.c1 = new Float32Array(count * 3);
    this.g = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.delay = new Float32Array(count);
    this.alive = new Uint8Array(count);
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.pp = new THREE.Vector3();
    this.col = new THREE.Color();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, this.col.set(0xffffff));
    }
    this.dirty = true;
  }

  emit(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const k = i * 3;
    this.p[k] = o.x; this.p[k + 1] = o.y; this.p[k + 2] = o.z;
    this.v[k] = o.vx || 0; this.v[k + 1] = o.vy || 0; this.v[k + 2] = o.vz || 0;
    this.life[i] = 0; this.max[i] = o.life || 1;
    this.s0[i] = o.s0; this.s1[i] = o.s1 === undefined ? o.s0 : o.s1;
    this.col.set(o.c0 === undefined ? 0xffffff : o.c0);
    this.c0[k] = this.col.r; this.c0[k + 1] = this.col.g; this.c0[k + 2] = this.col.b;
    this.col.set(o.c1 === undefined ? (o.c0 === undefined ? 0xffffff : o.c0) : o.c1);
    this.c1[k] = this.col.r; this.c1[k + 1] = this.col.g; this.c1[k + 2] = this.col.b;
    this.g[i] = o.g || 0; this.drag[i] = o.drag || 0;
    this.delay[i] = o.delay || 0;
    this.alive[i] = 1;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      any = true;
      if (this.delay[i] > 0) { this.delay[i] -= dt; this.mesh.setMatrixAt(i, this.zero); continue; }
      const k = i * 3;
      this.life[i] += dt;
      const t = this.life[i] / this.max[i];
      if (t >= 1) {
        this.alive[i] = 0; this.mesh.setMatrixAt(i, this.zero); continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[k] *= dr; this.v[k + 1] = (this.v[k + 1] - this.g[i] * dt) * dr; this.v[k + 2] *= dr;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < 0.05 && this.g[i] > 0) { this.p[k + 1] = 0.05; this.v[k + 1] *= -0.3; this.v[k] *= 0.6; this.v[k + 2] *= 0.6; }
      // grow quickly then shrink away at the end
      const grow = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.min(1, t * 2.2);
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      const sz = Math.max(0.001, grow * (fade * fade * (3 - 2 * fade)));
      this.pp.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      this.s.set(sz, sz, sz);
      this.m.compose(this.pp, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      const ct = Math.min(1, t * 1.6);
      this.col.setRGB(
        this.c0[k] + (this.c1[k] - this.c0[k]) * ct,
        this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * ct,
        this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * ct);
      this.mesh.setColorAt(i, this.col);
    }
    if (any || this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.dirty = any;
    }
  }

  clear() {
    for (let i = 0; i < this.n; i++) { this.alive[i] = 0; this.mesh.setMatrixAt(i, this.zero); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
}

function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}

// ---------------------------------------------------------------- effects
export class Effects {
  constructor(world, rig) {
    this.world = world;
    this.rig = rig;
    const scene = world.scene;
    this.scene = scene;
    this.fire = new Particles(scene, new THREE.MeshBasicMaterial({ color: 0xffffff }), 900, 0);
    this.smoke = new Particles(scene, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 }), 500, 1);
    this.screenFx = { flash: 0, tint: 0 };

    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), additive(0xfff4c2));
    this.fireball = new THREE.Group();
    this.fireballParts = [];
    const fcols = [0xff7a12, 0xffa52a, 0xff5a1a, 0xffc233, 0xff8a1f, 0xffd24a, 0xe8431a];
    for (let i = 0; i < 9; i++) {
      const part = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: fcols[i % fcols.length] }));
      const a = (i / 9) * Math.PI * 2 * 2.3, el = ((i * 37) % 10) / 10;
      part.userData = { off: new THREE.Vector3(Math.cos(a) * 0.5, el * 0.5 - 0.1, Math.sin(a) * 0.5), r: 0.5 + (i % 3) * 0.1, ph: i };
      this.fireball.add(part); this.fireballParts.push(part);
    }
    this.fireballCore = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
    this.fireball.add(this.fireballCore);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring2 = this.ring.clone(); this.ring2.material = this.ring.material.clone();
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    this.wall = new THREE.Mesh(new THREE.BoxGeometry(70, 9, 3), new THREE.MeshBasicMaterial({ color: 0xd9c49a, transparent: true, opacity: 0.4, depthWrite: false }));
    this.mushroom = this.makeMushroom();
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), additive(0xffa030, 0.7));
    [this.flash, this.fireball, this.ring, this.ring2, this.dome, this.wall, this.mushroom, this.glow].forEach((o) => { o.visible = false; scene.add(o); });

    this.active = false;
    this.t = 0;
    this.events = [];
    this.debris = [];
    this.done = false;
  }

  makeMushroom() {
    const g = new THREE.Group();
    const hot = new THREE.MeshBasicMaterial({ color: 0xff9a2e, fog: false });
    const cap = new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1, 1, 14, 1, true), hot);
    stem.geometry.translate(0, 0.5, 0);
    const base = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hot);
    const capGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cap);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.7, 0.05 * (i % 2), Math.sin(a) * 0.7);
      s.scale.set(0.55, 0.42, 0.55);
      capGroup.add(s);
    }
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cap);
    top.scale.set(0.85, 0.6, 0.85); top.position.y = 0.15;
    capGroup.add(top);
    const skirt = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.2, 8, 24), cap);
    skirt.rotation.x = Math.PI / 2; skirt.position.y = -0.25;
    capGroup.add(skirt);
    g.add(stem, base, capGroup);
    g.userData = { stem, base, capGroup, hot, cap };
    return g;
  }

  reset() {
    this.active = false; this.done = false; this.events.length = 0;
    this.fire.clear(); this.smoke.clear();
    [this.flash, this.fireball, this.ring, this.ring2, this.dome, this.wall, this.mushroom, this.glow].forEach((o) => (o.visible = false));
    this.screenFx.flash = 0; this.screenFx.tint = 0;
    this.world.flashLight.intensity = 0;
    this.debris.length = 0;
    this.world.markers.visible = true;
  }

  // level: level data; result: sim Result; recs: build records in placement order
  start(level, result, recs) {
    this.reset();
    this.level = level; this.result = result; this.recs = recs;
    this.active = true; this.t = 0; this.done = false;
    const b = level.blast;
    if (b.type === 'point') this.world.markers.visible = false;
    this.kind = b.type === 'far' ? 'nuke' : (level.tntKg >= 5 ? 'tnt' : 'grenade');
    this.speed = level.waveSpeed || 25;
    this.duration = { grenade: 4.8, tnt: 6.4, nuke: 9.5 }[this.kind];

    const at = (t, fn) => this.events.push({ t, fn, done: false });
    // flying blocks
    (result.broken || []).forEach((br) => {
      const rec = recs[br.index];
      if (!rec) return;
      at(Math.min(br.time, this.duration - 1.5), () => this.launch(rec, br));
    });

    if (this.kind === 'grenade') at(0, () => this.blastGrenade(b));
    else if (this.kind === 'tnt') at(0, () => this.blastTNT(b));
    else this.setupNuke(level);

    // house damage when the wave arrives
    let tHit;
    if (b.type === 'point') tHit = Math.max(0.15, (Math.hypot(b.x, b.z) - 2) / this.speed);
    else tHit = this.nukeArrival(-HOUSE.size / 2); // wave reaches the house
    at(tHit, () => {
      this.world.applyDamage(result.houseDamage, result.survived, (x, y, z, n) => this.glassBurst(x, y, z, n));
      if (this.kind !== 'nuke') this.rig.shake(this.kind === 'tnt' ? 0.5 : 0.18);
    });
    this.events.sort((a, c) => a.t - c.t);
  }

  // when the dust wall reaches z (nuke)
  nukeArrival(z) {
    return 2 + (z + HALF) / this.speed;
  }

  // --------------------------------------------------- grenade
  blastGrenade(b) {
    const x = b.x, z = b.z;
    this.flashAt(x, 0.6, z, 2.4, 0.22);
    this.fireballAt(x, 0.5, z, 1.5, 0.55, 0xff9a2e);
    this.shockRing(x, z, 7, 0.9, 0.7);
    this.world.flashLight.position.set(x, 3, z);
    this.lightPulse = { v: 120, k: 6 };
    for (let i = 0; i < 90; i++) {
      const a = rand(0, Math.PI * 2), up = rand(0.05, 0.9);
      const sp = rand(10, 24);
      this.fire.emit({ x, y: 0.5, z, vx: Math.cos(a) * sp * (1 - up * 0.4), vy: up * sp * 0.6, vz: Math.sin(a) * sp * (1 - up * 0.4),
        life: rand(0.5, 1.1), s0: rand(0.11, 0.22), s1: 0.05, c0: 0xfff2a0, c1: 0xff6a1a, g: 9, drag: 0.4 });
    }
    for (let i = 0; i < 16; i++) {
      this.smoke.emit({ x: x + rand(-0.4, 0.4), y: rand(0.3, 0.8), z: z + rand(-0.4, 0.4), vx: rand(-1.5, 1.5), vy: rand(1, 3), vz: rand(-1.5, 1.5),
        life: rand(1.8, 3), s0: 0.4, s1: rand(1.0, 1.7), c0: 0x8a8a8a, c1: 0xeeeeee, drag: 1.2, delay: rand(0, 0.15) });
    }
    this.rig.shake(0.22);
  }

  // --------------------------------------------------- TNT
  blastTNT(b) {
    const x = b.x, z = b.z;
    this.flashAt(x, 1, z, 6, 0.3);
    this.fireballAt(x, 1.5, z, 4.2, 1.2, 0xff7a12);
    this.shockRing(x, z, 18, 1.4, 0.8);
    this.domeAt(x, z, 16, 1.4);
    this.world.flashLight.position.set(x, 4, z);
    this.lightPulse = { v: 400, k: 3.5 };
    for (let i = 0; i < 140; i++) {
      const a = rand(0, Math.PI * 2), up = rand(0.1, 1);
      const sp = rand(9, 26);
      this.fire.emit({ x, y: 0.8, z, vx: Math.cos(a) * sp * (1 - up * 0.3), vy: up * sp * 0.8, vz: Math.sin(a) * sp * (1 - up * 0.3),
        life: rand(0.7, 1.6), s0: rand(0.16, 0.34), s1: 0.06, c0: 0xfff2a0, c1: 0xff4a10, g: 8, drag: 0.5 });
    }
    // fireball puffs
    for (let i = 0; i < 26; i++) {
      this.fire.emit({ x: x + rand(-1, 1), y: rand(0.6, 2.2), z: z + rand(-1, 1), vx: rand(-3, 3), vy: rand(2, 7), vz: rand(-3, 3),
        life: rand(0.8, 1.4), s0: rand(1, 1.8), s1: rand(2, 3.2), c0: 0xffd24a, c1: 0xe0431a, drag: 1.3 });
    }
    // dust ring on the ground
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rand(-0.05, 0.05);
      const sp = rand(5, 10);
      this.smoke.emit({ x, y: 0.4, z, vx: Math.cos(a) * sp, vy: rand(0.2, 1.5), vz: Math.sin(a) * sp,
        life: rand(1.4, 2.2), s0: 0.5, s1: rand(1.2, 1.9), c0: 0xb59a6b, c1: 0xe6d6b0, drag: 1.7, delay: rand(0, 0.1) });
    }
    // big smoke column
    for (let i = 0; i < 40; i++) {
      this.smoke.emit({ x: x + rand(-1.2, 1.2), y: rand(0.5, 2), z: z + rand(-1.2, 1.2), vx: rand(-2, 2), vy: rand(3, 9), vz: rand(-2, 2),
        life: rand(2.6, 4.2), s0: 0.9, s1: rand(2.2, 3.8), c0: 0x666666, c1: 0xdadada, drag: 0.9, delay: rand(0, 0.5) });
    }
    this.rig.shake(0.55);
  }

  // --------------------------------------------------- nuclear
  setupNuke(level) {
    const at = (t, fn) => this.events.push({ t, fn, done: false });
    // 0: white flash + heat tint
    at(0, () => {
      this.screenFx.flash = 1; this.screenFx.tint = 0.55;
      this.glow.visible = true; this.glow.position.set(0, 10, -230); this.glow.scale.setScalar(4);
      this.mushroom.visible = true; this.mushroom.position.set(0, 0, -230);
      this.nuke = { t0: this.t };
      this.rig.shake(0.18);
      this.world.flashLight.position.set(0, 12, -6);
      this.lightPulse = { v: 200, k: 1.2 };
    });
    // dust wall: reaches north fence (z = -10) at nukeArrival(-HALF)
    const tFence = this.nukeArrival(-HALF);
    const tStart = 0.8;
    at(tStart, () => { this.wall.visible = true; this.wallPath = { t0: this.t, z0: -140, z1: -HALF, t1: tFence }; });
    at(tFence - 0.1, () => this.rig.shake(0.9));
    at(tFence + 1.0, () => this.rig.shake(0.5));
  }

  // --------------------------------------------------- helpers
  flashAt(x, y, z, r, d) {
    this.flash.visible = true; this.flash.position.set(x, y, z);
    this.flashAnim = { t: 0, d, r };
  }
  fireballAt(x, y, z, r, d, color) {
    this.fireball.visible = true;
    this.fireball.position.set(x, y, z);
    this.fireAnim = { t: 0, d, r, x, y, z };
  }
  shockRing(x, z, R, w, op) {
    [this.ring, this.ring2].forEach((r, i) => { r.visible = true; r.position.set(x, 0.08 + i * 0.01, z); });
    this.ringAnim = { t: 0, R, op, x, z };
  }
  domeAt(x, z, R, d) {
    this.dome.visible = true; this.dome.position.set(x, 0, z);
    this.domeAnim = { t: 0, R, d };
  }
  glassBurst(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      this.fire.emit({ x, y, z, vx: rand(-3, 3), vy: rand(1, 5), vz: rand(0.5, 5),
        life: rand(0.8, 1.4), s0: rand(0.06, 0.12), s1: 0.05, c0: 0xdff6ff, c1: 0x9fd8ff, g: 9, drag: 0.2 });
    }
  }

  launch(rec, br) {
    const m = rec.mesh;
    const sp = Math.min(22, Math.hypot(br.vx, br.vy, br.vz));
    const k = sp / Math.max(0.001, Math.hypot(br.vx, br.vy, br.vz));
    this.debris.push({
      m, vx: br.vx * k, vy: Math.max(3, br.vy * k), vz: br.vz * k,
      sx: rand(-7, 7), sy: rand(-7, 7), sz: rand(-7, 7), rest: false,
    });
    const col = rec.mesh.material.color ? 0xffffff : 0xffffff;
    for (let i = 0; i < 4; i++) {
      this.smoke.emit({ x: m.position.x + rand(-0.3, 0.3), y: m.position.y, z: m.position.z + rand(-0.3, 0.3), vx: rand(-1, 1), vy: rand(0.5, 2), vz: rand(-1, 1),
        life: rand(0.8, 1.4), s0: 0.3, s1: 0.8, c0: 0xcbb98f, c1: 0xefe6cf, drag: 1.5 });
    }
    this.rig.shake(0.05);
  }

  // ------------------------------------------------------ per frame
  update(dt) {
    this.fire.update(dt);
    this.smoke.update(dt);
    // light pulse decays even after done
    if (this.lightPulse) {
      this.lightPulse.v *= Math.exp(-dt * this.lightPulse.k);
      this.world.flashLight.intensity = this.lightPulse.v;
      if (this.lightPulse.v < 0.5) { this.world.flashLight.intensity = 0; this.lightPulse = null; }
    }
    if (!this.active) return;
    this.t += dt;
    for (const e of this.events) if (!e.done && this.t >= e.t) { e.done = true; e.fn(); }

    if (this.flashAnim) {
      const a = this.flashAnim; a.t += dt;
      const u = a.t / a.d;
      if (u >= 1) { this.flash.visible = false; this.flashAnim = null; }
      else { this.flash.scale.setScalar(a.r * (0.4 + 0.6 * u)); this.flash.material.opacity = 1 - u; }
    }
    if (this.fireAnim) {
      const a = this.fireAnim; a.t += dt;
      const u = a.t / a.d;
      if (u >= 1.5) { this.fireball.visible = false; this.fireAnim = null; }
      else {
        const grow = Math.min(1, u * 3.5);
        const s = a.r * (1 - Math.pow(1 - grow, 3)) * (u < 1 ? 1 : Math.max(0, 1 - (u - 1) * 2));
        this.fireball.position.set(a.x, a.y + u * a.r * 0.6, a.z);
        this.fireball.scale.setScalar(Math.max(0.001, s));
        for (const p of this.fireballParts) {
          const d = p.userData;
          p.position.copy(d.off).multiplyScalar(1 + u * 0.4);
          p.scale.setScalar(d.r * (1 + Math.sin(a.t * 18 + d.ph) * 0.07));
        }
        this.fireballCore.scale.setScalar(Math.max(0.001, 1 - u * 1.2));
      }
    }
    if (this.ringAnim) {
      const a = this.ringAnim; a.t += dt;
      const r = Math.min(a.R, Math.max(0.1, a.t * this.speed * 1.2));
      const u = r / a.R;
      this.ring.scale.set(r, r, 1);
      this.ring2.scale.set(r * 0.82, r * 0.82, 1);
      this.ring.material.opacity = a.op * (1 - u);
      this.ring2.material.opacity = a.op * 0.7 * (1 - u);
      if (u >= 1) { this.ring.visible = false; this.ring2.visible = false; this.ringAnim = null; }
    }
    if (this.domeAnim) {
      const a = this.domeAnim; a.t += dt;
      const u = a.t / a.d;
      if (u >= 1) { this.dome.visible = false; this.domeAnim = null; }
      else { const r = a.R * (1 - Math.pow(1 - u, 2)); this.dome.scale.set(r, r * 0.6, r); this.dome.material.opacity = 0.22 * (1 - u); }
    }

    // nuke: mushroom, glow, tint, dust wall
    if (this.nuke) {
      const t = this.t - this.nuke.t0;
      this.screenFx.flash = Math.max(0, 1 - t / 2.2);
      this.screenFx.tint = t < 5 ? 0.5 * Math.max(0, 1 - t / 5) + 0.05 : Math.max(0, 0.05 * (1 - (t - 5) / 2));
      const grow = Math.min(1, t / 5.5);
      const e = 1 - Math.pow(1 - grow, 2.2);
      const H = 125 * e + 0.01;
      const u = this.mushroom.userData;
      u.stem.scale.set(11 + 4 * e, H, 11 + 4 * e);
      u.base.scale.set(32 * e + 1, 10 * e + 0.2, 32 * e + 1);
      u.capGroup.position.y = H;
      u.capGroup.scale.setScalar(Math.max(0.01, 52 * Math.min(1, t / 3.5) * (0.6 + 0.4 * e)));
      u.capGroup.rotation.y = t * 0.15;
      // colour cools from orange to brown/grey
      const cool = Math.min(1, t / 8);
      u.hot.color.lerpColors(new THREE.Color(0xff8a22), new THREE.Color(0x8a7a6a), cool);
      u.cap.color.lerpColors(new THREE.Color(0xffc247), new THREE.Color(0xb9a998), cool);
      this.glow.scale.setScalar(4 + t * 20); this.glow.material.opacity = Math.max(0, 0.75 - t * 0.14);
    }
    if (this.wallPath) {
      const w = this.wallPath;
      const u = Math.min(1.8, (this.t - w.t0) / (w.t1 - w.t0));
      let z;
      if (u <= 1) z = w.z0 + (w.z1 - w.z0) * u;
      else z = w.z1 + (this.t - w.t1) * this.speed;
      this.wall.position.set(0, 4.5, z);
      this.wall.scale.set(1 + Math.min(1, u) * 0.2, 1 + Math.sin(this.t * 6) * 0.05, 1);
      this.wall.material.opacity = z > 14 ? Math.max(0, 0.4 - (z - 14) * 0.03) : 0.4;
      // dust puffs along the wall
      if (z < 14) for (let i = 0; i < 4; i++) {
        this.smoke.emit({ x: rand(-30, 30), y: rand(0.3, 6), z: z + rand(-1.5, 1.5), vx: rand(-1, 1), vy: rand(0.2, 1.5), vz: this.speed * 0.55,
          life: rand(1.2, 2), s0: 1.0, s1: rand(2, 3.2), c0: 0xc8b48a, c1: 0xe8dcc0, drag: 0.8 });
      }
      if (z > 24) { this.wall.visible = false; this.wallPath = null; }
    }

    // debris
    for (const d of this.debris) {
      if (d.rest) continue;
      const m = d.m;
      d.vy -= 9.8 * dt;
      m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      m.rotation.x += d.sx * dt; m.rotation.y += d.sy * dt; m.rotation.z += d.sz * dt;
      if (m.position.y < 0.45) {
        m.position.y = 0.45;
        if (Math.abs(d.vy) > 1.2) {
          d.vy *= -0.38; d.vx *= 0.7; d.vz *= 0.7; d.sx *= 0.6; d.sy *= 0.6; d.sz *= 0.6;
          this.smoke.emit({ x: m.position.x, y: 0.3, z: m.position.z, vx: rand(-1, 1), vy: 0.8, vz: rand(-1, 1), life: 0.9, s0: 0.3, s1: 0.8, c0: 0xcbb98f, c1: 0xefe6cf, drag: 1.5 });
        } else { d.vy = 0; d.vx *= 0.9; d.vz *= 0.9; d.sx *= 0.85; d.sy *= 0.85; d.sz *= 0.85; }
        if (Math.hypot(d.vx, d.vz) < 0.25 && Math.abs(d.vy) < 0.1) { d.rest = true; m.rotation.x = Math.round(m.rotation.x / (Math.PI / 2)) * Math.PI / 2; m.rotation.z = Math.round(m.rotation.z / (Math.PI / 2)) * Math.PI / 2; }
      }
    }

    if (this.t >= this.duration && !this.done) {
      this.done = true;
    }
  }

  // jump to the end state (used for skipToResults)
  finishInstant() {
    this.reset();
    this.done = true;
  }
}
