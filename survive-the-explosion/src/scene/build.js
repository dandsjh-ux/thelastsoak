// Build layer: placed blocks, ghost preview, place / remove.
import * as THREE from 'three';
import { GRID, MAX_STACK, cellToWorld, canBuildAt } from '../sim/grid.js';
import { getMaterial } from '../data/materials.js';

const assetCache = new Map();

function tex(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function css(hex, amt = 0) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}

// Small canvas pattern per material id, so the blocks are easy to tell apart.
function patternFor(m) {
  const base = m.color;
  return tex((g, s) => {
    g.fillStyle = css(base); g.fillRect(0, 0, s, s);
    g.lineWidth = 4;
    const dark = css(base, -0.18), light = css(base, 0.14);
    switch (m.id) {
      case 'brick':
        g.strokeStyle = '#f1e6d6'; g.lineWidth = 5;
        for (let r = 0; r < 4; r++) {
          const y = r * s / 4;
          g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
          const off = r % 2 ? s / 4 : 0;
          for (let x = off; x < s; x += s / 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s / 4); g.stroke(); }
        }
        break;
      case 'wood':
        g.strokeStyle = dark;
        for (let r = 1; r < 4; r++) { g.beginPath(); g.moveTo(0, r * s / 4); g.lineTo(s, r * s / 4); g.stroke(); }
        g.lineWidth = 2; g.strokeStyle = light;
        for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(10, r * s / 4 + 12); g.bezierCurveTo(40, r * s / 4 + 6, 80, r * s / 4 + 20, 118, r * s / 4 + 12); g.stroke(); }
        break;
      case 'sandbag':
        g.strokeStyle = dark; g.lineWidth = 5; g.fillStyle = light;
        for (let r = 0; r < 2; r++) {
          g.beginPath(); g.roundRect(6 + r * 4, 8 + r * 62, s - 20, 50, 20); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(30, 33 + r * 62); g.lineTo(s - 34, 33 + r * 62); g.lineWidth = 2; g.stroke(); g.lineWidth = 5;
        }
        break;
      case 'cardboard':
        g.fillStyle = '#e9d3a3'; g.fillRect(s / 2 - 12, 0, 24, s);
        g.strokeStyle = dark; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
        g.fillStyle = dark; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('THIS WAY UP', s / 2, 100);
        break;
      case 'pillow':
        g.fillStyle = light; g.beginPath(); g.roundRect(8, 8, s - 16, s - 16, 36); g.fill();
        g.fillStyle = dark; g.beginPath(); g.arc(s / 2, s / 2, 7, 0, 7); g.fill();
        g.strokeStyle = dark; g.lineWidth = 3;
        for (let a = 0; a < 4; a++) { g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a * 1.57 + 0.78) * 38, s / 2 + Math.sin(a * 1.57 + 0.78) * 38); g.stroke(); }
        break;
      case 'concrete': case 'thickconcrete':
        g.fillStyle = dark;
        for (let i = 0; i < 40; i++) g.fillRect((i * 37) % s, (i * 59) % s, 4, 4);
        g.strokeStyle = dark; g.lineWidth = m.id === 'thickconcrete' ? 10 : 4; g.strokeRect(3, 3, s - 6, s - 6);
        if (m.id === 'thickconcrete') { g.lineWidth = 4; g.strokeRect(24, 24, s - 48, s - 48); }
        break;
      case 'steel':
        g.fillStyle = light; g.fillRect(8, 8, s - 16, 14);
        g.strokeStyle = dark; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
        g.fillStyle = '#e8eef3';
        [[18, 18], [s - 18, 18], [18, s - 18], [s - 18, s - 18]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); });
        break;
      case 'water':
        g.fillStyle = light; for (let r = 0; r < 3; r++) g.fillRect(0, 14 + r * 44, s, 8);
        g.strokeStyle = dark; g.lineWidth = 3;
        for (let r = 0; r < 3; r++) { g.beginPath(); g.moveTo(0, 14 + r * 44); g.lineTo(s, 14 + r * 44); g.stroke(); }
        g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(s / 2, s / 2, 16, 0, 7); g.fill();
        g.fillStyle = css(base, -0.05); g.beginPath(); g.moveTo(s / 2, s / 2 - 12); g.quadraticCurveTo(s / 2 + 12, s / 2 + 4, s / 2, s / 2 + 10); g.quadraticCurveTo(s / 2 - 12, s / 2 + 4, s / 2, s / 2 - 12); g.fill();
        break;
      case 'earth':
        g.fillStyle = dark; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc((i * 41) % s, (i * 67) % s, 5 + (i % 3) * 2, 0, 7); g.fill(); }
        g.fillStyle = '#6fbf4a'; g.fillRect(0, 0, s, 18);
        break;
      case 'lead':
        g.strokeStyle = light; g.lineWidth = 8;
        for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 34, s); g.lineTo(i * 34 + 80, 0); g.stroke(); }
        g.strokeStyle = dark; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
        g.fillStyle = '#ffe14d'; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.fillText('Pb', s / 2, s / 2 + 9);
        break;
      case 'foil':
        g.strokeStyle = '#ffffff'; g.lineWidth = 10;
        for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 30, s); g.lineTo(i * 30 + 70, 0); g.stroke(); }
        g.strokeStyle = dark; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
        break;
      default:
        g.strokeStyle = dark; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    }
  });
}

function assetsFor(materialId) {
  if (assetCache.has(materialId)) return assetCache.get(materialId);
  const m = getMaterial(materialId);
  const map = patternFor(m);
  const emissive = materialId === 'foil' ? 0x555555 : 0x000000;
  const material = new THREE.MeshLambertMaterial({ map, emissive });
  const barrel = materialId === 'water';
  const geo = barrel ? new THREE.CylinderGeometry(0.46, 0.46, 0.96, 18) : new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const edges = new THREE.EdgesGeometry(geo, 20);
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(m.color).multiplyScalar(0.45) });
  const a = { geo, material, edges, edgeMat };
  assetCache.set(materialId, a);
  return a;
}

export function makeBlockMesh(materialId) {
  const a = assetsFor(materialId);
  const mesh = new THREE.Mesh(a.geo, a.material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const lines = new THREE.LineSegments(a.edges, a.edgeMat);
  mesh.add(lines);
  return mesh;
}

export class BuildManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.blocks = new Map(); // "gx,gz,layer" -> { gx, gz, layer, materialId, mesh, pop }
    this.pops = [];
    this.level = null;

    // ghost
    this.ghost = new THREE.Group();
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat);
    this.ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.ghostPad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ghostPad.rotation.x = -Math.PI / 2;
    this.ghost.add(this.ghostBox, this.ghostEdges);
    this.ghost.visible = false; this.ghostPad.visible = false;
    scene.add(this.ghost, this.ghostPad);
    this.ghostT = 0;
  }

  setLevel(level) { this.level = level; this.clear(); }

  key(gx, gz, l) { return gx + ',' + gz + ',' + l; }
  height(gx, gz) {
    let h = 0;
    for (let l = 0; l < MAX_STACK; l++) if (this.blocks.has(this.key(gx, gz, l))) h = l + 1;
    return h;
  }
  isBlocked(gx, gz) { return this.blocks.has(this.key(gx, gz, 0)); }

  // reason string if not allowed, or null
  checkPlace(gx, gz) {
    if (!this.level) return 'No level';
    if (!canBuildAt(this.level, gx, gz)) return 'You cannot build here.';
    if (this.height(gx, gz) >= MAX_STACK) return 'This stack is full (3 high).';
    return null;
  }

  add(gx, gz, materialId, animate = true) {
    const layer = this.height(gx, gz);
    const mesh = makeBlockMesh(materialId);
    const p = cellToWorld(gx, gz);
    const m = getMaterial(materialId);
    mesh.position.set(p.x, layer + 0.5, p.z);
    // small random turn so stacks look hand-made
    mesh.rotation.y = ((gx * 7 + gz * 13 + layer * 5) % 5 - 2) * 0.03;
    if (animate) { mesh.scale.setScalar(0.2); this.pops.push({ mesh, t: 0 }); }
    this.group.add(mesh);
    const rec = { gx, gz, layer, materialId, mesh, cost: m.cost };
    this.blocks.set(this.key(gx, gz, layer), rec);
    return rec;
  }

  removeTop(gx, gz) {
    const h = this.height(gx, gz);
    if (!h) return null;
    const k = this.key(gx, gz, h - 1);
    const rec = this.blocks.get(k);
    this.blocks.delete(k);
    this.group.remove(rec.mesh);
    this.pops = this.pops.filter((p) => p.mesh !== rec.mesh);
    return rec;
  }

  clear() {
    for (const rec of this.blocks.values()) this.group.remove(rec.mesh);
    this.blocks.clear();
    this.pops.length = 0;
  }

  records() { return Array.from(this.blocks.values()); }
  placements() { return this.records().map((r) => ({ gx: r.gx, gz: r.gz, layer: r.layer, materialId: r.materialId })); }

  // Remove all meshes from the group (used when blocks get thrown by the blast): returns records.
  detachAll() {
    const recs = this.records();
    recs.forEach((r) => this.group.remove(r.mesh));
    return recs;
  }
  reattach(recs) {
    recs.forEach((r) => {
      const p = cellToWorld(r.gx, r.gz);
      r.mesh.position.set(p.x, r.layer + 0.5, p.z);
      r.mesh.rotation.set(0, 0, 0);
      r.mesh.scale.setScalar(1);
      this.group.add(r.mesh);
    });
  }

  showGhost(gx, gz, materialId, ok) {
    const p = cellToWorld(gx, gz);
    const h = this.height(gx, gz);
    const shown = gx >= 0 && gz >= 0 && gx < GRID && gz < GRID;
    this.ghost.visible = shown && h < MAX_STACK;
    this.ghostPad.visible = shown;
    if (!shown) return;
    const col = ok ? 0x4cd964 : 0xff4d4d;
    this.ghostMat.color.setHex(col);
    this.ghostPad.material.color.setHex(col);
    this.ghostBox.scale.setScalar(0.98);
    this.ghost.position.set(p.x, h + 0.5, p.z);
    this.ghostPad.position.set(p.x, 0.04, p.z);
    this.ghostPad.scale.setScalar(1);
    this.ghostMaterialId = materialId;
    this._ghostColor = col;
  }
  hideGhost() { this.ghost.visible = false; this.ghostPad.visible = false; }

  update(dt) {
    this.ghostT += dt;
    if (this.ghost.visible) {
      const s = 1 + Math.sin(this.ghostT * 6) * 0.025;
      this.ghost.scale.setScalar(s);
      this.ghostMat.opacity = 0.38 + Math.sin(this.ghostT * 6) * 0.1;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt / 0.22;
      const t = Math.min(p.t, 1);
      // overshoot bounce
      const s = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.18 - (1 - t) * (1 - t) * 0.8 : 1;
      p.mesh.scale.setScalar(Math.max(0.05, s));
      if (t >= 1) { p.mesh.scale.setScalar(1); this.pops.splice(i, 1); }
    }
  }
}
