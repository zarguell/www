import { beforeEach, describe, expect, it } from 'vitest';
import { StickerCard } from '../../assets/js/lib/ebird-card';

/**
 * The card is the only way a reader learns what a sticker is: there is no text
 * label on the collage, and the alt attribute is not visible. So both input
 * paths matter — hover for a mouse, tap for a touch screen where `(hover: none)`
 * means no pointer ever enters the sticker.
 */

function detail(name: string) {
	return {
		comName: name,
		sciName: 'Turdus migratorius',
		family: 'Thrushes and Allies',
		order: 'Passeriformes',
		mass: 78,
		firstDate: '2024-06-08',
		lastDate: '2025-03-02',
		checklists: 2,
		lastPlace: 'Rio Park',
		bestCount: 7
	};
}

function build(host: HTMLElement): HTMLImageElement {
	const img = document.createElement('img');
	StickerCard.annotate(img, detail('American Robin'));
	host.append(img);
	return img;
}

const card = (): HTMLElement | null => document.getElementById('ebirdStickerCard');

describe('sticker card', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('opens on hover and closes when the pointer leaves', () => {
		const host = document.createElement('div');
		document.body.append(host);
		new StickerCard(host);
		const img = build(host);

		img.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(true);
		expect(card()?.textContent).toContain('American Robin');

		img.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(false);
	});

	it('opens on tap, where no pointer ever hovers', () => {
		const host = document.createElement('div');
		document.body.append(host);
		new StickerCard(host);
		const img = build(host);

		// A tap produces a click with no preceding hover.
		img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(true);
	});

	it('survives the focus churn a tap produces', () => {
		// A real tap dispatches pointerdown, then focus moves (focusout on the
		// old node, focusin on the new), then click. An earlier version closed
		// the card on that focusout and the click reopened it in the same
		// gesture, so the card flickered and ended up shut.
		const host = document.createElement('div');
		document.body.append(host);
		new StickerCard(host);
		const img = build(host);

		img.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
		img.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(true);

		img.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(true);
	});

	it('closes when the same sticker is tapped again', () => {
		const host = document.createElement('div');
		document.body.append(host);
		new StickerCard(host);
		const img = build(host);

		img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(true);
		img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(false);
	});

	it('closes when the reader taps somewhere else', () => {
		const host = document.createElement('div');
		const elsewhere = document.createElement('p');
		document.body.append(host, elsewhere);
		new StickerCard(host);
		const img = build(host);

		img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(true);

		elsewhere.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(card()?.classList.contains('is-visible')).toBe(false);
	});

	it('names the bird and its family for screen readers', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const img = build(host);
		expect(img.alt).toBe('American Robin, Thrushes and Allies');
		// Focusable, so the card is reachable without any pointer at all.
		expect(img.tabIndex).toBe(0);
	});
});
