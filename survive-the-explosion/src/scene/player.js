// The builder character, its movement and collision, and the camera rig.
import * as THREE from 'three';
import { GRID, HOUSE, cellToWorld } from '../sim/grid.js';

const RADIUS = 0.36;
const MAX_SPEED = 5.4;
const ACCEL = 34;
const DECEL = 44;
const HALF = GRID / 2;

function lambert(c) { return new THREE.MeshLambertMaterial({ color: c }); }

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pos = new THREE.Vector2(-1.0, 6.5);
    this.vel = new THREE.Vector2();
    this.facing = Math.PI; // direction (sin f, cos f) on (x, z): PI = towards -z (north)
    this.walkT = 0;
    this.build();
    this.frozen = false;
    this.applyTransform();
  }

  build() {
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    const add = (geo, mat, x, y, z, parent = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true;
      parent.add(m);
      return m;
    };
    const vest = lambert(0xff8a1f), skin = lambert(0xffd2a6), pants = lambert(0x3f6fd9), boots = lambert(0x5a3a22);
    const hat = lambert(0xffd23f), dark = new THREE.MeshBasicMaterial({ color: 0x2b1b10 });
    // torso
    add(new THREE.CapsuleGeometry(0.24, 0.3, 4, 10), vest, 0, 0.78, 0);
    // reflective stripe
    const stripe = add(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 14), new THREE.MeshBasicMaterial({ color: 0xf4ff9a }), 0, 0.75, 0);
    stripe.castShadow = false;
    // head
    const head = add(new THREE.SphereGeometry(0.25, 16, 12), skin, 0, 1.3, 0);
    // eyes + smile
    add(new THREE.SphereGeometry(0.035, 6, 6), dark, -0.09, 1.33, 0.225, body).castShadow = false;
    add(new THREE.SphereGeometry(0.035, 6, 6), dark, 0.09, 1.33, 0.225, body).castShadow = false;
    const smile = add(new THREE.TorusGeometry(0.07, 0.014, 5, 10, Math.PI), dark, 0, 1.25, 0.225, body);
    smile.rotation.z = Math.PI; smile.castShadow = false;
    // cheeks
    const cheekM = new THREE.MeshBasicMaterial({ color: 0xff9aa2 });
    add(new THREE.SphereGeometry(0.04, 6, 6), cheekM, -0.16, 1.26, 0.18).castShadow = false;
    add(new THREE.SphereGeometry(0.04, 6, 6), cheekM, 0.16, 1.26, 0.18).castShadow = false;
    // hard hat
    add(new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.38, 0);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), hat, 0, 1.38, 0.02);
    add(new THREE.BoxGeometry(0.2, 0.04, 0.16), hat, 0, 1.4, 0.3).rotation.x = 0.0;
    add(new THREE.BoxGeometry(0.06, 0.05, 0.5), lambert(0xf5b800), 0, 1.65, 0);
    // arms
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.armL.position.set(-0.3, 1.0, 0); this.armR.position.set(0.3, 1.0, 0);
    body.add(this.armL, this.armR);
    add(new THREE.CapsuleGeometry(0.075, 0.28, 3, 8), vest, 0, -0.18, 0, this.armL);
    add(new THREE.CapsuleGeometry(0.075, 0.28, 3, 8), vest, 0, -0.18, 0, this.armR);
    add(new THREE.SphereGeometry(0.085, 8, 6), skin, 0, -0.4, 0, this.armL);
    add(new THREE.SphereGeometry(0.085, 8, 6), skin, 0, -0.4, 0, this.armR);
    // legs
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.legL.position.set(-0.12, 0.5, 0); this.legR.position.set(0.12, 0.5, 0);
    body.add(this.legL, this.legR);
    add(new THREE.CapsuleGeometry(0.095, 0.2, 3, 8), pants, 0, -0.15, 0, this.legL);
    add(new THREE.CapsuleGeometry(0.095, 0.2, 3, 8), pants, 0, -0.15, 0, this.legR);
    add(new THREE.BoxGeometry(0.18, 0.1, 0.28), boots, 0, -0.34, 0.04, this.legL);
    add(new THREE.BoxGeometry(0.18, 0.1, 0.28), boots, 0, -0.34, 0.04, this.legR);
  }

  reset(x = -1.0, z = 6.5, facing = Math.PI) {
    this.pos.set(x, z); this.vel.set(0, 0); this.facing = facing;
    this.group.visible = true; this.frozen = false;
    this.applyTransform();
  }

  applyTransform() {
    this.group.position.set(this.pos.x, 0, this.pos.y);
    this.group.rotation.y = this.facing;
  }

  // does the circle at (x,z) touch anything solid? returns push-out resolved position
  resolve(x, z, isBlocked) {
    const boxes = [];
    boxes.push([-HOUSE.size / 2 - 0.15, HOUSE.size / 2 + 0.15, -HOUSE.size / 2 - 0.15, HOUSE.size / 2 + 0.15]);
    const gx = Math.floor(x + HALF), gz = Math.floor(z + HALF);
    for (let i = gx - 2; i <= gx + 2; i++) for (let j = gz - 2; j <= gz + 2; j++) {
      if (isBlocked(i, j)) { const c = cellToWorld(i, j); boxes.push([c.x - 0.5, c.x + 0.5, c.z - 0.5, c.z + 0.5]); }
    }
    for (let it = 0; it < 3; it++) {
      for (const [x0, x1, z0, z1] of boxes) {
        const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = cx + dx / d * RADIUS; z = cz + dz / d * RADIUS;
          } else {
            // centre inside the box: push out through the nearest side
            const l = x - x0, r = x1 - x, t = z - z0, b = z1 - z;
            const m = Math.min(l, r, t, b);
            if (m === l) x = x0 - RADIUS; else if (m === r) x = x1 + RADIUS;
            else if (m === t) z = z0 - RADIUS; else z = z1 + RADIUS;
          }
        }
      }
    }
    const lim = HALF - 0.3 - RADIUS * 0.3;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return [x, z];
  }

  // dirX, dirZ: desired world direction (length 0..1)
  update(dt, dirX, dirZ, isBlocked) {
    if (!this.frozen) {
      const tx = dirX * MAX_SPEED, tz = dirZ * MAX_SPEED;
      const want = Math.hypot(dirX, dirZ) > 0.01;
      const rate = (want ? ACCEL : DECEL) * dt;
      const dx = tx - this.vel.x, dz = tz - this.vel.y;
      const dl = Math.hypot(dx, dz);
      if (dl <= rate) this.vel.set(tx, tz);
      else this.vel.set(this.vel.x + dx / dl * rate, this.vel.y + dz / dl * rate);
      const sp = this.vel.length();
      if (sp > 0.05) {
        const [nx, nz] = this.resolve(this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt, isBlocked);
        // if we were pushed back, remove velocity into the obstacle
        const mx = (nx - this.pos.x) / dt, mz = (nz - this.pos.y) / dt;
        this.vel.set(this.vel.x * 0.3 + mx * 0.7, this.vel.y * 0.3 + mz * 0.7);
        this.pos.set(nx, nz);
      }
      if (want) {
        // turn smoothly towards the walking direction
        const target = Math.atan2(dirX, dirZ);
        let diff = target - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.facing += diff * Math.min(1, dt * 14);
      }
    }
    // animation
    const sp = this.vel.length();
    this.walkT += dt * (2 + sp * 1.9);
    const k = Math.min(1, sp / MAX_SPEED);
    const sw = Math.sin(this.walkT) * 0.9 * k;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.9; this.armR.rotation.x = sw * 0.9;
    const idle = Math.sin(performance.now() / 500) * 0.02 * (1 - k);
    this.body.position.y = Math.abs(Math.sin(this.walkT)) * 0.07 * k + idle;
    this.body.rotation.z = Math.sin(this.walkT) * 0.04 * k;
    this.body.rotation.x = k * 0.1;
    this.applyTransform();
  }

  // the cell about 1.3 m in front
  targetCell() {
    const x = this.pos.x + Math.sin(this.facing) * 1.3;
    const z = this.pos.y + Math.cos(this.facing) * 1.3;
    return { gx: Math.floor(x + HALF), gz: Math.floor(z + HALF) };
  }
}

// --------------------------------------------------------------- camera
const ease = (t) => t * t * (3 - 2 * t);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'orbit'; // orbit (idle), follow, cine
    this.yaw = 0; this.pitch = 0.72; this.dist = 12;
    this.target = new THREE.Vector3(0, 1.2, 5);
    this.sTarget = this.target.clone();
    this.sYaw = 0; this.sPitch = this.pitch; this.sDist = this.dist;
    this.idleAngle = 0.6;
    this.cine = null;
    this.shakeAmp = 0; this.shakeT = 0;
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }

  forward() { return { x: -Math.sin(this.sYaw), z: -Math.cos(this.sYaw) }; }
  right() { return { x: Math.cos(this.sYaw), z: -Math.sin(this.sYaw) }; }

  follow(player, snap = false) {
    this.mode = 'follow';
    this.cine = null;
    if (snap) {
      this.sTarget.set(player.pos.x, 1.2, player.pos.y);
      this.sYaw = this.yaw; this.sPitch = this.pitch; this.sDist = this.dist;
    }
  }

  orbit() { this.mode = 'orbit'; this.cine = null; }

  // fly to a fixed view
  fly(toPos, toLook, duration = 1.5) {
    const cam = this.camera;
    this.cine = {
      t: 0, d: duration,
      p0: cam.position.clone(), p1: new THREE.Vector3(...toPos),
      l0: this._lastLook ? this._lastLook.clone() : new THREE.Vector3(0, 1.5, 0), l1: new THREE.Vector3(...toLook),
      drift: 0,
    };
    this.mode = 'cine';
  }

  shake(amp) { this.shakeAmp = Math.max(this.shakeAmp, amp); }

  applyInput(d) {
    this.yaw += d.yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + d.pitch, 0.18, 1.25);
    this.dist = THREE.MathUtils.clamp(this.dist + d.zoom, 4.5, 20);
  }

  update(dt, player) {
    const cam = this.camera;
    if (this.mode === 'follow' && player) {
      const k = 1 - Math.exp(-dt * 9);
      this.sTarget.x += (player.pos.x - this.sTarget.x) * k;
      this.sTarget.z += (player.pos.y - this.sTarget.z) * k;
      this.sTarget.y = 1.2;
      let dy = this.yaw - this.sYaw;
      this.sYaw += dy * (1 - Math.exp(-dt * 12));
      this.sPitch += (this.pitch - this.sPitch) * (1 - Math.exp(-dt * 10));
      this.sDist += (this.dist - this.sDist) * (1 - Math.exp(-dt * 8));
      const cp = Math.cos(this.sPitch);
      const asp = cam.aspect || 1;
      const D = this.sDist * (asp < 1 ? 1 + (1 - asp) * 0.7 : 1); // back off on tall screens
      this._pos.set(
        this.sTarget.x + Math.sin(this.sYaw) * cp * D,
        Math.max(0.8, this.sTarget.y + Math.sin(this.sPitch) * D),
        this.sTarget.z + Math.cos(this.sYaw) * cp * D);
      this._look.copy(this.sTarget);
      // keep inside the world a bit
      cam.position.copy(this._pos);
    } else if (this.mode === 'orbit') {
      this.idleAngle += dt * 0.12;
      const r = 17, a = this.idleAngle;
      this._pos.set(Math.sin(a) * r, 8.5, Math.cos(a) * r + 1);
      this._look.set(this.idleLook ? this.idleLook : 0, 1.6, 0);
      cam.position.lerp(this._pos, 1 - Math.exp(-dt * 3));
      this._look.lerp(this._look, 1);
      this.sYaw = a; // keeps WASD sensible if we switch to follow later
    } else if (this.mode === 'cine' && this.cine) {
      const c = this.cine;
      c.t = Math.min(c.d, c.t + dt);
      const e = ease(c.t / c.d);
      cam.position.lerpVectors(c.p0, c.p1, e);
      this._look.lerpVectors(c.l0, c.l1, e);
      if (c.t >= c.d) { c.drift += dt; cam.position.x += Math.sin(c.drift * 0.4) * 0.002; }
    }
    this._lastLook = this._lastLook || new THREE.Vector3();
    this._lastLook.copy(this._look);
    cam.lookAt(this._look);
    // shake
    if (this.shakeAmp > 0.002) {
      this.shakeT += dt * 60;
      const a = this.shakeAmp;
      cam.position.x += (Math.sin(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1)) * 0.5 * a;
      cam.position.y += (Math.sin(this.shakeT * 2.3) + Math.cos(this.shakeT * 4.1)) * 0.5 * a;
      cam.position.z += Math.sin(this.shakeT * 1.3) * 0.4 * a;
      cam.rotation.z += Math.sin(this.shakeT * 2.9) * 0.02 * a;
      this.shakeAmp *= Math.exp(-dt * 2.2);
    } else this.shakeAmp = 0;
  }
}
