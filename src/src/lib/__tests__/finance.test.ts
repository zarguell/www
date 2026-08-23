import { describe, it, expect } from 'vitest';
import { calcTspMatchPerPay, calc401kMatchPerPay } from '../finance';

describe('calcTspMatchPerPay', () => {
	// Standard FERS-style tiers: 1% at 1:1, next 4% at 0.5:1
	const pay = 2000;

	it('zero contribution gets zero match', () => {
		expect(calcTspMatchPerPay(pay, 0, 1, 4)).toBe(0);
	});

	it('below tier1: dollar-for-dollar', () => {
		// 0.5% of 2000 at 1:1 => $10
		expect(calcTspMatchPerPay(pay, 0.5, 1, 4)).toBe(10);
	});

	it('exactly tier1: match capped at tier1%', () => {
		expect(calcTspMatchPerPay(pay, 1, 1, 4)).toBe(20);
	});

	it('in tier2: 1:1 on tier1 + 50% on the rest', () => {
		// 3% => 1% full (20) + 2% at half (20) => $40
		expect(calcTspMatchPerPay(pay, 3, 1, 4)).toBe(40);
	});

	it('full match at tier1+tier2 (5% for FERS 1+4)', () => {
		// 1% full (20) + 4% half (40) => $60
		expect(calcTspMatchPerPay(pay, 5, 1, 4)).toBe(60);
	});

	it('contributing above both tiers caps the match', () => {
		expect(calcTspMatchPerPay(pay, 15, 1, 4)).toBe(60);
	});

	it('never exceeds 1:1 on tier1 + 0.5:1 on tier2 in total', () => {
		const maxPossible = pay * ((1 + 4 * 0.5) / 100);
		expect(calcTspMatchPerPay(pay, 100, 1, 4)).toBe(maxPossible);
	});

	it('handles zero-width tiers', () => {
		expect(calcTspMatchPerPay(pay, 5, 0, 0)).toBe(0);
		expect(calcTspMatchPerPay(pay, 5, 5, 0)).toBe(100); // only 1:1 tier
	});
});

describe('calc401kMatchPerPay', () => {
	const pay = 2500;

	it('matches dollar-for-dollar up to the tier', () => {
		expect(calc401kMatchPerPay(pay, 3, 5)).toBe(75);
		expect(calc401kMatchPerPay(pay, 5, 5)).toBe(125);
	});

	it('caps at the tier for large contributions', () => {
		expect(calc401kMatchPerPay(pay, 50, 5)).toBe(125);
	});

	it('zero contribution or zero tier yields zero', () => {
		expect(calc401kMatchPerPay(pay, 0, 5)).toBe(0);
		expect(calc401kMatchPerPay(pay, 5, 0)).toBe(0);
	});
});
