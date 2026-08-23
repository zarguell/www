import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { escapeHtml } from '../escape-html';
import { encodeState, decodeState, getParamsFor, linkWithParams, debounce } from '../url-state';

describe('escapeHtml', () => {
	it('escapes all five special characters', () => {
		expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
	});

	it('leaves plain text untouched', () => {
		expect(escapeHtml('hello world 123')).toBe('hello world 123');
	});

	it('stringifies non-strings safely', () => {
		expect(escapeHtml(42)).toBe('42');
		expect(escapeHtml(null)).toBe('');
		expect(escapeHtml(undefined)).toBe('');
	});

	it('neutralizes a hostile script payload', () => {
		const hostile = '<img src=x onerror=alert(1)>';
		const escaped = escapeHtml(hostile);
		expect(escaped).not.toContain('<img');
		expect(escaped.startsWith('&lt;img')).toBe(true);
	});
});

// Minimal LZString stand-in: identity "compression" with URI encoding hazards.
const fakeLZ = {
	compressToEncodedURIComponent: (s: string) => encodeURIComponent(s),
	decompressFromEncodedURIComponent: (s: string | null) =>
		s === null ? null : decodeURIComponent(s)
};

describe('url-state', () => {
	const original = (globalThis as Record<string, unknown>).LZString;

	afterEach(() => {
		if (original === undefined) delete (globalThis as Record<string, unknown>).LZString;
		else (globalThis as Record<string, unknown>).LZString = original;
	});

	it('encodeState returns null when LZString is unavailable (CDN failure)', () => {
		delete (globalThis as Record<string, unknown>).LZString;
		expect(encodeState({ a: 1 })).toBeNull();
		expect(decodeState('anything')).toBeNull();
	});

	it('round-trips state', () => {
		(globalThis as Record<string, unknown>).LZString = fakeLZ;
		const state = { people: ['a', 'b'], expenses: [{ amount: 12.5 }] };
		const encoded = encodeState(state)!;
		expect(decodeState(encoded)).toEqual(state);
	});

	it('chunking inserts delimiters and decode removes them', () => {
		(globalThis as Record<string, unknown>).LZString = fakeLZ;
		const encoded = encodeState({ x: 'a'.repeat(200) }, { chunkSize: 40, delimiter: '-' })!;
		expect((encoded.match(/-/g) || []).length).toBeGreaterThanOrEqual(4);
		const decoded = decodeState<{ x: string }>(encoded, '-')!;
		expect(decoded.x).toBe('a'.repeat(200));
	});

	it('decodeState returns null on garbage', () => {
		(globalThis as Record<string, unknown>).LZString = fakeLZ;
		expect(decodeState('%%%not-valid%%%')).toBeNull();
	});

	it('getParamsFor reads current URL params', () => {
		const url = new URL(window.location.href);
		url.searchParams.set('e', 'abc');
		url.searchParams.set('d', 'def');
		window.history.replaceState({}, '', url);
		expect(getParamsFor(['e', 'd', 'v'])).toEqual({ e: 'abc', d: 'def', v: null });
		window.history.replaceState({}, '', url.origin + url.pathname);
	});

	it('linkWithParams builds a clean absolute link', () => {
		const link = new URL(linkWithParams({ v: 'xyz' }));
		expect(link.origin + link.pathname).toBe(window.location.origin + window.location.pathname);
		expect(link.searchParams.get('v')).toBe('xyz');
	});

	it('debounce collapses bursts into one call', () => {
		return new Promise<void>((done) => {
			let calls = 0;
			const fn = debounce(() => calls++, 10);
			fn(); fn(); fn();
			setTimeout(() => {
				expect(calls).toBe(1);
				done();
			}, 40);
		});
	});
});
