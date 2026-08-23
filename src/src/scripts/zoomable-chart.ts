/**
 * Click-to-zoom wiring for PyScript-generated chart images.
 *
 * Charts are injected dynamically (PyScript display), so each chart container
 * gets a MutationObserver that wraps the image in a zoom-on-click structure
 * once it appears. Was copy-pasted across eight tool pages.
 */

interface ZoomTarget {
	/** id of the <img> PyScript injects */
	img: string;
	/** unique id for the generated zoom checkbox */
	checkbox: string;
}

function makeZoomable(imgId: string, checkboxId: string): void {
	const chartImg = document.getElementById(imgId);
	if (!chartImg || chartImg.dataset.zoomInitialized) return;
	chartImg.dataset.zoomInitialized = 'true';

	// Wrap in click-zoom structure
	const clickZoom = document.createElement('div');
	clickZoom.className = 'click-zoom';

	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.id = checkboxId;
	checkbox.className = 'zoom-checkbox';

	const label = document.createElement('label');
	label.htmlFor = checkboxId;
	label.className = 'zoom-label';

	chartImg.parentNode?.insertBefore(clickZoom, chartImg);
	clickZoom.appendChild(checkbox);
	clickZoom.appendChild(label);
	label.appendChild(chartImg);

	// Zoom hint
	const hint = document.createElement('div');
	hint.className = 'zoom-hint';
	hint.style.fontFamily = 'VT323, monospace';
	hint.style.fontSize = '1rem';
	hint.style.color = 'var(--text)';
	hint.style.opacity = '0.7';
	hint.style.marginBottom = '0.5rem';
	hint.style.textAlign = 'center';
	hint.textContent = '🔍 Click image to view fullscreen';
	clickZoom.parentNode?.insertBefore(hint, clickZoom);
}

/**
 * Watch a chart container and make each target image zoomable when it
 * appears. No-op (with a console warning) if the container is missing.
 */
export function watchForChart(containerId: string, targets: ZoomTarget[]): void {
	const container = document.getElementById(containerId);
	if (!container) {
		console.warn(`zoomable-chart: container #${containerId} not found`);
		return;
	}

	const initAll = () => {
		for (const t of targets) {
			if (document.getElementById(t.img)) makeZoomable(t.img, t.checkbox);
		}
	};

	new MutationObserver((mutations) => {
		if (mutations.some((m) => m.addedNodes.length > 0)) initAll();
	}).observe(container, { childList: true });

	// Images may already exist by the time this runs
	initAll();
}
