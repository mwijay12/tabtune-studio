/** Shared helpers: one scroll loop, one resize loop, motion preference. */

const scrollFns = new Set();
const resizeFns = new Set();
let ticking = false;
let lastY = window.scrollY;

export const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** How far `el` has travelled through the viewport, 0 (entering) to 1 (leaving). */
export function throughViewport(el) {
  const r = el.getBoundingClientRect();
  const vh = Math.min(window.innerHeight, 900);
  const span = vh + r.height;
  return clamp((vh - r.top) / span, 0, 1);
}

function frame() {
  const y = window.scrollY;
  const velocity = y - lastY;
  lastY = y;
  for (const fn of scrollFns) fn(y, velocity);
  ticking = false;
}

function request() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
}

export function onScroll(fn) {
  scrollFns.add(fn);
  fn(window.scrollY, 0);
}

export function onResize(fn) {
  resizeFns.add(fn);
  fn();
}

export function startLoops() {
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', () => {
    request();
    for (const fn of resizeFns) fn();
  }, { passive: true });
  request();
}

/** Run `fn` for every element matching `sel`, now and after each build. */
export const all = (sel, root = document) => [...root.querySelectorAll(sel)];
