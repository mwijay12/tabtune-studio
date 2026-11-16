/** Entry point. Everything here degrades: with scripting off the page is complete. */

import { initTheme } from './theme.js';
import { initMotion, refreshFieldTheme } from './motion.js';
import { initStickers } from './stickers.js';
import { initMenu } from './menu.js';
import { startLoops } from './util.js';

/* Header gains a background once you leave the top. */
function stickyHeader() {
  const head = document.querySelector('[data-masthead]');
  if (!head) return;
  const update = () => head.classList.toggle('is-stuck', window.scrollY > 24);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* Mark the link for the section you are reading. */
function currentSection() {
  const links = [...document.querySelectorAll('.nav__link')].filter((a) => a.hash);
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map();
  links.forEach((a) => {
    const el = document.querySelector(a.hash);
    if (el) map.set(el, a);
  });
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((a) => a.removeAttribute('aria-current'));
          map.get(e.target)?.setAttribute('aria-current', 'page');
        }
      });
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  map.forEach((_a, el) => io.observe(el));
}

function boot() {
  initTheme();
  // In mix mode the background follows the section, so a mode change needs it re-read.
  document.querySelectorAll('[data-mode-set]').forEach((b) =>
    b.addEventListener('click', () => requestAnimationFrame(refreshFieldTheme))
  );
  refreshFieldTheme();
  initMenu();
  initMotion();
  initStickers();
  stickyHeader();
  currentSection();
  startLoops();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
