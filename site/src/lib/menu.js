/** The mobile sheet: opens from the button, closes on Escape, keeps focus inside. */

export function initMenu() {
  const open = document.querySelector('[data-menu-open]');
  const sheet = document.querySelector('[data-sheet]');
  if (!open || !sheet) return;

  let lastFocus = null;

  const setOpen = (on) => {
    sheet.hidden = !on;
    // let the browser apply [hidden] before the transition
    requestAnimationFrame(() => sheet.classList.toggle('is-open', on));
    open.setAttribute('aria-expanded', String(on));
    open.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) lastFocus = document.activeElement;
    else if (lastFocus) lastFocus.focus();
  };

  setOpen(false);

  open.addEventListener('click', () => setOpen(sheet.hidden));

  sheet.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) {
      setOpen(false);
      return;
    }
    if (e.key !== 'Tab' || sheet.hidden) return;
    const focusables = [...sheet.querySelectorAll('a[href], button:not([disabled])')];
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // A resize past the breakpoint should not leave the sheet covering the page.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && !sheet.hidden) setOpen(false);
  }, { passive: true });
}
