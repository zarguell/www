/**
 * 401(k)/TSP employer match math.
 *
 * Pure functions shared by the 401k calculator page and vitest.
 */

/**
 * Tiered TSP match (FERS-style): dollar-for-dollar on the first `tier1`%
 * of pay, then 50 cents per dollar on the next `tier2`% above tier1.
 */
export function calcTspMatchPerPay(
	payPerPeriod: number,
	employeePct: number,
	tier1: number,
	tier2: number
): number {
	let match = 0;

	// First tier: 1:1 up to tier1%
	const pctTier1Used = Math.min(employeePct, tier1);
	match += payPerPeriod * (pctTier1Used / 100);

	// Second tier: 50% up to tier2% above tier1
	if (employeePct > tier1) {
		const pctAboveTier1 = employeePct - tier1;
		const pctTier2Used = Math.min(pctAboveTier1, tier2);
		match += payPerPeriod * (pctTier2Used / 100) * 0.5;
	}

	return match;
}

/** Simple 1:1 match up to `matchTier`% of pay. */
export function calc401kMatchPerPay(
	payPerPeriod: number,
	employeePct: number,
	matchTier: number
): number {
	const pctUsed = Math.min(employeePct, matchTier);
	return payPerPeriod * (pctUsed / 100);
}
