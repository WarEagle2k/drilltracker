/* Applies the saved (or system-preferred) theme before first paint to avoid a flash.
   Loaded as a blocking script in <head>, kept separate so the page needs no inline script. */
(function () {
  var theme = null;
  try { theme = localStorage.getItem('drilltracker-theme'); } catch (e) {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
