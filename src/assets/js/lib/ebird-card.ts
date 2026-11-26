/**
 * Hover/focus card for a collage sticker.
 *
 * Everybird shows what a bird is and where you found it on hover; the same
 * detail here comes from the parsed export, not a second lookup.
 *
 * Positioning is fixed and clamped to the viewport rather than absolute inside
 * the collage: stickers near the right or bottom edge would otherwise push the
 * card off-screen, and the collage clips its overflow.
 */

export interface StickerDetail {
	comName: string;
	sciName: string;
	family: string;
	order: string;
	/** body mass in grams, 0 when the source has none */
	mass: number;
	/** ISO date of the first sighting, empty when unknown */
	firstDate: string;
	lastDate: string;
	/** number of checklists the species appeared on */
	checklists: number;
	/** most recent location name, empty in a shared view */
	lastPlace: string;
	/** highest count on one checklist, 0 when never counted */
	bestCount: number;
	/**
	 * Dates carry month precision only (a shared list). Rendering "Jun 1, 2024"
	 * would claim a day the source never stored.
	 */
	monthOnly?: boolean;
}

const CARD_ID = 'ebirdStickerCard';
/** Gap between the sticker and the card, in px. */
const OFFSET = 10;

function formatMass(grams: number): string {
	if (!grams) return 'unknown';
	return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`;
}

function formatDate(iso: string, monthOnly = false): string {
	if (!iso) return '';
	const date = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		...(monthOnly ? {} : { day: 'numeric' })
	});
}

function elapsed(first: string, last: string): string {
	if (!first || !last || first === last) return '';
	const a = new Date(`${first}T00:00:00`).getTime();
	const b = new Date(`${last}T00:00:00`).getTime();
	if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return '';
	const days = Math.round((b - a) / 86_400_000);
	if (days < 60) return `${days} days apart`;
	const months = Math.round(days / 30.4);
	if (months < 24) return `${months} months apart`;
	return `${Math.round(days / 365.25)} years apart`;
}

export class StickerCard {
	private card: HTMLElement;
	/** The sticker the card currently describes, so scroll can re-anchor it. */
	private active: HTMLImageElement | null = null;
	/** True while a pointer is over the collage, so focus churn cannot close it. */
	private pointerInside = false;
	/** Kind of the last pointer that touched the page; a mouse can hover away. */
	private pointerType = 'mouse';
	/** True once a key is pressed, so focus means tabbing rather than a tap. */
	private keyboard = false;

	constructor(host: HTMLElement) {
		const existing = document.getElementById(CARD_ID);
		if (existing) existing.remove();

		const card = document.createElement('div');
		card.id = CARD_ID;
		card.className = 'ebird-card';
		card.setAttribute('role', 'tooltip');
		card.setAttribute('aria-hidden', 'true');
		this.card = card;
		document.body.append(card);

		// A pointer leaving the sticker hides it; the card itself is
		// pointer-events:none so it can never trap the pointer.
		host.addEventListener('mouseover', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLImageElement)) return;
			this.show(target);
		});
		host.addEventListener('mouseout', (event) => {
			const target = event.target;
			if (target instanceof HTMLImageElement) this.hide();
		});
		// Keyboard reach: stickers are focusable, so tabbing to one shows its card.
		// Only keyboard focus opens it — a tap focuses the sticker too, and
		// opening on that focus would fight the click that opens it, so the same
		// tap would show and immediately toggle the card shut.
		host.addEventListener('focusin', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLImageElement)) return;
			if (!this.keyboard) return;
			this.show(target);
		});
		// A tap focuses the sticker and a mouse click focuses it too, so
		// focusout cannot be trusted to mean "the reader moved on": on touch it
		// fires between the pointerdown and the click of the same tap. Only a
		// pointer or key that actually leaves closes the card.
		host.addEventListener('focusout', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLImageElement)) return;
			// Touch focus is not a decision. The same tap that opens the card
			// also moves focus, so a touch-driven focusout leaving the sticker
			// means nothing; the tap, pointerdown or tap-elsewhere closes it.
			if (this.pointerInside || this.pointerType === 'touch') return;
			this.hide();
		});

		// Touch has no hover, so tapping a sticker opens its card. `click` is
		// the right event, not `touchstart`: a tap that turns into a swipe never
		// produces one, so panning the collage does not open cards by accident.
		// Tapping the same sticker again closes it; the card is not a toggle
		// driven by focus, which would fight the browser's own tap sequence.
		host.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLImageElement) || !target.dataset.detail) return;
			if (this.active === target && this.card.classList.contains('is-visible')) {
				this.hide();
				return;
			}
			this.show(target);
		});
		window.addEventListener('keydown', () => {
			this.keyboard = true;
		});
		host.addEventListener('pointerenter', () => {
			this.pointerInside = true;
		});
		host.addEventListener('pointerleave', () => {
			this.pointerInside = false;
			if (this.pointerType === 'mouse') this.hide();
		});
		document.addEventListener('pointerdown', (event) => {
			const target = event.target;
			this.keyboard = false;
			this.pointerType = event.pointerType;
			if (target instanceof Node && host.contains(target)) return;
			this.hide();
		}, { passive: true });

		// The card is fixed to the viewport, so a scroll leaves it stranded next
		// to a sticker that moved. Re-anchor instead of hiding: hiding on scroll
		// makes the card flicker away whenever the page nudges, and browsers
		// scroll an element into view on their own before firing the hover.
		const reanchor = (): void => this.reanchor();
		host.addEventListener('scroll', reanchor, { passive: true });
		window.addEventListener('scroll', reanchor, { passive: true });
		window.addEventListener('resize', reanchor, { passive: true });
	}

	/** Attach the detail to a sticker; the image carries it as a dataset. */
	static annotate(img: HTMLImageElement, detail: StickerDetail): void {
		img.dataset.detail = JSON.stringify(detail);
		img.tabIndex = 0;
		img.setAttribute('role', 'img');
		img.alt = `${detail.comName}, ${detail.family}`;
	}

	private detailOf(img: HTMLImageElement): StickerDetail | null {
		const raw = img.dataset.detail;
		if (!raw) return null;
		try {
			return JSON.parse(raw) as StickerDetail;
		} catch {
			return null;
		}
	}

	private show(img: HTMLImageElement): void {
		const detail = this.detailOf(img);
		if (!detail) return;

		this.active = img;
		this.card.replaceChildren(...this.buildRows(detail));
		this.card.setAttribute('aria-hidden', 'false');
		this.card.classList.add('is-visible');
		this.position(img);
	}

	private hide(): void {
		this.active = null;
		this.card.setAttribute('aria-hidden', 'true');
		this.card.classList.remove('is-visible');
	}

	/**
	 * Keep the card on its sticker after a scroll, and drop it once the sticker
	 * leaves the viewport — a fixed card for an off-screen sticker would float
	 * beside whatever happens to be there.
	 */
	private reanchor(): void {
		const img = this.active;
		if (!img || !img.isConnected) {
			this.hide();
			return;
		}
		const box = img.getBoundingClientRect();
		if (box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth) {
			this.hide();
			return;
		}
		this.position(img);
	}

	/** Place above the sticker when there is room, else below; clamp to viewport. */
	private position(img: HTMLImageElement): void {
		const box = img.getBoundingClientRect();
		const card = this.card.getBoundingClientRect();

		let left = box.left + box.width / 2 - card.width / 2;
		left = Math.max(8, Math.min(left, window.innerWidth - card.width - 8));

		let top = box.top - card.height - OFFSET;
		if (top < 8) top = box.bottom + OFFSET;
		top = Math.max(8, Math.min(top, window.innerHeight - card.height - 8));

		this.card.style.left = `${Math.round(left)}px`;
		this.card.style.top = `${Math.round(top)}px`;
	}

	private buildRows(detail: StickerDetail): HTMLElement[] {
		const nodes: HTMLElement[] = [];

		const title = document.createElement('p');
		title.className = 'ebird-card__title';
		title.textContent = detail.comName;
		nodes.push(title);

		const sci = document.createElement('p');
		sci.className = 'ebird-card__sci';
		sci.textContent = detail.sciName;
		nodes.push(sci);

		const list = document.createElement('dl');
		list.className = 'ebird-card__meta';

		const row = (label: string, value: string): void => {
			if (!value) return;
			const dt = document.createElement('dt');
			dt.textContent = label;
			const dd = document.createElement('dd');
			dd.textContent = value;
			list.append(dt, dd);
		};

		row('Family', detail.family);
		row('Order', detail.order);
		row('Mass', formatMass(detail.mass));

		const first = formatDate(detail.firstDate, detail.monthOnly);
		const last = formatDate(detail.lastDate, detail.monthOnly);
		if (first) {
			const apart = elapsed(detail.firstDate, detail.lastDate);
			row('First seen', apart ? `${first} · ${apart}` : first);
		}
		if (last && last !== first) row('Last seen', last);
		if (detail.checklists > 0) row('Checklists', String(detail.checklists));
		if (detail.bestCount > 0) row('Best count', String(detail.bestCount));
		row('Last place', detail.lastPlace);

		nodes.push(list);
		return nodes;
	}
}
