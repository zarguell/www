/**
 * Elden Ring Golden Rune planner.
 *
 * Greedy selection: spend the largest affordable stocked rune, falling back
 * to tier 1 even when it overshoots the remainder.
 */

/** Rune values for Golden Rune tiers 1-13. */
export const RUNE_VALUES = [200, 400, 800, 1200, 1600, 2000, 2500, 3000, 3800, 5000, 7500, 10000, 12500];

/**
 * Plan which Golden Runes to spend to cover `runesNeeded` given what the
 * player already holds. Returns one quantity per tier, or an empty array
 * when the stock cannot reach the target.
 *
 * NOTE: `availableRunes` is consumed (mutated) — pass a copy if you need it.
 */
export function calculateRunes(runesNeeded: number, runesHave: number, availableRunes: number[]): number[] {
	runesNeeded -= runesHave;

	const numGoldenRunes: number[] = RUNE_VALUES.map(() => 0);

	while (runesNeeded > 0) {
		let tier = 0;
		for (let i = RUNE_VALUES.length - 1; i > 0; i--) {
			if (runesNeeded >= RUNE_VALUES[i] && availableRunes[i] > 0) {
				tier = i;
				break;
			}
		}
		if (availableRunes[tier] <= 0) {
			// Not enough runes available to reach the target
			return [];
		}
		numGoldenRunes[tier]++;
		runesNeeded -= RUNE_VALUES[tier];
		availableRunes[tier]--;
	}

	return numGoldenRunes;
}
