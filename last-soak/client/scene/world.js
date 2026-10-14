// Renderer, isometric camera, picking, character placement and HTML anchors.
import * as THREE from 'three';
import { cellPath, cellCenter } from '../../shared/layout.js';
import { buildManor, buildPoliceCar, FLOOR_Y } from './manor.js';
import { Critter } from './animals.js';

const ISO_DIR = new THREE.Vector3(1, 1.05, 1).normalize();
const FACE_CAMERA = Math.PI / 4;
const shown = (o) => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};
const OVERVIEW = { target: new THREE.Vector3(2.5, 0, 5), zoom: 1 };

export class World {
  constructor(canvas, meta) {
    this.meta = meta;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.view = { target: OVERVIEW.target.clone(), zoom: 1 };
    this.goal = { target: OVERVIEW.target.clone(), zoom: 1 };
    this.userPan = new THREE.Vector3();
    this.userZoom = 1;
    this.shake = 0;

    this.scene.add(new THREE.HemisphereLight('#c9d4ff', '#5a4a6e', 1.5));
    const moon = new THREE.DirectionalLight('#fff0d8', 2.0);
    moon.position.set(-14, 30, 10);
    moon.target.position.set(2, 0, 5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.02;
    this.scene.add(moon, moon.target);
    this.scene.add(new THREE.AmbientLight('#8f7fb8', 0.5));

    this.manor = buildManor(this.scene, meta.rooms);
    this.rooms = this.manor.rooms;

    // Cast
    this.critters = {};
    this.home = {};
    for (const c of meta.characters) {
      const k = new Critter(c.id);
      const room = this.rooms[c.room];
      const pos = room.center.clone().add(new THREE.Vector3(-0.5, 0, -0.3));
      k.group.position.copy(pos);
      k.group.rotation.y = FACE_CAMERA;
      this.home[c.id] = pos;
      this.critters[c.id] = k;
      this.scene.add(k.group);
    }
    this.dan = new Critter('dan');
    this.dan.group.visible = false;
    this.scene.add(this.dan.group);
    this.detective = new Critter('waffles');
    this.detective.group.position.copy(this.detSpot('foyer'));
    this.detective.group.rotation.y = FACE_CAMERA;
    this.scene.add(this.detective.group);
    this.detLoc = 'foyer';
    this.walk = null;
    this.tweens = [];

    this.policeCar = buildPoliceCar();
    this.policeCar.position.set(15.8, 0, 2.6);
    this.policeCar.rotation.y = -Math.PI / 2;
    this.scene.add(this.policeCar);

    // picking
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoverRoom = null;
    this.pickable = Object.values(this.rooms).map((r) => r.floor);
    this.onRoomClick = null;
    this.canPick = () => false;
    this.bindInput();

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
    this.anchors = []; // { el, obj, offset }
    this.maxFps = Number(new URLSearchParams(location.search).get('fps')) || 0;
  }

  detSpot(roomId) {
    const c = this.rooms[roomId].center;
    return roomId === 'foyer' ? c.clone().add(new THREE.Vector3(0.3, 0, 0.4)) : c.clone().add(new THREE.Vector3(1.5, 0, 0.3));
  }

  // ───────────────────────── camera ─────────────────────────

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    // Fit the whole island: wider screens are limited by height, phones by width.
    this.baseHalf = Math.max(17, 30 / this.aspect);
    this.updateFrustum();
  }

  updateFrustum() {
    const half = this.baseHalf;
    Object.assign(this.camera, { left: -half * this.aspect, right: half * this.aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }

  focus(target, zoom, instant = false) {
    this.goal.target.copy(target);
    this.goal.zoom = zoom;
    if (instant) {
      this.view.target.copy(target);
      this.view.zoom = zoom;
    }
  }

  focusRoom(roomId, instant) {
    const r = this.rooms[roomId];
    const narrow = this.aspect < 0.8;
    // Phones: fill the width with the room. Desktop: a comfortable close-up.
    const zoom = narrow ? (this.baseHalf * this.aspect) / 6.2 : 2.3;
    // Nudge the room up the screen so the bottom panel doesn't cover it.
    const halfH = this.baseHalf / zoom;
    const k = ((narrow ? 0.36 : 0.2) * halfH) / 0.834;
    this.focus(r.center.clone().add(new THREE.Vector3(k, 0.6, k)), zoom, instant);
    this.userPan.set(0, 0, 0);
    this.userZoom = 1;
  }

  overview(instant) {
    this.focus(OVERVIEW.target, OVERVIEW.zoom, instant);
    this.userPan.set(0, 0, 0);
    this.userZoom = 1;
  }

  // ───────────────────────── input ─────────────────────────

  bindInput() {
    const el = this.canvas;
    let down = null;
    const pts = new Map();
    let pinch = null;
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) down = { x: e.clientX, y: e.clientY, pan: this.userPan.clone(), moved: false };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.userZoom };
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.userZoom = THREE.MathUtils.clamp(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), 0.4, 3);
        if (down) down.moved = true;
        return;
      }
      if (down && pts.size === 1) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) down.moved = true;
        if (down.moved) {
          const scale = (this.baseHalf * 2) / window.innerHeight / (this.view.zoom * this.userZoom);
          const right = new THREE.Vector3(1, 0, -1).normalize();
          const fwd = new THREE.Vector3(-1, 0, -1).normalize();
          this.userPan.copy(down.pan).addScaledVector(right, -dx * scale).addScaledVector(fwd, dy * scale * 1.45);
        }
      }
      this.hover(e);
    });
    const up = (e) => {
      const wasClick = down && !down.moved && pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (wasClick) this.click(e);
      if (pts.size === 0) down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => {
      pts.delete(e.pointerId);
      down = null;
      pinch = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.userZoom = THREE.MathUtils.clamp(this.userZoom * Math.exp(-e.deltaY * 0.0015), 0.4, 3);
    }, { passive: false });
  }

  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickable, false)[0];
    return hit ? hit.object.userData.roomId : null;
  }

  hover(e) {
    const id = this.canPick() ? this.pick(e) : null;
    if (id === this.hoverRoom) return;
    this.hoverRoom = id;
    for (const r of Object.values(this.rooms)) r.floor.material.emissiveIntensity = r.id === id ? 0.18 : 0;
    this.canvas.style.cursor = id ? 'pointer' : '';
  }

  click(e) {
    if (!this.canPick()) return;
    const id = this.pick(e);
    if (id && this.onRoomClick) this.onRoomClick(id);
  }

  // ───────────────────────── cast control ─────────────────────────

  /** Walk the corgi along the hallway grid; finishes by arriveAt (local ms). */
  moveDetective(to, durationMs) {
    const from = this.detLoc;
    this.detLoc = to;
    const cells = cellPath(this.rooms[from].cell, this.rooms[to].cell);
    const pts = [this.detective.group.position.clone()];
    for (let i = 1; i < cells.length; i++) {
      const a = cellCenter(cells[i - 1]);
      const b = cellCenter(cells[i]);
      pts.push(new THREE.Vector3((a.x + b.x) / 2, FLOOR_Y, (a.z + b.z) / 2)); // doorway
      if (i < cells.length - 1) pts.push(new THREE.Vector3(b.x, FLOOR_Y, b.z));
    }
    pts.push(this.detSpot(to));
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += lens[i - 1] = pts[i].distanceTo(pts[i - 1]);
    this.walk = { pts, lens, total, t0: performance.now(), dur: Math.max(300, durationMs) };
    this.detective.walking = true;
  }

  placeDetective(roomId) {
    this.detLoc = roomId;
    this.walk = null;
    this.detective.walking = false;
    this.detective.group.position.copy(this.detSpot(roomId));
    this.faceSuspect();
  }

  faceSuspect() {
    const suspect = this.meta.characters.find((c) => c.room === this.detLoc);
    if (suspect && !this.critters[suspect.id].atStation) {
      const d = this.critters[suspect.id].group.position.clone().sub(this.detective.group.position);
      this.detective.group.rotation.y = Math.atan2(d.x, d.z);
    } else this.detective.group.rotation.y = FACE_CAMERA;
  }

  sendToStation(charId, animate = true) {
    const k = this.critters[charId];
    if (k.atStation) return;
    const idx = Object.values(this.critters).filter((c) => c.atStation).length;
    k.atStation = true;
    const dest = this.manor.station.spots[idx % 8].clone();
    if (!animate) {
      k.group.position.copy(dest);
      return;
    }
    this.tween(k, k.group.position.clone(), dest, 1600, true);
  }

  returnHome(charId) {
    const k = this.critters[charId];
    k.atStation = false;
    k.group.position.copy(this.home[charId]);
    k.group.rotation.y = FACE_CAMERA;
  }

  tween(critter, from, to, ms, arc = false, done) {
    this.tweens = this.tweens.filter((t) => t.critter !== critter);
    this.tweens.push({ critter, from, to, ms, arc, t0: performance.now(), done });
    critter.walking = !arc;
  }

  // ───────────────────────── HTML anchors ─────────────────────────

  anchor(el, obj, offsetY = 0) {
    this.anchors.push({ el, obj, offsetY });
    return () => {
      this.anchors = this.anchors.filter((a) => a.el !== el);
    };
  }

  project(obj, offsetY = 0) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    v.y += offsetY;
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  // ───────────────────────── loop ─────────────────────────

  frame() {
    // Optional frame cap (?fps=15) for slow machines and automated tests.
    const now0 = performance.now();
    if (this.maxFps && now0 - (this.lastFrame || 0) < 1000 / this.maxFps) return;
    this.lastFrame = now0;
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();
    const now = performance.now();

    if (this.walk) {
      const w = this.walk;
      const k = Math.min(1, (now - w.t0) / w.dur);
      let dist = k * w.total;
      let i = 0;
      while (i < w.lens.length - 1 && dist > w.lens[i]) dist -= w.lens[i++];
      const a = w.pts[i], b = w.pts[i + 1];
      const p = a.clone().lerp(b, w.lens[i] ? dist / w.lens[i] : 1);
      this.detective.group.position.copy(p);
      const dir = b.clone().sub(a);
      if (dir.lengthSq() > 0.001) this.detective.group.rotation.y = Math.atan2(dir.x, dir.z);
      if (k >= 1) {
        this.walk = null;
        this.detective.walking = false;
        this.faceSuspect();
      }
    }
    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (now - tw.t0) / tw.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      tw.critter.group.position.lerpVectors(tw.from, tw.to, tw.arc ? e : k);
      if (tw.arc) tw.critter.group.position.y += Math.sin(k * Math.PI) * 3;
      const d = tw.to.clone().sub(tw.from);
      if (!tw.arc && d.lengthSq() > 0.01) tw.critter.group.rotation.y = Math.atan2(d.x, d.z);
      if (k >= 1) {
        tw.critter.walking = false;
        if (tw.arc) tw.critter.group.rotation.y = FACE_CAMERA;
        tw.done?.();
        return false;
      }
      return true;
    });

    for (const k of Object.values(this.critters)) k.update(t, dt);
    this.dan.update(t, dt);
    this.detective.update(t, dt);
    this.manor.update(t);
    this.policeCar.userData.sirens.forEach((s, i) => (s.visible = Math.sin(t * 8 + i * Math.PI) > 0));
    this.onFrame?.(t, dt);

    // ease camera
    const ease = 1 - Math.pow(0.0025, dt);
    this.view.target.lerp(this.goal.target, ease);
    this.view.zoom += (this.goal.zoom - this.view.zoom) * ease;
    const target = this.view.target.clone().add(this.userPan);
    if (this.shake > 0) {
      target.x += (Math.random() - 0.5) * this.shake;
      target.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.position.copy(target).addScaledVector(ISO_DIR, 80);
    this.camera.lookAt(target);
    this.camera.zoom = this.view.zoom * this.userZoom;
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);

    for (const a of this.anchors) {
      if (!shown(a.obj)) {
        a.el.style.display = 'none';
        continue;
      }
      const p = this.project(a.obj, a.offsetY);
      a.el.style.display = '';
      a.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
  }
}
