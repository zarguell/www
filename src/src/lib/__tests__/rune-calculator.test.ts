import { describe, it, expect } from 'vitest';
import { RUNE_VALUES, calculateRunes } from '../rune-calculator';

const fullStock = () => RUNE_VALUES.map(() => 99);

describe('calculateRunes', () => {
	it('no runes needed when holdings cover the target', () => {
		const plan = calculateRunes(1000, 1500, fullStock());
		expect(plan).toEqual(RUNE_VALUES.map(() => 0));
	});

	it('picks the largest affordable rune greedily', () => {
		const plan = calculateRunes(12500, 0, fullStock());
		expect(plan[12]).toBe(1); // one tier-13
		expect(plan.slice(0, 12).reduce((a, b) => a + b, 0)).toBe(0);
	});

	it('combines tiers for exact targets', () => {
		// 12500 + 200 = 12700
		const plan = calculateRunes(12700, 0, fullStock());
		expect(plan[12]).toBe(1);
		expect(plan[0]).toBe(1);
	});

	it('falls back to tier 1 even when it overshoots', () => {
		// remainder 201: no tier-2+ affordable (400 > 201), so tier 1 overshoots by 1
		const plan = calculateRunes(201, 0, fullStock());
		expect(plan[0]).toBe(2); // two 200s = 400 >= 201
	});

	it('skips unstocked tiers', () => {
		const stock = RUNE_VALUES.map(() => 0);
		stock[0] = 10; // only tier 1 available
		const plan = calculateRunes(600, 0, stock);
		expect(plan[0]).toBe(3);
	});

	it('returns empty array when stock cannot reach the target', () => {
		const stock = RUNE_VALUES.map(() => 1);
		stock[0] = 0; // remove the overshoot fallback
		const plan = calculateRunes(RUNE_VALUES[0] + 1, 0, stock); // 201 vs 200 max
		expect(plan).toEqual([]);
	});

	it('consumes stock correctly across repeated greedy picks', () => {
		const stock = RUNE_VALUES.map(() => 2);
		const plan = calculateRunes(25000, 0, stock);
		expect(plan[12]).toBe(2);
		const spent = plan.reduce((sum, qty, i) => sum + qty * RUNE_VALUES[i], 0);
		expect(spent).toBeGreaterThanOrEqual(25000);
	});

	it('subtracts existing holdings first', () => {
		const plan = calculateRunes(1400, 1200, fullStock());
		expect(plan[0]).toBe(1); // only 200 more needed
	});

	it('plan always covers the target when non-empty', () => {
		for (let target = 1; target <= 3000; target += 137) {
			const plan = calculateRunes(target, 0, fullStock());
			const spent = plan.reduce((sum, qty, i) => sum + qty * RUNE_VALUES[i], 0);
			expect(spent, `target ${target}`).toBeGreaterThanOrEqual(target);
		}
	});
});
