/**
 * Pinch-to-zoom and one-finger pan for the collage stage.
 *
 * Why not let the page zoom: the browser's own pinch scales the whole document,
 * and inside a horizontally-scrolling box that fights the scroll container —
 * the reader loses the wall they were inspecting. Zooming the stage itself keeps
 * the collage under the fingers and leaves the page alone.
 *
 * The stage is a wide, absolutely-positioned child inside a viewport-sized
 * container. Zooming means transforming the *stage*, not the container, so the
 * scroll position survives and the container stays scrollable at scale 1.
 *
 * Pointer Events only: one code path covers touch, pen and mouse drag. Two
 * pointer IDs mean pinch; one means pan; the spread between the two fingers is
 * the scale.
 */

/** Below this the tiles are smaller than at rest, which is never useful. */
const MIN_SCALE = 1;
/** 4x is enough to read the smallest sticker; further is blurry upscaling. */
const MAX_SCALE = 4;
/** A pinch is a ratio; damp extremes so a jittery two-finger touch is calm. */
const WHEEL_STEP = 1.12;

export interface CollageZoomOptions {
	/** the scrolling container */
	viewport: HTMLElement;
	/** the absolutely-positioned stage inside it */
	stage: HTMLElement;
}

export class CollageZoom {
	private viewport: HTMLElement;
	private stage: HTMLElement;
	private scale = MIN_SCALE;
	/** pointer id -> position, for the pointers currently down */
	private pointers = new Map<number, { x: number; y: number }>();
	/** distance between the pinch fingers when the gesture began */
	private startDistance = 0;
	private startScale = MIN_SCALE;
	/**
	 * Stage coordinates under the pinch centre when the gesture began.
	 *
	 * Pinned once, not recomputed per move: two fingers never move in the same
	 * event, so a per-event centre walks a few pixels sideways and the stage
	 * drifts out from under them over a gesture.
	 */
	private anchor: { x: number; y: number } | null = null;
	/** scale mode is entered with two fingers and held until both lift */
	private pinching = false;
	/** one-finger pan bookkeeping */
	private panFrom: { x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;

	constructor({ viewport, stage }: CollageZoomOptions) {
		this.viewport = viewport;
		this.stage = stage;

		viewport.addEventListener('pointerdown', this.onDown);
		viewport.addEventListener('pointermove', this.onMove);
		viewport.addEventListener('pointerup', this.onUp);
		viewport.addEventListener('pointercancel', this.onUp);
		viewport.addEventListener('pointerleave', this.onUp);
		// Desktop trackpad pinch arrives as a ctrl+wheel event.
		viewport.addEventListener('wheel', this.onWheel, { passive: false });
		// A double tap resets, which is the only affordance touch users expect.
		viewport.addEventListener('dblclick', this.reset);
		this.syncHint();
	}

	/** Current zoom, 1 = fitted. */
	get value(): number {
		return this.scale;
	}

	private onDown = (event: PointerEvent): void => {
		// Sticker clicks and the hover card must keep working.
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (this.pointers.size === 2) {
			this.pinching = true;
			this.panFrom = null;
			this.startDistance = this.spread();
			this.startScale = this.scale;
			this.anchor = this.centreInStage();
			return;
		}

		if (this.pointers.size === 1 && this.scale > MIN_SCALE) {
			// At rest the browser's native scrolling is better than a synthetic
			// pan: it has momentum and does not fight the click handler.
			this.panFrom = {
				x: event.clientX,
				y: event.clientY,
				scrollLeft: this.viewport.scrollLeft,
				scrollTop: this.viewport.scrollTop
			};
			// Not in jsdom, and pointer capture is an optimisation here: without
			// it the browser still routes moves to the element under the finger.
			this.viewport.setPointerCapture?.(event.pointerId);
		}
	};

	private onMove = (event: PointerEvent): void => {
		if (!this.pointers.has(event.pointerId)) return;
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (this.pinching && this.pointers.size >= 2) {
			event.preventDefault();
			const distance = this.spread();
			if (this.startDistance > 0) this.apply(this.startScale * (distance / this.startDistance));
			return;
		}

		const from = this.panFrom;
		if (!from) return;
		event.preventDefault();
		this.viewport.scrollLeft = from.scrollLeft - (event.clientX - from.x);
		this.viewport.scrollTop = from.scrollTop - (event.clientY - from.y);
	};

	private onUp = (event: PointerEvent): void => {
		this.pointers.delete(event.pointerId);
		if (this.viewport.hasPointerCapture?.(event.pointerId)) {
			this.viewport.releasePointerCapture(event.pointerId);
		}

		// Pinch ends only when fewer than two fingers remain, or the gesture
		// would flip back to pan mid-pinch and jump the scroll position.
		if (this.pointers.size < 2) {
			this.pinching = false;
			this.anchor = null;
		}
		if (this.pointers.size === 0) {
			this.panFrom = null;
			// A zoomed-in stage can be dragged back to its edges.
			this.clampScroll();
		}
	};

	private onWheel = (event: WheelEvent): void => {
		// ctrl+wheel is the trackpad pinch; plain wheel keeps scrolling the page.
		if (!event.ctrlKey) return;
		event.preventDefault();
		const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
		this.apply(this.scale * factor);
	};

	private spread(): number {
		const [a, b] = [...this.pointers.values()];
		if (!a || !b) return 0;
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	/** The pinch centre in stage coordinates, using the pre-gesture scale. */
	private centreInStage(): { x: number; y: number } {
		const box = this.viewport.getBoundingClientRect();
		const [a, b] = [...this.pointers.values()];
		const cx = a && b ? (a.x + b.x) / 2 - box.left : box.width / 2;
		const cy = a && b ? (a.y + b.y) / 2 - box.top : box.height / 2;
		return {
			x: (this.viewport.scrollLeft + cx) / this.scale,
			y: (this.viewport.scrollTop + cy) / this.scale
		};
	}

	/**
	 * Scale the stage keeping the pinned stage point under the finger centre.
	 *
	 * The anchor is captured once per gesture, so a pinch that also slides both
	 * fingers carries the wall with it instead of letting it creep.
	 */
	private apply(next: number): void {
		const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
		if (Math.abs(clamped - this.scale) < 0.001) return;

		const box = this.viewport.getBoundingClientRect();
		const [a, b] = [...this.pointers.values()];
		const cx = a && b ? (a.x + b.x) / 2 - box.left : box.width / 2;
		const cy = a && b ? (a.y + b.y) / 2 - box.top : box.height / 2;
		const anchor = this.anchor ?? this.centreInStage();

		this.scale = clamped;
		this.stage.style.transform = `scale(${clamped})`;
		this.stage.style.transformOrigin = '0 0';

		// Put the pinned point back under the (possibly moved) centre.
		this.viewport.scrollLeft = anchor.x * clamped - cx;
		this.viewport.scrollTop = anchor.y * clamped - cy;
		this.clampScroll();
		this.syncHint();
	}

	private clampScroll(): void {
		const maxLeft = Math.max(0, this.viewport.scrollWidth - this.viewport.clientWidth);
		const maxTop = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
		this.viewport.scrollLeft = Math.min(maxLeft, Math.max(0, this.viewport.scrollLeft));
		this.viewport.scrollTop = Math.min(maxTop, Math.max(0, this.viewport.scrollTop));
	}

	/**
	 * Zoomed-in, the container must claim the gesture: `touch-action: none`
	 * stops the page scrolling under a one-finger pan, which would drag the wall
	 * away from the fingers mid-inspection.
	 */
	private syncHint(): void {
		this.viewport.classList.toggle('is-zoomed', this.scale > MIN_SCALE);
		const hint = document.getElementById('ebirdCollageZoom');
		if (!hint) return;
		hint.textContent =
			this.scale > MIN_SCALE ? `${this.scale.toFixed(1)}× · double-tap to reset` : 'Pinch to zoom';
		hint.classList.remove('is-hidden');
	}

	private reset = (): void => {
		if (this.scale === MIN_SCALE) return;
		this.scale = MIN_SCALE;
		this.stage.style.transform = '';
		this.viewport.scrollLeft = 0;
		this.viewport.scrollTop = 0;
		this.syncHint();
	};

	/** Detach every listener; the stage element is rebuilt on each render. */
	destroy(): void {
		this.viewport.removeEventListener('pointerdown', this.onDown);
		this.viewport.removeEventListener('pointermove', this.onMove);
		this.viewport.removeEventListener('pointerup', this.onUp);
		this.viewport.removeEventListener('pointercancel', this.onUp);
		this.viewport.removeEventListener('pointerleave', this.onUp);
		this.viewport.removeEventListener('wheel', this.onWheel);
		this.viewport.removeEventListener('dblclick', this.reset);
	}
}
