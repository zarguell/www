import { describe, it, expect } from 'vitest';
import {
	round2,
	participantsOf,
	computeBalances,
	computeSettlements,
	type Expense,
	type SplitCheckState
} from '../splitcheck';

function expense(partial: Partial<Expense> & { payer: string; amount: number }): Expense {
	return {
		id: partial.id ?? crypto.randomUUID(),
		description: partial.description ?? 'test',
		splitType: partial.splitType ?? 'even',
		...partial
	};
}

function state(people: string[], expenses: Expense[]): SplitCheckState {
	return { people, expenses };
}

describe('round2', () => {
	it('rounds half up (away from zero with epsilon)', () => {
		expect(round2(10.005)).toBe(10.01);
		expect(round2(-10.005)).toBe(-10.01);
	});

	it('corrects float dust', () => {
		expect(round2(0.1 + 0.2)).toBe(0.3);
		expect(round2(1.005 * 100)).toBe(100.5);
	});

	it('passes through clean values', () => {
		expect(round2(42)).toBe(42);
		expect(round2(12.34)).toBe(12.34);
	});

	it('coerces numeric strings', () => {
		expect(round2('7.555' as unknown as number)).toBe(7.56);
	});
});

describe('participantsOf', () => {
	it('prefers the expense snapshot', () => {
		const e = expense({ payer: 'a', amount: 30, participants: ['a', 'b'] });
		expect(participantsOf(e, ['a', 'b', 'c'])).toEqual(['a', 'b']);
	});

	it('falls back to current people for legacy expenses', () => {
		const e = expense({ payer: 'a', amount: 30 }); // no snapshot
		expect(participantsOf(e, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
	});

	it('falls back when the snapshot is empty', () => {
		const e = expense({ payer: 'a', amount: 30, participants: [] });
		expect(participantsOf(e, ['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('computeBalances', () => {
	it('splits an even expense: payer is owed the rest', () => {
		const s = state(
			['a', 'b', 'c'],
			[expense({ payer: 'a', amount: 90, participants: ['a', 'b', 'c'] })]
		);
		const b = computeBalances(s);
		expect(b.a).toBeCloseTo(-60, 2); // paid 90, owes 30
		expect(b.b).toBeCloseTo(30, 2);
		expect(b.c).toBeCloseTo(30, 2);
	});

	it('handles custom splits', () => {
		const s = state(
			['a', 'b'],
			[
				expense({
					payer: 'b',
					amount: 100,
					splitType: 'custom',
					participants: ['a', 'b'],
					customSplits: { a: 75, b: 25 }
				})
			]
		);
		const bal = computeBalances(s);
		expect(bal.a).toBe(75);
		expect(bal.b).toBeCloseTo(-75, 2);
	});

	it('keeps history intact when a person is removed later', () => {
		// a+b split 50 while both present; then b leaves the group list.
		const s = state(
			['a'],
			[expense({ payer: 'a', amount: 50, participants: ['a', 'b'] })]
		);
		const bal = computeBalances(s);
		expect(bal.a).toBe(-25);
		expect(bal.b).toBe(25); // b still owed from the past expense
	});

	it('adds removed payers back into the ledger', () => {
		const s = state(
			['a'],
			[expense({ payer: 'gone', amount: 40, participants: ['a', 'gone'] })]
		);
		const bal = computeBalances(s);
		expect(bal.gone).toBe(-20);
		expect(bal.a).toBe(20);
	});

	it('does not rewrite old splits when the group grows', () => {
		// old expense split by 2; a third person joins the people list
		const s = state(
			['a', 'b', 'c'],
			[expense({ payer: 'a', amount: 60, participants: ['a', 'b'] })]
		);
		const bal = computeBalances(s);
		expect(bal.c).toBe(0);
		expect(bal.a).toBe(-30);
		expect(bal.b).toBe(30);
	});

	it('survives empty participant lists without dividing by zero', () => {
		// Empty snapshot falls back to people; with people empty too, share math
		// is guarded (len || 1) and nobody but the payer is touched.
		const s = state([], [expense({ payer: 'a', amount: 10, participants: [] })]);
		const bal = computeBalances(s);
		expect(bal.a).toBe(-10);
	});

	it('empty snapshot falls back to current people', () => {
		const s = state(['a', 'b'], [expense({ payer: 'a', amount: 10, participants: [] })]);
		const bal = computeBalances(s);
		expect(bal.a).toBe(-5);
		expect(bal.b).toBe(5);
	});

	it('skips expenses with no payer', () => {
		const s = state(['a', 'b'], [expense({ payer: '', amount: 50, participants: ['a', 'b'] })]);
		const bal = computeBalances(s);
		expect(bal).toEqual({ a: 0, b: 0 });
	});

	it('sums multiple expenses across payers', () => {
		const s = state(
			['a', 'b'],
			[
				expense({ payer: 'a', amount: 40, participants: ['a', 'b'] }),
				expense({ payer: 'b', amount: 60, participants: ['a', 'b'] })
			]
		);
		const bal = computeBalances(s);
		expect(bal.a).toBeCloseTo(10, 2); // owes 20+30, paid 40 => -10? no: paid 40, owes 50 => +10
		expect(bal.b).toBe(-10);
	});
});

describe('computeSettlements', () => {
	it('settles a simple two-person debt', () => {
		const tx = computeSettlements({ a: 20, b: -20 });
		expect(tx).toEqual([{ from: 'a', to: 'b', amount: 20 }]);
	});

	it('chains through the largest debtor/creditor greedily', () => {
		const tx = computeSettlements({ a: 50, b: -30, c: -20 });
		expect(tx).toEqual([
			{ from: 'a', to: 'b', amount: 30 },
			{ from: 'a', to: 'c', amount: 20 }
		]);
	});

	it('ignores sub-cent dust so nobody settles 0.00', () => {
		const tx = computeSettlements({ a: 0.004, b: -0.004, c: 5, d: -5 });
		expect(tx).toEqual([{ from: 'c', to: 'd', amount: 5 }]);
	});

	it('returns nothing for a settled group', () => {
		expect(computeSettlements({ a: 0, b: 0 })).toEqual([]);
	});

	it('settles the full ledger end-to-end', () => {
		const s = state(
			['a', 'b', 'c'],
			[
				expense({ payer: 'a', amount: 90, participants: ['a', 'b', 'c'] }),
				expense({ payer: 'c', amount: 30, participants: ['b', 'c'] })
			]
		);
		const bal = computeBalances(s);
		const tx = computeSettlements(bal);
		// b owes 30+15=45, a is owed 60, c is owed 15
		const paid = Object.fromEntries(Object.keys(bal).map((p) => [p, 0]));
		for (const t of tx) {
			paid[t.from] = round2(paid[t.from] + t.amount);
			paid[t.to] = round2(paid[t.to] - t.amount);
		}
		for (const [p, amt] of Object.entries(bal)) {
			expect(paid[p]).toBeCloseTo(amt, 2);
		}
	});
});
