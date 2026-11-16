/** Colour mode: night, day, or mix (each section shows the theme it was written for). */

const KEY = 'tabtune:theme';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function write(mode) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode }));
  } catch {
    /* private mode — the choice simply does not stick */
  }
}

export function setMode(mode) {
  applyMode(mode);
  write(mode);
}

/** Same look, but it does not overwrite what the visitor chose. */
export function setModeSilently(mode) {
  applyMode(mode);
}

function applyMode(mode) {
  const root = document.documentElement;
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-theme', mode === 'day' ? 'day' : 'night');
  document.querySelectorAll('[data-mode-set]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.modeSet === mode));
  });
}

export function initTheme() {
  // ?theme=dark|light|mix wins over what was saved, but is not remembered —
  // it is there so all three modes can be checked in one sitting.
  const asked = new URLSearchParams(location.search).get('theme');
  const askedMode = { dark: 'night', light: 'day', mix: 'mix' }[asked];
  if (askedMode) {
    setModeSilently(askedMode);
  } else {
    const saved = read();
    const mode = ['night', 'day', 'mix'].includes(saved.mode)
      ? saved.mode
      : document.documentElement.getAttribute('data-mode') || 'night';
    setMode(mode);
  }
  document.querySelectorAll('[data-mode-set]').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.modeSet));
  });
}
