import type { CvssParseResult, ParsedMetric } from './cvss';

export interface CvssCard {
  svg: string;
  width: number;
  height: number;
  summary: string;
}

const escapeXml = (value: string): string =>
  value.replace(/[<>&"']/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });

const clamp = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

function wrapVector(vector: string, max = 96): string[] {
  const parts = vector.split('/');
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}/${part}` : part;
    if (next.length > max && current) {
      lines.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapWords(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function metricLabel(metric: ParsedMetric): string {
  return `${metric.definition.name} · ${metric.valueLabel ?? 'Unknown value'}`;
}

export function buildCvssCard(result: CvssParseResult, sourceUrl = 'arguelles.me/tools/cvss-parser'): CvssCard | null {
  if (!result.version || result.errors.length || !result.metrics.length) return null;

  const width = 1200;
  const pad = 56;
  const contentWidth = width - pad * 2;
  const vectorLines = wrapVector(result.canonical);
  const vectorY = 128;
  const vectorHeight = 32 + vectorLines.length * 23;
  const gridY = vectorY + vectorHeight + 30;
  const base = result.metrics.filter((metric) => metric.definition.group === 'Base');
  const extras = result.metrics.filter((metric) => metric.definition.group !== 'Base');
  const columns = 3;
  const gap = 14;
  const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
  const cellHeight = 72;
  const rows = Math.max(1, Math.ceil(base.length / columns));
  const gridHeight = rows * cellHeight + (rows - 1) * gap;
  const extrasText = extras.map((metric) => `${metric.code}:${metric.value}`).join(' · ');
  const extrasLines = extrasText ? wrapWords(extrasText, 112) : [];
  const extrasY = gridY + gridHeight + 28;
  const extrasHeight = extrasLines.length ? extrasLines.length * 18 + 14 : 0;
  const footerY = extrasY + extrasHeight + 26;
  const height = Math.max(520, footerY + 44);
  const warningCount = result.warnings.length;
  const warningColor = warningCount ? '#e2c07e' : '#7ee2a8';

  const vectorText = vectorLines
    .map(
      (line, index) =>
        `<tspan x="${pad + 20}" dy="${index === 0 ? 0 : 23}">${escapeXml(line)}</tspan>`
    )
    .join('');

  const cells = base
    .map((metric, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = pad + column * (cellWidth + gap);
      const y = gridY + row * (cellHeight + gap);
      return `<g>
        <rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="#111111" stroke="#262626"/>
        <text x="${x + 14}" y="${y + 27}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="14">
          <tspan fill="#7ee2a8">${escapeXml(metric.code)}</tspan>
          <tspan fill="#ededed"> ${escapeXml(metric.value)}</tspan>
        </text>
        <text x="${x + 14}" y="${y + 49}" font-family="'IBM Plex Sans', Arial, sans-serif" font-size="11" fill="#7a7a7a">${escapeXml(
          clamp(metricLabel(metric), 46)
        )}</text>
      </g>`;
    })
    .join('');

  const extrasBlock = extrasLines.length
    ? `<text x="${pad}" y="${extrasY + 14}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="11" fill="#7a7a7a">${extrasLines
        .map((line, index) => `<tspan x="${pad}" dy="${index === 0 ? 0 : 18}">${escapeXml(line)}</tspan>`)
        .join('')}</text>`
    : '';

  const summaryLines = [
    result.versionLabel,
    result.canonical,
    ...base.map((metric) => `- ${metric.code} ${metric.value} — ${metricLabel(metric)}`),
    ...(extras.length ? [`Also: ${extrasText}`] : []),
    `Source: https://${sourceUrl}`
  ];
  const summary = summaryLines.join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title card-desc">
  <title id="card-title">${escapeXml(result.versionLabel)} vector card</title>
  <desc id="card-desc">${escapeXml(result.canonical)}</desc>
  <rect width="${width}" height="${height}" fill="#0b0b0b"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#262626"/>
  <text x="${pad}" y="76" font-family="'IBM Plex Sans', Arial, sans-serif" font-size="34" font-weight="600" fill="#ffffff">${escapeXml(
    result.versionLabel
  )}</text>
  <text x="${pad}" y="101" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="11" fill="#7a7a7a">CVSS VECTOR BREAKDOWN</text>
  <text x="${width - pad}" y="76" text-anchor="end" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="11">
    <tspan fill="#ededed">${result.metrics.length} metrics</tspan>
    <tspan fill="${warningColor}">${warningCount ? ` · ${warningCount} warning${warningCount === 1 ? '' : 's'}` : ' · parsed'}</tspan>
  </text>
  <rect x="${pad}" y="${vectorY}" width="${contentWidth}" height="${vectorHeight}" fill="#111111" stroke="#262626"/>
  <text x="${pad + 20}" y="${vectorY + 26}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="13" fill="#ededed">${vectorText}</text>
  ${cells}
  ${extrasBlock}
  <line x1="${pad}" y1="${footerY}" x2="${width - pad}" y2="${footerY}" stroke="#262626"/>
  <text x="${pad}" y="${footerY + 20}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="10" fill="#5f5f5f">https://${escapeXml(
    sourceUrl
  )}</text>
  <text x="${width - pad}" y="${footerY + 20}" text-anchor="end" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="10" fill="#5f5f5f">Parsed locally · no score calculated</text>
</svg>`;

  return { svg, width, height, summary };
}
