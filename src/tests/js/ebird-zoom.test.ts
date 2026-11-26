import { beforeEach, describe, expect, it } from 'vitest';
import { CollageZoom } from '../../assets/js/lib/ebird-zoom';

/**
 * The collage is the one place a phone reader wants to zoom: 40px tiles on a
 * 390px screen. These tests cover the arithmetic that is easy to get wrong and
 * invisible in a screenshot — the scale clamp, and keeping the pinched point
 * under the fingers instead of letting the stage drift.
 */

interface Rig {
	viewport: HTMLElement;
	stage: HTMLElement;
	zoom: CollageZoom;
	pointer: (type: string, id: number, x: number, y: number) => void;
}

function rig(stageWidth = 1000, viewportWidth = 300): Rig {
	document.body.replaceChildren();
	const viewport = document.createElement('div');
	viewport.style.width = `${viewportWidth}px`;
	viewport.style.height = '300px';
	viewport.style.overflow = 'auto';
	// jsdom does not lay out, so scroll dimensions are stubbed to what the
	// browser would report for a stage this wide.
	Object.defineProperty(viewport, 'scrollWidth', { value: stageWidth, configurable: true });
	Object.defineProperty(viewport, 'clientWidth', { value: viewportWidth, configurable: true });
	Object.defineProperty(viewport, 'scrollHeight', { value: 300, configurable: true });
	Object.defineProperty(viewport, 'clientHeight', { value: 300, configurable: true });

	const stage = document.createElement('div');
	viewport.append(stage);
	document.body.append(viewport);

	const zoom = new CollageZoom({ viewport, stage });

	return {
		viewport,
		stage,
		zoom,
		pointer: (type, id, x, y) =>
			viewport.dispatchEvent(
				new PointerEvent(type, { bubbles: true, pointerId: id, clientX: x, clientY: y, pointerType: 'touch' })
			),
	};
}

describe('collage zoom', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('starts at 1x with the stage untransformed', () => {
		const r = rig();
		expect(r.zoom.value).toBe(1);
		expect(r.stage.style.transform).toBe('');
	});

	it('scales the stage by the finger spread', () => {
		const r = rig();
		// Fingers 100 apart spreading to 200 is a 2x pinch.
		r.pointer('pointerdown', 1, 100, 50);
		r.pointer('pointerdown', 2, 200, 50);
		r.pointer('pointermove', 1, 50, 50);
		r.pointer('pointermove', 2, 250, 50);

		expect(r.zoom.value).toBeCloseTo(2, 1);
		expect(r.stage.style.transform).toBe('scale(2)');
	});

	it('never zooms below the fitted size', () => {
		// Pinching in from 1x must be a no-op: showing the wall smaller than the
		// container helps nobody and leaves dead space around it.
		const r = rig();
		r.pointer('pointerdown', 1, 100, 50);
		r.pointer('pointerdown', 2, 300, 50);
		r.pointer('pointermove', 1, 190, 50);
		r.pointer('pointermove', 2, 210, 50);

		expect(r.zoom.value).toBe(1);
		expect(r.stage.style.transform).toBe('');
	});

	it('clamps at 4x however far the fingers spread', () => {
		const r = rig();
		r.pointer('pointerdown', 1, 150, 50);
		r.pointer('pointerdown', 2, 160, 50);
		// Ten pixels to a thousand: a 100x pinch.
		r.pointer('pointermove', 1, -350, 50);
		r.pointer('pointermove', 2, 660, 50);

		expect(r.zoom.value).toBe(4);
	});

	it('keeps the pinched point under the fingers', () => {
		const r = rig();
		// Anchor at x=150 in a 300px viewport, scroll at the far left.
		r.viewport.scrollLeft = 0;
		r.pointer('pointerdown', 1, 100, 50);
		r.pointer('pointerdown', 2, 200, 50);
		r.pointer('pointermove', 1, 50, 50);
		r.pointer('pointermove', 2, 250, 50);

		// The stage point that was under the centre (screen x 150) must be the
		// one under it now: scroll/(scale) should still be 150.
		expect(r.zoom.value).toBeCloseTo(2, 1);
		const contentX = (r.viewport.scrollLeft + 150) / r.zoom.value;
		expect(contentX).toBeCloseTo(150, 0);
	});

	it('marks the container zoomed so the page cannot scroll underneath', () => {
		const r = rig();
		expect(r.viewport.classList.contains('is-zoomed')).toBe(false);
		r.pointer('pointerdown', 1, 100, 50);
		r.pointer('pointerdown', 2, 200, 50);
		r.pointer('pointermove', 1, 50, 50);
		r.pointer('pointermove', 2, 250, 50);
		expect(r.viewport.classList.contains('is-zoomed')).toBe(true);
	});

	it('resets on double click', () => {
		const r = rig();
		r.pointer('pointerdown', 1, 100, 50);
		r.pointer('pointerdown', 2, 200, 50);
		r.pointer('pointermove', 1, 50, 50);
		r.pointer('pointermove', 2, 250, 50);
		r.pointer('pointerup', 1, 50, 50);
		r.pointer('pointerup', 2, 250, 50);
		expect(r.zoom.value).toBeGreaterThan(1);

		r.viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(r.zoom.value).toBe(1);
		expect(r.stage.style.transform).toBe('');
		expect(r.viewport.classList.contains('is-zoomed')).toBe(false);
	});

	it('pans a zoomed stage with one finger', () => {
		const r = rig();
		r.pointer('pointerdown', 1, 100, 50);
		r.pointer('pointerdown', 2, 200, 50);
		r.pointer('pointermove', 1, 50, 50);
		r.pointer('pointermove', 2, 250, 50);
		r.pointer('pointerup', 1, 50, 50);
		r.pointer('pointerup', 2, 250, 50);

		const before = r.viewport.scrollLeft;
		r.pointer('pointerdown', 5, 200, 50);
		r.pointer('pointermove', 5, 120, 50);
		r.pointer('pointerup', 5, 120, 50);

		// Dragging left by 80 scrolls right by 80.
		expect(r.viewport.scrollLeft).toBe(before + 80);
	});

	it('does not pan on one finger at rest, leaving it to native scrolling', () => {
		// A synthetic pan would fight momentum scrolling and eat sticker taps.
		const r = rig();
		r.pointer('pointerdown', 5, 200, 50);
		r.pointer('pointermove', 5, 100, 50);
		r.pointer('pointerup', 5, 100, 50);
		expect(r.viewport.scrollLeft).toBe(0);
	});
});
