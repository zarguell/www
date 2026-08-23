import { describe, it, expect } from 'vitest';
import { baseTotals, computeBatch, fmt, freezerTag, fromMl, toMl } from '../cocktail';

const OZ = 29.5735;

describe('unit conversion', () => {
	it('converts to ml', () => {
		expect(toMl(100, 'ml')).toBe(100);
		expect(toMl(1, 'l')).toBe(1000);
		expect(toMl(2, 'oz')).toBeCloseTo(2 * OZ, 4);
		expect(toMl(1, 'cup')).toBeCloseTo(236.588, 4);
		expect(toMl(5, 'unknown')).toBe(5); // passthrough
		expect(toMl('3.5', 'oz')).toBeCloseTo(3.5 * OZ, 4);
		expect(toMl('garbage', 'oz')).toBe(0);
		expect(toMl(NaN, 'ml')).toBe(0);
	});

	it('round-trips through ml', () => {
		for (const unit of ['ml', 'l', 'oz', 'cup']) {
			const v = 12.34;
			expect(fromMl(toMl(v, unit), unit)).toBeCloseTo(v, 9);
		}
	});
});

describe('fmt', () => {
	it('trims trailing zeros', () => {
		expect(fmt(2.0)).toBe('2');
		expect(fmt(1.5, 2)).toBe('1.5');
		expect(fmt(0.75, 2)).toBe('0.75');
		expect(fmt(1.1, 2)).toBe('1.1');
	});
	it('keeps significant digits and floors to the requested precision', () => {
		expect(fmt(2.345, 2)).toBe('2.35'); // toFixed rounds
		expect(fmt(10, 0)).toBe('10');
	});
	it('degrades non-finite input to "0"', () => {
		expect(fmt(NaN)).toBe('0');
		expect(fmt(Infinity)).toBe('0');
	});
});

describe('freezerTag', () => {
	it('buckets ABV into freezer-safety labels', () => {
		expect(freezerTag(0).cls).toBe('danger');
		expect(freezerTag(15).cls).toBe('danger');
		expect(freezerTag(16).cls).toBe('warn');
		expect(freezerTag(24).cls).toBe('warn');
		expect(freezerTag(30).cls).toBe('warn');
		expect(freezerTag(35).cls).toBe('ok');
		expect(freezerTag(40).cls).toBe('ok');
		expect(freezerTag(60).cls).toBe('ok');
		expect(freezerTag(NaN).cls).toBe('danger'); // Number(NaN)||0
	});
});

describe('baseTotals', () => {
	const gimlet = [
		{ emoji: '🍸', name: 'Gin', amount: 2, unit: 'oz', abv: 40 },
		{ emoji: '🍋', name: 'Lime juice', amount: 1, unit: 'oz', abv: 0 },
		{ emoji: '🍯', name: 'Syrup', amount: 0.75, unit: 'oz', abv: 0 }
	];

	it('sums volume and absolute ethanol', () => {
		const { baseTotal, ethanol } = baseTotals(gimlet);
		expect(baseTotal).toBeCloseTo(3.75 * OZ, 4);
		expect(ethanol).toBeCloseTo(2 * OZ * 0.4, 4);
	});

	it('returns zeros for an empty recipe', () => {
		expect(baseTotals([])).toEqual({ baseTotal: 0, ethanol: 0 });
	});
});

describe('computeBatch', () => {
	const martini = [
		{ emoji: '🍸', name: 'Gin', amount: 60, unit: 'ml', abv: 45 },
		{ emoji: '🍷', name: 'Dry vermouth', amount: 20, unit: 'ml', abv: 18 }
	];
	// base = 80 ml; ethanol = 27 + 3.6 = 30.6 ml

	it('returns null for an empty (zero-volume) recipe', () => {
		expect(computeBatch({ recipe: [], scaleMode: 'servings', dilutionPct: 0.2 })).toBeNull();
	});

	it('scales linearly by servings with dilution water added', () => {
		const b = computeBatch({ recipe: martini, scaleMode: 'servings', servings: 10, dilutionPct: 0.2 });
		expect(b).not.toBeNull();
		// 10 servings of 80 ml = 800 ml undiluted; +20% dilution = 960 ml final
		expect(b!.undilutedMl).toBeCloseTo(800, 6);
		expect(b!.waterMl).toBeCloseTo(160, 6);
		expect(b!.finalMl).toBeCloseTo(960, 6);
		// ethanol scales with the drink: 30.6 * 10 = 306 ml
		expect(b!.ethanolMl).toBeCloseTo(306, 6);
		// dilution lowers ABV: 306/960 = 31.875%
		expect(b!.abvPct).toBeCloseTo(31.875, 4);
		expect(b!.servings).toBe(10);
		expect(b!.finalTargetMl).toBeNull();
	});

	it('targets a final post-dilution volume (undiluted = target / (1+dilution))', () => {
		const b = computeBatch({
			recipe: martini,
			scaleMode: 'total',
			targetTotal: 750,
			targetUnit: 'ml',
			dilutionPct: 0.25
		});
		expect(b).not.toBeNull();
		// need 600 ml undiluted to land at 750 after 25% dilution
		expect(b!.finalTargetMl).toBeCloseTo(750, 6);
		expect(b!.undilutedMl).toBeCloseTo(600, 6);
		expect(b!.waterMl).toBeCloseTo(150, 6);
		expect(b!.finalMl).toBeCloseTo(750, 6);
		expect(b!.scale).toBeCloseTo(600 / 80, 6);
		expect(b!.servings).toBeNull();
	});

	it('accepts target volumes in other units', () => {
		const b = computeBatch({
			recipe: martini,
			scaleMode: 'total',
			targetTotal: 25.3605, // ~750 ml in fl oz
			targetUnit: 'oz',
			dilutionPct: 0
		});
		expect(b!.finalMl).toBeCloseTo(750, 0);
		expect(b!.waterMl).toBe(0);
	});

	it('zero dilution yields waterMl 0 and unchanged ABV', () => {
		const b = computeBatch({ recipe: martini, scaleMode: 'servings', servings: 1, dilutionPct: 0 });
		expect(b!.waterMl).toBe(0);
		expect(b!.abvPct).toBeCloseTo((30.6 / 80) * 100, 4); // 38.25
	});

	it('clamps servings to at least 1', () => {
		const b = computeBatch({ recipe: martini, scaleMode: 'servings', servings: 0, dilutionPct: 0 });
		expect(b!.servings).toBe(1);
		expect(b!.scale).toBe(1);
	});

	it('per-ingredient ml and ethanolMl scale together', () => {
		const b = computeBatch({ recipe: martini, scaleMode: 'servings', servings: 2, dilutionPct: 0 });
		expect(b!.scaled[0].ml).toBeCloseTo(120, 6);
		expect(b!.scaled[0].ethanolMl).toBeCloseTo(54, 6); // 120 * 0.45
		expect(b!.scaled[1].ml).toBeCloseTo(40, 6);
		expect(b!.scaled[1].ethanolMl).toBeCloseTo(7.2, 6); // 40 * 0.18
	});
});
