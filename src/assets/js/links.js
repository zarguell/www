/** Links page: filter cool finds by tag and free text. */
(() => {
  const items = Array.from(document.querySelectorAll('[data-find]'));
  if (!items.length) return;
  const search = document.querySelector('[data-find-search]');
  const filters = Array.from(document.querySelectorAll('[data-find-filter]'));
  const empty = document.querySelector('[data-find-empty]');
  let activeTag = 'all';

  function apply() {
    const query = (search?.value || '').trim().toLowerCase();
    let visible = 0;
    items.forEach((item) => {
      const tags = (item.dataset.tags || '').split('|').filter(Boolean);
      const haystack = `${item.dataset.title || ''} ${item.dataset.description || ''} ${tags.join(' ')}`.toLowerCase();
      const tagMatch = activeTag === 'all' || tags.includes(activeTag);
      const queryMatch = !query || haystack.includes(query);
      const show = tagMatch && queryMatch;
      item.hidden = !show;
      if (show) visible += 1;
    });
    filters.forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.findFilter || 'all') === activeTag));
    });
    if (empty) empty.hidden = visible !== 0;
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      activeTag = button.dataset.findFilter || 'all';
      apply();
    });
  });
  search?.addEventListener('input', apply);
  apply();
})();
