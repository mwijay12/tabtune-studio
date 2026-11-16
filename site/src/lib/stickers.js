/**
 * Stickers.
 *
 * Four layers, one job each, so no two animations touch the same property of
 * the same element:
 *
 *   .sticker          placement and resting tilt — CSS only
 *   .sticker__drift   y + rotation, from the scroll position
 *   .sticker__body    scale, pops in once
 *   .doodle           leans with the speed of the scroll, springs back
 *
 * Stickers are decoration: aria-hidden, pointer-events none, and hidden on
 * narrow screens where they would land on words.
 */

import { all, clamp, onScroll, reduced } from './util.js';

const DRIFT_SHARE = 0.2; // of the viewport height
const MAX_LEAN = 16; // degrees

export function initStickers() {
  const stickers = all('.sticker');
  if (!stickers.length || reduced()) return;

  for (const el of stickers) {
    // Build the layers once, so the markup stays plain in the HTML.
    if (!el.querySelector('.sticker__drift')) {
      const drift = document.createElement('span');
      drift.className = 'sticker__drift';
      const body = document.createElement('span');
      body.className = 'sticker__body';
      while (el.firstChild) body.appendChild(el.firstChild);
      drift.appendChild(body);
      el.appendChild(drift);
    }
  }

  const state = stickers.map(() => ({ lean: 0 }));

  onScroll((y, velocity) => {
    const vh = Math.min(window.innerHeight, 900);
    const amount = vh * (window.innerWidth < 900 ? DRIFT_SHARE * 0.5 : DRIFT_SHARE);

    stickers.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      // 0 when the sticker enters the bottom, 1 when it leaves the top.
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);

      const drift = el.querySelector('.sticker__drift');
      if (drift) {
        drift.style.setProperty('--drift', `${((p - 0.5) * amount).toFixed(1)}px`);
        drift.style.setProperty('--spin', `${((p - 0.5) * 7).toFixed(2)}deg`);
      }

      const doodle = el.querySelector('.doodle');
      if (doodle) {
        const target = clamp(velocity * 0.14, -MAX_LEAN, MAX_LEAN);
        state[i].lean += (target - state[i].lean) * 0.12;
        doodle.style.setProperty('--lean', `${state[i].lean.toFixed(2)}deg`);
      }
    });
    void y;
  });
}
