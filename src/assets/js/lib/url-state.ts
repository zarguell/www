/**
 * Shared URL-state plumbing for shareable tools (was duplicated verbatim
 * between cocktail-recipe and splitcheck).
 *
 * Encoding is LZString (loaded as a global from CDN by the pages that need it);
 * the guard degrades to null when the CDN fails so callers can show a message
 * instead of throwing.
 */

interface LZStringStatic {
	compressToEncodedURIComponent(input: string): string;
	decompressFromEncodedURIComponent(input: string): string | null;
}

function lz(): LZStringStatic | null {
	const g = globalThis as unknown as { LZString?: LZStringStatic };
	return g.LZString ?? null;
}

export interface EncodeOptions {
	/** Split the encoded string with this delimiter every `chunkSize` chars
	 *  so messaging platforms still linkify long URLs. */
	chunkSize?: number;
	delimiter?: string;
}

export function encodeState(obj: unknown, opts: EncodeOptions = {}): string | null {
	const lib = lz();
	if (!lib) return null;
	let compressed = lib.compressToEncodedURIComponent(JSON.stringify(obj));
	if (opts.chunkSize && compressed.length > opts.chunkSize) {
		const chunks: string[] = [];
		for (let i = 0; i < compressed.length; i += opts.chunkSize) {
			chunks.push(compressed.slice(i, i + opts.chunkSize));
		}
		compressed = chunks.join(opts.delimiter ?? '-');
	}
	return compressed;
}

export function decodeState<T = unknown>(str: string, delimiter?: string): T | null {
	const lib = lz();
	if (!lib) return null;
	let json: string | null;
	try {
		const cleaned = delimiter ? str.split(delimiter).join('') : str;
		json = lib.decompressFromEncodedURIComponent(cleaned);
	} catch {
		return null;
	}
	if (!json) return null;
	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}

/** Read the given query params off the current URL (values or null). */
export function getParamsFor(keys: readonly string[]): Record<string, string | null> {
	const sp = new URLSearchParams(window.location.search);
	return Object.fromEntries(keys.map((k) => [k, sp.get(k)]));
}

/** Absolute URL for the current page with the given params set (replacing any). */
export function linkWithParams(params: Record<string, string>): string {
	const url = new URL(window.location.origin + window.location.pathname);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return url.toString();
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 300): (...args: A) => void {
	let t: ReturnType<typeof setTimeout> | null = null;
	return (...args: A) => {
		if (t !== null) clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	};
}
