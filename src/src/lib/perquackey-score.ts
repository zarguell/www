/**
 * Perquackey Scoring
 * Score tables and pure scoring logic shared by the tracker page and its tests.
 */

export interface ScoreResult {
	totalScore: number;
	bonuses: string[];
}

/** Points by word count (1-5) for each word length (3-8). */
export const SCORING_TABLE: Record<number, Record<number, number>> = {
	3: {1:60, 2:70, 3:80, 4:90, 5:100},
	4: {1:120, 2:140, 3:160, 4:180, 5:200},
	5: {1:200, 2:250, 3:300, 4:350, 5:400},
	6: {1:300, 2:400, 3:500, 4:600, 5:700},
	7: {1:500, 2:650, 3:800, 4:950, 5:1100},
	8: {1:750, 2:1000, 3:1250, 4:1500, 5:1750}
};

/** Bonus for completing two adjacent word-length categories (5 words each). */
export const BONUS_TABLE: Record<string, number> = {
	'3-4': 300,
	'4-5': 500,
	'5-6': 800,
	'6-7': 1200,
	'7-8': 1850
};

/** At this total score, 3-letter words are disabled and red dice come out. */
export const VULNERABILITY_THRESHOLD = 2000;

/** Vulnerable players scoring below this in a round take the penalty. */
export const MIN_SCORE_THRESHOLD = 500;

/** Penalty applied to a vulnerable player's total (negative). */
export const PENALTY_AMOUNT = -500;

/**
 * Calculate the score for a round's words: per-length points plus the single
 * highest completed adjacent-pair bonus.
 * @param words - Map of word length to list of words played this round
 * @returns Total score and any earned bonus labels
 */
export function calculateScore(words: Record<number, string[]>): ScoreResult {
	let totalScore = 0;
	let bonuses: string[] = [];

	for (const [length, wordList] of Object.entries(words)) {
		const len = parseInt(length);
		const count = wordList.length;
		if (count > 0 && SCORING_TABLE[len]) {
			totalScore += SCORING_TABLE[len][count] || 0;
		}
	}

	if (words[7]?.length >= 5 && words[8]?.length >= 5) {
		totalScore += BONUS_TABLE['7-8'];
		bonuses.push('7-8 Bonus: +1850');
	} else if (words[6]?.length >= 5 && words[7]?.length >= 5) {
		totalScore += BONUS_TABLE['6-7'];
		bonuses.push('6-7 Bonus: +1200');
	} else if (words[5]?.length >= 5 && words[6]?.length >= 5) {
		totalScore += BONUS_TABLE['5-6'];
		bonuses.push('5-6 Bonus: +800');
	} else if (words[4]?.length >= 5 && words[5]?.length >= 5) {
		totalScore += BONUS_TABLE['4-5'];
		bonuses.push('4-5 Bonus: +500');
	} else if (words[3]?.length >= 5 && words[4]?.length >= 5) {
		totalScore += BONUS_TABLE['3-4'];
		bonuses.push('3-4 Bonus: +300');
	}

	return { totalScore, bonuses };
}
