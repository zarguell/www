/** Filter controls for Markdown ```timeline blocks. */
(() => {
  document.querySelectorAll('[data-timeline]').forEach((timeline) => {
    const items = Array.from(timeline.querySelectorAll('[data-timeline-item]'));
    const filters = Array.from(timeline.querySelectorAll('[data-timeline-filter]'));
    const empty = timeline.querySelector('[data-timeline-empty]');

    function apply(kind) {
      let visible = 0;
      items.forEach((item) => {
        const show = kind === 'all' || item.dataset.kind === kind;
        item.hidden = !show;
        if (show) visible += 1;
      });
      filters.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.timelineFilter === kind));
      });
      if (empty) empty.hidden = visible > 0;
    }

    filters.forEach((button) => {
      button.addEventListener('click', () => apply(button.dataset.timelineFilter || 'all'));
    });
  });
})();
