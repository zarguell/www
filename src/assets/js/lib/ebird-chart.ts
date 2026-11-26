/**
 * SVG bar charts for the eBird dashboard.
 *
 * Plain DOM, no library: the chart is redrawn on each import and is also
 * embedded in the export poster, so it must render without a canvas context.
 */

const SV = 'http://www.w3.org/2000/svg';

export interface BarDatum {
	label: string;
	value: number;
	/** second series drawn over the bar, normally new lifers */
	overlay?: number;
	/** tooltip / accessible label */
	title?: string;
}

export interface BarChartOptions {
	width?: number;
	height?: number;
	/** value multiplier printed on the axis, e.g. 1 for integers */
	formatTick?: (value: number) => string;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SV, tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
	return node;
}

/**
 * Vertical bars with an optional overlay series.
 *
 * The overlay is drawn on the same scale as the bars, not stacked, so a lifer
 * count is read as "of which" rather than "in addition to".
 */
export function barChart(data: BarDatum[], options: BarChartOptions = {}): SVGSVGElement {
	const width = options.width ?? 720;
	const height = options.height ?? 240;
	const tick = options.formatTick ?? ((value: number) => String(Math.round(value)));

	const padX = 40;
	const padY = 26;
	const labelBand = 18;
	const plotW = width - padX * 2;
	const plotH = height - padY * 2 - labelBand;

	const max = Math.max(...data.map((datum) => datum.value), 1);
	const slot = plotW / Math.max(data.length, 1);
	const barW = Math.min(56, slot * 0.62);

	const svg = svgEl('svg', {
		viewBox: `0 0 ${width} ${height}`,
		role: 'img',
		class: 'ebird-svg',
		preserveAspectRatio: 'xMidYMid meet'
	});

	for (let step = 0; step <= 2; step += 1) {
		const y = padY + plotH - (plotH * step) / 2;
		svg.append(svgEl('line', { x1: padX, x2: width - padX, y1: y, y2: y, class: 'ebird-svg__grid' }));
		const axisLabel = svgEl('text', {
			x: padX - 6,
			y: y + 3,
			'text-anchor': 'end',
			class: 'ebird-svg__axis'
		});
		axisLabel.textContent = tick((max / 2) * step);
		svg.append(axisLabel);
	}

	data.forEach((datum, index) => {
		const x = padX + slot * index + (slot - barW) / 2;
		const barH = (datum.value / max) * plotH;

		const bar = svgEl('rect', {
			x,
			y: padY + plotH - barH,
			width: barW,
			height: Math.max(barH, 1),
			class: 'ebird-svg__bar'
		});
		if (datum.title) {
			const title = svgEl('title', {});
			title.textContent = datum.title;
			bar.append(title);
		}
		svg.append(bar);

		if (datum.overlay && datum.overlay > 0) {
			const overlayH = (datum.overlay / max) * plotH;
			svg.append(
				svgEl('rect', {
					x,
					y: padY + plotH - overlayH,
					width: barW,
					height: Math.max(overlayH, 1),
					class: 'ebird-svg__bar ebird-svg__bar--lifer'
				})
			);
		}

		const caption = svgEl('text', {
			x: x + barW / 2,
			y: height - 4,
			'text-anchor': 'middle',
			class: 'ebird-svg__axis'
		});
		caption.textContent = datum.label;
		svg.append(caption);
	});

	return svg;
}
