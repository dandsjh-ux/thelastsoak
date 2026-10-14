// Renders each character's head-and-shoulders portrait once, for the HTML UI.
import * as THREE from 'three';
import { Critter } from './animals.js';

export function makePortraits(ids, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8f7fb8', 2.2));
  const key = new THREE.DirectionalLight('#fff4e0', 2.2);
  key.position.set(2, 4, 5);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const out = {};
  for (const id of ids) {
    const k = new Critter(id);
    k.shadow.visible = false;
    k.update(0, 0);
    k.parts.eyes.forEach((e) => (e.scale.y = 1));
    k.group.rotation.y = -0.35;
    scene.add(k.group);
    const tall = id === 'lulu' || id === 'hazel';
    cam.position.set(0, 1.35, tall ? 4.6 : 4.0);
    cam.lookAt(0, tall ? 1.35 : 1.15, 0);
    renderer.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(k.group);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
