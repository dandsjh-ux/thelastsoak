// Small DOM helpers.
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Render a snippet: {key words} highlighted, "…" gaps softened. */
export function snippet(text) {
  return esc(text)
    .replace(/\{([^}]*)\}/g, '<span class="kw">$1</span>')
    .replace(/…/g, '<span class="gap">…</span>');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toast(text, tone = '', ms = 3800) {
  const t = el(`<div class="toast ${tone}">${esc(text)}</div>`);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

let modalStack = [];
/** Show a modal; returns { el, close }. Only one modal per key at a time. */
export function modal(key, html, { onClose, dismissable = true } = {}) {
  closeModal(key, true);
  const back = el(`<div class="modal-back" data-key="${key}"><div class="modal card">${html}</div></div>`);
  const close = (silent) => {
    if (!back.isConnected) return;
    back.remove();
    modalStack = modalStack.filter((m) => m.key !== key);
    if (silent !== true) onClose?.();
  };
  if (dismissable) back.addEventListener('pointerdown', (e) => e.target === back && close());
  back.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => close()));
  $('#modalRoot').append(back);
  modalStack.push({ key, close });
  return { el: back, close };
}

export function closeModal(key, silent = true) {
  const m = modalStack.find((x) => x.key === key);
  if (m) m.close(silent);
}

export function hasModal(key) {
  return modalStack.some((m) => m.key === key);
}

export function closeAllModals() {
  [...modalStack].forEach((m) => m.close(true));
}
