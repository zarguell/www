/** Blog index filtering by tag and free text. */
(() => {
  const rows = Array.from(document.querySelectorAll('[data-post-row]'));
  if (!rows.length) return;
  const search = document.querySelector('[data-blog-search]');
  const filters = Array.from(document.querySelectorAll('[data-blog-filter]'));
  const empty = document.querySelector('[data-blog-empty]');
  const params = new URLSearchParams(window.location.search);
  let activeTag = params.get('tag') || 'all';

  function apply() {
    const query = (search?.value || '').trim().toLowerCase();
    let visible = 0;
    rows.forEach((row) => {
      const tags = (row.dataset.tags || '').split('|').filter(Boolean);
      const haystack = `${row.dataset.title || ''} ${row.dataset.description || ''} ${tags.join(' ')}`.toLowerCase();
      const tagMatch = activeTag === 'all' || tags.includes(activeTag);
      const queryMatch = !query || haystack.includes(query);
      const show = tagMatch && queryMatch;
      row.hidden = !show;
      if (show) visible += 1;
    });
    filters.forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.blogFilter || 'all') === activeTag));
    });
    if (empty) empty.hidden = visible !== 0;
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      activeTag = button.dataset.blogFilter || 'all';
      const url = new URL(window.location.href);
      if (activeTag === 'all') url.searchParams.delete('tag');
      else url.searchParams.set('tag', activeTag);
      window.history.replaceState({}, '', url);
      apply();
    });
  });
  search?.addEventListener('input', apply);
  apply();
})();
