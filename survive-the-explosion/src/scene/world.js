// World: renderer, sky, ground, yard, fence, house, lights, blast markers.
import * as THREE from 'three';
import { GRID, HOUSE } from '../sim/grid.js';

const HALF = GRID / 2;

export function makeLabelTexture(lines, opts = {}) {
  const w = opts.w || 512, hgt = opts.h || 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.beginPath();
    g.roundRect(6, 6, w - 12, hgt - 12, 28);
    g.fill();
    g.lineWidth = 10; g.strokeStyle = opts.border || '#6b4423';
    g.stroke();
  }
  g.fillStyle = opts.color || '#3b2a14';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = opts.size || 64;
  arr.forEach((t, i) => {
    g.font = `800 ${size}px Fredoka, system-ui, sans-serif`;
    g.fillText(t, w / 2, hgt / 2 + (i - (arr.length - 1) / 2) * size * 1.15);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- house
function buildHouse() {
  const group = new THREE.Group();
  const body = new THREE.Group(); // tilts when the house is damaged
  group.add(body);

  const wallM = mat(0xfff0cf);
  const trimM = mat(0xffffff);
  const walls = box(HOUSE.size, HOUSE.height, HOUSE.size, wallM, 0, HOUSE.height / 2, 0);
  body.add(walls);
  // base trim
  body.add(box(HOUSE.size + 0.16, 0.25, HOUSE.size + 0.16, mat(0xc9b48f), 0, 0.125, 0));

  const S = HOUSE.size / 2;
  const glass = [];
  const glassM = new THREE.MeshLambertMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.35 });
  const frameM = mat(0x7b4a24);

  function addWindow(x, y, z, ry, w, h) {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    wg.rotation.y = ry;
    const t = 0.1;
    wg.add(box(w + 0.2, t * 1.4, 0.12, frameM, 0, h / 2 + 0.05, 0.03));
    wg.add(box(w + 0.2, t * 1.4, 0.12, frameM, 0, -h / 2 - 0.05, 0.03));
    wg.add(box(t * 1.4, h + 0.2, 0.12, frameM, w / 2 + 0.05, 0, 0.03));
    wg.add(box(t * 1.4, h + 0.2, 0.12, frameM, -w / 2 - 0.05, 0, 0.03));
    wg.add(box(w + 0.35, 0.1, 0.25, trimM, 0, -h / 2 - 0.15, 0.1)); // sill
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
    back.position.z = 0.012;
    wg.add(back);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassM.clone());
    pane.position.z = 0.1;
    wg.add(pane);
    glass.push(pane);
    // cross bars
    const bar1 = box(w, 0.05, 0.05, frameM, 0, 0, 0.11);
    const bar2 = box(0.05, h, 0.05, frameM, 0, 0, 0.11);
    wg.add(bar1, bar2);
    pane.userData.bars = [bar1, bar2];
    body.add(wg);
    return wg;
  }

  // south wall (+z): window with capybaras + door
  const win = addWindow(1.0, 1.7, S + 0.02, 0, 1.4, 1.1);
  addCapybara(win, -0.32, -0.5, 1.0);
  addCapybara(win, 0.33, -0.5, 0.62);
  // other sides
  addWindow(-1.0, 1.7, -S - 0.02, Math.PI, 1.0, 1.0);
  addWindow(1.0, 1.7, -S - 0.02, Math.PI, 1.0, 1.0);
  addWindow(S + 0.02, 1.7, 0, Math.PI / 2, 1.2, 1.0);
  addWindow(-S - 0.02, 1.7, 0, -Math.PI / 2, 1.2, 1.0);

  // door
  const door = new THREE.Group();
  door.position.set(-1.0, 0, S + 0.02);
  door.add(box(1.1, 2.0, 0.12, mat(0xb5651d), 0, 1.0, 0.03));
  door.add(box(1.3, 0.12, 0.16, trimM, 0, 2.06, 0.03));
  door.add(box(0.12, 2.1, 0.16, trimM, 0.6, 1.02, 0.03));
  door.add(box(0.12, 2.1, 0.16, trimM, -0.6, 1.02, 0.03));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xffd34d));
  knob.position.set(0.35, 1.0, 0.13);
  door.add(knob);
  body.add(door);
  // doormat + step
  const step = box(1.6, 0.12, 0.7, mat(0xd8cdb8), -1.0, 0.06, S + 0.4);
  body.add(step);

  // corner posts
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    body.add(box(0.2, HOUSE.height, 0.2, trimM, sx * (S + 0.02), HOUSE.height / 2, sz * (S + 0.02)));
  });

  // roof
  const roof = new THREE.Group();
  roof.position.y = HOUSE.height;
  body.add(roof);
  const roofM = mat(0xd9453b);
  const roofM2 = mat(0xc23a31);
  const tiles = [];
  const rise = 1.6, run = S + 0.45;
  const slope = Math.hypot(rise, run);
  const ang = Math.atan2(rise, run);
  const strips = 6;
  const stripW = (HOUSE.size + 0.8) / strips;
  for (const side of [-1, 1]) {
    const slab = new THREE.Group();
    slab.position.set(0, rise / 2, side * run / 2);
    slab.rotation.x = side * ang; // tilt so the outer edge goes down
    roof.add(slab);
    for (let i = 0; i < strips; i++) {
      const tile = box(stripW - 0.03, 0.16, slope + 0.1, i % 2 ? roofM : roofM2,
        -((HOUSE.size + 0.8) / 2) + stripW * (i + 0.5), 0, 0);
      slab.add(tile);
      tiles.push(tile);
    }
  }
  // gable ends
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-S, 0); gableShape.lineTo(S, 0); gableShape.lineTo(0, rise); gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
  gableGeo.rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const g = new THREE.Mesh(gableGeo, wallM);
    g.position.set(sx * (S - 0.06) + (sx > 0 ? 0 : -0.0), 0, 0);
    g.castShadow = true;
    roof.add(g);
  }
  // ridge cap + chimney
  roof.add(box(HOUSE.size + 0.9, 0.14, 0.24, mat(0x9e2f28), 0, rise + 0.02, 0));
  const chimney = box(0.55, 1.1, 0.55, mat(0xb3532f), 1.2, rise - 0.1, -0.6);
  roof.add(chimney);
  roof.add(box(0.7, 0.12, 0.7, mat(0x8a8a8a), 1.2, rise + 0.5, -0.6));
  tiles.push(chimney);

  group.userData = { body, roof, glass, tiles, door };
  return group;
}

function addCapybara(win, x, y, s) {
  const g = new THREE.Group();
  g.position.set(x, y, 0.05);
  g.scale.setScalar(s);
  const fur = new THREE.MeshBasicMaterial({ color: 0xb98a55 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2b1b10 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), fur);
  head.scale.set(1, 1, 0.8);
  head.position.set(0, 0.35, 0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), fur);
  body.scale.set(1.15, 0.8, 0.8);
  body.position.set(0, 0.0, -0.02);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xcfa06a }));
  snout.scale.set(1.2, 0.85, 0.8);
  snout.position.set(0, 0.28, 0.2);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), dark);
  nose.position.set(0, 0.33, 0.32);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), dark);
  eyeL.position.set(-0.12, 0.42, 0.22);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.12;
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), fur);
  earL.position.set(-0.2, 0.6, 0);
  const earR = earL.clone(); earR.position.x = 0.2;
  g.add(body, head, snout, nose, eyeL, eyeR, earL, earR);
  win.add(g);
}

// ---------------------------------------------------------------- world
export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const SKY_TOP = new THREE.Color(0x5bb8f5), SKY_BOT = new THREE.Color(0xdff4ff);
  scene.fog = new THREE.Fog(0xcfeeff, 70, 520);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 2500);
  scene.add(camera);

  // sky dome with a vertical gradient
  const skyGeo = new THREE.SphereGeometry(1800, 24, 16);
  const cols = [];
  const pos = skyGeo.attributes.position;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 1800, 0, 1);
    tmp.copy(SKY_BOT).lerp(SKY_TOP, Math.pow(t, 0.6));
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9bc27a, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.position.set(-14, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const flashLight = new THREE.PointLight(0xffc27a, 0, 60, 1.5);
  scene.add(flashLight);

  // ground
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x8fd16b }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true;
  scene.add(outer);
  // lawn texture (checker) for the grid area
  const cv = document.createElement('canvas'); cv.width = cv.height = 20 * 16;
  const cg = cv.getContext('2d');
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    cg.fillStyle = (x + y) % 2 ? '#a6e07b' : '#9bd870';
    cg.fillRect(x * 16, y * 16, 16, 16);
  }
  const lawnTex = new THREE.CanvasTexture(cv);
  lawnTex.colorSpace = THREE.SRGBColorSpace;
  lawnTex.magFilter = THREE.NearestFilter;
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshLambertMaterial({ map: lawnTex }));
  yard.rotation.x = -Math.PI / 2; yard.receiveShadow = true;
  scene.add(yard);
  // path from door to fence gap
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 8), new THREE.MeshLambertMaterial({ color: 0xe3d3a8 }));
  path.rotation.x = -Math.PI / 2; path.position.set(-1.0, 0.01, 6.0); path.receiveShadow = true;
  scene.add(path);

  // grid lines
  const gridPts = [];
  for (let i = 0; i <= GRID; i++) {
    const p = i - HALF;
    gridPts.push(p, 0.03, -HALF, p, 0.03, HALF, -HALF, 0.03, p, HALF, 0.03, p);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
  scene.add(gridLines);

  // house
  const house = buildHouse();
  scene.add(house);

  // fence: pickets around the grid
  const fence = new THREE.Group();
  const picketGeo = new THREE.BoxGeometry(0.16, 0.8, 0.06);
  picketGeo.translate(0, 0.4, 0);
  const picketCount = (GRID * 2 + 2) * 4;
  const pickets = new THREE.InstancedMesh(picketGeo, mat(0xffffff), picketCount);
  pickets.castShadow = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc1 = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
  let pi = 0;
  const railM = mat(0xf2e3c4);
  for (let side = 0; side < 4; side++) {
    const rot = side * Math.PI / 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    for (let k = 0; k < GRID * 2 + 1; k++) {
      const a = -HALF + k * 0.5;
      // side 0: south (z=+HALF), 1: east, 2: north, 3: west
      if (side === 0) v3.set(a, 0, HALF + 0.05);
      else if (side === 1) v3.set(HALF + 0.05, 0, -a);
      else if (side === 2) v3.set(-a, 0, -HALF - 0.05);
      else v3.set(-HALF - 0.05, 0, a);
      m4.compose(v3, q, sc1);
      pickets.setMatrixAt(pi++, m4);
    }
    const rail = box(GRID + 0.3, 0.08, 0.08, railM, 0, 0.55, 0);
    const rail2 = box(GRID + 0.3, 0.08, 0.08, railM, 0, 0.2, 0);
    const holder = new THREE.Group();
    holder.add(rail, rail2);
    holder.rotation.y = rot;
    holder.position.set(0, 0, 0);
    // place the rails on the proper side
    const off = HALF + 0.12;
    if (side === 0) holder.position.set(0, 0, off);
    if (side === 1) holder.position.set(off, 0, 0);
    if (side === 2) holder.position.set(0, 0, -off);
    if (side === 3) holder.position.set(-off, 0, 0);
    if (side === 1 || side === 3) holder.rotation.y = Math.PI / 2;
    fence.add(holder);
  }
  pickets.count = pi;
  pickets.instanceMatrix.needsUpdate = true;
  fence.add(pickets);
  scene.add(fence);

  // trees and bushes outside the fence
  const trees = new THREE.Group();
  const trunkM = mat(0x8b5a2b), leafM = mat(0x4cb050), leafM2 = mat(0x67c761), pinkM = mat(0xff9ccf);
  function tree(x, z, s, pine) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 8), trunkM);
    trunk.position.y = 0.9; trunk.castShadow = true;
    t.add(trunk);
    if (pine) {
      [[1.5, 1.8, 2.3], [1.15, 1.6, 3.4], [0.8, 1.4, 4.3]].forEach(([r, hh, y], i) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 9), i % 2 ? leafM : leafM2);
        c.position.y = y; c.castShadow = true; t.add(c);
      });
    } else {
      [[0, 2.8, 0, 1.3], [0.8, 2.3, 0.3, 0.9], [-0.7, 2.4, -0.3, 0.95]].forEach(([dx, y, dz, r], i) => {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? leafM2 : (x % 3 > 1 ? pinkM : leafM));
        c.position.set(dx, y, dz); c.castShadow = true; t.add(c);
      });
    }
    trees.add(t);
  }
  const treeSpots = [[-15, -4, 1.1, 0], [-14, 8, 1.3, 1], [15, -10, 1.2, 1], [16, 5, 1.0, 0], [-17, -15, 1.5, 1], [13, 15, 1.2, 0],
    [-12, 16, 1.1, 1], [20, -2, 1.4, 1], [-22, 2, 1.3, 0], [8, -20, 1.3, 1], [-8, -22, 1.2, 0], [18, 18, 1.5, 1], [-20, 20, 1.2, 0], [26, 12, 1.3, 1]];
  treeSpots.forEach(([x, z, s, p]) => tree(x, z, s, !!p));
  scene.add(trees);

  // clouds
  const clouds = new THREE.Group();
  const cloudM = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, fog: false });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const n = 3 + (i % 3);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + (k % 2) * 3, 1), cloudM);
      s.position.set(k * 8 - n * 4, (k % 2) * 2, 0);
      s.scale.y = 0.6;
      c.add(s);
    }
    const a = (i / 9) * Math.PI * 2;
    c.position.set(Math.cos(a) * 220, 60 + (i % 3) * 12, Math.sin(a) * 220 - 80);
    c.userData.speed = 0.6 + (i % 4) * 0.3;
    clouds.add(c);
  }
  scene.add(clouds);

  // distant hills
  const hillM = new THREE.MeshLambertMaterial({ color: 0x7cc464 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 300 + (i % 3) * 40;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(50 + (i % 4) * 14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillM);
    hill.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    hill.scale.y = 0.55;
    scene.add(hill);
  }

  // ------------- blast markers (per level)
  const markers = new THREE.Group();
  scene.add(markers);
  const animated = [];

  function clearMarkers() {
    while (markers.children.length) {
      const c = markers.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }
    animated.length = 0;
  }

  function flatRing(rIn, rOut, color, opacity) {
    const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 72),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05;
    return m;
  }

  function setLevelMarkers(level) {
    clearMarkers();
    const b = level.blast;
    if (b.type === 'point') {
      const g = new THREE.Group();
      g.position.set(b.x, 0, b.z);
      if (level.key === 'tnt' || level.tntKg >= 5) {
        const crate = box(1.1, 0.8, 0.8, mat(0xd9382c), 0, 0.4, 0);
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), new THREE.MeshBasicMaterial({ map: makeLabelTexture('TNT', { w: 256, h: 160, size: 100, color: '#fff', bg: '#d9382c', border: '#fff' }), transparent: true }));
        lbl.position.set(0, 0.4, 0.41);
        const lbl2 = lbl.clone(); lbl2.rotation.y = Math.PI; lbl2.position.z = -0.41;
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), mat(0x333333));
        stick.position.set(0.3, 1.0, 0);
        g.add(crate, lbl, lbl2, stick);
        g.userData.fuse = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffc233 }));
        g.userData.fuse.position.set(0.3, 1.25, 0);
        g.add(g.userData.fuse);
      } else {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), mat(0x4a7a3a));
        body.scale.y = 1.15; body.position.y = 0.4; body.castShadow = true;
        const top = box(0.2, 0.15, 0.2, mat(0x333333), 0, 0.82, 0);
        const lever = box(0.07, 0.07, 0.4, mat(0x999999), 0, 0.92, 0.1);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), mat(0xdddddd));
        ring.position.set(0.14, 0.88, 0);
        g.add(body, top, lever, ring);
        g.userData.fuse = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffc233 }));
        g.userData.fuse.position.set(0, 1.05, 0);
        g.add(g.userData.fuse);
      }
      g.userData.baseScale = 1;
      markers.add(g);
      animated.push((t) => { g.position.y = Math.sin(t * 3) * 0.04 + 0.04; g.userData.fuse.scale.setScalar(1 + 0.5 * Math.sin(t * 14)); });
      g.userData.isBomb = true;
      // clear zone (no building)
      const cr = b.clearRadius || 0;
      if (cr > 0) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(cr, 48),
          new THREE.MeshBasicMaterial({ color: 0xff5a4d, transparent: true, opacity: 0.28, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.set(b.x, 0.04, b.z);
        markers.add(disc);
        const ring = flatRing(cr - 0.08, cr, 0xff3b2f, 0.9); ring.position.set(b.x, 0.05, b.z);
        markers.add(ring);
        const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(['No building', 'here!'], { w: 384, h: 192, size: 56, color: '#fff', bg: '#e0453a', border: '#fff' }), depthWrite: false }));
        sign.scale.set(2.6, 1.3, 1);
        sign.position.set(b.x, 2.1, b.z + 0.2);
        markers.add(sign);
      }
      if (level.dangerRadius) {
        const r = level.dangerRadius;
        const ring = flatRing(r - 0.12, r, 0xffa51f, 0.55); ring.position.set(b.x, 0.05, b.z);
        markers.add(ring);
        const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('Danger zone', { w: 384, h: 96, size: 52, color: '#b4570b' }), transparent: true, depthWrite: false }));
        lab.scale.set(3.4, 0.85, 1);
        lab.position.set(b.x, 0.5, b.z + r);
        markers.add(lab);
      }
    } else {
      // far blast: sign on the north fence + a flag on the horizon
      const km = (b.distanceM || 3000) / 1000;
      const sign = new THREE.Group();
      sign.position.set(0, 0, -HALF - 0.4);
      const postM = mat(0x8b5a2b);
      sign.add(box(0.2, 3.0, 0.2, postM, -1.9, 1.5, 0), box(0.2, 3.0, 0.2, postM, 1.9, 1.5, 0));
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3),
        new THREE.MeshBasicMaterial({ map: makeLabelTexture(['BOMB', `${km} km`, 'this way'], { w: 512, h: 256, size: 62, bg: '#ffe9a8', color: '#c0331f' }) }));
      board.position.set(0, 2.6, 0.12);
      // face south (towards the player), arrow up
      sign.add(board);
      const back = box(4.7, 2.4, 0.1, postM, 0, 2.6, 0);
      sign.add(back);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 3), new THREE.MeshBasicMaterial({ color: 0xe0453a }));
      arrow.position.set(0, 4.6, 0.1);
      sign.add(arrow);
      markers.add(sign);
      animated.push((t) => { arrow.position.y = 4.6 + Math.sin(t * 4) * 0.2; });
      // horizon flag
      const flag = new THREE.Group();
      flag.position.set(-70, 0, -170);
      flag.add(box(0.8, 30, 0.8, mat(0xdddddd), 0, 15, 0));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshBasicMaterial({ map: makeLabelTexture([`${km} km`], { w: 256, h: 160, size: 80, bg: '#ff5a4d', color: '#fff', border: '#fff' }), side: THREE.DoubleSide }));
      cloth.position.set(7.4, 25, 0);
      flag.add(cloth);
      markers.add(flag);
    }
  }

  // ------------- house damage animation
  const hd = { t: 0, active: false, d: 0, survived: true, flying: [], tilt: 0, tiltTarget: 0, sink: 0, sinkTarget: 0 };
  const hu = house.userData;

  function resetHouse() {
    hd.active = false; hd.flying.length = 0; hd.tilt = 0; hd.tiltTarget = 0; hd.sink = 0; hd.sinkTarget = 0;
    hu.body.rotation.set(0, 0, 0); hu.body.position.set(0, 0, 0);
    hu.glass.forEach((p) => { p.visible = true; p.material.opacity = 0.35; p.userData.bars.forEach((b) => (b.visible = true)); });
    hu.tiles.forEach((tl) => {
      if (tl.userData.home) {
        tl.parent.remove(tl);
        tl.userData.parent.add(tl);
        tl.position.copy(tl.userData.home.p); tl.quaternion.copy(tl.userData.home.q);
      }
      tl.visible = true;
    });
    hu.roof.rotation.set(0, 0, 0); hu.roof.position.set(0, HOUSE.height, 0);
  }
  hu.tiles.forEach((tl) => { tl.userData.home = { p: tl.position.clone(), q: tl.quaternion.clone() }; tl.userData.parent = tl.parent; });

  // Apply the damage the sim reports. burst(x,y,z,n) is called for glass shards.
  function applyDamage(d, survived, burst, instant = false) {
    hd.d = d; hd.survived = survived;
    if (d > 0.2) {
      hu.glass.forEach((p, i) => {
        p.visible = false;
        p.userData.bars.forEach((b) => (b.visible = false));
        if (burst && !instant) {
          const wp = new THREE.Vector3(); p.getWorldPosition(wp);
          burst(wp.x, wp.y, wp.z, 8, p);
        }
      });
    }
    if (d > 0.5) {
      const n = Math.min(hu.tiles.length - 3, 3 + Math.floor((d - 0.5) * 14));
      const sorted = hu.tiles.slice();
      for (let i = 0; i < n; i++) {
        const tl = sorted[(i * 5 + 1) % sorted.length];
        if (!tl.visible) continue;
        if (instant) { tl.visible = false; continue; }
        const wp = new THREE.Vector3(); tl.getWorldPosition(wp);
        const wq = new THREE.Quaternion(); tl.getWorldQuaternion(wq);
        const parent = tl.parent;
        scene.attach(tl);
        tl.position.copy(wp); tl.quaternion.copy(wq);
        hd.flying.push({ m: tl, vx: (Math.sin(i * 7.1)) * 3, vy: 4 + (i % 4) * 1.5, vz: 1.5 + (i % 3) * 1.5, sx: Math.sin(i) * 6, sy: 4, sz: Math.cos(i * 2) * 5 });
      }
    }
    if (!survived) {
      hd.tiltTarget = 0.08 + d * 0.16;
      hd.sinkTarget = 0.12 + d * 0.3;
      if (instant) { hd.tilt = hd.tiltTarget; hd.sink = hd.sinkTarget; }
      hd.active = true;
    }
  }

  function updateHouse(dt) {
    for (let i = hd.flying.length - 1; i >= 0; i--) {
      const f = hd.flying[i];
      f.vy -= 9.8 * dt;
      f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      f.m.rotation.x += f.sx * dt; f.m.rotation.y += f.sy * dt; f.m.rotation.z += f.sz * dt;
      if (f.m.position.y < 0.1) {
        f.m.position.y = 0.1; f.vy *= -0.3; f.vx *= 0.6; f.vz *= 0.6; f.sx *= 0.5; f.sy *= 0.5; f.sz *= 0.5;
        if (Math.abs(f.vy) < 0.5) { f.vy = 0; f.sx = f.sy = f.sz = 0; f.vx = f.vz = 0; f.m.rotation.x = 0; f.m.rotation.z = 0; f.m.position.y = 0.08; }
      }
    }
    if (hd.active) {
      hd.tilt += (hd.tiltTarget - hd.tilt) * Math.min(1, dt * 2.5);
      hd.sink += (hd.sinkTarget - hd.sink) * Math.min(1, dt * 2.5);
      hu.body.rotation.z = -hd.tilt * 0.6;
      hu.body.rotation.x = -hd.tilt;
      hu.body.position.y = -hd.sink;
      hu.roof.rotation.z = hd.tilt * 0.8;
    }
  }

  let size = { w: 1, h: 1 }, shift = 0;
  function applyView() {
    if (shift && size.w / size.h > 1.2) camera.setViewOffset(size.w, size.h, -shift * size.w, 0, size.w, size.h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    size = { w, h };
    applyView();
  }
  // shift the picture sideways (fraction of the width) so menus do not cover the house
  function setShift(f) { if (f !== shift) { shift = f; applyView(); } }

  let time = 0;
  function update(dt) {
    time += dt;
    animated.forEach((f) => f(time));
    clouds.children.forEach((c) => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 400) c.position.x = -400;
    });
    updateHouse(dt);
    sky.position.copy(camera.position);
  }

  return {
    renderer, scene, camera, house, gridLines, markers, flashLight, sun, hemi,
    setLevelMarkers, applyDamage, resetHouse, resize, update, setShift,
    setGridVisible(v) { gridLines.visible = v; },
  };
}
