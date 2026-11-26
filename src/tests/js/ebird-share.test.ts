import { describe, expect, it } from 'vitest';
import {
	ShareTooLarge,
	codeTable,
	compareLists,
	decodeCompare,
	decodeShare,
	encodeCompare,
	encodeShare,
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
		// A budget that fits the species-only body but not species plus dates.
		const payload = {
			birds: [
				{ sciName: 'Branta canadensis', ym: 1400 },
				{ sciName: 'Cardinalis cardinalis', ym: 1500 }
			]
		};
		const spacious = await encodeShare(payload, index, 100_000);
		expect(spacious.level).toBe('dates');

		// A budget that the date-bearing token exceeds but the species-only
		// token fits, so the encoder has to drop dates rather than fail.
		const speciesOnly = await encodeShare({ birds: payload.birds }, index, 100_000);
		const noDatesLength = (await encodeShare({ birds: payload.birds.map((b) => ({ sciName: b.sciName })) }, index)).token.length;
		void speciesOnly;
		const degraded = await encodeShare(payload, index, noDatesLength);
		expect(degraded.level).toBe('species');
		expect(degraded.token.length).toBeLessThanOrEqual(noDatesLength);
		expect(await decodeShare(degraded.token, codes)).toMatchObject({
			birds: [{ sciName: 'Branta canadensis' }, { sciName: 'Cardinalis cardinalis' }]
		});
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
