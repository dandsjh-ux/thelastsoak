// Keyboard, mouse and touch input. Pure DOM, no three.js.

export class Input {
  constructor(canvas, joystickHost) {
    this.canvas = canvas;
    this.keys = new Set();
    this.handlers = {};
    this.enabled = true;       // movement + build keys
    this.camEnabled = true;    // orbit / zoom
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.zoomDelta = 0;
    this.stick = { x: 0, y: 0 };
    this.pointers = new Map();
    this.pinch = null;
    this.onTap = null; // (clientX, clientY, button)

    this._bindKeys();
    this._bindPointer();
    this._makeJoystick(joystickHost);
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, arg) { if (this.handlers[name]) this.handlers[name](arg); }

  _bindKeys() {
    const isTyping = (e) => /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace'].includes(k)) {
        // do not scroll the page; but let buttons keep their own Space/Enter
        if (!(e.target && e.target.tagName === 'BUTTON')) e.preventDefault();
      }
      if (e.repeat) return;
      if (!this.enabled) return;
      if (k === ' ' || k === 'Enter') {
        if (e.target && e.target.tagName === 'BUTTON') return;
        this.emit('place');
      } else if (k === 'x' || k === 'Backspace' || k === 'Delete') this.emit('remove');
      else if (k === 'r') this.emit('ready');
      else if (k >= '1' && k <= '9') this.emit('material', parseInt(k, 10) - 1);
      else if (k === 'Tab') { e.preventDefault(); this.emit('nextMaterial'); }
      else if (k === 'Escape') this.emit('escape');
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.stick.x = this.stick.y = 0; });
  }

  // x: right, y: forward (-1..1), from keys and joystick
  move() {
    let x = 0, y = 0;
    if (this.enabled) {
      const k = this.keys;
      if (k.has('a') || k.has('ArrowLeft')) x -= 1;
      if (k.has('d') || k.has('ArrowRight')) x += 1;
      if (k.has('w') || k.has('ArrowUp')) y += 1;
      if (k.has('s') || k.has('ArrowDown')) y -= 1;
      x += this.stick.x; y += this.stick.y;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // continuous camera keys
  consumeCamera(dt) {
    let yaw = this.yawDelta, pitch = this.pitchDelta, zoom = this.zoomDelta;
    this.yawDelta = this.pitchDelta = this.zoomDelta = 0;
    if (this.camEnabled) {
      if (this.keys.has('q')) yaw -= 1.8 * dt;
      if (this.keys.has('e')) yaw += 1.8 * dt;
      if (this.keys.has('z')) zoom -= 8 * dt;
      if (this.keys.has('c')) zoom += 8 * dt;
    } else { yaw = pitch = zoom = 0; }
    return { yaw, pitch, zoom };
  }

  _bindPointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.camEnabled) this.zoomDelta += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.012;
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') document.body.classList.add('touch');
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button, type: e.pointerType });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.pointers.forEach((p) => (p.moved = true));
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > (p.type === 'touch' ? 10 : 5)) p.moved = true;
      if (this.pointers.size === 2 && this.pinch != null) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.camEnabled) this.zoomDelta -= (d - this.pinch) * 0.03;
        this.pinch = d;
      } else if (p.moved && this.camEnabled) {
        this.yawDelta -= dx * 0.006;
        this.pitchDelta += dy * 0.004;
      }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (e.type === 'pointerup' && !p.moved && this.onTap) this.onTap(e.clientX, e.clientY, p.button);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  _makeJoystick(host) {
    if (!host) return;
    const base = document.createElement('div');
    base.className = 'joystick';
    base.innerHTML = '<div class="joy-ring"></div><div class="joy-knob"></div>';
    host.appendChild(base);
    const knob = base.querySelector('.joy-knob');
    let id = null;
    const R = 46;
    const set = (e) => {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let sx = dx / R, sy = -dy / R;
      const m = Math.hypot(sx, sy);
      if (m < 0.12) { sx = sy = 0; }
      this.stick.x = sx; this.stick.y = sy;
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault(); id = e.pointerId; base.setPointerCapture(id);
      document.body.classList.add('touch');
      set(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; knob.style.transform = '';
      this.stick.x = this.stick.y = 0;
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    this.joystick = base;
  }
}
