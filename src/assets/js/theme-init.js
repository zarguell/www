// Runs before first paint. Kept external so the CSP can forbid inline scripts.
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem('theme');
  } catch {
    saved = null;
  }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
})();
