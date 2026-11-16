/**
 * Runs before first paint, so the right theme is on the page from the start
 * and there is no flash. Plain script, no module, loaded in <head>.
 *
 * The `no-js` class is removed here: anything that depends on scripting uses
 * it to show itself only when scripts are off.
 */
(function () {
  var d = document.documentElement;
  d.classList.remove('no-js');

  var mode = 'night';
  try {
    var saved = JSON.parse(localStorage.getItem('tabtune:theme') || '{}');
    if (saved.mode === 'day' || saved.mode === 'night' || saved.mode === 'mix') {
      mode = saved.mode;
    } else if (saved.theme === 'day' || saved.theme === 'night') {
      mode = saved.theme;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      mode = 'day';
    }
  } catch (e) {
    /* private mode — fall back to night */
  }

  d.setAttribute('data-mode', mode);
  d.setAttribute('data-theme', mode === 'day' ? 'day' : 'night');
})();
