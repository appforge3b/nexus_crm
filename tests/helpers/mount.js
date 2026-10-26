import { createApp } from '../../js/app.js';

/**
 * Mounts the SPA into a fresh #app root.
 * `seed: false` starts from an empty store so fixtures stay explicit.
 * Default clock is Wednesday 21 October 2026, 09:00 local (morning greeting).
 */
export function mount(options = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  window.location.hash = options.hash ?? '';

  const clock = options.clock ?? { now: () => new Date(2026, 9, 21, 9, 0, 0, 0) };
  const app = createApp({
    root: document.getElementById('app'),
    storage: options.storage ?? localStorage,
    clock,
    seed: options.seed ?? false,
    openUrl: options.openUrl ?? null,
    speechFactory: options.speechFactory,
    clipboard: options.clipboard,
  });
  app.start();
  return app;
}

export function click(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`No element for click: ${target}`);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return el;
}

/** Changes the route and renders synchronously (jsdom fires hashchange asynchronously). */
export function navigate(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function field(name, root = document) {
  const el = root.querySelector(`[data-field="${name}"]`);
  if (!el) throw new Error(`Missing [data-field="${name}"]`);
  return el;
}

export function setValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
