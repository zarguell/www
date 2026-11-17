import { parseVector, type CvssParseResult } from '../lib/cvss';
import { escapeHtml } from '../lib/escape-html';

const input = document.getElementById('cvssInput') as HTMLTextAreaElement;
const results = document.getElementById('cvssResults') as HTMLElement;
const status = document.getElementById('cvssStatus') as HTMLElement;

const examples: Record<string, string> = {
  v4: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N',
  v31: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:F/RL:O/RC:C',
  v2: 'AV:N/AC:L/Au:N/C:P/I:P/A:P/E:F/RL:OF/RC:C'
};

function notice(kind: 'error' | 'warning', message: string): string {
  return `<div class="notice notice--${kind}">${escapeHtml(message)}</div>`;
}

function summary(result: CvssParseResult): string {
  if (!result.version) {
    return `<div class="cvss-summary"><div class="cvss-summary__item"><span>Status</span><strong>Not parsed</strong></div></div>
      ${result.errors.map((message) => notice('error', message)).join('')}`;
  }

  const state = result.errors.length ? 'Needs attention' : result.warnings.length ? 'Parsed with warnings' : 'Parsed';
  const canonical = result.canonical
    ? `<div class="cvss-canonical">
        <span class="cvss-canonical__label">Canonical vector</span>
        <code>${escapeHtml(result.canonical)}</code>
        <button class="btn btn--small" type="button" id="cvssCopy">Copy</button>
      </div>`
    : '';
  const notices = [
    ...result.errors.map((message) => notice('error', message)),
    ...result.warnings.map((message) => notice('warning', message))
  ].join('');

  return `<div class="cvss-summary">
      <div class="cvss-summary__item"><span>Version</span><strong>${escapeHtml(result.versionLabel)}</strong></div>
      <div class="cvss-summary__item"><span>Metrics</span><strong>${result.metrics.length}</strong></div>
      <div class="cvss-summary__item"><span>Status</span><strong>${state}</strong></div>
    </div>
    ${canonical}
    ${notices}`;
}

function metricCard(metric: CvssParseResult['metrics'][number]): string {
  const value = metric.invalidValue
    ? `<strong class="cvss-metric__value cvss-metric__value--invalid">${escapeHtml(metric.value)} · Unknown value</strong>`
    : `<strong class="cvss-metric__value">${escapeHtml(metric.value)} · ${escapeHtml(metric.valueLabel ?? 'Unknown')}</strong>`;
  const valueDescription = metric.valueDescription
    ? `<p class="cvss-metric__value-desc">${escapeHtml(metric.valueDescription)}</p>`
    : '';
  return `<article class="cvss-metric">
      <div class="cvss-metric__head">
        <code class="cvss-metric__code">${escapeHtml(metric.code)}</code>
        <span class="cvss-metric__name">${escapeHtml(metric.definition.name)}</span>
        ${value}
      </div>
      <p class="cvss-metric__desc">${escapeHtml(metric.definition.description)}</p>
      ${valueDescription}
    </article>`;
}

function groups(result: CvssParseResult): string {
  return result.groups
    .map(
      (group) => `<section class="panel cvss-group">
        <div class="panel__head">
          <h2 class="panel__title">${escapeHtml(group.group)}</h2>
          <span class="badge">${group.metrics.length}</span>
        </div>
        <div class="panel__body cvss-metrics">
          ${group.metrics.map(metricCard).join('')}
        </div>
      </section>`
    )
    .join('');
}

function render(): void {
  const result = parseVector(input.value);
  results.classList.remove('is-hidden');
  results.innerHTML = summary(result) + groups(result);
  status.textContent = result.version
    ? `${result.metrics.length} metric${result.metrics.length === 1 ? '' : 's'} · ${result.versionLabel}`
    : 'Waiting for a valid vector';

  const copy = document.getElementById('cvssCopy');
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(result.canonical);
      copy.textContent = 'Copied';
      window.setTimeout(() => {
        copy.textContent = 'Copy';
      }, 1200);
    } catch {
      copy.textContent = 'Copy failed';
    }
  });
}

let timer = 0;
input.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(render, 120);
});

document.querySelectorAll<HTMLElement>('[data-cvss-example]').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = examples[button.dataset.cvssExample ?? 'v4'] ?? examples.v4;
    render();
    input.focus();
  });
});

render();
