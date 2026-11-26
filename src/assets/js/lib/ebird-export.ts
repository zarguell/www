/**
 * Export surfaces: the share poster, PNG/PDF capture, and the sticker zip.
 *
 * Everything here runs in the browser. The poster is a real DOM node rendered
 * off-screen at a fixed pixel width, so `html-to-image` captures it at a known
 * size regardless of the reader's viewport; the same node is then drawn to a
 * canvas for the PDF, which avoids a second rendering path.
 */

import type { EbirdSummary, Taxonomy } from './ebird';
import { taxonomyFor } from './ebird';
import { barChart } from './ebird-chart';
import { packCollage, type CollageBox, type CollageItem } from './ebird-collage';

export const STICKER_CDN = 'https://cdn.jsdelivr.net/gh/alchaincyf/huashu-bird-sticker@main';

export interface ExportContext {
	summary: EbirdSummary;
	taxonomy: Taxonomy;
	/** species already resolved to sticker URLs, largest first */
	stickers: StickerRef[];
	/** peak month label for the poster footer */
	peakMonthLabel: string;
	hours: number;
	distanceKm: number;
}

export interface StickerRef {
	sciName: string;
	comName: string;
	mass: number;
	url: string;
}

/** Sticker path uses the scientific binomial: Genus_species. */
export function stickerUrl(sciName: string, taxonomy: Taxonomy): string | null {
	const entry = taxonomyFor(sciName, taxonomy);
	if (!entry.familySci) return null;
	const binomial = sciName.trim().split(/\s+/).slice(0, 2).join('_');
	return `${STICKER_CDN}/stickers/${entry.order}/${entry.familySci}/${binomial}.webp`;
}

export function stickerRefs(summary: EbirdSummary, taxonomy: Taxonomy): StickerRef[] {
	return summary.lifeList
		.map((entry) => {
			const url = stickerUrl(entry.sciName, taxonomy);
			const mass = taxonomyFor(entry.sciName, taxonomy).mass;
			return url ? { sciName: entry.sciName, comName: entry.comName, mass, url } : null;
		})
		.filter((ref): ref is StickerRef => ref !== null)
		.sort((a, b) => b.mass - a.mass);
}

/* ---------- poster ---------- */

/**
 * The poster is a fixed 1080x1350 with 56px side padding, and the collage is
 * the flex-1 band between the stats row and the footer. These are the numbers
 * `buildPoster` packs against; they must match the poster CSS.
 */
const POSTER_COLLAGE_WIDTH = 1080 - 56 * 2;
const POSTER_COLLAGE_HEIGHT = 940;

/**
 * Largest median tile size whose pack fits the box in both directions.
 *
 * `packCollage` only grows the stage to fit its tiles, so a caller has to
 * choose `base` itself. Fixed values silently overflow, and overflow here is
 * invisible: the collage clips, so the export just loses birds.
 */
function packToFit(
	items: CollageItem[],
	maxWidth: number,
	maxHeight: number
): { boxes: CollageBox[]; width: number; height: number } {
	const gapFor = (base: number): number => Math.max(4, Math.round(base * 0.12));

	let best = packCollage(items, { base: MIN_POSTER_TILE, gap: gapFor(MIN_POSTER_TILE) });
	for (let base = 60; base >= MIN_POSTER_TILE; base -= 2) {
		const candidate = packCollage(items, { base, gap: gapFor(base) });
		if (candidate.width <= maxWidth && candidate.height <= maxHeight) return candidate;
		best = candidate;
	}

	// Nothing fits even at the floor. Every bird still has to appear, so shrink
	// the whole stage to the box rather than clip it: at this size the gaps
	// close but the stickers stay whole.
	const scale = Math.min(maxWidth / best.width, maxHeight / best.height);
	return {
		boxes: best.boxes.map((box) => ({
			...box,
			x: box.x * scale,
			y: box.y * scale,
			size: box.size * scale,
			width: box.width * scale,
			height: box.height * scale
		})),
		width: best.width * scale,
		height: best.height * scale
	};
}

/** Smallest poster tile worth packing before falling back to a uniform scale. */
const MIN_POSTER_TILE = 8;

function posterEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/**
 * Build the share poster off-screen.
 *
 * Fixed 1080x1350 (a 4:5 post): wide enough for a collage grid, tall enough to
 * hold the numbers and a caption band. Caller must remove the node.
 */
export function buildPoster(context: ExportContext): HTMLElement {
	const { summary, stickers, hours, distanceKm, peakMonthLabel } = context;
	const { stats } = summary;

	const poster = posterEl('div', 'ebird-poster');

	const head = posterEl('header', 'ebird-poster__head');
	head.append(
		posterEl('p', 'ebird-poster__kicker', 'eBird field analytics'),
		posterEl('h1', 'ebird-poster__title', 'My birding, in numbers')
	);
	poster.append(head);

	const numbers = posterEl('div', 'ebird-poster__stats');
	const cells: [string, string][] = [
		[String(stats.species), 'species'],
		[String(stats.checklists), 'checklists'],
		[String(stats.families), 'families'],
		[hours.toFixed(0), 'hours afield'],
		[`${distanceKm.toFixed(0)}`, 'km travelled'],
		[String(stats.regions), 'countries']
	];
	for (const [value, label] of cells) {
		const cell = posterEl('div', 'ebird-poster__stat');
		cell.append(posterEl('strong', undefined, value), posterEl('span', undefined, label));
		numbers.append(cell);
	}
	poster.append(numbers);

	// Collage: every sticker that resolved, packed to fit the band the poster
	// actually gives it. The old code fixed base at 54 and sliced to 120, which
	// packed a 5000px-wide stage into a 968px box and let `overflow: hidden`
	// throw most of the birds away without a word.
	const collage = posterEl('div', 'ebird-poster__collage');
	const items: CollageItem[] = stickers.map((ref) => ({
		id: ref.sciName,
		mass: ref.mass,
		aspect: 1
	}));
	const layout = packToFit(items, POSTER_COLLAGE_WIDTH, POSTER_COLLAGE_HEIGHT);
	collage.style.height = `${Math.round(layout.height)}px`;

	const byId = new Map(stickers.map((ref) => [ref.sciName, ref]));
	for (const box of layout.boxes) {
		const ref = byId.get(box.id);
		if (!ref) continue;
		const img = document.createElement('img');
		img.src = ref.url;
		img.alt = ref.comName;
		img.crossOrigin = 'anonymous';
		img.className = 'ebird-poster__sticker';
		img.style.left = `${Math.round(box.x)}px`;
		img.style.top = `${Math.round(box.y)}px`;
		img.style.width = `${Math.round(box.width)}px`;
		img.style.height = `${Math.round(box.height)}px`;
		collage.append(img);
	}
	poster.append(collage);

	const foot = posterEl('footer', 'ebird-poster__foot');
	foot.append(
		posterEl('span', undefined, `${formatRange(stats.firstDate, stats.lastDate)} · peak month ${peakMonthLabel}`),
		posterEl('span', undefined, 'www.arguelles.me/tools/ebird-analytics')
	);
	poster.append(foot);

	const credits = posterEl(
		'p',
		'ebird-poster__credits',
		'Stickers: huashu-bird-sticker by Huashu (CC BY 4.0), via Everybird by Yusuf Taleb. Data: eBird.'
	);
	poster.append(credits);

	return poster;
}

function formatRange(first: string, last: string): string {
	const yearOf = (iso: string): string => (iso ? iso.slice(0, 4) : '');
	const a = yearOf(first);
	const b = yearOf(last);
	if (!a && !b) return '';
	if (a === b) return a;
	return `${a}–${b}`;
}

/** Mount off-screen, capture, unmount. Keeps the reader's layout untouched. */
export interface PosterCapture {
	dataUrl: string;
	/** stickers the CDN could not supply, removed before capture */
	missingStickers: number;
}

export async function capturePoster(
	poster: HTMLElement,
	render: (node: HTMLElement) => Promise<string>
): Promise<PosterCapture> {
	const holder = document.createElement('div');
	holder.className = 'ebird-poster-holder';
	holder.append(poster);
	document.body.append(holder);

	let broken = 0;
	try {
		// Give the browser a frame to lay the collage out and start image loads.
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		await waitForImages(poster);
		// html-to-image rejects with an Event when any image in the tree failed
		// to load, which would otherwise kill the whole export over a single
		// missing sticker. Drop the failures and render what did arrive.
		broken = dropBrokenImages(poster);
		return { dataUrl: await render(poster), missingStickers: broken };
	} finally {
		holder.remove();
	}
}

/**
 * Remove images the CDN could not supply, so one gap cannot fail the capture.
 *
 * The sticker set does not cover every eBird species — extinct and very rare
 * ones 404, and a few answer 403 — so this returns the count it dropped. The
 * caller reports it: a poster missing birds says so instead of quietly looking
 * complete.
 */
function dropBrokenImages(node: HTMLElement): number {
	let dropped = 0;
	for (const img of [...node.querySelectorAll('img')]) {
		if (img.complete && img.naturalWidth === 0) {
			img.remove();
			dropped += 1;
		}
	}
	return dropped;
}

/** Resolve once every image under `node` has loaded or failed. */
async function waitForImages(node: HTMLElement): Promise<void> {
	const images = [...node.querySelectorAll('img')];
	await Promise.all(
		images.map((img) => {
			if (img.complete) return Promise.resolve();
			// Executor form on purpose: Promise.withResolvers needs Safari 17.4,
			// and unzipping works from 16.4 — not worth raising the floor here.
			return new Promise<void>((resolve) => {
				img.addEventListener('load', () => resolve(), { once: true });
				img.addEventListener('error', () => resolve(), { once: true });
				// Never hang the export on a CDN stall.
				setTimeout(resolve, 6000);
			});
		})
	);
}

/* ---------- pdf ---------- */

/**
 * Write a JPEG into a one-page PDF at the image's own aspect.
 *
 * JPEG, not PNG: PDF's `/DCTDecode` filter takes JPEG bytes directly, while PNG
 * would need the pixel data re-encoded as raw RGB *plus* the alpha and deflate
 * handling that PNG adds. A share poster is opaque, so JPEG loses nothing and
 * keeps this to a few dozen lines instead of a PNG decoder.
 *
 * A PDF wrapping a single image is a short, stable structure: a catalog, a page
 * tree, one page, the image XObject, and a content stream that draws it.
 */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
	const encoder = new TextEncoder();
	const chunks: Uint8Array[] = [];
	const offsets: number[] = [];
	let length = 0;

	const push = (data: Uint8Array | string): void => {
		const bytes = typeof data === 'string' ? encoder.encode(data) : data;
		chunks.push(bytes);
		length += bytes.length;
	};

	const object = (body: string): void => {
		offsets.push(length);
		push(body);
	};

	push('%PDF-1.4\n');

	// 1: catalog, 2: pages, 3: page, 4: image, 5: content
	object('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
	object('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
	object(
		`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
			'/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
	);

	object(
		`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
			`/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
	);
	push(jpeg);
	push('\nendstream\nendobj\n');

	const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
	object(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

	const xrefStart = length;
	const count = offsets.length + 1;
	let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
	for (const offset of offsets) {
		xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
	}
	push(xref);
	push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

	const out = new Uint8Array(length);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

/* ---------- download ---------- */

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	// Revoking immediately can cancel the download in some browsers.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
	const anchor = document.createElement('a');
	anchor.href = dataUrl;
	anchor.download = filename;
	anchor.click();
}

export function timestamp(): string {
	const now = new Date();
	const pad = (value: number): string => String(value).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A small summary chart for the poster, reusing the page's SVG builder. */
export function posterChart(summary: EbirdSummary): SVGSVGElement {
	return barChart(
		summary.years.map((year) => ({
			label: String(year.year),
			value: year.species,
			overlay: year.lifers
		})),
		{ width: 520, height: 150 }
	);
}
