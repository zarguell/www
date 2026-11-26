import { describe, expect, it } from 'vitest';
import {
	ShareTooLarge,
	codeTable,
	compareLists,
	decodeCompare,
	decodeShare,
	encodeCompare,
	encodeShare,
	monthsSince1900,
	ymToIso
} from '../../assets/js/lib/ebird-share';

// The table is keyed by the same string the encoder looks up: the species
// binomial the tool stores in a life list.
const SPECIES = [
	'Anas platyrhynchos',
	'Branta canadensis',
	'Cardinalis cardinalis',
	'Cyanocitta cristata',
	'Melanerpes carolinus',
	'Poecile atricapillus',
	'Passer domesticus',
	'Sitta canadensis',
	'Spinus tristis',
	'Turdus migratorius',
	'Zenaida macroura',
	'Columba livia'
];
const { codes, index } = codeTable(SPECIES);

const birds = (...names: string[]) => names.map((sciName) => ({ sciName }));

describe('share links', () => {
	it('round-trips a species list', async () => {
		const payload = { name: 'Zach', birds: birds('Branta canadensis', 'Turdus migratorius') };
		const { token } = await encodeShare(payload, index);
		const decoded = await decodeShare(token, codes);

		expect(decoded.name).toBe('Zach');
		// Order follows the sorted code table, which is what the deltas encode.
		expect(decoded.birds.map((bird) => bird.sciName)).toEqual([
			'Branta canadensis',
			'Turdus migratorius'
		]);
	});

	it('carries dates through the date section', async () => {
		const payload = {
			birds: [{ sciName: 'Branta canadensis', ym: (2021 - 1900) * 12 + 6 }]
		};
		const { token, level } = await encodeShare(payload, index);
		expect(level).toBe('dates');

		const decoded = await decodeShare(token, codes);
		expect(decoded.birds[0].ym).toBe((2021 - 1900) * 12 + 6);
		expect(ymToIso(decoded.birds[0].ym ?? 0)).toBe('2021-07');
	});

	it('drops dates before species when the token is too long', async () => {
		const payload = {
			birds: [
				{ sciName: 'Branta canadensis', ym: 1400 },
				{ sciName: 'Cardinalis cardinalis', ym: 1500 }
			]
		};

		// Measure the date-bearing token once, then demand one character less.
		// Deriving the budget from the token itself keeps this independent of
		// whatever the deflate implementation emits.
		const withDates = await encodeShare(payload, index, 100_000);
		expect(withDates.level).toBe('dates');

		const degraded = await encodeShare(payload, index, withDates.token.length - 1);
		expect(degraded.level).toBe('species');
		expect(degraded.token.length).toBeLessThanOrEqual(withDates.token.length - 1);

		// Species survive; only the dates are gone.
		const decoded = await decodeShare(degraded.token, codes);
		expect(decoded.birds.map((bird) => bird.sciName)).toEqual([
			'Branta canadensis',
			'Cardinalis cardinalis'
		]);
		expect(decoded.birds.every((bird) => bird.ym === undefined)).toBe(true);
	});

	it('refuses a list that cannot fit even without dates', async () => {
		await expect(encodeShare({ birds: birds('Branta canadensis') }, index, 4)).rejects.toBeInstanceOf(
			ShareTooLarge
		);
	});

	it('counts species the index does not know as dropped', async () => {
		const payload = { birds: birds('Branta canadensis', 'Unknownus species') };
		const { dropped, token } = await encodeShare(payload, index);
		expect(dropped).toBe(1);
		expect(await decodeShare(token, codes)).toMatchObject({
			birds: [{ sciName: 'Branta canadensis' }]
		});
	});

	it('keeps the token under the chat-clickable budget for a big list', async () => {
		const many = Array.from({ length: 600 }, (_, at) => ({
			sciName: `Genus${at} species${at}`
		}));
		const bigTable = codeTable(many.map((bird) => bird.sciName));
		const { token } = await encodeShare({ name: 'Zach', birds: many }, bigTable.index);
		expect(token.length).toBeLessThan(1900);
	});

	it('rejects malformed and truncated tokens', async () => {
		await expect(decodeShare('2abcdef', codes)).rejects.toThrow(/newer version/);
		await expect(decodeShare('1', codes)).rejects.toThrow();
		await expect(decodeShare('1!!!!', codes)).rejects.toThrow(/malformed/);
	});

	it('rejects a token whose species index is out of range', async () => {
		// Encode against a table with more species than the decoder knows.
		const other = codeTable([...SPECIES, 'Zzzz zzzz', 'Zzzz yyyy', 'Zzzz xxxx']);
		const { token } = await encodeShare({ birds: birds('Zzzz xxxx') }, other.index);
		await expect(decodeShare(token, codes)).rejects.toThrow(/unknown species/);
	});
});

describe('date budget', () => {
	it('keeps a full-size list with dates inside the URL budget', async () => {
		// Dates add two bytes per bird before deflate. A 300-species list must
		// still produce a link a chat client will linkify, so this guards the
		// size assumption behind sending dates at all.
		const many = Array.from({ length: 300 }, (_, at) => ({
			sciName: `Genus${at} species${at}`,
			ym: 1200 + at
		}));
		const { codes: manyCodes, index: manyIndex } = codeTable(many.map((b) => b.sciName));
		expect(manyCodes).toHaveLength(300);

		const { token, level } = await encodeShare({ name: 'Zach', birds: many }, manyIndex);
		expect(level).toBe('dates');
		// The tool page path plus "?s=" is what the token rides behind.
		expect(token.length + '/tools/ebird-analytics/?s='.length).toBeLessThan(2000);
	});
});

describe('monthsSince1900', () => {
	it('converts an ISO date to months since January 1900', () => {
		expect(monthsSince1900('1900-01-01')).toBe(0);
		expect(monthsSince1900('2024-06-08')).toBe(1493);
	});

	it('rejects dates the format cannot store', () => {
		// A pre-1900 or malformed date must read as "unknown", not January 1900,
		// or an old record lands on the year chart as a sighting.
		expect(monthsSince1900('')).toBeUndefined();
		expect(monthsSince1900('1899-12-31')).toBeUndefined();
		expect(monthsSince1900('2024-13-01')).toBeUndefined();
		expect(monthsSince1900('nope')).toBeUndefined();
	});

	it('round-trips through ymToIso', () => {
		expect(ymToIso(monthsSince1900('2025-03-02') as number)).toBe('2025-03');
	});
});

describe('comparison links', () => {
	it('round-trips two named lists', async () => {
		const lists = [
			{ name: 'Mine', birds: birds('Branta canadensis', 'Turdus migratorius') },
			{ name: 'Theirs', birds: birds('Turdus migratorius', 'Cardinalis cardinalis') }
		];
		const { token } = await encodeCompare(lists, index);
		const decoded = await decodeCompare(token, codes);

		expect(decoded.lists).toHaveLength(2);
		expect(decoded.lists[0].name).toBe('Mine');
		expect(decoded.lists[1].name).toBe('Theirs');
		expect(decoded.lists[0].birds.map((bird) => bird.sciName)).toEqual([
			'Branta canadensis',
			'Turdus migratorius'
		]);
	});

	it('is distinguishable from a single-list token', async () => {
		const { token } = await encodeShare({ birds: birds('Branta canadensis') }, index);
		await expect(decodeCompare(token, codes)).rejects.toThrow(/single-list/);
	});

	it('refuses more than eight lists', async () => {
		const lists = Array.from({ length: 9 }, () => ({ birds: birds('Branta canadensis') }));
		const { token } = await encodeCompare(lists, index);
		await expect(decodeCompare(token, codes)).rejects.toThrow(/odd number/);
	});
});

describe('compareLists', () => {
	it('splits shared and unique species', () => {
		const result = compareLists(
			['a', 'b', 'c'],
			['b', 'c', 'd']
		);
		expect(result.shared).toEqual(['b', 'c']);
		expect(result.onlyFirst).toEqual(['a']);
		expect(result.onlySecond).toEqual(['d']);
	});

	it('handles disjoint and identical lists', () => {
		expect(compareLists(['a'], ['b'])).toEqual({ shared: [], onlyFirst: ['a'], onlySecond: ['b'] });
		const same = compareLists(['a', 'b'], ['b', 'a']);
		expect(same.shared).toEqual(['a', 'b']);
		expect(same.onlyFirst).toEqual([]);
		expect(same.onlySecond).toEqual([]);
	});

	it('deduplicates repeated names in one list', () => {
		const result = compareLists(['a', 'a'], ['a']);
		expect(result.shared).toEqual(['a']);
		expect(result.onlyFirst).toEqual([]);
	});
});
