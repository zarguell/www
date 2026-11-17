/**
 * Perquackey Dice Configuration
 * Defines the letter distribution for classic and modern (post-2004) dice sets
 */

export interface Die {
	letters: string[];
	color: 'black' | 'red';
}

export interface DiceSet {
	name: string;
	blackDice: Die[];
	redDice: Die[];
}

export interface RolledDie {
	letter: string;
	color: 'black' | 'red';
	selected: boolean;
	index: number;
}

export const DICE_CONFIGS: Record<string, DiceSet> = {
	classic: {
		name: 'Classic (Pre-2004)',
		blackDice: [
			{ letters: ['A', 'A', 'A', 'E', 'E', 'E'], color: 'black' },
			{ letters: ['A', 'A', 'A', 'E', 'E', 'E'], color: 'black' },
			{ letters: ['B', 'H', 'I', 'K', 'R', 'T'], color: 'black' },
			{ letters: ['F', 'H', 'I', 'R', 'S', 'U'], color: 'black' },
			{ letters: ['G', 'I', 'M', 'R', 'S', 'U'], color: 'black' },
			{ letters: ['E', 'J', 'Q', 'V', 'X', 'Z'], color: 'black' },
			{ letters: ['F', 'I', 'N', 'P', 'T', 'U'], color: 'black' },
			{ letters: ['C', 'M', 'O', 'O', 'P', 'W'], color: 'black' },
			{ letters: ['D', 'L', 'N', 'O', 'R', 'T'], color: 'black' },
			{ letters: ['B', 'L', 'O', 'O', 'W', 'Y'], color: 'black' }
		],
		redDice: [
			{ letters: ['Q', 'S', 'S', 'V', 'W', 'Y'], color: 'red' },
			{ letters: ['B', 'F', 'H', 'L', 'N', 'P'], color: 'red' },
			{ letters: ['C', 'D', 'G', 'J', 'K', 'M'], color: 'red' }
		]
	},
	modern: {
		name: 'Modern (2004+)',
		blackDice: [
			{ letters: ['A', 'A', 'A', 'E', 'E', 'E'], color: 'black' },
			{ letters: ['A', 'A', 'A', 'E', 'E', 'E'], color: 'black' },
			{ letters: ['B', 'H', 'I', 'K', 'R', 'T'], color: 'black' },
			{ letters: ['F', 'H', 'I', 'R', 'S', 'U'], color: 'black' },
			{ letters: ['G', 'I', 'M', 'R', 'S', 'U'], color: 'black' },
			{ letters: ['E', 'J', 'Q', 'V', 'X', 'Z'], color: 'black' },
			{ letters: ['F', 'I', 'N', 'P', 'T', 'U'], color: 'black' },
			{ letters: ['C', 'M', 'O', 'O', 'P', 'W'], color: 'black' },
			{ letters: ['D', 'L', 'N', 'O', 'R', 'T'], color: 'black' },
			{ letters: ['B', 'L', 'O', 'O', 'W', 'Y'], color: 'black' }
		],
		redDice: [
			{ letters: ['B', 'F', 'P', 'Q', 'S', 'Y'], color: 'red' },
			{ letters: ['C', 'D', 'G', 'J', 'K', 'M'], color: 'red' },
			{ letters: ['H', 'L', 'N', 'S', 'V', 'W'], color: 'red' }
		]
	}
};

/**
 * Roll all dice for a given dice set
 * @param diceSetKey - Key of dice set ('classic' or 'modern')
 * @param includeRedDice - Whether to include red dice (default: false)
 * @returns Array of rolled dice with randomly selected letters
 */
export function rollDice(diceSetKey: string, includeRedDice: boolean = false): RolledDie[] {
	const config = DICE_CONFIGS[diceSetKey];
	if (!config) {
		throw new Error(`Invalid dice set: ${diceSetKey}`);
	}

	const rolled: RolledDie[] = [];
	let index = 0;

	// Roll all black dice
	for (const die of config.blackDice) {
		const randomIndex = Math.floor(Math.random() * die.letters.length);
		rolled.push({
			letter: die.letters[randomIndex],
			color: 'black',
			selected: false,
			index: index++
		});
	}

	// Roll red dice if included
	if (includeRedDice) {
		for (const die of config.redDice) {
			const randomIndex = Math.floor(Math.random() * die.letters.length);
			rolled.push({
				letter: die.letters[randomIndex],
				color: 'red',
				selected: false,
				index: index++
			});
		}
	}

	return rolled;
}

/**
 * Toggle selection state of a die
 * @param dice - Array of rolled dice
 * @param index - Index of die to toggle
 * @returns Updated array with toggled selection
 */
export function toggleDiceSelection(dice: RolledDie[], index: number): RolledDie[] {
	return dice.map((die, i) =>
		i === index ? { ...die, selected: !die.selected } : die
	);
}

/**
 * Clear all selections
 * @param dice - Array of rolled dice
 * @returns Array with all selections cleared
 */
export function clearDiceSelections(dice: RolledDie[]): RolledDie[] {
	return dice.map(die => ({ ...die, selected: false }));
}

/**
 * Get word from selected dice
 * @param dice - Array of rolled dice
 * @returns Word formed by selected dice in selection order
 */
export function getSelectedWord(dice: RolledDie[]): string {
	return dice
		.filter(die => die.selected)
		.map(die => die.letter)
		.join('');
}

/**
 * Check if a word can be formed from available dice letters
 * @param word - Word to check
 * @param dice - Array of rolled dice
 * @returns True if word can be formed from available letters
 */
export function canFormWord(word: string, dice: RolledDie[]): boolean {
	const availableLetters = dice.map(d => d.letter.toLowerCase());
	const wordLetters = word.toLowerCase().split('');

	for (const letter of wordLetters) {
		const index = availableLetters.indexOf(letter);
		if (index === -1) {
			return false;
		}
		availableLetters.splice(index, 1);
	}

	return true;
}
