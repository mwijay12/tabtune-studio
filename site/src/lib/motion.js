/** Scroll-driven drawing: the progress bar, the step rail, meters, reveals and the contour drift. */

import { all, clamp, onScroll, reduced, throughViewport } from './util.js';

/* ---------- top progress bar ---------- */
function progressBar() {
  const wrap = document.querySelector('[data-progress]');
  const bar = document.querySelector('[data-progress-bar]');
  const dot = document.querySelector('[data-progress-dot]');
  if (!wrap || !bar) return;

  onScroll(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max > 0 ? clamp((window.scrollY / max) * 100, 0, 100) : 0;
    bar.style.strokeDashoffset = String(100 - pct);
    if (dot) dot.style.setProperty('--pw', ((pct / 100) * wrap.clientWidth).toFixed(1));
    wrap.classList.toggle('has-scrolled', window.scrollY > 40);
    wrap.setAttribute('aria-valuenow', String(Math.round(pct)));
  });
}

/* ---------- the rail between the steps ---------- */
function stepRail() {
  const steps = document.querySelector('[data-steps]');
  if (!steps) return;
  const line = steps.querySelector('[data-rail]');
  const nodes = all('[data-node]', steps);

  onScroll(() => {
    const p = throughViewport(steps);
    const r = steps.getBoundingClientRect();
    // How far the list has travelled past the middle of the screen.
    const travelled = clamp((window.innerHeight * 0.62 - r.top) / Math.max(r.height, 1), 0, 1);
    if (line) line.style.strokeDashoffset = String(100 - travelled * 100);
    nodes.forEach((n, i) => {
      n.classList.toggle('is-on', travelled >= i / nodes.length - 0.02);
    });
    void p;
  });
}

/* ---------- linear meters (--p on the parent) ---------- */
function meters() {
  const els = all('[data-meter]');
  if (!els.length) return;
  const show = (el) => {
    const host = el.closest('svg')?.parentElement;
    if (!host) return;
    const p = Number(getComputedStyle(host).getPropertyValue('--p')) || 0;
    el.style.strokeDashoffset = String(100 - clamp(p, 0, 100));
  };
  els.forEach((el) => {
    if (reduced()) show(el);
    else new IntersectionObserver((es, o) => es.forEach((e) => {
      if (e.isIntersecting) { show(e.target); o.disconnect(); }
    }), { threshold: 0.4 }).observe(el);
  });
}

/* ---------- reveals and self-drawing lines ---------- */
function reveals() {
  const targets = all('.reveal, svg.draw-in, .sticker');
  if (!targets.length) return;

  if (reduced() || !('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          obs.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  targets.forEach((t) => {
    // A sticker at 92% up the screen pops; copy a little earlier.
    io.observe(t);
  });
}

/* ---------- the contour field drifts, transform only ---------- */
function contour() {
  const el = document.querySelector('.field .contour');
  if (!el || reduced()) return;
  onScroll((y) => {
    el.style.transform = `translate3d(0, ${(y * 0.05).toFixed(1)}px, 0) scale(1.04)`;
  });
}

/* ---------- in mix mode the field wears the theme of the section you are reading ---------- */
function fieldTheme() {
  const field = document.querySelector('.field');
  if (!field) return;
  const mix = document.documentElement.getAttribute('data-mode') === 'mix';
  if (!mix) {
    delete field.dataset.sec;
    return;
  }
  const mid = window.innerHeight * 0.5;
  let sec = document.documentElement.getAttribute('data-theme') || 'night';
  for (const el of document.querySelectorAll('[data-sec]')) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) {
      sec = el.dataset.sec;
      break;
    }
  }
  field.dataset.sec = sec;
}

/* ---------- launch countdown ---------- */
function countdown() {
  const host = document.querySelector('[data-countdown]');
  if (!host) return;

  const target = new Date(host.dataset.countdown).getTime();
  const startEl = host.closest('[data-countdown-start]');
  const start = startEl ? new Date(startEl.dataset.countdownStart).getTime() : target - 1000 * 60 * 60 * 24 * 30;
  const ring = host.querySelector('[data-ring]');
  const ringPct = host.querySelector('[data-ring-pct]');
  const wrap = host.querySelector('.count__ring');
  const units = host.querySelectorAll('[data-cd]');

  const tick = () => {
    const now = Date.now();
    const left = Math.max(0, target - now);
    const total = Math.max(1, target - start);
    const pct = clamp(((now - start) / total) * 100, 0, 100);

    if (wrap) wrap.style.setProperty('--p', pct.toFixed(1));
    if (ringPct) ringPct.textContent = String(Math.round(pct));

    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);

    units.forEach((u) => {
      const v = { days: d, hours: h, minutes: m, seconds: s }[u.dataset.cd];
      u.textContent = String(v).padStart(2, '0');
    });

    if (left === 0) {
      const label = host.parentElement?.querySelector('[data-cd-label]');
      if (label) label.textContent = 'It is live. The link is on the way to everyone who asked.';
    }
  };

  tick();
  setInterval(tick, 1000);
}

export function initMotion() {
  progressBar();
  stepRail();
  meters();
  reveals();
  contour();
  countdown();
  onScroll(fieldTheme);
}

/** Re-run after the mode changes, because mix mode is the only one that cares. */
export const refreshFieldTheme = fieldTheme;
