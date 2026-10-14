// Shared toon materials + primitive helpers for the cutesy diorama look.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const gradientMap = (() => {
  const data = new Uint8Array([120, 185, 230, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap, ...opts }));
  }
  return matCache.get(key);
}

export function glow(color, intensity = 1.6) {
  return toon(color, { emissive: color, emissiveIntensity: intensity });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: '#3a2e4a', side: THREE.BackSide });

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

export const G = {
  sphere: (r = 0.5, w = 20, h = 16) => cached(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h)),
  box: (w, h, d, r = 0.08) =>
    cached(`b${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))),
  cyl: (rt, rb, h, s = 20) => cached(`c${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  cone: (r, h, s = 12) => cached(`k${r}|${h}|${s}`, () => new THREE.ConeGeometry(r, h, s)),
  capsule: (r, l) => cached(`p${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10)),
  torus: (r, t, arc = Math.PI * 2) => cached(`t${r}|${t}|${arc}`, () => new THREE.TorusGeometry(r, t, 8, 24, arc)),
};

export function mesh(geo, material, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, typeof material === 'string' ? toon(material) : material);
  m.position.set(x, y, z);
  if (opts.s !== undefined) {
    if (Array.isArray(opts.s)) m.scale.set(...opts.s);
    else m.scale.setScalar(opts.s);
  }
  if (opts.r) m.rotation.set(...opts.r);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = !!opts.receive;
  return m;
}

/** Rounded box whose bottom sits at y. */
export function block(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  return mesh(G.box(w, h, d, opts.radius ?? 0.08), color, x, y + h / 2, z, { receive: true, ...opts });
}

/** Inverted-hull outline for soft cartoon edges. */
export function outline(m, thickness = 0.045) {
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.scale.setScalar(1 + thickness / Math.max(0.1, m.geometry.boundingSphere?.radius || (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere.radius)));
  o.castShadow = false;
  m.add(o);
  return m;
}

/** Canvas texture helper for floors, wallpaper and signs. */
export function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
