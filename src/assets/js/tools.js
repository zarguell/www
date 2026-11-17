/** Tools index: filter cards by category and free text. */
(() => {
  const cards = Array.from(document.querySelectorAll('[data-tool-card]'));
  if (!cards.length) return;
  const search = document.querySelector('[data-tool-search]');
  const filters = Array.from(document.querySelectorAll('[data-tool-filter]'));
  const empty = document.querySelector('[data-tool-empty]');
  let activeCategory = 'all';

  function apply() {
    const query = (search?.value || '').trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const category = card.dataset.category || '';
      const haystack = `${card.dataset.title || ''} ${card.dataset.description || ''} ${card.dataset.features || ''}`.toLowerCase();
      const categoryMatch = activeCategory === 'all' || category === activeCategory;
      const queryMatch = !query || haystack.includes(query);
      const show = categoryMatch && queryMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });
    document.querySelectorAll('[data-tool-category]').forEach((section) => {
      section.hidden = !section.querySelector('[data-tool-card]:not([hidden])');
    });
    filters.forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.toolFilter || 'all') === activeCategory));
    });
    if (empty) empty.hidden = visible !== 0;
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.toolFilter || 'all';
      apply();
    });
  });
  search?.addEventListener('input', apply);
  apply();
})();
