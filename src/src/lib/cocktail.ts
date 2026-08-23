/**
 * Cocktail recipe math — pure, no DOM.
 * Consumed by `scripts/cocktail-recipe-app.ts`.
 */

export interface Ingredient {
	emoji: string;
	name: string;
	amount: number;
	unit: string;
	abv: number;
}

export interface PresetIngredient {
	emoji: string;
	name: string;
	abv: number;
}

export type ScaleMode = 'servings' | 'total';
export type PreparationMethod = 'none' | 'stirred' | 'shaken';

// 1 US fl oz = 29.5735 ml; 1 US cup = 236.588 ml
export function toMl(value: number | string, unit: string): number {
	const v = Number(value) || 0;
	if (unit === 'ml') return v;
	if (unit === 'l') return v * 1000;
	if (unit === 'oz') return v * 29.5735;
	if (unit === 'cup') return v * 236.588;
	return v;
}

export function fromMl(ml: number, unit: string): number {
	if (unit === 'ml') return ml;
	if (unit === 'l') return ml / 1000;
	if (unit === 'oz') return ml / 29.5735;
	if (unit === 'cup') return ml / 236.588;
	return ml;
}

/** Trim trailing zeros: 2.0 -> "2", 1.50 -> "1.5", 0.75 -> "0.75". */
export function fmt(n: number, digits = 1): string {
	const x = Number(n);
	if (!isFinite(x)) return '0';
	return x
		.toFixed(digits)
		.replace(/\.0+$/, '')
		.replace(/(\.\d*[1-9])0+$/, '$1');
}

export const PRESETS: PresetIngredient[] = [
	{ emoji: '🍸', name: 'Gin', abv: 40 },
	{ emoji: '🍸', name: 'Vodka', abv: 40 },
	{ emoji: '🥃', name: 'Bourbon', abv: 45 },
	{ emoji: '🥃', name: 'Rye whiskey', abv: 45 },
	{ emoji: '🥃', name: 'Scotch', abv: 43 },
	{ emoji: '🍹', name: 'White rum', abv: 40 },
	{ emoji: '🍹', name: 'Aged rum', abv: 40 },
	{ emoji: '🌵', name: 'Tequila blanco', abv: 40 },
	{ emoji: '🌵', name: 'Mezcal', abv: 45 },
	{ emoji: '🍊', name: 'Triple sec', abv: 30 },
	{ emoji: '🍊', name: 'Orange curaçao', abv: 40 },
	{ emoji: '🍷', name: 'Sweet vermouth', abv: 16 },
	{ emoji: '🍷', name: 'Dry vermouth', abv: 18 },
	{ emoji: '🍒', name: 'Maraschino liqueur', abv: 32 },
	{ emoji: '🥥', name: 'Coconut cream', abv: 0 },
	{ emoji: '🍍', name: 'Pineapple juice', abv: 0 },
	{ emoji: '🍋', name: 'Lemon juice', abv: 0 },
	{ emoji: '🍋', name: 'Lime juice', abv: 0 },
	{ emoji: '🍯', name: 'Simple syrup', abv: 0 },
	{ emoji: '🧊', name: 'Soda water', abv: 0 },
	{ emoji: '🫚', name: 'Ginger beer', abv: 0 },
	{ emoji: '☕', name: 'Coffee', abv: 0 },
	{ emoji: '🧂', name: 'Saline (drops)', abv: 0 },
	{ emoji: '🌿', name: 'Bitters', abv: 44 }
];

export interface FreezerTag {
	label: string;
	cls: 'danger' | 'warn' | 'ok';
}

export function freezerTag(abvPct: number): FreezerTag {
	const a = Number(abvPct || 0);
	if (a <= 15) return { label: 'Likely freezes (≤15% ABV)', cls: 'danger' };
	if (a < 25) return { label: 'May slush/freeze (~20% ABV)', cls: 'warn' };
	if (a < 35) return { label: 'Borderline (~30% ABV)', cls: 'warn' };
	if (a < 50) return { label: 'Likely liquid (~40% ABV)', cls: 'ok' };
	return { label: 'Very likely liquid (high ABV)', cls: 'ok' };
}

export interface BaseTotals {
	/** Total volume of all ingredients, in ml. */
	baseTotal: number;
	/** Absolute ethanol across all ingredients, in ml. */
	ethanol: number;
}

export function baseTotals(recipe: readonly Ingredient[]): BaseTotals {
	let baseTotal = 0;
	let ethanol = 0;
	for (const i of recipe) {
		const ml = toMl(i.amount, i.unit);
		baseTotal += ml;
		ethanol += ml * ((Number(i.abv) || 0) / 100);
	}
	return { baseTotal, ethanol };
}

export interface ScaledIngredient extends Ingredient {
	ml: number;
	ethanolMl: number;
}

export interface BatchResult {
	scaled: ScaledIngredient[];
	undilutedMl: number;
	waterMl: number;
	finalMl: number;
	ethanolMl: number;
	abvPct: number;
	dilutionPct: number;
	finalTargetMl: number | null;
	servings: number | null;
	scale: number;
}

export interface BatchInput {
	recipe: readonly Ingredient[];
	scaleMode: ScaleMode;
	/** Number of servings (scaleMode 'servings'). */
	servings?: number | string;
	/** Target final volume, raw value (scaleMode 'total'). */
	targetTotal?: number | string;
	/** Unit of targetTotal ('ml' | 'oz' | 'cup' | 'l'). */
	targetUnit?: string;
	/** Dilution fraction, e.g. 0.2 for stirred. */
	dilutionPct: number;
}

/** Scale a recipe by servings or to a target final (post-dilution) volume. */
export function computeBatch(input: BatchInput): BatchResult | null {
	const { recipe, scaleMode, dilutionPct } = input;
	const { baseTotal } = baseTotals(recipe);
	if (baseTotal <= 0) return null;

	let scale = 1;
	let finalTargetMl: number | null = null;
	let servings: number | null = null;

	if (scaleMode === 'servings') {
		servings = Math.max(1, Number(input.servings ?? 1) || 1);
		scale = servings;
	} else {
		const targetFinalMl = toMl(input.targetTotal ?? 0, input.targetUnit ?? 'ml');
		finalTargetMl = targetFinalMl;
		const targetUndiluted = targetFinalMl / (1 + dilutionPct);
		scale = targetUndiluted / baseTotal;
	}

	const scaled: ScaledIngredient[] = recipe.map((i) => {
		const ml = toMl(i.amount, i.unit) * scale;
		const ethanolMl = ml * ((Number(i.abv) || 0) / 100);
		return { ...i, ml, ethanolMl };
	});

	const undilutedMl = scaled.reduce((s, i) => s + i.ml, 0);
	const waterMl = undilutedMl * dilutionPct;
	const finalMl = undilutedMl + waterMl;
	const ethanolMl = scaled.reduce((s, i) => s + i.ethanolMl, 0);
	const abvPct = finalMl > 0 ? (100 * ethanolMl) / finalMl : 0;

	return { scaled, undilutedMl, waterMl, finalMl, ethanolMl, abvPct, dilutionPct, finalTargetMl, servings, scale };
}
