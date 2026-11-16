/**
 * TabTune Studio — lib/icons.js
 * -----------------------------
 * One place for every drawing in the interface. No emoji, no icon font,
 * no image request: each icon is a stroked SVG path, injected once as a
 * <symbol> sprite and referenced with <use href="#tt-name">.
 *
 * The sprite is inserted at the top of <body>, so icons already in the
 * markup resolve as soon as this file runs. It is loaded before popup.js.
 *
 *   TabTuneIcons.icon('gear')        ->  '<svg class="ico">…</svg>'
 *   TabTuneIcons.set(btn, 'play')    ->  replaces a button's icon in place
 */
(function () {
  'use strict';

  // 24x24 grid, stroke only, round caps — the same hand as the website.
  const P = {
    pin: 'M14 3.5l6.5 6.5-2.4 2.4-1.2-1.2-3 3 .7 3.6-1.7 1.7L7.2 13.8 4 10.6V4z',
    expand: 'M4 9.5V4h5.5M20 14.5V20h-5.5M20 9.5V4h-5.5M4 14.5V20h5.5',
    keyboard: 'M3 7.2h18v9.6H3zM7 11h.01M11 11h.01M15 11h.01M8.5 14h7',
    gear: 'M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM12 2.9v2.6M12 18.5v2.6M4.4 12H1.9M22.1 12h-2.5M6.4 6.4 4.6 4.6M19.4 19.4l-1.8-1.8M6.4 17.6l-1.8 1.8M19.4 4.6l-1.8 1.8',
    close: 'M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8',
    disk: 'M5 4.2h10.8L19 7.4v12.4H5zM9 4.2v4.6h6V4.2M8 19.6v-5.4h8v5.4',
    download: 'M12 3.6v10.6m0 0 3.8-3.8M12 14.2l-3.8-3.8M4.6 19.4h14.8',
    box: 'M12 3.2l8.3 4.1v8.6L12 20 3.7 15.9V7.3zM3.9 7.5 12 11.5l8.1-4M12 11.5v8.5',
    file: 'M14 3.6H7.7A1.6 1.6 0 0 0 6.1 5.2v13.6a1.6 1.6 0 0 0 1.6 1.6h8.6a1.6 1.6 0 0 0 1.6-1.6V7.6zM14 3.6v4h4M9.2 13h5.6M9.2 16.2h3.8',
    sparkle: 'M11 3.2l1.6 4.8L17.4 9.6 12.6 11.2 11 16 9.4 11.2 4.6 9.6 9.4 8zM18 14.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
    search: 'M10.9 17.6a6.7 6.7 0 1 0 0-13.4 6.7 6.7 0 0 0 0 13.4zM15.8 15.8 20.4 20.4',
    volume: 'M4 9.4h3.4L11.8 5.6v12.8L7.4 14.6H4zM15.6 9.4a4 4 0 0 1 0 5.2M18.2 6.8a7.7 7.7 0 0 1 0 10.4',
    back: 'M11.4 6.6 6 12l5.4 5.4M17.4 6.6 12 12l5.4 5.4',
    fwd: 'M12.6 6.6 18 12l-5.4 5.4M6.6 6.6 12 12l-5.4 5.4',
    play: 'M8 5.4 19.2 12 8 18.6z',
    pause: 'M8.2 5h3v14h-3zM12.8 5h3v14h-3z',
    stop: 'M7 7h10v10H7z',
    trash: 'M5 7h14M9.6 7V4.4h4.8V7M7 7l1 13h8l1-13M10.4 10.6v6M13.6 10.6v6',
    check: 'M4.8 12.6l4.6 4.6L19.2 6.9',
    warn: 'M12 4.4 21 19.8H3zM12 10v4.6M12 17.3h.01',
    lock: 'M6.6 11h10.8v9H6.6zM9.2 11V8.2a2.8 2.8 0 0 1 5.6 0V11',
    refresh: 'M20.2 12a8.2 8.2 0 1 1-2.6-6M20.4 4.4v5.8h-5.8',
    clock: 'M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8zM12 7.6V12l3.2 2M9.2 2.6h5.6',
    stamp: 'M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8zM12 7.4V12l3.4 2.1',
    mic: 'M12 3.4a2.9 2.9 0 0 1 2.9 2.9v4a2.9 2.9 0 0 1-5.8 0v-4A2.9 2.9 0 0 1 12 3.4zM6.6 11.4a5.4 5.4 0 0 0 10.8 0M12 17v3.4M9.2 20.4h5.6',
    moon: 'M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8 8.6 8.6 0 1 0 20.2 14.6z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M5.2 18.8l1.6-1.6M17.2 6.8l1.6-1.6',
    copy: 'M9 9h9.4v10.6H9zM15 9V4.4H5.4V15H9',
    wave: 'M3 12h1.6M7.2 8.4v7.2M11.4 5v14M15.6 7.4v9.2M19.8 10.2v3.6M21.6 12h-.8'
  };

  // Filled glyphs: they read better solid at small sizes.
  const FILLED = new Set(['play', 'pause', 'stop', 'sparkle']);

  function buildSprite() {
    const symbols = Object.keys(P)
      .map((name) => {
        const fill = FILLED.has(name) ? ' fill="currentColor" stroke="none"' : '';
        return `<symbol id="tt-${name}" viewBox="0 0 24 24"><path${fill} d="${P[name]}"/></symbol>`;
      })
      .join('');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tt-sprite');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = `<defs>${symbols}</defs>`;
    return svg;
  }

  function inject() {
    if (document.querySelector('.tt-sprite')) return;
    document.body.insertBefore(buildSprite(), document.body.firstChild);
  }

  const icon = (name, cls = 'ico') =>
    `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#tt-${name}"/></svg>`;

  /** Swap the icon of a button that also holds a <span class="lbl"> label. */
  function set(btn, name) {
    if (!btn) return;
    const use = btn.querySelector('svg.ico use');
    if (use) {
      use.setAttribute('href', `#tt-${name}`);
      return;
    }
    const label = btn.querySelector('.lbl');
    btn.innerHTML = icon(name) + (label ? label.outerHTML : '');
  }

  /** Set a button's whole content: icon plus text. */
  function label(btn, name, text) {
    if (!btn) return;
    btn.innerHTML = `${icon(name)}<span class="lbl">${text}</span>`;
  }

  window.TabTuneIcons = { icon, set, label, names: Object.keys(P) };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
