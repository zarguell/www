/**
 * SplitCheck pure computation.
 *
 * DOM-free and framework-free so the page script and vitest share one
 * implementation. The page owns all rendering/state; only math lives here.
 */

export interface Expense {
	id: string;
	description: string;
	amount: number;
	payer: string;
	/** 'even' shares across `participants`; anything else uses `customSplits`. */
	splitType: string;
	/** Snapshot of who was in the split when the expense was created. */
	participants?: string[];
	/** Per-person amounts for custom splits. */
	customSplits?: Record<string, number>;
}

export interface SplitCheckState {
	people: string[];
	expenses: Expense[];
}

/** positive => owes the group, negative => is owed. */
export type Balances = Record<string, number>;

export interface Settlement {
	from: string;
	to: string;
	amount: number;
}

export function round2(n: number): number {
	return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function participantsOf(expense: Expense, people: string[]): string[] {
	// Expenses snapshot their participants at creation. Legacy data
	// (old links / imported JSON from before snapshots existed) has
	// none, so fall back to deriving them from the current people list.
	if (Array.isArray(expense.participants) && expense.participants.length) return expense.participants;
	return people;
}

export function computeBalances(state: SplitCheckState): Balances {
	// Balance everyone in the group plus anyone still on past expenses,
	// so removing a person keeps the historical books balanced.
	const balances: Balances = Object.fromEntries(state.people.map((p) => [p, 0]));

	for (const e of state.expenses) {
		if (!e.payer) continue;
		const participants = participantsOf(e, state.people);
		if (balances[e.payer] === undefined) balances[e.payer] = 0;
		for (const p of participants) {
			if (balances[p] === undefined) balances[p] = 0;
		}

		if (e.splitType === 'even') {
			const share = round2(e.amount / (participants.length || 1));
			for (const p of participants) balances[p] = round2(balances[p] + share);
			balances[e.payer] = round2(balances[e.payer] - e.amount);
		} else {
			const splits = e.customSplits || {};
			for (const p of participants) {
				const owed = round2(Number(splits[p] || 0));
				balances[p] = round2(balances[p] + owed);
			}
			balances[e.payer] = round2(balances[e.payer] - e.amount);
		}
	}
	return balances; // positive => owes, negative => is owed
}

export function computeSettlements(balances: Balances): Settlement[] {
	const debtors: Array<{ p: string; amt: number }> = [];
	const creditors: Array<{ p: string; amt: number }> = [];
	for (const [p, amt] of Object.entries(balances)) {
		if (amt > 0.009) debtors.push({ p, amt: round2(amt) });
		else if (amt < -0.009) creditors.push({ p, amt: round2(-amt) });
	}
	debtors.sort((a, b) => b.amt - a.amt);
	creditors.sort((a, b) => b.amt - a.amt);

	const tx: Settlement[] = [];
	let i = 0;
	let j = 0;
	while (i < debtors.length && j < creditors.length) {
		const pay = debtors[i];
		const recv = creditors[j];
		const amt = round2(Math.min(pay.amt, recv.amt));
		if (amt > 0) tx.push({ from: pay.p, to: recv.p, amount: amt });

		pay.amt = round2(pay.amt - amt);
		recv.amt = round2(recv.amt - amt);

		if (pay.amt <= 0.009) i++;
		if (recv.amt <= 0.009) j++;
	}
	return tx;
}
