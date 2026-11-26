/**
 * Self-contained share links: the whole list lives in the URL, no database.
 *
 * Format (version 1, frozen once shipped — old links must keep working):
 *
 *   token = "1" + base64url( deflateRaw( level 9, BODY ) )
 *   BODY  = u8 flags
 *           [name]  if F_NAME: varint len, UTF-8 (at most 40 chars)
 *           varint nBirds
 *           per bird, ascending by species code:
 *             varint delta of the species' index in the baked code table
 *             (first delta from 0; every later delta >= 1)
 *           [dates] if F_DATES: per bird uint16 BE, months since 1900-01,
 *                   0xFFFF = unknown, high bit = year only
 *
 * Sizing is the whole design constraint. A 327-species list with full Latin
 * names and dates runs to ~3.5 KB of base64 — past the ~2,000 characters that
 * stay clickable in every chat client. Numbering the species against a fixed
 * table cuts the payload to a dozen-ish bytes per bird before deflate, which
 * lands a big list under the budget.
 *
 * The table is the species list already baked for the tool, so it costs no new
 * network request; it is ordered the same way the build wrote it, and that
 * order must never change.
 */

const NAME_MAX = 40;
const MAX_TOKEN = 12_000;
const MAX_BODY = 400_000;
/** A whole share URL stays at or under this, the point where chat clients stop linkifying. */
export const URL_BUDGET = 2000;

const F_NAME = 1;
const F_DATES = 2;

export class ShareTooLarge extends Error {
	constructor() {
		super('This list is too big to fit in a share link.');
		this.name = 'ShareTooLarge';
	}
}

export interface ShareBird {
	sciName: string;
	/** months since 1900-01; absent when unknown */
	ym?: number;
	yearOnly?: boolean;
}

export interface SharePayload {
	name?: string;
	birds: ShareBird[];
}

export interface EncodeResult {
	token: string;
	/** what survived: "birds" with dates, or "species" without */
	level: 'dates' | 'species';
	dropped: number;
}

/* ---------- byte plumbing ---------- */

class Writer {
	bytes: number[] = [];

	u8(value: number): void {
		this.bytes.push(value & 0xff);
	}

	varint(value: number): void {
		let n = value;
		while (n >= 128) {
			this.bytes.push((n & 127) | 128);
			n = Math.floor(n / 128);
		}
		this.bytes.push(n);
	}

	raw(data: Uint8Array): void {
		for (const byte of data) this.bytes.push(byte);
	}
}

class Reader {
	private at = 0;

	constructor(private readonly data: Uint8Array) {}

	u8(): number {
		if (this.at >= this.data.length) throw new Error('Truncated share link.');
		return this.data[this.at++];
	}

	varint(): number {
		let value = 0;
		let scale = 1;
		for (let step = 0; step < 5; step += 1) {
			const byte = this.u8();
			value += (byte & 127) * scale;
			if (byte < 128) return value;
			scale *= 128;
		}
		throw new Error('Malformed share link.');
	}

	raw(length: number): Uint8Array {
		if (this.at + length > this.data.length) throw new Error('Truncated share link.');
		const out = this.data.subarray(this.at, this.at + length);
		this.at += length;
		return out;
	}

	get remaining(): number {
		return this.data.length - this.at;
	}
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): Uint8Array {
	if (!/^[A-Za-z0-9_-]*$/.test(token) || token.length % 4 === 1) {
		throw new Error('That share link is malformed.');
	}
	const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/* ---------- deflate ---------- */

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
	// Workers and every current browser ship CompressionStream; using it keeps
	// this a pure platform module with no vendored library.
	// Copy out of the caller's view: Response() will not take a possibly-shared
	// buffer, and jsdom has no Blob.stream() to route through.
	const owned = new Uint8Array(data.byteLength);
	owned.set(data);
	const body = new Response(owned).body;
	if (!body) throw new Error('Could not read the payload.');
	const stream = body.pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const owned = new Uint8Array(data.byteLength);
	owned.set(data);
	const body = new Response(owned).body;
	if (!body) throw new Error('Could not read that share link.');
	const stream = body.pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------- code table ---------- */

/**
 * Stable ordering for the species index.
 *
 * `codes` must be sorted and must never be reordered or removed; appended
 * entries are fine, since old links carry indices into the old prefix.
 */
export function codeTable(species: string[]): { codes: string[]; index: Map<string, number> } {
	const codes = [...new Set(species)].sort();
	return { codes, index: new Map(codes.map((code, at) => [code, at])) };
}

/* ---------- encode ---------- */

function encodeBody(payload: SharePayload, index: Map<string, number>, withDates: boolean): Uint8Array {
	const writer = new Writer();
	let flags = 0;
	if (payload.name) flags |= F_NAME;
	if (withDates) flags |= F_DATES;
	writer.u8(flags);

	if (payload.name) {
		const name = new TextEncoder().encode(payload.name.slice(0, NAME_MAX));
		writer.varint(name.length);
		writer.raw(name);
	}

	const numbered = payload.birds
		.map((bird) => ({ bird, at: index.get(bird.sciName) }))
		.filter((entry): entry is { bird: ShareBird; at: number } => entry.at !== undefined)
		.sort((a, b) => a.at - b.at);

	writer.varint(numbered.length);
	let previous = 0;
	for (const entry of numbered) {
		writer.varint(entry.at - previous);
		previous = entry.at;
	}

	if (withDates) {
		for (const entry of numbered) {
			const stamp = entry.bird.ym !== undefined ? entry.bird.ym : -1;
			const value = stamp < 0 ? 0xffff : (entry.bird.yearOnly ? 0x8000 : 0) | stamp;
			writer.u8((value >> 8) & 0xff);
			writer.u8(value & 0xff);
		}
	}

	return Uint8Array.from(writer.bytes);
}

/**
 * Encode a payload, degrading dates then species to fit the budget.
 *
 * Dates go first: a life list without sighting dates is still a life list, and
 * the dates are most of the extra bytes.
 */
export async function encodeShare(payload: SharePayload, index: Map<string, number>, budget = URL_BUDGET): Promise<EncodeResult> {
	const present = payload.birds.filter((bird) => index.has(bird.sciName)).length;
	const dropped = payload.birds.length - present;

	for (const withDates of [true, false]) {
		const body = encodeBody(payload, index, withDates);
		const token = `1${toBase64Url(await deflateRaw(body))}`;
		if (token.length <= budget) {
			return { token, level: withDates ? 'dates' : 'species', dropped };
		}
	}

	throw new ShareTooLarge();
}

/* ---------- decode ---------- */

export async function decodeShare(token: string, codes: string[]): Promise<SharePayload> {
	if (token.length > MAX_TOKEN) throw new Error('That share link is too long.');
	if (!token.startsWith('1')) throw new Error('That share link is from a newer version.');
	// Length is checked on the base64 body, not the token: the version prefix is
	// one extra character, so a body that is a multiple of four was rejected.
	if ((token.length - 1) % 4 === 1) throw new Error('That share link is malformed.');

	const body = await inflateRaw(fromBase64Url(token.slice(1)));
	if (body.length > MAX_BODY) throw new Error('That share link is too large.');

	const reader = new Reader(body);
	const flags = reader.u8();
	if (flags & ~(F_NAME | F_DATES)) throw new Error('That share link uses unknown options.');

	let name: string | undefined;
	if (flags & F_NAME) {
		const length = reader.varint();
		if (length > NAME_MAX * 4) throw new Error('Malformed name in share link.');
		name = new TextDecoder('utf-8', { fatal: true }).decode(reader.raw(length));
	}

	const count = reader.varint();
	if (count > codes.length) throw new Error('That share link lists more birds than exist.');

	const birds: ShareBird[] = [];
	let at = 0;
	for (let n = 0; n < count; n += 1) {
		at += reader.varint();
		const code = codes[at];
		if (code === undefined) throw new Error('That share link references an unknown species.');
		birds.push({ sciName: code });
	}

	if (flags & F_DATES) {
		for (const bird of birds) {
			const high = reader.u8();
			const low = reader.u8();
			const value = (high << 8) | low;
			if (value === 0xffff) continue;
			bird.yearOnly = (value & 0x8000) !== 0;
			bird.ym = value & 0x7fff;
		}
	}

	return { name, birds };
}

/* ---------- compare ---------- */

export interface CompareList {
	name?: string;
	birds: ShareBird[];
}

export interface ComparePayload {
	lists: CompareList[];
}

const F_MULTI = 4;

/**
 * Several lists in one token, for a comparison link.
 *
 * Layout: F_MULTI set, varint list count, then each list as a name and a bird
 * block. Kept separate from the single-list body so an old decoder rejects it
 * on the unknown flag instead of misreading it.
 */
export async function encodeCompare(
	lists: CompareList[],
	index: Map<string, number>,
	budget = URL_BUDGET
): Promise<{ token: string; dropped: number }> {
	const writer = new Writer();
	writer.u8(F_MULTI);
	writer.varint(lists.length);

	let dropped = 0;
	for (const list of lists) {
		const name = new TextEncoder().encode((list.name ?? '').slice(0, NAME_MAX));
		writer.u8(name.length ? F_NAME : 0);
		if (name.length) {
			writer.varint(name.length);
			writer.raw(name);
		}

		const numbered = list.birds
			.map((bird) => ({ at: index.get(bird.sciName) }))
			.filter((entry): entry is { at: number } => entry.at !== undefined)
			.map((entry) => entry.at)
			.sort((a, b) => a - b);
		dropped += list.birds.length - numbered.length;

		writer.varint(numbered.length);
		let previous = 0;
		for (const at of numbered) {
			writer.varint(at - previous);
			previous = at;
		}
	}

	const token = `1${toBase64Url(await deflateRaw(Uint8Array.from(writer.bytes)))}`;
	if (token.length > budget) throw new ShareTooLarge();
	return { token, dropped };
}

export async function decodeCompare(token: string, codes: string[]): Promise<ComparePayload> {
	if (token.length > MAX_TOKEN) throw new Error('That comparison link is too long.');
	if (!token.startsWith('1')) throw new Error('That comparison link is from a newer version.');

	const body = await inflateRaw(fromBase64Url(token.slice(1)));
	if (body.length > MAX_BODY) throw new Error('That comparison link is too large.');

	const reader = new Reader(body);
	const flags = reader.u8();
	if (!(flags & F_MULTI)) throw new Error('That is a single-list link, not a comparison.');

	const count = reader.varint();
	if (count === 0 || count > 8) throw new Error('That comparison link has an odd number of lists.');

	const lists: CompareList[] = [];
	for (let n = 0; n < count; n += 1) {
		const listFlags = reader.u8();
		let name: string | undefined;
		if (listFlags & F_NAME) {
			const length = reader.varint();
			if (length > NAME_MAX * 4) throw new Error('Malformed name in comparison link.');
			name = new TextDecoder('utf-8', { fatal: true }).decode(reader.raw(length));
		}

		const birds: ShareBird[] = [];
		let at = 0;
		const birdCount = reader.varint();
		if (birdCount > codes.length) throw new Error('That comparison link lists more birds than exist.');
		for (let b = 0; b < birdCount; b += 1) {
			at += reader.varint();
			const code = codes[at];
			if (code === undefined) throw new Error('That comparison link references an unknown species.');
			birds.push({ sciName: code });
		}

		lists.push({ name, birds });
	}

	return { lists };
}

/** Species in one list and not another, plus the shared set. */
export interface CompareResult {
	shared: string[];
	onlyFirst: string[];
	onlySecond: string[];
}

export function compareLists(first: string[], second: string[]): CompareResult {
	const a = new Set(first);
	const b = new Set(second);
	return {
		shared: [...a].filter((name) => b.has(name)).sort(),
		onlyFirst: [...a].filter((name) => !b.has(name)).sort(),
		onlySecond: [...b].filter((name) => !a.has(name)).sort()
	};
}

/* ---------- display helpers ---------- */

export function ymToIso(ym: number): string {
	const year = 1900 + Math.floor(ym / 12);
	const month = (ym % 12) + 1;
	return `${year}-${String(month).padStart(2, '0')}`;
}

/** What the shared page shows, which is also the compare feature's input. */
export function shareUrl(origin: string, token: string): string {
	return `${origin}/tools/ebird-analytics/s/${token}`;
}
