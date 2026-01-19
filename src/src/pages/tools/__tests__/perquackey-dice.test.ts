import { describe, it, expect } from 'vitest';
import { rollDice, toggleDiceSelection, clearDiceSelections, getSelectedWord, canFormWord } from '../../../data/perquackey-dice';
import type { RolledDie } from '../../../data/perquackey-dice';

describe('Perquackey Dice - Roll Function', () => {
	describe('Happy Path - Basic Rolling', () => {
		it('rolls 10 black dice when red dice not included', () => {
			const dice = rollDice('classic', false);
			expect(dice).toHaveLength(10);
			expect(dice.every(d => d.color === 'black')).toBe(true);
		});

		it('rolls 13 dice when red dice included', () => {
			const dice = rollDice('classic', true);
			expect(dice).toHaveLength(13);
			expect(dice.filter(d => d.color === 'black')).toHaveLength(10);
			expect(dice.filter(d => d.color === 'red')).toHaveLength(3);
		});

		it('rolls dice with classic set', () => {
			const dice = rollDice('classic', true);
			const blackDice = dice.filter(d => d.color === 'black');
			const redDice = dice.filter(d => d.color === 'red');

			expect(blackDice).toHaveLength(10);
			expect(redDice).toHaveLength(3);
		});

		it('rolls dice with modern set', () => {
			const dice = rollDice('modern', true);
			const blackDice = dice.filter(d => d.color === 'black');
			const redDice = dice.filter(d => d.color === 'red');

			expect(blackDice).toHaveLength(10);
			expect(redDice).toHaveLength(3);
		});
	});

	describe('Edge Cases - Dice State', () => {
		it('initially all dice are unselected', () => {
			const dice = rollDice('classic', false);
			expect(dice.every(d => d.selected === false)).toBe(true);
		});

		it('each die has a unique index', () => {
			const dice = rollDice('classic', false);
			const indices = dice.map(d => d.index);
			const uniqueIndices = [...new Set(indices)];
			expect(indices.length).toBe(uniqueIndices.length);
		});

		it('all dice have single letter', () => {
			const dice = rollDice('classic', false);
			expect(dice.every(d => d.letter.length === 1)).toBe(true);
		});
	});

	describe('Edge Cases - Invalid Input', () => {
		it('throws error for invalid dice set', () => {
			expect(() => rollDice('invalid', false)).toThrow('Invalid dice set: invalid');
		});
	});
});

describe('Perquackey Dice - Selection Functions', () => {
	let mockDice: RolledDie[];

	beforeEach(() => {
		mockDice = [
			{ letter: 'A', color: 'black', selected: false, index: 0 },
			{ letter: 'B', color: 'black', selected: false, index: 1 },
			{ letter: 'C', color: 'black', selected: false, index: 2 }
		];
	});

	describe('Happy Path - Toggle Selection', () => {
		it('toggles selection from false to true', () => {
			const result = toggleDiceSelection(mockDice, 0);
			expect(result[0].selected).toBe(true);
		});

		it('toggles selection from true to false', () => {
			mockDice[0].selected = true;
			const result = toggleDiceSelection(mockDice, 0);
			expect(result[0].selected).toBe(false);
		});

		it('does not affect other dice', () => {
			mockDice[0].selected = false;
			const result = toggleDiceSelection(mockDice, 0);
			expect(result[1].selected).toBe(false);
			expect(result[2].selected).toBe(false);
		});
	});

	describe('Happy Path - Clear Selections', () => {
		it('clears all selections', () => {
			mockDice[0].selected = true;
			mockDice[1].selected = true;
			mockDice[2].selected = true;

			const result = clearDiceSelections(mockDice);
			expect(result.every(d => d.selected === false)).toBe(true);
		});

		it('handles already cleared dice', () => {
			const result = clearDiceSelections(mockDice);
			expect(result.every(d => d.selected === false)).toBe(true);
		});
	});
});

describe('Perquackey Dice - Word Functions', () => {
	let mockDice: RolledDie[];

	beforeEach(() => {
		mockDice = [
			{ letter: 'C', color: 'black', selected: true, index: 0 },
			{ letter: 'A', color: 'black', selected: true, index: 1 },
			{ letter: 'T', color: 'black', selected: false, index: 2 },
			{ letter: 'S', color: 'black', selected: false, index: 3 }
		];
	});

	describe('Happy Path - Get Selected Word', () => {
		it('returns word from selected dice', () => {
			const word = getSelectedWord(mockDice);
			expect(word).toBe('CA');
		});

		it('returns empty string when no dice selected', () => {
			const unselectedDice = mockDice.map(d => ({ ...d, selected: false }));
			const word = getSelectedWord(unselectedDice);
			expect(word).toBe('');
		});

		it('builds word in selection order', () => {
			mockDice[0].selected = false;
			mockDice[2].selected = true;
			mockDice[3].selected = true;
			const word = getSelectedWord(mockDice);
			expect(word).toBe('ATS');
		});
	});

	describe('Happy Path - Can Form Word', () => {
		it('returns true for word that can be formed', () => {
			const result = canFormWord('CAT', mockDice);
			expect(result).toBe(true);
		});

		it('returns false for word with letters not available', () => {
			const result = canFormWord('DOG', mockDice);
			expect(result).toBe(false);
		});

		it('returns false for word requiring duplicate letters not available', () => {
			const result = canFormWord('CATASTROPHE', mockDice);
			expect(result).toBe(false);
		});

		it('is case insensitive', () => {
			const result = canFormWord('cat', mockDice);
			expect(result).toBe(true);
		});
	});

	describe('Edge Cases - Word Formation', () => {
		it('handles exact letter count match', () => {
			const result = canFormWord('CATS', mockDice);
			expect(result).toBe(true);
		});

		it('handles letter reuse limitation', () => {
			const result = canFormWord('AAAA', mockDice);
			expect(result).toBe(false);
		});

		it('handles empty word', () => {
			const result = canFormWord('', mockDice);
			expect(result).toBe(true);
		});

		it('handles dice with multiple same letters', () => {
			const multiDice = [
				{ letter: 'A', color: 'black', selected: false, index: 0 },
				{ letter: 'A', color: 'black', selected: false, index: 1 },
				{ letter: 'A', color: 'black', selected: false, index: 2 }
			];
			const result = canFormWord('AAA', multiDice);
			expect(result).toBe(true);
		});
	});
});
