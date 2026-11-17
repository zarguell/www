/** Shared wiring for PyScript tool pages. */
import { watchForChart } from '../lib/zoomable-chart';

document.querySelectorAll<HTMLFormElement>('form[data-no-submit]').forEach((form) => {
  form.addEventListener('submit', (event) => event.preventDefault());
});

watchForChart('chart', [{ img: 'chartImg', checkbox: 'zoom-checkbox-chart' }]);
watchForChart('chart2', [{ img: 'chartImg2', checkbox: 'zoom-checkbox-chart2' }]);
