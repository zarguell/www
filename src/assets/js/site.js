/** Global behavior: theme, mobile navigation, copy buttons, dismissible notices. */
(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector('[data-theme-toggle]');
  const menuButton = document.querySelector('[data-menu-toggle]');
  const mobileNav = document.getElementById('mobile-nav');

  function syncThemeButton() {
    if (!themeButton) return;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    themeButton.setAttribute('aria-label', `Switch to ${next} theme`);
    themeButton.setAttribute('title', `Switch to ${next} theme`);
  }

  themeButton?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage can be disabled; the visual toggle still works */
    }
    syncThemeButton();
  });
  syncThemeButton();

  function setMenu(open) {
    if (!mobileNav || !menuButton) return;
    mobileNav.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    const icon = menuButton.querySelector('use');
    if (icon) icon.setAttribute('href', `/assets/icons.svg#${open ? 'close' : 'menu'}`);
  }

  menuButton?.addEventListener('click', () => setMenu(mobileNav?.hidden ?? true));
  mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });

  document.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      const block = button.closest('.code-block');
      const code = block?.querySelector('code');
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.innerText);
        const old = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.textContent = old;
        }, 1200);
      } catch {
        button.textContent = 'Copy failed';
      }
    });
  });

  document.querySelectorAll('[data-copy-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const old = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.textContent = old;
        }, 1200);
      } catch {
        button.textContent = 'Copy failed';
      }
    });
  });

  document.querySelectorAll('[data-dismiss]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.closest('[data-dismissable]');
      if (target) target.hidden = true;
    });
  });
})();
