// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('soak.muted') === '1'; } catch {}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, delay = 0, slide = 0) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('soak.muted', muted ? '1' : '0'); } catch {}
    return muted;
  },
  unlock() { ac(); },
  pop() { tone(660, 0.08, 'sine', 0.12, 0, 300); },
  click() { tone(520, 0.05, 'triangle', 0.08); },
  ring() { for (let i = 0; i < 4; i++) tone(i % 2 ? 1180 : 960, 0.09, 'square', 0.05, i * 0.1); },
  step() { tone(200, 0.05, 'triangle', 0.05); },
  sting() { [392, 370, 349, 262].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.07, i * 0.18)); },
  slam() { tone(90, 0.2, 'square', 0.12, 0, -40); },
  siren() { for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 820, 0.22, 'triangle', 0.06, i * 0.22); },
  whisper() { tone(1800, 0.25, 'sine', 0.02, 0, -900); },
  good() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, i * 0.1)); },
  bad() { [330, 262].forEach((f, i) => tone(f, 0.3, 'square', 0.07, i * 0.2)); },
  tick() { tone(1400, 0.03, 'square', 0.03); },
};
