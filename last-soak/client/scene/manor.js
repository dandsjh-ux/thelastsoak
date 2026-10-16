// Mossbottom Manor: a floating dollhouse diorama. 3×3 rooms, garden + pond to the south, police station to the east.
import * as THREE from 'three';
import { CELL, cellCenter } from '../../shared/layout.js';
import { G, mesh, block, toon, glow, canvasTex, outline } from './toon.js';

export const FLOOR_Y = 0.26;
const HALF = CELL / 2;

const ROOM_STYLE = {
  darkroom: { wall: '#6f6386', floor: ['#4f4763', '#5a5170'], pattern: 'checker' },
  bedroom: { wall: '#ffc6dc', floor: ['#f9e2ee', '#f3d3e3'], pattern: 'dots' },
  laundry: { wall: '#bfe6f0', floor: ['#ffffff', '#cfe9f5'], pattern: 'checker' },
  music: { wall: '#ddc9ff', floor: ['#b07c52', '#a26f48'], pattern: 'planks' },
  foyer: { wall: '#ffe2a8', floor: ['#fff4dc', '#eab08e'], pattern: 'checker' },
  parlor: { wall: '#c8e6bc', floor: ['#c48d5c', '#b57f51'], pattern: 'planks' },
  kitchen: { wall: '#fff0c4', floor: ['#ffffff', '#f6aaa4'], pattern: 'checker' },
  study: { wall: '#d9c0a0', floor: ['#91643f', '#845a38'], pattern: 'planks' },
  shed: { wall: '#c99f73', floor: ['#ad8c65', '#a08060'], pattern: 'planks' },
};

function floorTexture([a, b], pattern) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    if (pattern === 'checker') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) ctx.fillRect(x * 32, y * 32, 32, 32);
    } else if (pattern === 'planks') {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(0, i * 32, w, 2);
        ctx.fillRect(((i * 53) % 128), i * 32, 2, 32);
      }
    } else if (pattern === 'dots') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        ctx.beginPath();
        ctx.arc(x * 32 + 16 + (y % 2) * 16, y * 32 + 16, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [3, 3]);
}

function wallpaper(color) {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 6, h);
  }, [4, 1]);
}

/** A wall segment along x (dir 'x') or z (dir 'z'), base at FLOOR_Y. */
const WALLS = [];
function wallSeg(g, dir, cx, cz, len, height, color) {
  const tex = wallpaper(color);
  tex.repeat.set(len / 1.5, 1);
  const w = dir === 'x' ? len : 0.24;
  const d = dir === 'x' ? 0.24 : len;
  const m = mesh(G.box(w, height, d, 0.06), new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, gradientMap: toon('#fff').gradientMap }), cx, FLOOR_Y + height / 2, cz, { receive: true });
  g.add(m);
  WALLS.push(m);
  g.add(block(w + 0.06, 0.12, d + 0.06, '#fff8ee', cx, FLOOR_Y + height, cz, { radius: 0.05 }));
  g.add(block(w + 0.04, 0.16, d + 0.04, '#8a6a58', cx, FLOOR_Y, cz, { radius: 0.03 }));
  return m;
}

function windowOn(g, dir, x, z, y = 1.6) {
  const w = dir === 'x' ? 1.1 : 0.06;
  const d = dir === 'x' ? 0.06 : 1.1;
  const off = dir === 'x' ? [0, 0.14] : [0.14, 0];
  g.add(mesh(G.box(w + (dir === 'x' ? 0.16 : 0.04), 1.06, d + (dir === 'z' ? 0.16 : 0.04), 0.05), '#fff8ee', x + off[0], FLOOR_Y + y, z + off[1]));
  g.add(mesh(G.box(w, 0.9, d, 0.03), glow('#9fd0ff', 0.35), x + off[0] * 1.3, FLOOR_Y + y, z + off[1] * 1.3));
  g.add(mesh(G.box(dir === 'x' ? 0.06 : 0.08, 0.9, dir === 'z' ? 0.06 : 0.08, 0.01), '#fff8ee', x + off[0] * 1.5, FLOOR_Y + y, z + off[1] * 1.5));
}

function lampGlow(g, x, y, z, color = '#ffd27a', size = 0.16) {
  const bulb = mesh(G.sphere(size, 12, 10), glow(color, 1.4), x, y, z, { shadow: false });
  g.add(bulb);
  return bulb;
}

// ───────────────────────── furniture ─────────────────────────
// Keep-clear rule (checked by the walk test): nothing at body height on the room's centre cross
// (|dx| or |dz| < 0.85 from the centre), where the detective walks between doors, or in the south
// half where the suspect (-1.4, +1.3), detective (+1.4, +1.3) and assistant (+0.4, +2.3) stand.
// Furniture lives in the two north quadrants and against the west wall.

const FURNITURE = {
  kitchen(g, x, z) {
    const n = z - HALF + 0.6;
    g.add(block(1.9, 0.9, 0.9, '#f7c98b', x + 1.95, FLOOR_Y, n));
    g.add(block(2.0, 0.1, 1.0, '#fffaf2', x + 1.95, FLOOR_Y + 0.9, n));
    g.add(block(1.0, 0.95, 0.9, '#e7e2f2', x - 1.5, FLOOR_Y, n));
    for (const dx of [-0.22, 0.22]) g.add(mesh(G.cyl(0.14, 0.14, 0.03), '#3b3a44', x - 1.5 + dx, FLOOR_Y + 0.97, n));
    g.add(mesh(G.cyl(0.2, 0.18, 0.28), '#e05a4f', x - 1.5 + 0.22, FLOOR_Y + 1.12, n));
    const pot = mesh(G.sphere(0.17, 14, 10), '#ffffff', x + 1.3, FLOOR_Y + 1.12, n, { s: [1, 0.85, 1] });
    pot.add(mesh(G.cyl(0.03, 0.05, 0.2), '#ffffff', 0.18, 0.02, 0, { r: [0, 0, -1] }));
    pot.add(mesh(G.sphere(0.04, 8, 6), '#ffd23f', 0, 0.17, 0));
    g.add(pot);
    for (let i = 0; i < 3; i++) g.add(mesh(G.cyl(0.11, 0.11, 0.18), ['#ffd23f', '#9fd77a', '#ff9f80'][i], x + 1.9 + i * 0.3, FLOOR_Y + 1.04, n));
    // pantry shelf on the west wall, with the lilac moonpoppy tin
    const w = x - HALF + 0.45;
    g.add(block(0.2, 2.0, 1.8, '#a9774f', w - 0.15, FLOOR_Y, z + 0.6));
    for (let r = 0; r < 3; r++) g.add(block(0.5, 0.08, 1.8, '#c98f5a', w + 0.05, FLOOR_Y + 0.2 + r * 0.65, z + 0.6, { radius: 0.03 }));
    for (const [i, c] of ['#b9a3ff', '#ffd23f', '#ff9f80', '#ffffff', '#9fd77a', '#f6aaa4'].entries()) {
      g.add(mesh(G.cyl(0.12, 0.12, 0.28), c, w + 0.1, FLOOR_Y + 0.42 + (i % 3) * 0.65, z + 0.05 + i * 0.25));
    }
    g.add(block(0.9, 0.7, 0.9, '#f7c98b', x + 2.45, FLOOR_Y, z - 0.2));
  },
  study(g, x, z) {
    const n = z - HALF + 0.4;
    g.add(block(2.0, 2.1, 0.5, '#7a5236', x + 1.9, FLOOR_Y, n));
    const cols = ['#e05a4f', '#3f6e8c', '#f2c94c', '#6f9a5a', '#b9a3ff'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
      g.add(block(0.22, 0.45, 0.32, cols[(i + r * 2) % cols.length], x + 1.1 + i * 0.32, FLOOR_Y + 0.15 + r * 0.66, n + 0.12, { radius: 0.03 }));
    }
    // desk tucked into the north-west corner
    const dx = x - 1.9, dz = z - 1.4;
    g.add(block(1.7, 0.75, 0.9, '#9a6a42', dx, FLOOR_Y, dz));
    g.add(block(0.5, 0.12, 0.6, '#3f6e8c', dx - 0.2, FLOOR_Y + 0.75, dz, { radius: 0.03 }));
    lampGlow(g, dx + 0.5, FLOOR_Y + 1.15, dz - 0.2, '#bff5a8', 0.13);
    g.add(mesh(G.cyl(0.03, 0.03, 0.4), '#c99a2e', dx + 0.5, FLOOR_Y + 0.95, dz - 0.2));
    // torn ledger pages on the floor
    for (let i = 0; i < 7; i++) {
      g.add(mesh(G.box(0.32, 0.02, 0.24, 0.005), '#fffaf2', x - 0.6 + Math.sin(i * 2.3) * 1.2, FLOOR_Y + 0.02, z + 1.0 + Math.cos(i * 1.7) * 0.8, { r: [0, i, 0] }));
    }
  },
  shed(g, x, z) {
    const n = z - HALF + 0.55;
    g.add(block(1.9, 0.85, 0.8, '#a9774f', x + 1.9, FLOOR_Y, n));
    for (let i = 0; i < 3; i++) g.add(mesh(G.cyl(0.18, 0.13, 0.3), '#d9774b', x + 1.4 + i * 0.5, FLOOR_Y + 1.0, n));
    for (let i = 0; i < 3; i++) g.add(mesh(G.sphere(0.12, 10, 8), '#6f9a5a', x + 1.4 + i * 0.5, FLOOR_Y + 1.2, n));
    const w = x - HALF + 0.4;
    g.add(mesh(G.cyl(0.04, 0.04, 1.4), '#8a5d3b', w + 0.2, FLOOR_Y + 0.9, z - 0.8, { r: [0, 0, 0.2] }));
    g.add(mesh(G.box(0.3, 0.38, 0.05, 0.03), '#9aa0ad', w + 0.07, FLOOR_Y + 0.25, z - 0.8, { r: [0, 0, 0.2] }));
    for (const [sx, sz] of [[x - 2.2, z - 1.9], [x - 1.35, z - 2.2]]) g.add(mesh(G.sphere(0.4, 14, 10), '#e6d3a8', sx, FLOOR_Y + 0.35, sz, { s: [1, 0.85, 0.9] }));
    g.add(mesh(G.cyl(0.22, 0.25, 0.4), '#4fb3a9', x + 2.5, FLOOR_Y + 0.2, z + 2.4));
  },
  music(g, x, z) {
    const px = x - 1.85, pz = z - 1.85; // grand piano in the north-west corner
    g.add(block(2.0, 0.55, 1.3, '#2b2233', px, FLOOR_Y + 0.55, pz, { radius: 0.2 }));
    for (const [dx, dz] of [[-0.8, -0.5], [0.8, -0.5], [0, 0.5]]) g.add(mesh(G.cyl(0.07, 0.07, 0.55), '#2b2233', px + dx, FLOOR_Y + 0.28, pz + dz));
    g.add(mesh(G.box(1.9, 0.05, 1.2, 0.03), '#2b2233', px, FLOOR_Y + 1.35, pz - 0.35, { r: [0.6, 0, 0] }));
    g.add(block(1.6, 0.06, 0.25, '#fffaf2', px, FLOOR_Y + 1.1, pz + 0.62, { radius: 0.02 }));
    for (let i = 0; i < 7; i++) g.add(block(0.07, 0.04, 0.14, '#2b2233', px - 0.6 + i * 0.2, FLOOR_Y + 1.14, pz + 0.58, { radius: 0.01 }));
    g.add(block(1.0, 0.45, 0.4, '#7b4fa0', px, FLOOR_Y, pz + 1.15));
    // music stand in the south-west corner
    g.add(mesh(G.cyl(0.03, 0.03, 1.1), '#3b3a44', x - 2.45, FLOOR_Y + 0.55, z + 2.35));
    g.add(mesh(G.box(0.5, 0.36, 0.04, 0.02), '#fffaf2', x - 2.45, FLOOR_Y + 1.2, z + 2.35, { r: [-0.3, 0.6, 0] }));
    // half-eaten slice of cake
    g.add(mesh(G.cyl(0.25, 0.25, 0.04), '#ffffff', x + 2.3, FLOOR_Y + 0.02, z - 2.2));
    g.add(mesh(G.cyl(0.18, 0.18, 0.18, 3), '#ffe3ef', x + 2.3, FLOOR_Y + 0.13, z - 2.2));
  },
  parlor(g, x, z) {
    g.add(mesh(G.cyl(1.7, 1.7, 0.03, 32), '#d9574b', x, FLOOR_Y + 0.02, z, { receive: true, s: [1, 1, 0.8] }));
    g.add(mesh(G.cyl(1.4, 1.4, 0.035, 32), '#f2c94c', x, FLOOR_Y + 0.025, z, { receive: true, s: [1, 1, 0.8] }));
    // armchair
    const ax = x - 1.6, az = z - 1.5;
    g.add(block(1.2, 0.5, 1.0, '#e05a4f', ax, FLOOR_Y, az, { radius: 0.2 }));
    g.add(block(1.2, 0.9, 0.3, '#e05a4f', ax, FLOOR_Y + 0.4, az - 0.4, { radius: 0.15 }));
    for (const s of [-1, 1]) g.add(block(0.25, 0.75, 1.0, '#c94b42', ax + s * 0.55, FLOOR_Y, az, { radius: 0.12 }));
    // card table
    const tx = x + 1.9, tz = z - 1.9;
    g.add(mesh(G.cyl(0.75, 0.75, 0.08, 24), '#3f8f5a', tx, FLOOR_Y + 0.75, tz));
    g.add(mesh(G.cyl(0.08, 0.15, 0.75), '#7a5236', tx, FLOOR_Y + 0.37, tz));
    for (let i = 0; i < 5; i++) g.add(mesh(G.box(0.18, 0.015, 0.26, 0.01), i === 2 ? '#e05a4f' : '#fffaf2', tx - 0.3 + i * 0.15, FLOOR_Y + 0.8, tz + Math.sin(i) * 0.1, { r: [0, i * 0.3, 0] }));
    // lifebuoy on the north wall
    g.add(mesh(G.torus(0.32, 0.1), '#ffffff', x + 0.2, FLOOR_Y + 1.8, z - HALF + 0.2));
    for (let i = 0; i < 4; i++) g.add(mesh(G.box(0.12, 0.22, 0.22, 0.04), '#e05a4f', x + 0.2 + Math.cos(i * Math.PI / 2) * 0.32, FLOOR_Y + 1.8 + Math.sin(i * Math.PI / 2) * 0.32, z - HALF + 0.2));
  },
  darkroom(g, x, z) {
    const n = z - HALF + 0.55;
    g.add(block(2.6, 0.85, 0.8, '#3b3a44', x + 0.2, FLOOR_Y, n));
    for (let i = 0; i < 3; i++) g.add(block(0.6, 0.08, 0.45, ['#cfe9f5', '#f6aaa4', '#fffaf2'][i], x - 0.6 + i * 0.75, FLOOR_Y + 0.85, n, { radius: 0.03 }));
    // drying line with photos
    const lineZ = z - 0.4;
    g.add(mesh(G.cyl(0.012, 0.012, CELL - 0.6), '#fffaf2', x, FLOOR_Y + 2.0, lineZ, { r: [0, 0, Math.PI / 2], shadow: false }));
    for (let i = 0; i < 5; i++) g.add(mesh(G.box(0.38, 0.46, 0.02, 0.01), i === 2 ? '#fff8d8' : '#e8e2f0', x - 2 + i * 1.0, FLOOR_Y + 1.7, lineZ, { r: [0, 0, Math.sin(i) * 0.1] }));
    lampGlow(g, x - HALF + 0.5, FLOOR_Y + 2.2, z - HALF + 0.5, '#ff4d5e', 0.2);
    g.add(mesh(G.cone(0.3, 0.25, 12), '#3b3a44', x - HALF + 0.5, FLOOR_Y + 2.38, z - HALF + 0.5));
  },
  bedroom(g, x, z) {
    const bx = x - 1.6, bz = z - 1.4;
    g.add(block(1.6, 0.5, 2.4, '#c98f5a', bx, FLOOR_Y, bz, { radius: 0.12 }));
    g.add(block(1.5, 0.22, 2.0, '#ff9fc6', bx, FLOOR_Y + 0.5, bz + 0.15, { radius: 0.1 }));
    g.add(block(1.2, 0.22, 0.45, '#ffffff', bx, FLOOR_Y + 0.55, bz - 0.85, { radius: 0.1 }));
    g.add(block(1.7, 1.2, 0.2, '#c98f5a', bx, FLOOR_Y, bz - 1.2, { radius: 0.1 }));
    // half-packed suitcase (spoons!)
    const sx = x + 1.6, sz = z - 1.6;
    g.add(block(1.1, 0.35, 0.75, '#e0a14f', sx, FLOOR_Y, sz, { radius: 0.08 }));
    g.add(mesh(G.box(1.1, 0.75, 0.1, 0.06), '#e0a14f', sx, FLOOR_Y + 0.7, sz - 0.4, { r: [-0.3, 0, 0] }));
    for (let i = 0; i < 5; i++) g.add(mesh(G.capsule(0.03, 0.3), '#dfe6ee', sx - 0.35 + i * 0.17, FLOOR_Y + 0.38, sz, { r: [Math.PI / 2, 0, 0.2], shadow: false }));
    // heart rug
    g.add(mesh(G.cyl(0.9, 0.9, 0.03, 24), '#ffd6e7', x + 0.6, FLOOR_Y + 0.02, z + 0.9, { s: [1.2, 1, 0.8], receive: true }));
  },
  laundry(g, x, z) {
    const n = z - HALF + 0.6;
    for (let i = 0; i < 2; i++) {
      const wx = x - 0.9 + i * 1.3;
      g.add(block(1.1, 1.15, 1.0, '#ffffff', wx, FLOOR_Y, n));
      g.add(mesh(G.torus(0.3, 0.05), '#9aa0ad', wx, FLOOR_Y + 0.55, n + 0.5));
      g.add(mesh(G.cyl(0.28, 0.28, 0.04, 20), glow('#8fd3ff', 0.4), wx, FLOOR_Y + 0.55, n + 0.5, { r: [Math.PI / 2, 0, 0] }));
    }
    const lx = x + 2.2, lz = z - 0.9; // laundry basket, out of the walkway
    g.add(mesh(G.cyl(0.5, 0.4, 0.55, 16), '#d9b07c', lx, FLOOR_Y + 0.28, lz));
    for (let i = 0; i < 3; i++) g.add(mesh(G.sphere(0.25, 10, 8), ['#ff9fc6', '#9fd3e8', '#fff1a8'][i], lx - 0.1 + (i - 1) * 0.22, FLOOR_Y + 0.6, lz + (i % 2) * 0.15, { s: [1, 0.6, 1] }));
    for (let i = 0; i < 4; i++) g.add(block(0.7, 0.14, 0.5, ['#ffffff', '#9fd3e8', '#ff9fc6', '#fff1a8'][i], x - HALF + 0.55, FLOOR_Y + i * 0.15, z + 0.9, { radius: 0.06 }));
  },
  foyer(g, x, z) {
    g.add(mesh(G.cyl(2.0, 2.0, 0.03, 36), '#b9455c', x, FLOOR_Y + 0.02, z, { receive: true }));
    g.add(mesh(G.cyl(1.7, 1.7, 0.035, 36), '#f2c94c', x, FLOOR_Y + 0.025, z, { receive: true }));
    // grandfather clock
    const cx = x - HALF + 0.5, cz = z - HALF + 0.5;
    g.add(block(0.7, 2.3, 0.5, '#7a5236', cx, FLOOR_Y, cz));
    g.add(mesh(G.cyl(0.24, 0.24, 0.05, 20), '#fffaf2', cx + 0.05, FLOOR_Y + 1.9, cz + 0.27, { r: [Math.PI / 2, 0, 0] }));
    // party table with birthday cake + balloons
    const tx = x + 1.5, tz = z - 1.6;
    g.add(mesh(G.cyl(0.65, 0.65, 0.08, 20), '#fffaf2', tx, FLOOR_Y + 0.72, tz));
    g.add(mesh(G.cyl(0.08, 0.14, 0.72), '#c98f5a', tx, FLOOR_Y + 0.36, tz));
    g.add(mesh(G.cyl(0.35, 0.35, 0.25, 20), '#ffe3ef', tx, FLOOR_Y + 0.9, tz));
    g.add(mesh(G.cyl(0.25, 0.25, 0.2, 20), '#ffffff', tx, FLOOR_Y + 1.12, tz));
    g.add(mesh(G.sphere(0.07, 8, 6), '#ffd23f', tx, FLOOR_Y + 1.27, tz));
    for (let i = 0; i < 3; i++) {
      const bx = tx - 0.5 + i * 0.4, by = FLOOR_Y + 2.1 + (i % 2) * 0.25, bz = tz - 0.3;
      g.add(mesh(G.sphere(0.24, 14, 10), glow(['#ff7eb6', '#7ec8ff', '#ffd23f'][i], 0.25), bx, by, bz, { s: [1, 1.15, 1] }));
      g.add(mesh(G.cyl(0.006, 0.006, by - FLOOR_Y - 0.9), '#ffffff', bx, (by + FLOOR_Y + 0.9) / 2 - 0.1, bz, { shadow: false }));
    }
    g.add(mesh(G.cyl(0.25, 0.2, 0.4, 12), '#d9774b', x - 1.8, FLOOR_Y + 0.2, z + 1.8));
    g.add(mesh(G.sphere(0.45, 12, 10), '#6fbf63', x - 1.8, FLOOR_Y + 0.8, z + 1.8));
  },
};

// ───────────────────────── garden ─────────────────────────

function buildGarden(g) {
  const out = {};
  // path from the garden door to the pond
  for (let i = 0; i < 4; i++) g.add(mesh(G.cyl(0.45, 0.5, 0.08, 10), '#e9dfcf', (i % 2) * 0.4 - 0.2, 0.04, 10 + i * 0.9, { receive: true }));
  // pond
  const pond = new THREE.Group();
  pond.position.set(0, 0, 15.5);
  g.add(pond);
  pond.add(mesh(G.cyl(1, 1, 0.12, 48), '#e9dfcf', 0, 0.02, 0, { s: [4.3, 1, 3.3], receive: true }));
  const water = mesh(G.cyl(1, 1, 0.1, 48), toon('#5fc4e8', { emissive: '#2a6fa0', emissiveIntensity: 0.25 }), 0, 0.06, 0, { s: [3.9, 1, 2.9], receive: true, shadow: false });
  pond.add(water);
  out.water = water;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    pond.add(mesh(G.sphere(0.3, 8, 6), i % 3 ? '#b8b4c4' : '#a7a2b5', Math.cos(a) * 4.1, 0.1, Math.sin(a) * 3.15, { s: [1.2, 0.6, 1] }));
  }
  for (const [x, z, f] of [[-2.4, -0.8, true], [-1.6, 1.4, false], [2.6, 1.0, true]]) {
    pond.add(mesh(G.cyl(0.35, 0.35, 0.03, 16, Math.PI * 1.8), '#6fbf63', x, 0.13, z, { shadow: false }));
    if (f) pond.add(mesh(G.sphere(0.1, 8, 6), '#ffb8d9', x, 0.2, z));
  }
  // Mr. Dan's soaking rock
  const rock = mesh(G.box(1.3, 0.6, 1.0, 0.28), '#9e99ad', 1.2, 0.05, -0.6, { r: [0, 0.4, 0] });
  pond.add(rock);
  out.rockPos = new THREE.Vector3(1.2, 0.35, 15.5 - 0.6);
  out.pondCenter = new THREE.Vector3(0, 0.1, 15.5);
  // police tape around the rock
  const tapePosts = [[-0.2, -1.6], [2.6, -1.6], [2.8, 0.6], [-0.4, 0.5]];
  tapePosts.forEach(([x, z], i) => {
    pond.add(mesh(G.cyl(0.04, 0.04, 0.8), '#f2c94c', x, 0.4, z));
    const [nx, nz] = tapePosts[(i + 1) % 4];
    const len = Math.hypot(nx - x, nz - z);
    pond.add(mesh(G.box(len, 0.08, 0.02, 0.005), '#ffd23f', (x + nx) / 2, 0.7, (z + nz) / 2, { r: [0, -Math.atan2(nz - z, nx - x), 0], shadow: false }));
  });
  out.tape = pond.children.slice(-8);

  // vegetable beds (east): tomatoes + carrots
  const bed = (x, z, kind) => {
    g.add(block(3.2, 0.35, 1.6, '#a9774f', x, 0, z, { radius: 0.06 }));
    g.add(block(3.0, 0.06, 1.4, '#6b4a34', x, 0.32, z, { radius: 0.03 }));
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
      const px = x - 1.2 + i * 0.6, pz = z - 0.35 + j * 0.7;
      if (kind === 'tomato') {
        g.add(mesh(G.cyl(0.03, 0.03, 0.6), '#4f8a3f', px, 0.65, pz));
        g.add(mesh(G.sphere(0.2, 10, 8), '#6fbf63', px, 0.95, pz));
        g.add(mesh(G.sphere(0.09, 8, 6), '#e8453c', px + 0.12, 0.85, pz + 0.12));
      } else {
        g.add(mesh(G.cone(0.08, 0.2, 6), '#f08a3c', px, 0.42, pz));
        g.add(mesh(G.cone(0.1, 0.3, 5), '#6fbf63', px, 0.6, pz));
      }
    }
  };
  bed(6.4, 12.4, 'tomato');
  bed(6.4, 17.6, 'carrot');
  // hedges (west)
  for (const [x, z, w] of [[-6.6, 11.8, 3.4], [-7.4, 15.2, 1.8], [-6.6, 18.6, 3.4]]) g.add(outline(block(w, 1.2, 1.3, '#58a85a', x, 0, z, { radius: 0.5 }), 0.03));
  // picket fence + gate
  const fence = (x0, x1, z) => {
    for (let x = x0; x <= x1; x += 0.6) g.add(block(0.18, 0.75, 0.08, '#fffaf2', x, 0, z, { radius: 0.04 }));
    g.add(block(x1 - x0 + 0.2, 0.08, 0.06, '#fffaf2', (x0 + x1) / 2, 0.45, z, { radius: 0.02 }));
  };
  fence(-9.6, -1.4, 21.6);
  fence(1.4, 9.6, 21.6);
  for (const s of [-1, 1]) {
    g.add(block(0.3, 1.2, 0.3, '#e9dfcf', s * 1.1, 0, 21.6));
    g.add(lampGlow(g, s * 1.1, 1.38, 21.6));
  }
  g.add(block(1.9, 0.9, 0.08, '#3b3a44', 0, 0, 21.6, { radius: 0.03 }));
  // lantern posts
  out.lanterns = [];
  for (const [x, z] of [[-2.2, 10.4], [2.2, 10.4], [-4.8, 15.5], [4.8, 15.5], [-2.6, 20.2], [2.6, 20.2]]) {
    g.add(mesh(G.cyl(0.05, 0.06, 1.6), '#3b3a44', x, 0.8, z));
    out.lanterns.push(lampGlow(g, x, 1.7, z, '#ffcf6a', 0.18));
  }
  return out;
}

function tree(g, x, z, s = 1, kind = 0) {
  g.add(mesh(G.cyl(0.18 * s, 0.25 * s, 1.2 * s), '#8a5d3b', x, 0.6 * s, z));
  if (kind === 0) {
    g.add(outline(mesh(G.sphere(1.0 * s, 14, 12), '#5fb35f', x, 1.9 * s, z), 0.04));
    g.add(mesh(G.sphere(0.7 * s, 12, 10), '#78c66f', x + 0.4 * s, 2.5 * s, z + 0.3 * s));
  } else {
    for (let i = 0; i < 3; i++) g.add(mesh(G.cone((1.1 - i * 0.25) * s, 1.0 * s, 10), '#4f9e62', x, (1.5 + i * 0.6) * s, z));
  }
}

function buildStation(g) {
  // North of the drive, so the accused line up between the station and the road.
  const sx = 14.4, sz = -5.0;
  g.add(block(2.4, 0.2, 2.4, '#d6d2e0', sx, 0, sz));
  g.add(outline(block(2.0, 2.6, 2.0, '#2d4a8a', sx, 0.2, sz, { radius: 0.12 }), 0.03));
  g.add(block(2.2, 0.25, 2.2, '#24407a', sx, 2.8, sz));
  const light = mesh(G.sphere(0.22, 12, 10), glow('#7ec8ff', 2), sx, 3.25, sz);
  g.add(light);
  const sign = canvasTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1d2b52';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 38px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STATION', w / 2, h / 2 + 2);
  });
  for (const [x, z, ry] of [[sx + 1.02, sz, Math.PI / 2], [sx, sz + 1.02, 0]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ map: sign }));
    p.position.set(x, 2.5, z);
    p.rotation.y = ry;
    g.add(p);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), toon('#bfe0ff', { emissive: '#7aa6d9', emissiveIntensity: 0.6 }));
    win.position.set(x + (ry ? 0.01 : 0), 1.4, z + (ry ? 0 : 0.01));
    win.rotation.y = ry;
    g.add(win);
  }
  const spots = [];
  for (let i = 0; i < 8; i++) spots.push(new THREE.Vector3(11.9 + (i % 4) * 1.15, 0, -2.95 + Math.floor(i / 4) * 1.15 + (i % 2) * 0.15));
  return { light, spots, pos: new THREE.Vector3(sx, 0, sz) };
}

// The drive: from a tunnel through the grassy hill at the island's east edge, straight west to the front porch.
export const ROAD = { z: 0, from: 17.2, park: 12.6, porch: 10.0 };

function buildRoad(g) {
  const z = ROAD.z;
  const x0 = 9.4, x1 = 16.1;
  g.add(block(x1 - x0, 0.04, 2.0, '#d6d2e0', (x0 + x1) / 2, 0, z, { radius: 0.02 })); // curbs
  g.add(block(x1 - x0, 0.06, 1.7, '#6f6b80', (x0 + x1) / 2, 0, z, { radius: 0.02 }));
  for (let x = x0 + 0.9; x < x1 - 0.3; x += 1.0) g.add(block(0.45, 0.07, 0.1, '#fff1a8', x, 0, z, { radius: 0.02 }));
  // front porch: steps up to the parlor, doormat, two lanterns
  g.add(block(0.7, 0.13, 1.8, '#e9dfcf', 9.65, 0, z, { radius: 0.04 }));
  g.add(mesh(G.box(0.9, 0.02, 1.2, 0.01), '#c0504d', CELL * 1.5 - 0.55, FLOOR_Y + 0.01, z, { receive: true }));
  for (const s of [-1, 1]) {
    g.add(mesh(G.cyl(0.05, 0.06, 1.4), '#3b3a44', 10.0, 0.7, z + s * 1.2));
    lampGlow(g, 10.0, 1.48, z + s * 1.2, '#ffcf6a', 0.16);
  }
  // grassy hill with a tunnel: the police car drives out of it
  g.add(outline(block(2.6, 1.9, 2.8, '#58a85a', 17.0, 0, z, { radius: 0.7 }), 0.03));
  g.add(block(0.08, 1.35, 1.5, '#1b1530', 15.67, 0, z, { radius: 0.02 }));
  for (const s of [-1, 1]) g.add(block(0.3, 1.55, 0.3, '#d6d2e0', 15.6, 0, z + s * 0.9, { radius: 0.06 }));
  g.add(block(0.32, 0.3, 2.1, '#d6d2e0', 15.6, 1.45, z, { radius: 0.06 }));
}

/** Police car. Its nose points along +x; rotation.y = PI drives it west. */
export function buildPoliceCar() {
  const car = new THREE.Group();
  car.add(outline(block(1.6, 0.55, 1.0, '#ffffff', 0, 0.22, 0, { radius: 0.2 }), 0.03));
  car.add(block(1.62, 0.2, 1.02, '#2d4a8a', 0, 0.42, 0, { radius: 0.08 }));
  car.add(block(0.9, 0.45, 0.9, '#ffffff', -0.1, 0.75, 0, { radius: 0.18 }));
  car.add(mesh(G.box(0.85, 0.32, 0.92, 0.1), toon('#9fd0ff', { emissive: '#4a7fb5', emissiveIntensity: 0.4 }), -0.1, 0.98, 0));
  const red = mesh(G.box(0.18, 0.12, 0.2, 0.05), glow('#ff4d5e', 2), -0.1, 1.27, -0.14);
  const blue = mesh(G.box(0.18, 0.12, 0.2, 0.05), glow('#4d8aff', 2), -0.1, 1.27, 0.14);
  car.add(red, blue);
  const wheels = [];
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const w = mesh(G.cyl(0.22, 0.22, 0.14, 14), '#2b2233', x, 0.22, z, { r: [Math.PI / 2, 0, 0] });
    w.add(mesh(G.box(0.3, 0.16, 0.06, 0.02), '#d6d2e0', 0, 0, 0, { shadow: false })); // hubcap, so the spin shows
    car.add(w);
    wheels.push(w);
  }
  // headlights on the nose, tail lights at the back
  for (const s of [-1, 1]) {
    car.add(mesh(G.box(0.06, 0.12, 0.2, 0.03), glow('#fff3b0', 1.8), 0.81, 0.42, s * 0.32));
    car.add(mesh(G.box(0.06, 0.1, 0.16, 0.03), glow('#ff4d5e', 1.2), -0.81, 0.44, s * 0.34));
  }
  car.userData.sirens = [red, blue];
  car.userData.wheels = wheels;
  return car;
}

function fireflies(scene, count = 40) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const s = { x: (Math.random() - 0.5) * 20, y: 0.8 + Math.random() * 2.5, z: 10 + Math.random() * 11, p: Math.random() * 10 };
    seeds.push(s);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprite = canvasTex(32, 32, (ctx) => {
    const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,250,190,1)');
    gr.addColorStop(0.4, 'rgba(255,230,120,0.6)');
    gr.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 32, 32);
  });
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, map: sprite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts);
  return (t) => {
    seeds.forEach((s, i) => {
      pos[i * 3] = s.x + Math.sin(t * 0.5 + s.p) * 0.8;
      pos[i * 3 + 1] = s.y + Math.sin(t * 1.3 + s.p * 2) * 0.3;
      pos[i * 3 + 2] = s.z + Math.cos(t * 0.4 + s.p) * 0.8;
    });
    geo.attributes.position.needsUpdate = true;
    pts.material.opacity = 0.6 + Math.sin(t * 3) * 0.3;
  };
}

export function buildManor(scene, roomsMeta) {
  const g = new THREE.Group();
  scene.add(g);

  // floating island
  const ix = 2.75, iz = 5.5, iw = 31, id = 36;
  g.add(block(iw, 0.6, id, '#9fd77a', ix, -0.6, iz, { radius: 0.3 }));
  g.add(block(iw - 0.4, 2.6, id - 0.4, '#b5835a', ix, -3.1, iz, { radius: 0.3 }));
  g.add(block(iw - 2, 1.4, id - 2, '#9c6d4a', ix, -4.3, iz, { radius: 0.5 }));
  // manor base
  g.add(block(CELL * 3 + 0.6, FLOOR_Y, CELL * 3 + 0.6, '#efe3d0', 0, 0, 0, { radius: 0.06 }));

  const rooms = {};
  const darkMat = () => new THREE.MeshBasicMaterial({ color: '#0d0820', transparent: true, opacity: 0, depthWrite: false });
  for (const [id, meta] of Object.entries(roomsMeta)) {
    const [cx, cz] = meta.cell;
    const { x, z } = cellCenter(meta.cell);
    const st = ROOM_STYLE[id];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELL - 0.1, CELL - 0.1), new THREE.MeshToonMaterial({ map: floorTexture(st.floor, st.pattern), gradientMap: toon('#fff').gradientMap, emissive: '#ffe08a', emissiveIntensity: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, FLOOR_Y + 0.005, z);
    floor.receiveShadow = true;
    floor.userData.roomId = id;
    g.add(floor);

    const outer = { north: cz === 0, west: cx === 0 };
    const H_OUT = 2.8;
    const H_IN = 1.25;
    const DOOR = 1.7;
    // north wall
    if (outer.north) {
      wallSeg(g, 'x', x, z - HALF, CELL, H_OUT, st.wall);
      windowOn(g, 'x', x + 1.2, z - HALF);
    } else {
      const seg = (CELL - DOOR) / 2;
      wallSeg(g, 'x', x - HALF + seg / 2, z - HALF, seg, H_IN, st.wall);
      wallSeg(g, 'x', x + HALF - seg / 2, z - HALF, seg, H_IN, st.wall);
    }
    if (outer.west) {
      wallSeg(g, 'z', x - HALF, z, CELL, H_OUT, st.wall);
      windowOn(g, 'z', x - HALF, z + 1.2);
    } else {
      const seg = (CELL - DOOR) / 2;
      wallSeg(g, 'z', x - HALF, z - HALF + seg / 2, seg, H_IN, st.wall);
      wallSeg(g, 'z', x - HALF, z + HALF - seg / 2, seg, H_IN, st.wall);
    }
    // cut-away skirting on the camera-facing outer edges
    if (cz === 2) g.add(block(CELL, 0.22, 0.22, '#e3d3bb', x, FLOOR_Y, z + HALF, { radius: 0.05 }));
    if (cx === 2) g.add(block(0.22, 0.22, CELL, '#e3d3bb', x + HALF, FLOOR_Y, z, { radius: 0.05 }));

    const n0 = g.children.length;
    FURNITURE[id]?.(g, x, z);
    const furniture = g.children.slice(n0);

    // ceiling lamp glow + "lights off" overlay for the cinematic
    const lamp = lampGlow(g, x + 0.3, FLOOR_Y + 2.6, z + 0.3, id === 'darkroom' ? '#ff4d5e' : '#ffe1a0', 0.14);
    const dark = new THREE.Mesh(new THREE.BoxGeometry(CELL, 3.2, CELL), darkMat());
    dark.position.set(x, FLOOR_Y + 1.6, z);
    dark.renderOrder = 5;
    g.add(dark);

    const hl = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0, depthWrite: false }));
    hl.rotation.x = -Math.PI / 2;
    hl.position.set(x, FLOOR_Y + 0.03, z);
    g.add(hl);

    rooms[id] = { id, center: new THREE.Vector3(x, FLOOR_Y, z), floor, dark, hl, lamp, cell: meta.cell, furniture };
  }

  // the camera-facing corner post to finish the dollhouse
  g.add(block(0.4, 0.5, 0.4, '#e3d3bb', CELL * 1.5, FLOOR_Y - 0.1, CELL * 1.5));
  // garden door marker on the south edge of the foyer column (below the Study)
  g.add(block(1.4, 0.06, 0.8, '#c98f5a', 0, FLOOR_Y, CELL * 1.5 + 0.3, { radius: 0.03 }));

  const garden = buildGarden(g);
  const station = buildStation(g);
  buildRoad(g);

  // trees around the island
  for (const [x, z, s, k] of [[-11, -10, 1.1, 1], [-11, -3, 0.9, 0], [-11, 5, 1.2, 1], [-10.6, 12, 1, 0], [-10.8, 20, 1.2, 1], [11.2, -10.5, 1, 0], [17, -10, 1.2, 1], [17, 9, 1, 0], [12, 13, 1.2, 1], [16.5, 18, 1, 0], [11.5, 22, 0.9, 1], [-3, -11.4, 0.8, 0], [4, -11.4, 1, 1]]) tree(g, x, z, s, k);
  for (const [x, z] of [[11, 6], [16.8, 3.4], [-10.8, 9]]) g.add(outline(block(1.2, 0.8, 1.0, '#58a85a', x, 0, z, { radius: 0.4 }), 0.03));

  const updateFireflies = fireflies(scene);
  return { group: g, rooms, garden, station, walls: WALLS, update: (t) => {
    updateFireflies(t);
    station.light.material.emissive.set(Math.sin(t * 6) > 0 ? '#ff4d5e' : '#4d8aff');
    garden.water.material.emissiveIntensity = 0.22 + Math.sin(t * 1.5) * 0.06;
    garden.lanterns.forEach((l, i) => (l.material.emissiveIntensity = 1.3 + Math.sin(t * 3 + i) * 0.2));
  } };
}
