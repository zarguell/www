/**
 * Collage packing for the sticker wall: a spiral first-fit packer.
 *
 * This is a from-scratch simplification of Everybird's mask-aware packer
 * (github.com/yusuftaleb/everybird, MIT). The original packs transparent
 * alpha masks, runs a settling pass that closes loose lattice edges, and
 * trims the stage symmetrically about the count in the middle. What matters
 * for the look is simpler:
 *
 * - stickers are placed largest-first, so the big birds land at the centre;
 * - each candidate position walks an Archimedean spiral outward from the
 *   centre, taking the first spot where its box clears every box already
 *   placed;
 * - tile area follows body mass, so a swan reads bigger than a sparrow.
 *
 * Boxes are axis-aligned rectangles, not silhouettes, so gaps are slightly
 * more generous than the original's. That is the one visible difference: birds
 * of the same mass pack a little looser here.
 */

const GOLDEN_STEP = 0.35;
const SPIRAL_RATE = 2.2;

/** Painted area follows mass ** (2 * EXP), so a tile's long side follows mass ** EXP. */
const EXP = 0.2;
const MIN_REL = 0.55;
const MAX_REL = 2.6;

export interface CollageItem {
	id: string;
	/** body mass in grams; 0 falls back to the median */
	mass: number;
	/** width / height of the sticker image */
	aspect: number;
}

export interface CollageBox {
	id: string;
	/** top-left corner of the tile, in stage units */
	x: number;
	y: number;
	/** long side of the tile, in stage units */
	size: number;
	/** full width and height of the tile */
	width: number;
	height: number;
}

export interface CollageLayout {
	boxes: CollageBox[];
	/** stage extent in stage units, before scaling */
	width: number;
	height: number;
}

interface Rect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
	return (
		a.x0 < b.x1 + gap &&
		a.x1 > b.x0 - gap &&
		a.y0 < b.y1 + gap &&
		a.y1 > b.y0 - gap
	);
}

function median(values: number[]): number {
	if (values.length === 0) return 1;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Relative tile size per item: `(mass / median) ** EXP`, clamped so one
 * extreme bird cannot swallow the stage or vanish.
 */
export function relativeSizes(items: CollageItem[]): Map<string, number> {
	const masses = items.map((item) => (item.mass > 0 ? item.mass : 0)).filter((mass) => mass > 0);
	const reference = masses.length > 0 ? median(masses) : 1;
	const sizes = new Map<string, number>();
	for (const item of items) {
		const mass = item.mass > 0 ? item.mass : reference;
		const rel = Math.pow(mass / reference, EXP);
		sizes.set(item.id, Math.min(MAX_REL, Math.max(MIN_REL, rel)));
	}
	return sizes;
}

/**
 * Pack a collage.
 *
 * `base` is the long side of a median-mass tile in stage units; everything else
 * scales from it. The stage grows to fit, and the caller scales the result to
 * whatever pixel size it has.
 */
export function packCollage(items: CollageItem[], options: { base?: number; gap?: number } = {}): CollageLayout {
	const base = options.base ?? 46;
	const gap = options.gap ?? 6;

	if (items.length === 0) return { boxes: [], width: base * 4, height: base * 4 };

	const sizes = relativeSizes(items);

	// Largest first: big birds own the centre, small ones fill the fringe.
	const ordered = [...items].sort((a, b) => {
		const relA = sizes.get(a.id) ?? 1;
		const relB = sizes.get(b.id) ?? 1;
		return relB - relA || a.id.localeCompare(b.id);
	});

	const placed: Rect[] = [];
	const boxes: CollageBox[] = [];

	// Step along the spiral in proportion to the tile size, so a dense centre
	// does not get skipped and a sparse fringe is not over-sampled.
	const stepGrowth = 0.6;

	for (const item of ordered) {
		const rel = sizes.get(item.id) ?? 1;
		const longSide = base * rel;
		const aspect = item.aspect > 0 ? item.aspect : 1;
		const width = aspect >= 1 ? longSide : longSide * aspect;
		const height = aspect >= 1 ? longSide / aspect : longSide;

		let placedAt: { x: number; y: number } | null = null;
		let t = 0;
		const maxT = 60 + ordered.length * 0.7;

		while (t < maxT) {
			const radius = SPIRAL_RATE * t;
			const x = radius * Math.cos(t);
			const y = radius * Math.sin(t);

			const candidate: Rect = {
				x0: x - width / 2,
				y0: y - height / 2,
				x1: x + width / 2,
				y1: y + height / 2
			};

			if (!placed.some((existing) => overlaps(candidate, existing, gap))) {
				placedAt = { x, y };
				placed.push(candidate);
				break;
			}

			// Advance proportionally to the radius: fine steps near the centre,
			// coarser where a tile covers more ground, so this stays linear.
			t += (GOLDEN_STEP * 0.5) / (1 + 0.035 * radius) + 0.004 * stepGrowth;
		}

		// Spiral exhausted: park the tile just past the current fringe rather
		// than dropping it. Only reachable for pathologically many items.
		if (!placedAt) {
			const extent = placed.reduce((max, rect) => Math.max(max, rect.x1, -rect.x0), 0);
			const x = extent + width / 2 + gap;
			placedAt = { x, y: 0 };
			placed.push({ x0: x - width / 2, y0: -height / 2, x1: x + width / 2, y1: height / 2 });
		}

		boxes.push({ id: item.id, x: placedAt.x, y: placedAt.y, size: longSide, width, height });
	}

	// Bounds of the packed cluster.
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const rect of placed) {
		minX = Math.min(minX, rect.x0);
		minY = Math.min(minY, rect.y0);
		maxX = Math.max(maxX, rect.x1);
		maxY = Math.max(maxY, rect.y1);
	}

	// Translate so the cluster starts at the origin. Corners, not centres: every
	// caller positions a tile by its top-left, and a half-tile offset here shows
	// up as overlapping stickers.
	return {
		boxes: boxes.map((box) => ({
			...box,
			x: box.x - box.width / 2 - minX,
			y: box.y - box.height / 2 - minY
		})),
		width: maxX - minX,
		height: maxY - minY
	};
}
