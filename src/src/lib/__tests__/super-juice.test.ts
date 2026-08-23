import { describe, it, expect } from 'vitest';
import {
	PEEL_WATER_MULT,
	kumquatPer100g,
	kumquatAscorbicFixedPer100g,
	peelBased,
	computeFromBase,
	baseFromTargetFinalWeight
} from '../super-juice';

describe('computeFromBase — classic citrus', () => {
	it('lemon: 1:1 citric, no malic/msg, water at PEEL_WATER_MULT', () => {
		const r = computeFromBase('lemon', 100);
		expect(r.citric_g).toBe(100);
		expect(r.malic_g).toBe(0);
		expect(r.msg_g).toBe(0);
		expect(r.ascorbic_g).toBe(0); // ascorbic only for kumquat
		expect(r.water_ml).toBeCloseTo(1666, 1);
		expect(r.peel_g).toBe(100);
		expect(r.fruit_g).toBe(0);
	});

	it('lime: 2:1 citric:malic blend', () => {
		const r = computeFromBase('lime', 200);
		expect(r.citric_g).toBeCloseTo(132, 6); // 0.66 * 200
		expect(r.malic_g).toBeCloseTo(66, 6); // 0.33 * 200
	});

	it('grapefruit adds MSG', () => {
		const r = computeFromBase('grapefruit', 300);
		expect(r.citric_g).toBe(240); // 0.80
		expect(r.malic_g).toBe(60); // 0.20
		expect(r.msg_g).toBeCloseTo(9.9, 6); // 0.033
	});

	it('orange blend', () => {
		const r = computeFromBase('orange', 150);
		expect(r.citric_g).toBe(135); // 0.90
		expect(r.malic_g).toBe(15); // 0.10
	});

	it('scales linearly with base weight', () => {
		const a = computeFromBase('lemon', 50);
		const b = computeFromBase('lemon', 250);
		expect(b.citric_g).toBe(5 * a.citric_g);
		expect(b.water_ml).toBeCloseTo(5 * a.water_ml, 4);
	});
});

describe('computeFromBase — kumquat', () => {
	it('works from fruit weight with per-100g constants', () => {
		const r = computeFromBase('kumquat', 100);
		expect(r.fruit_g).toBe(100);
		expect(r.citric_g).toBe(25); // 25.0 per 100g
		expect(r.water_ml).toBeCloseTo(416.5, 6);
		expect(r.ascorbic_g).toBeCloseTo(0.2, 6);
		expect(r.peel_g).toBe(0);
		expect(r.malic_g).toBe(0);
		expect(r.msg_g).toBe(0);
	});

	it('scales with fruit weight', () => {
		const r = computeFromBase('kumquat', 250);
		expect(r.citric_g).toBeCloseTo(62.5, 6);
		expect(r.water_ml).toBeCloseTo(1041.25, 4);
	});
});

describe('baseFromTargetFinalWeight', () => {
	it('classic citrus: inverts the PEEL_WATER_MULT relation', () => {
		const base = 120;
		const target = computeFromBase('lemon', base).water_ml;
		expect(baseFromTargetFinalWeight('lemon', target)).toBeCloseTo(base, 6);
	});

	it('kumquat: inverts the per-100g water relation', () => {
		const base = 80;
		const target = computeFromBase('kumquat', base).water_ml;
		expect(baseFromTargetFinalWeight('kumquat', target)).toBeCloseTo(base, 6);
	});

	it('round-trips every type through both directions', () => {
		for (const type of ['lemon', 'lime', 'orange', 'grapefruit', 'kumquat'] as const) {
			const b = computeFromBase(type, 90);
			const back = baseFromTargetFinalWeight(type, b.water_ml);
			expect(back, type).toBeCloseTo(90, 6);
		}
	});
});

describe('constants', () => {
	it('match published formula values', () => {
		expect(PEEL_WATER_MULT).toBe(16.66);
		expect(kumquatPer100g).toEqual({ citric: 25.0, water: 416.5 });
		expect(kumquatAscorbicFixedPer100g).toBe(0.2);
		expect(peelBased.grapefruit.msg).toBeCloseTo(0.033, 6);
	});
});
