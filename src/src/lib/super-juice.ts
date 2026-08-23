/**
 * Super Juice ratio math (published fixed-constant formulas).
 *
 * Pure functions + constants shared by the super-juice page and vitest.
 */

/** Classic citrus: total water is fixed at this multiple of peel weight. */
export const PEEL_WATER_MULT = 16.66;

/** Kumquat works from whole-fruit weight instead of peel. */
export const kumquatPer100g = { citric: 25.0, water: 416.5 };
export const kumquatAscorbicFixedPer100g = 0.2;

export type JuiceType = 'lemon' | 'lime' | 'orange' | 'grapefruit' | 'kumquat';

/** Peel-based acid ratios (per gram peel). Grapefruit adds MSG. */
export const peelBased: Record<Exclude<JuiceType, 'kumquat'>, { citric: number; malic: number; msg: number }> = {
	lemon: { citric: 1.0, malic: 0.0, msg: 0.0 },
	lime: { citric: 0.66, malic: 0.33, msg: 0.0 },
	orange: { citric: 0.9, malic: 0.1, msg: 0.0 },
	grapefruit: { citric: 0.8, malic: 0.2, msg: 0.033 }
};

export interface SuperJuiceResult {
	type: JuiceType;
	peel_g: number;
	fruit_g: number;
	citric_g: number;
	malic_g: number;
	msg_g: number;
	ascorbic_g: number;
	water_ml: number;
}

/** Compute recipe parts from a base weight (peel grams, or fruit grams for kumquat). */
export function computeFromBase(type: JuiceType, base_g: number): SuperJuiceResult {
	let peel_g = 0,
		fruit_g = 0;
	let citric_g = 0,
		malic_g = 0,
		msg_g = 0,
		ascorbic_g = 0,
		water_ml = 0;

	if (type === 'kumquat') {
		fruit_g = base_g;
		const scale = fruit_g / 100.0;
		citric_g = kumquatPer100g.citric * scale;
		water_ml = kumquatPer100g.water * scale;
		ascorbic_g = kumquatAscorbicFixedPer100g * scale;
	} else {
		peel_g = base_g;
		const r = peelBased[type];
		citric_g = peel_g * r.citric;
		malic_g = peel_g * r.malic;
		msg_g = peel_g * r.msg;
		water_ml = peel_g * PEEL_WATER_MULT;
	}

	return { type, peel_g, fruit_g, citric_g, malic_g, msg_g, ascorbic_g, water_ml };
}

/** Inverse: base weight needed to hit a target final (water) weight. */
export function baseFromTargetFinalWeight(type: JuiceType, target_g: number): number {
	if (type === 'kumquat') {
		return target_g / (kumquatPer100g.water / 100.0);
	}
	return target_g / PEEL_WATER_MULT;
}
