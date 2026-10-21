// Build-phase HUD: top bar, fact banner, inventory cards, action buttons, toasts, countdown.
import { h } from './dom.js';
import { MATERIALS, THREATS } from '../data/materials.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Hud {
  constructor(root, handlers) {
    this.root = root;
    this.hd = handlers;
    this.cards = new Map();
    this.level = null;
    this.selected = null;
    this.toastTimer = 0;
    this.factTimer = 0;

    this.menuBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Levels', 'aria-label': 'Back to levels', onclick: () => this.hd.menu() }, '☰');
    this.levelName = h('div', { class: 'chip level-chip' });
    this.coins = h('div', { class: 'chip coins', 'aria-live': 'polite' });
    this.threatsEl = h('div', { class: 'threat-chips' });
    this.helpBtn = h('button', { class: 'icon-btn', type: 'button', title: 'About this material', 'aria-label': 'About this material', onclick: () => this.showFact(true) }, '?');
    this.clearBtn = h('button', { class: 'btn small soft', type: 'button', onclick: () => this.hd.clear() }, 'Clear all');
    this.top = h('div', { class: 'topbar' }, this.menuBtn, this.levelName, this.coins, h('div', { class: 'spacer' }), this.threatsEl, this.helpBtn, this.clearBtn);

    this.fact = h('div', { class: 'fact-banner' });
    this.hint = h('div', { class: 'hint' }, h('span', { class: 'only-keys' }, 'WASD walk · Space place · X remove · Q/E turn · Z/C zoom · R ready'),
      h('span', { class: 'only-touch' }, 'Joystick to walk · drag to turn · pinch to zoom'));

    this.placeBtn = h('button', { class: 'act place', type: 'button', 'aria-label': 'Place block' }, h('b', {}, '＋'), h('span', {}, 'Place'));
    this.removeBtn = h('button', { class: 'act remove', type: 'button', 'aria-label': 'Remove block' }, h('b', {}, '－'), h('span', {}, 'Remove'));
    this.readyBtn = h('button', { class: 'act ready', type: 'button' }, 'Ready! ▶');
    this.bindPress(this.placeBtn, () => this.hd.place());
    this.bindPress(this.removeBtn, () => this.hd.remove());
    this.bindPress(this.readyBtn, () => this.hd.ready());
    this.actions = h('div', { class: 'actions' }, this.removeBtn, this.placeBtn, this.readyBtn);

    this.joyHost = h('div', { class: 'joy-host' });
    this.inv = h('div', { class: 'inventory', role: 'listbox', 'aria-label': 'Materials' });
    this.invWrap = h('div', { class: 'inv-wrap' }, this.inv);
    this.toastEl = h('div', { class: 'toast' });
    this.countEl = h('div', { class: 'countdown' });

    this.el = h('div', { class: 'hud hidden' }, this.top, this.fact, this.hint, this.joyHost, this.actions, this.invWrap, this.toastEl);
    root.append(this.el, this.countEl);
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        const hgt = this.invWrap.offsetHeight;
        if (hgt > 40) document.documentElement.style.setProperty('--inv-h', hgt + 'px');
      }).observe(this.invWrap);
    }
  }

  bindPress(el, fn) {
    el.addEventListener('click', (e) => { e.preventDefault(); fn(); el.blur(); });
  }

  show(v) { this.el.classList.toggle('hidden', !v); }
  setEnabled(v) { this.el.classList.toggle('locked', !v); }

  setLevel(level) {
    this.level = level;
    this.levelName.textContent = level.name;
    this.threatsEl.innerHTML = '';
    for (const id of Object.keys(level.threats)) {
      const t = THREATS[id];
      this.threatsEl.append(h('span', { class: 'tchip', title: `${t.name}: ${t.short}` }, h('i', {}, t.icon), h('span', {}, t.name)));
    }
    this.buildInventory(level);
  }

  buildInventory(level) {
    this.inv.innerHTML = '';
    this.cards.clear();
    const list = MATERIALS.filter((m) => m.unlockLevel <= level.id);
    this.list = list;
    const threats = Object.keys(level.threats);
    list.forEach((m, i) => {
      const bars = threats.map((tid) => h('div', { class: 'mb', title: THREATS[tid].name },
        h('i', {}, THREATS[tid].icon),
        h('div', { class: 'mbar' }, h('b', { style: { width: (m.resist[tid] * 10) + '%' } }))));
      const card = h('button', {
        class: 'card-m ' + m.kind, type: 'button', role: 'option', 'data-id': m.id,
        title: m.fact,
        onclick: () => this.hd.pick(m.id),
      },
        h('span', { class: 'swatch', style: { background: hex(m.color) } }, m.emoji),
        h('span', { class: 'mname' }, m.name),
        h('span', { class: 'mcost' }, `🪙 ${m.cost}`),
        h('span', { class: 'mbars' }, bars),
        i < 9 && h('span', { class: 'key' }, i + 1),
        m.kind === 'upgrade' && h('span', { class: 'tag' }, 'Upgrade'));
      this.cards.set(m.id, card);
      this.inv.append(card);
    });
  }

  select(id) {
    this.selected = id;
    this.cards.forEach((c, k) => c.classList.toggle('sel', k === id));
    const c = this.cards.get(id);
    if (c && c.scrollIntoView) { try { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } }
    this.showFact(false);
  }

  setUpgrade(id, on) {
    const c = this.cards.get(id);
    if (c) c.classList.toggle('on', on);
  }

  setAffordable(coinsLeft) {
    this.cards.forEach((c, id) => {
      const m = this.list.find((x) => x.id === id);
      c.classList.toggle('poor', m.cost > coinsLeft && !c.classList.contains('on'));
    });
  }

  setCoins(left, budget) {
    this.coins.innerHTML = '';
    this.coins.append(h('span', { class: 'ci' }, '🪙'), h('b', {}, String(left)), h('span', { class: 'of' }, ` / ${budget}`));
    this.coins.classList.toggle('low', left < budget * 0.1);
  }

  showFact(force) {
    const m = this.list && this.list.find((x) => x.id === this.selected);
    if (!m) return;
    this.fact.innerHTML = '';
    this.fact.append(h('b', {}, `${m.emoji} ${m.name}: `), m.fact);
    this.fact.classList.add('show');
    clearTimeout(this.factTimer);
    this.factTimer = setTimeout(() => this.fact.classList.remove('show'), force ? 9000 : 6000);
  }

  toast(msg, kind = '') {
    this.toastEl.textContent = msg;
    this.toastEl.className = 'toast show ' + kind;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  count(text) {
    this.countEl.textContent = text;
    this.countEl.classList.remove('pop');
    void this.countEl.offsetWidth;
    this.countEl.classList.toggle('on', !!text);
    if (text) this.countEl.classList.add('pop');
  }
}
