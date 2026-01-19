import { describe, it, expect } from 'vitest';

describe('Perquackey Tracker - Scoring System', () => {
	const SCORING_TABLE = {
		3: {1:60, 2:70, 3:80, 4:90, 5:100},
		4: {1:120, 2:140, 3:160, 4:180, 5:200},
		5: {1:200, 2:250, 3:300, 4:350, 5:400},
		6: {1:300, 2:400, 3:500, 4:600, 5:700},
		7: {1:500, 2:650, 3:800, 4:950, 5:1100},
		8: {1:750, 2:1000, 3:1250, 4:1500, 5:1750}
	};

	const BONUS_TABLE = {
		'3-4': 300,
		'4-5': 500,
		'5-6': 800,
		'6-7': 1200,
		'7-8': 1850
	};

	function calculateScore(words: Record<number, string[]>) {
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

	describe('Happy Path - Base Scoring', () => {
		it('scores single 3-letter word correctly', () => {
			const words = { 3: ['CAT'] };
			const result = calculateScore(words);
			expect(result.totalScore).toBe(60);
		});

		it('scores five 3-letter words correctly', () => {
			const words = { 3: ['CAT', 'DOG', 'BAT', 'HAT', 'RAT'] };
			const result = calculateScore(words);
			expect(result.totalScore).toBe(100);
		});

		it('scores five 8-letter words correctly', () => {
			const words = { 8: ['QUESTION', 'ELEPHANT', 'COMPUTER', 'MOUNTAIN', 'ABSOLUTE'] };
			const result = calculateScore(words);
			expect(result.totalScore).toBe(1750);
		});

		it('scores mixed word lengths correctly', () => {
			const words = {
				3: ['CAT', 'DOG', 'BAT'],
				4: ['BIRD', 'FISH'],
				5: ['SNAKE']
			};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(80 + 140 + 200);
		});
	});

	describe('Happy Path - Bonus Calculations', () => {
		it('applies 3-4 bonus (300 points) when both categories complete', () => {
			const words = {
				3: ['CAT', 'DOG', 'BAT', 'HAT', 'RAT'],
				4: ['BIRD', 'FISH', 'LION', 'BEAR', 'WOLF']
			};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(100 + 200 + 300);
			expect(result.bonuses).toContain('3-4 Bonus: +300');
		});

		it('applies 7-8 bonus (1850 points) when both categories complete', () => {
			const words = {
				7: ['JUNGLE', 'PUZZLE', 'MUZZLE', 'GUZZLE', 'NOZZLE'],
				8: ['QUESTION', 'ELEPHANT', 'COMPUTER', 'MOUNTAIN', 'ABSOLUTE']
			};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(1100 + 1750 + 1850);
			expect(result.bonuses).toContain('7-8 Bonus: +1850');
		});

		it('applies highest bonus only when multiple bonuses available', () => {
			const words = {
				3: ['CAT', 'DOG', 'BAT', 'HAT', 'RAT'],
				4: ['BIRD', 'FISH', 'LION', 'BEAR', 'WOLF'],
				5: ['SNAKE', 'HORSE', 'TIGER', 'PANDA', 'KOALA'],
				6: ['MONKEY', 'DONKEY', 'TURKEY', 'COYOTE', 'GIRAFFE']
			};
			const result = calculateScore(words);
			// Should get 5-6 bonus (800), not both 3-4 and 5-6
			expect(result.totalScore).toBe(100 + 200 + 400 + 700 + 800);
			expect(result.bonuses).toHaveLength(1);
			expect(result.bonuses).toContain('5-6 Bonus: +800');
		});
	});

	describe('Edge Cases - Empty Words', () => {
		it('returns zero score for empty word list', () => {
			const words: Record<number, string[]> = {};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(0);
			expect(result.bonuses).toHaveLength(0);
		});

		it('handles word length with zero words', () => {
			const words = {
				3: [],
				4: [],
				5: []
			};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(0);
		});
	});

	describe('Edge Cases - Maximum Words', () => {
		it('scores maximum 5 words per length correctly', () => {
			const words = {
				3: ['CAT', 'DOG', 'BAT', 'HAT', 'RAT'],
				4: ['BIRD', 'FISH', 'LION', 'BEAR', 'WOLF'],
				5: ['SNAKE', 'HORSE', 'TIGER', 'PANDA', 'KOALA'],
				6: ['MONKEY', 'DONKEY', 'TURKEY', 'COYOTE', 'GIRAFFE'],
				7: ['JUNGLE', 'PUZZLE', 'MUZZLE', 'GUZZLE', 'NOZZLE'],
				8: ['QUESTION', 'ELEPHANT', 'COMPUTER', 'MOUNTAIN', 'ABSOLUTE']
			};
			const result = calculateScore(words);
			// All categories complete + highest bonus (7-8)
			const baseScore = 100 + 200 + 400 + 700 + 1100 + 1750;
			expect(result.totalScore).toBe(baseScore + 1850);
		});
	});

	describe('Edge Cases - Partial Completions', () => {
		it('scores 2 of 5 words correctly for 5-letter words', () => {
			const words = { 5: ['SNAKE', 'HORSE'] };
			const result = calculateScore(words);
			expect(result.totalScore).toBe(250);
		});

		it('scores 4 of 5 words correctly for 6-letter words', () => {
			const words = { 6: ['MONKEY', 'DONKEY', 'TURKEY', 'COYOTE'] };
			const result = calculateScore(words);
			expect(result.totalScore).toBe(600);
		});
	});

	describe('Edge Cases - Bonus Thresholds', () => {
		it('does not apply 3-4 bonus when only one category complete', () => {
			const words = {
				3: ['CAT', 'DOG', 'BAT', 'HAT', 'RAT'],
				4: ['BIRD', 'FISH', 'LION', 'BEAR']
			};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(100 + 180);
			expect(result.bonuses).toHaveLength(0);
		});

		it('applies 4-5 bonus instead of 3-4 when both eligible', () => {
			const words = {
				3: ['CAT', 'DOG', 'BAT', 'HAT', 'RAT'],
				4: ['BIRD', 'FISH', 'LION', 'BEAR', 'WOLF'],
				5: ['SNAKE', 'HORSE', 'TIGER', 'PANDA', 'KOALA']
			};
			const result = calculateScore(words);
			expect(result.totalScore).toBe(100 + 200 + 400 + 500);
			expect(result.bonuses).toContain('4-5 Bonus: +500');
		});
	});
});

describe('Perquackey Tracker - Vulnerability System', () => {
	const VULNERABILITY_THRESHOLD = 2000;
	const PENALTY_AMOUNT = -500;
	const MIN_SCORE_THRESHOLD = 500;

	describe('Happy Path - Vulnerability Trigger', () => {
		it('triggers vulnerability at exactly 2000 points', () => {
			const totalScore = 2000;
			const roundScore = 0;
			const isVulnerable = totalScore + roundScore >= VULNERABILITY_THRESHOLD;
			expect(isVulnerable).toBe(true);
		});

		it('triggers vulnerability when exceeding 2000 points', () => {
			const totalScore = 1950;
			const roundScore = 100;
			const isVulnerable = totalScore + roundScore >= VULNERABILITY_THRESHOLD;
			expect(isVulnerable).toBe(true);
		});

		it('does not trigger vulnerability below 2000 points', () => {
			const totalScore = 1999;
			const roundScore = 0;
			const isVulnerable = totalScore + roundScore >= VULNERABILITY_THRESHOLD;
			expect(isVulnerable).toBe(false);
		});
	});

	describe('Edge Cases - Penalty Application', () => {
		it('applies -500 penalty when vulnerable and round score < 500', () => {
			const vulnerable = true;
			const roundScore = 400;
			const penaltyApplied = !vulnerable || roundScore >= MIN_SCORE_THRESHOLD ? 0 : PENALTY_AMOUNT;
			expect(penaltyApplied).toBe(-500);
		});

		it('does not apply penalty when vulnerable but round score >= 500', () => {
			const vulnerable = true;
			const roundScore = 500;
			const penaltyApplied = !vulnerable || roundScore >= MIN_SCORE_THRESHOLD ? 0 : PENALTY_AMOUNT;
			expect(penaltyApplied).toBe(0);
		});

		it('does not apply penalty when not vulnerable', () => {
			const vulnerable = false;
			const roundScore = 300;
			const penaltyApplied = !vulnerable || roundScore >= MIN_SCORE_THRESHOLD ? 0 : PENALTY_AMOUNT;
			expect(penaltyApplied).toBe(0);
		});

		it('applies penalty exactly at 499 round score', () => {
			const vulnerable = true;
			const roundScore = 499;
			const penaltyApplied = !vulnerable || roundScore >= MIN_SCORE_THRESHOLD ? 0 : PENALTY_AMOUNT;
			expect(penaltyApplied).toBe(-500);
		});
	});
});

describe('Perquackey Tracker - Word Validation', () => {
	describe('Happy Path - Valid Words', () => {
		it('accepts valid 3-letter word', () => {
			const word = 'CAT';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(true);
		});

		it('accepts valid 8-letter word', () => {
			const word = 'QUESTION';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(true);
		});
	});

	describe('Edge Cases - Word Length', () => {
		it('rejects 2-letter word', () => {
			const word = 'AT';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(false);
		});

		it('rejects 9-letter word', () => {
			const word = 'QUESTIONA';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(false);
		});

		it('rejects 1-letter word', () => {
			const word = 'A';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(false);
		});

		it('accepts exactly 3-letter word', () => {
			const word = 'CAT';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(true);
		});

		it('accepts exactly 8-letter word', () => {
			const word = 'ELEPHANT';
			const valid = word.length >= 3 && word.length <= 8;
			expect(valid).toBe(true);
		});
	});

	describe('Edge Cases - S-Plural Conflicts', () => {
		it('detects s-plural word', () => {
			const word = 'cats';
			const baseWord = word.endsWith('s') ? word.slice(0, -1) : null;
			expect(baseWord).toBe('cat');
		});

		it('does not detect non-s-plural as plural', () => {
			const word = 'CAT';
			const baseWord = word.endsWith('s') ? word.slice(0, -1) : null;
			expect(baseWord).toBe(null);
		});
	});

	describe('Edge Cases - Word Count Limits', () => {
		it('rejects when already have 5 words of same length', () => {
			const currentCount = 5;
			const canAdd = currentCount < 5;
			expect(canAdd).toBe(false);
		});

		it('accepts when have 4 words of same length', () => {
			const currentCount = 4;
			const canAdd = currentCount < 5;
			expect(canAdd).toBe(true);
		});

		it('accepts when have 0 words of same length', () => {
			const currentCount = 0;
			const canAdd = currentCount < 5;
			expect(canAdd).toBe(true);
		});
	});
});

describe('Perquackey Tracker - Timer', () => {
	const ROUND_TIME = 180;

	describe('Happy Path - Timer Display', () => {
		it('formats 180 seconds as 3:00', () => {
			const seconds = 180;
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
			expect(formatted).toBe('3:00');
		});

		it('formats 120 seconds as 2:00', () => {
			const seconds = 120;
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
			expect(formatted).toBe('2:00');
		});

		it('formats 60 seconds as 1:00', () => {
			const seconds = 60;
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
			expect(formatted).toBe('1:00');
		});

		it('formats 30 seconds as 0:30', () => {
			const seconds = 30;
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
			expect(formatted).toBe('0:30');
		});

		it('formats 5 seconds as 0:05', () => {
			const seconds = 5;
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
			expect(formatted).toBe('0:05');
		});

		it('formats 0 seconds as 0:00', () => {
			const seconds = 0;
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
			expect(formatted).toBe('0:00');
		});
	});

	describe('Edge Cases - Timer Warning Zones', () => {
		it('detects danger zone at 30 seconds', () => {
			const secondsRemaining = 30;
			const inDanger = secondsRemaining <= 30;
			expect(inDanger).toBe(true);
		});

		it('detects warning zone at 60 seconds', () => {
			const secondsRemaining = 60;
			const inWarning = secondsRemaining <= 60 && secondsRemaining > 30;
			expect(inWarning).toBe(true);
		});

		it('does not show warning above 60 seconds', () => {
			const secondsRemaining = 61;
			const inWarning = secondsRemaining <= 60;
			expect(inWarning).toBe(false);
		});
	});
});

describe('Perquackey Tracker - Winner Determination', () => {
	interface Player {
		id: string;
		name: string;
		totalScore: number;
	}

	function determineWinner(players: Player[]): Player | null {
		let maxScore = -Infinity;
		let winners: Player[] = [];

		for (const player of players) {
			if (player.totalScore > maxScore) {
				maxScore = player.totalScore;
				winners = [player];
			} else if (player.totalScore === maxScore) {
				winners.push(player);
			}
		}

		return winners.length === 1 ? winners[0] : null;
	}

	describe('Happy Path - Single Winner', () => {
		it('identifies player with highest score as winner', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 1000 },
				{ id: '2', name: 'Bob', totalScore: 1500 },
				{ id: '3', name: 'Charlie', totalScore: 800 }
			];
			const winner = determineWinner(players);
			expect(winner?.name).toBe('Bob');
		});
	});

	describe('Edge Cases - Ties', () => {
		it('returns null when two players tie for highest score', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 1500 },
				{ id: '2', name: 'Bob', totalScore: 1500 },
				{ id: '3', name: 'Charlie', totalScore: 800 }
			];
			const winner = determineWinner(players);
			expect(winner).toBe(null);
		});

		it('returns null when three players tie for highest score', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 1000 },
				{ id: '2', name: 'Bob', totalScore: 1000 },
				{ id: '3', name: 'Charlie', totalScore: 1000 }
			];
			const winner = determineWinner(players);
			expect(winner).toBe(null);
		});

		it('returns null when all players tie at zero', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 0 },
				{ id: '2', name: 'Bob', totalScore: 0 }
			];
			const winner = determineWinner(players);
			expect(winner).toBe(null);
		});
	});

	describe('Edge Cases - Zero Scores', () => {
		it('identifies winner when one player has zero score', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 0 },
				{ id: '2', name: 'Bob', totalScore: 100 }
			];
			const winner = determineWinner(players);
			expect(winner?.name).toBe('Bob');
		});

		it('identifies winner when all players have zero score', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 0 },
				{ id: '2', name: 'Bob', totalScore: 0 }
			];
			const winner = determineWinner(players);
			expect(winner).toBe(null);
		});
	});

	describe('Edge Cases - Large Score Differences', () => {
		it('handles very large scores correctly', () => {
			const players = [
				{ id: '1', name: 'Alice', totalScore: 9999 },
				{ id: '2', name: 'Bob', totalScore: 1 }
			];
			const winner = determineWinner(players);
			expect(winner?.name).toBe('Alice');
		});
	});
});
