/**
 * Perquackey DOM wiring — game state, rendering, timers, sounds.
 * Pure scoring is in `lib/perquackey-score.ts`; dice logic in
 * `data/perquackey-dice.ts`.
 */
import { rollDice, type RolledDie } from '../data/perquackey-dice';
import {
	SCORING_TABLE,
	VULNERABILITY_THRESHOLD,
	MIN_SCORE_THRESHOLD,
	PENALTY_AMOUNT,
	calculateScore
} from '../lib/perquackey-score';



const DEFAULT_ROUND_TIME = 180;
const DEFAULT_SCORE_LIMIT = 5000;




declare global {
	interface Window {
		addPlayer: () => void;
		removePlayer: (index: number) => void;
		movePlayer: (index: number, direction: number) => void;
		removeWord: (length: number, index: number) => void;
		toggleDiceSelection: (index: number) => void;
		addDiceWord: () => void;
		clearDiceSelection: () => void;
		clearAllDice: () => void;
		undoLastDie: () => void;
		handleDicePointerDown: (event: PointerEvent | KeyboardEvent, index: number) => void;
		handleDiceKeyDown: (event: KeyboardEvent, index: number) => void;
		startGame: () => void;
		startTimer: () => void;
		pauseTimer: () => void;
		endRound: () => void;
		restartRound: () => void;
		forfeitRound: () => void;
		editWords: () => void;
		confirmRound: () => void;
		applyManualAdjustment: () => void;
		toggleSound: () => void;
		toggleStandings: () => void;
		playAgain: () => void;
		shareResults: () => void;
	}
}

/** Required-element lookup: fails fast if the markup contract is broken. */
function $id<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`perquackey: missing #${id} in markup`);
	return el as T;
}

let lastTapTime = 0;
const DOUBLE_TAP_THRESHOLD = 200;
let audioContext: AudioContext | null = null;
let userInteracted = false;

interface RoundHistoryEntry {
	roundNumber: number;
	score: number;
	words: string[];
}

interface Player {
	id: string;
	name: string;
	totalScore: number;
	currentRoundScore: number;
	manualScoreAdjustment: number;
	words: Record<number, string[]>;
	currentRoundWords: Record<number, string[]>;
	vulnerable: boolean;
	redDice: boolean;
	penaltyApplied: boolean;
	roundHistory: RoundHistoryEntry[];
	allWordsPlayed: string[];
}

type GameState = 'setup' | 'playing' | 'round_complete' | 'game_over';

interface PerquackeyState {
	gameState: GameState;
	players: Player[];
	currentPlayerIndex: number;
	roundTime: number;
	scoreLimit: number;
	timer: {
		secondsRemaining: number;
		isRunning: boolean;
		intervalId: ReturnType<typeof setInterval> | null;
	};
	winner: Player | null;
	dictionaryLoaded: boolean;
	dictionary: Set<string> | null;
	soundEnabled: boolean;
	diceSoundEnabled: boolean;
	diceMode: 'manual' | 'virtual';
	diceSet: string;
	currentDice: RolledDie[];
	diceRolled: boolean;
	selectedDiceOrder: number[];
	reorderMode: {
		active: boolean;
		sourceIndex: number | null;
	};
}

let state: PerquackeyState = {
	gameState: 'setup',
	players: [],
	currentPlayerIndex: 0,
	roundTime: DEFAULT_ROUND_TIME,
	scoreLimit: DEFAULT_SCORE_LIMIT,
	timer: {
		secondsRemaining: DEFAULT_ROUND_TIME,
		isRunning: false,
		intervalId: null
	},
	winner: null,
	dictionaryLoaded: false,
	dictionary: null,
	soundEnabled: true,
	diceSoundEnabled: false,
	diceMode: 'manual',
	diceSet: 'classic',
	currentDice: [],
	diceRolled: false,
	selectedDiceOrder: [],
	reorderMode: {
		active: false,
		sourceIndex: null
	}
};

function saveState() {
	const saveData = {
		gameState: state.gameState,
		players: state.players,
		currentPlayerIndex: state.currentPlayerIndex,
		roundTime: state.roundTime,
		scoreLimit: state.scoreLimit,
		timer: {
			secondsRemaining: state.timer.secondsRemaining,
			isRunning: state.timer.isRunning
		},
		winner: state.winner,
		soundEnabled: state.soundEnabled,
		diceSoundEnabled: state.diceSoundEnabled,
		diceMode: state.diceMode,
		diceSet: state.diceSet
	};
	localStorage.setItem('perquackey-state', JSON.stringify(saveData));
}

function loadState() {
	const saved = localStorage.getItem('perquackey-state');
	if (saved) {
		const data = JSON.parse(saved);
		state = {
			...state,
			...data,
			roundTime: data.roundTime || DEFAULT_ROUND_TIME,
			scoreLimit: data.scoreLimit || DEFAULT_SCORE_LIMIT,
			timer: {
				...state.timer,
				...data.timer,
				intervalId: null
			},
			soundEnabled: data.soundEnabled !== undefined ? data.soundEnabled : true,
			diceSoundEnabled: data.diceSoundEnabled !== undefined ? data.diceSoundEnabled : false,
			diceMode: data.diceMode || 'manual',
			diceSet: data.diceSet || 'classic'
		};
	}
}

function getCurrentPlayer() {
	return state.players[state.currentPlayerIndex];
}

function formatTime(seconds: number) {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
	const timerEl = document.getElementById('timer');
	if (timerEl) {
		timerEl.textContent = formatTime(state.timer.secondsRemaining);
		timerEl.className = 'timer-display';
		const warningThreshold = Math.max(30, Math.floor(parseInt(String(state.roundTime)) * 0.17));
		const dangerThreshold = Math.max(10, Math.floor(parseInt(String(state.roundTime)) * 0.05));
		if (state.timer.secondsRemaining <= 0) {
			timerEl.classList.add('time-up');
		} else if (state.timer.secondsRemaining <= dangerThreshold) {
			timerEl.classList.add('danger');
		} else if (state.timer.secondsRemaining <= warningThreshold) {
			timerEl.classList.add('warning');
		}
	}
}

function announce(message: string) {
	const announcer = document.getElementById('game-announcer');
	if (announcer) {
		announcer.textContent = message;
	}
}

function playTimerEndSound() {
	if (!state.soundEnabled) return;
	
	try {
		// Create or reuse AudioContext
		if (!audioContext) {
			audioContext = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
		}
		
		// Resume if suspended (required after user gesture)
		if (audioContext.state === 'suspended') {
			audioContext.resume();
		}
		
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		
		oscillator.frequency.value = 800;
		oscillator.type = 'square';
		gainNode.gain.value = 0.3;
		
		oscillator.start();
		oscillator.stop(audioContext.currentTime + 0.5);
	} catch (error) {
		// Silently fail if audio not supported
	}
}

function playDiceSelectSound() {
	if (!state.soundEnabled || !state.diceSoundEnabled) return;
	
	try {
		// Create or reuse AudioContext
		if (!audioContext) {
			audioContext = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
		}
		
		// Resume if suspended (required after user gesture)
		if (audioContext.state === 'suspended') {
			audioContext.resume();
		}
		
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		
		oscillator.frequency.value = 1200;
		oscillator.type = 'sine';
		gainNode.gain.value = 0.15;
		
		oscillator.start();
		oscillator.stop(audioContext.currentTime + 0.05);
	} catch (error) {
		// Silently fail if audio not supported
	}
}

function startTimer() {
	if (state.timer.intervalId) return;
	state.timer.isRunning = true;
	state.timer.intervalId = setInterval(() => {
		if (state.timer.secondsRemaining > 0) {
			state.timer.secondsRemaining--;
			updateTimerDisplay();
			saveState();
		} else {
			stopTimer();
			playTimerEndSound();
			announce('Time is up! Round over.');
			endRound();
		}
	}, 1000);
}

function stopTimer() {
	if (state.timer.intervalId) {
		clearInterval(state.timer.intervalId);
		state.timer.intervalId = null;
	}
	state.timer.isRunning = false;
}

async function loadDictionary() {
	if (state.dictionaryLoaded) return;
	try {
		const wordlist = await import('wordlist-js');
		state.dictionary = new Set(wordlist.englishAll);
		state.dictionaryLoaded = true;
		console.log('Dictionary loaded with', wordlist.englishAll.length, 'words');
	} catch (error) {
		console.error('Failed to load dictionary:', error);
	}
}

function validateWord(word: string) {
	const validation = { valid: true, message: '' };

	if (!word) {
		validation.valid = false;
		validation.message = '';
		return validation;
	}

	if (word.length < 3 || word.length > 8) {
		validation.valid = false;
		validation.message = 'Word must be 3-8 letters';
		return validation;
	}

	const player = getCurrentPlayer();
	const currentLength = player.currentRoundWords[word.length];
	
	if (currentLength && currentLength.length >= 5) {
		validation.valid = false;
		validation.message = `Already have 5 words of ${word.length} letters`;
		return validation;
	}

	const baseWord = word.endsWith('s') ? word.slice(0, -1) : null;
	if (baseWord && player.currentRoundWords[baseWord.length]?.includes(baseWord)) {
		validation.valid = false;
		validation.message = `Cannot add "${word}" when "${baseWord}" exists`;
		return validation;
	}

	if (player.currentRoundWords[word.length]?.includes(word)) {
		validation.valid = false;
		validation.message = 'Word already added';
		return validation;
	}

	if (!state.dictionaryLoaded) {
		validation.valid = false;
		validation.message = 'Loading dictionary...';
		return validation;
	}

	if (!state.dictionary?.has(word.toLowerCase())) {
		validation.valid = false;
		validation.message = 'Not in dictionary';
		return validation;
	}

	if (player.vulnerable && word.length === 3) {
		validation.valid = false;
		validation.message = '3-letter words disabled when vulnerable';
		return validation;
	}

	validation.message = '✓ Valid word';
	return validation;
}

function rollDiceForRound() {
	const player = getCurrentPlayer();
	const includeRedDice = player.vulnerable;

	state.currentDice = rollDice(state.diceSet, includeRedDice);
	state.diceRolled = true;
	state.selectedDiceOrder = [];
	saveState();
	renderDice();

	const undoBtn = document.getElementById('undo-last-die-btn') as HTMLButtonElement | null;
	if (undoBtn) {
		undoBtn.disabled = true;
	}
}

function toggleDiceSelection(index: number) {
	const die = state.currentDice[index];

	if (die.selected) {
		die.selected = false;
		state.selectedDiceOrder = state.selectedDiceOrder.filter(i => i !== index);
	} else {
		die.selected = true;
		state.selectedDiceOrder.push(index);
	}

	renderDice();
	updateSelectedWord();
	playDiceSelectSound();
	validateDiceWord();
	
	const undoBtn = document.getElementById('undo-last-die-btn') as HTMLButtonElement | null;
	if (undoBtn) {
		undoBtn.disabled = state.selectedDiceOrder.length === 0;
	}
}

function handleDiceReorder(index: number) {
	const die = state.currentDice[index];
	
	if (!state.reorderMode.active) {
		if (die.selected) {
			state.reorderMode.active = true;
			state.reorderMode.sourceIndex = index;
			highlightReorderTarget(index);
		} else {
			toggleDiceSelection(index);
		}
	} else if (state.reorderMode.sourceIndex === index) {
		state.reorderMode.active = false;
		state.reorderMode.sourceIndex = null;
		clearReorderHighlight();
	} else {
		const source = state.reorderMode.sourceIndex;
		if (source !== null) {
			if (die.selected) {
				swapDiceInSelection(source, index);
			} else {
				replaceDieInSelection(source, index);
			}
		}
		state.reorderMode.active = false;
		state.reorderMode.sourceIndex = null;
		clearReorderHighlight();
	}
}

function swapDiceInSelection(fromIndex: number, toIndex: number) {
	const fromPos = state.selectedDiceOrder.indexOf(fromIndex);
	const toPos = state.selectedDiceOrder.indexOf(toIndex);
	
	if (fromPos !== -1 && toPos !== -1 && fromPos !== toPos) {
		const temp = state.selectedDiceOrder[fromPos];
		state.selectedDiceOrder[fromPos] = state.selectedDiceOrder[toPos];
		state.selectedDiceOrder[toPos] = temp;
		
		renderDice();
		updateSelectedWord();
		validateDiceWord();
	}
}

function replaceDieInSelection(sourceIndex: number, newIndex: number) {
	const sourcePos = state.selectedDiceOrder.indexOf(sourceIndex);
	
	if (sourcePos !== -1) {
		state.currentDice[sourceIndex].selected = false;
		state.currentDice[newIndex].selected = true;
		state.selectedDiceOrder[sourcePos] = newIndex;
		
		renderDice();
		updateSelectedWord();
		validateDiceWord();
	}
}

function highlightReorderTarget(index: number) {
	const dieElements = document.querySelectorAll('.die');
	dieElements[index].classList.add('reorder-target');
	showReorderHelp();
}

function clearReorderHighlight() {
	document.querySelectorAll('.die').forEach(die => {
		die.classList.remove('reorder-target');
	});
	hideReorderHelp();
}

function showReorderHelp() {
	const container = document.querySelector<HTMLElement>('.dice-controls')!;
	if (!document.getElementById('reorder-help')) {
		const help = document.createElement('div');
		help.id = 'reorder-help';
		help.className = 'reorder-help-text';
		help.textContent = '🔄 Tap another die to swap or replace, or tap again to cancel';
		container.insertBefore(help, container.firstChild);
	}
}

function hideReorderHelp() {
	const help = document.getElementById('reorder-help');
	if (help) help.remove();
}

function handleDicePointerDown(event: PointerEvent | KeyboardEvent, index: number) {
	// Pointer-only guard: keyboard events (Enter/Space via handleDiceKeyDown)
	// lack isPrimary and must pass through — the old truthiness check made the
	// keyboard path a silent no-op.
	if ('isPrimary' in event && !event.isPrimary) return;
	event.preventDefault();

	const now = Date.now();
	if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
		return;
	}
	lastTapTime = now;

	const dieElement = (event.target as HTMLElement).closest('.die');
	if (dieElement) {
		dieElement.classList.add('touch-active');
		setTimeout(() => {
			dieElement.classList.remove('touch-active');
		}, 150);
	}

	handleDiceReorder(index);
	const die = state.currentDice[index];
	if (die && die.selected) {
		provideHapticFeedback('selection');
	}
}

function clearDiceSelection() {
	state.currentDice.forEach(die => die.selected = false);
	state.selectedDiceOrder = [];
	renderDice();
	updateSelectedWord();
	$id<HTMLButtonElement>('add-word-btn').disabled = true;
	
	const undoBtn = document.getElementById('undo-last-die-btn') as HTMLButtonElement | null;
	if (undoBtn) {
		undoBtn.disabled = true;
	}
}

function getSelectedDiceWord() {
	return state.selectedDiceOrder
		.map(index => state.currentDice[index].letter)
		.join('');
}

function validateDiceWord() {
	const word = getSelectedDiceWord();
	const validation = validateWord(word);
	const validationEl = $id<HTMLElement>('dice-validation-message');
	const addBtn = $id<HTMLButtonElement>('add-word-btn');

	if (!word) {
		validationEl.textContent = '';
		validationEl.className = 'validation-message';
		addBtn.disabled = true;
		return;
	}

	validationEl.textContent = validation.message;
	validationEl.className = `validation-message ${validation.valid ? 'success' : 'error'}`;
	addBtn.disabled = !validation.valid;
	
	const undoBtn = document.getElementById('undo-last-die-btn') as HTMLButtonElement | null;
	if (undoBtn) {
		undoBtn.disabled = state.selectedDiceOrder.length === 0;
	}
}

function provideHapticFeedback(pattern = 'selection') {
	// Check for vibration support AND user interaction
	if (!navigator.vibrate || !userInteracted) return;
	
	try {
		switch(pattern) {
			case 'selection':
				navigator.vibrate(10);
				break;
			case 'success':
				navigator.vibrate([10, 50, 10]);
				break;
			case 'undo':
				navigator.vibrate(15);
				break;
		}
	} catch (error) {
		// Silently fail if vibration not supported
	}
}

function clearAllDice() {
	state.currentDice.forEach(die => die.selected = false);
	state.selectedDiceOrder = [];
	state.reorderMode.active = false;
	state.reorderMode.sourceIndex = null;
	clearReorderHighlight();
	
	renderDice();
	updateSelectedWord();
	validateDiceWord();
	provideHapticFeedback('undo');
}

function undoLastDie() {
	if (state.selectedDiceOrder.length === 0) return;
	
	const lastIndex = state.selectedDiceOrder.pop();
	if (lastIndex !== undefined) state.currentDice[lastIndex].selected = false;
	
	state.reorderMode.active = false;
	state.reorderMode.sourceIndex = null;
	clearReorderHighlight();
	
	renderDice();
	updateSelectedWord();
	validateDiceWord();
	provideHapticFeedback('selection');
}

function addDiceWord() {
	const word = getSelectedDiceWord();
	if (word) {
		addWord(word);
		provideHapticFeedback('success');
		state.currentDice.forEach(die => die.selected = false);
		state.selectedDiceOrder = [];
		renderDice();
		updateSelectedWord();
		validateDiceWord();
		
		const undoBtn = document.getElementById('undo-last-die-btn') as HTMLButtonElement | null;
		if (undoBtn) {
			undoBtn.disabled = true;
		}
	}
}

function renderDice() {
	const diceGrid = document.getElementById('dice-grid');
	if (!diceGrid) return;

	diceGrid.innerHTML = state.currentDice.map(die => `
		<div class="die ${die.color} ${die.selected ? 'selected' : ''}"
		     role="button"
		     tabindex="0"
		     aria-pressed="${die.selected}"
		     aria-label="Die ${die.letter}${die.selected ? ', selected' : ''}"
		     data-index="${die.index}"
		     onpointerdown="window.handleDicePointerDown(event, ${die.index})"
		     onkeydown="window.handleDiceKeyDown(event, ${die.index})">
			${die.letter}
		</div>
	`).join('');
}

function updateSelectedWord() {
	const wordEl = document.getElementById('selected-word');
	if (wordEl) {
		wordEl.textContent = getSelectedDiceWord();
	}
}

function showWordEntryMode() {
	const manualEntry = $id('manual-word-entry');
	const diceEntry = $id('virtual-dice-entry');

	if (state.diceMode === 'virtual') {
		manualEntry.style.display = 'none';
		diceEntry.style.display = 'block';
	} else {
		manualEntry.style.display = 'block';
		diceEntry.style.display = 'none';
	}
}

function addWord(word: string) {
	const player = getCurrentPlayer();
	const length = word.length;
	
	if (!player.currentRoundWords[length]) {
		player.currentRoundWords[length] = [];
	}
	player.currentRoundWords[length].push(word);
	
	saveState();
	renderCurrentWords();
	checkVulnerability();
}

function removeWord(length: number, index: number) {
	const player = getCurrentPlayer();
	player.currentRoundWords[length].splice(index, 1);
	saveState();
	renderCurrentWords();
	checkVulnerability();
}


function checkVulnerability() {
	const player = getCurrentPlayer();
	const roundScore = calculateScore(player.currentRoundWords).totalScore;
	
	if (player.totalScore + roundScore >= VULNERABILITY_THRESHOLD && !player.vulnerable) {
		player.vulnerable = true;
		player.redDice = true;
		announce(`${player.name} is now vulnerable. Red dice active, 3-letter words disabled.`);
		showStandings();
	}
}

function applyPenalty(player: Player) {
	if (player.vulnerable && !player.penaltyApplied) {
		const roundScore = calculateScore(player.currentRoundWords).totalScore;
		if (roundScore < MIN_SCORE_THRESHOLD) {
			player.totalScore += PENALTY_AMOUNT;
			player.penaltyApplied = true;
		}
	}
}

function advanceToNextPlayer() {
	const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
	state.currentPlayerIndex = nextPlayerIndex;
	state.timer.secondsRemaining = parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME;
	state.timer.isRunning = false;
	state.timer.intervalId = null;
	state.gameState = 'playing';
	state.diceRolled = false;
	state.selectedDiceOrder = [];
	saveState();
	showPhase('playing');
	showWordEntryMode();
	renderCurrentPlayer();
	renderCurrentWords();
	updateTimerDisplay();
	updateTimerButtons();
	showStandings();

	if (state.diceMode === 'virtual') {
		rollDiceForRound();
	}
}

function endRound() {
	stopTimer();
	const player = getCurrentPlayer();
	applyPenalty(player);
	
	const roundScore = calculateScore(player.currentRoundWords).totalScore;
	player.currentRoundScore = roundScore;
	
	state.gameState = 'round_complete';
	saveState();
	showPhase('round-complete');
	renderRoundSummary();
	showStandings();
}

	function confirmRound() {
	const player = getCurrentPlayer();
	
	const roundWords = [];
	for (const [len, wordList] of Object.entries(player.currentRoundWords)) {
		const length = Number(len);
		if (!player.words[length]) {
			player.words[length] = [];
		}
		player.words[length].push(...wordList);
		roundWords.push(...wordList);
	}
	
	player.roundHistory.push({
		roundNumber: player.roundHistory.length + 1,
		score: player.currentRoundScore,
		words: roundWords
	});
	player.allWordsPlayed.push(...roundWords);
	
	player.totalScore += player.currentRoundScore + player.manualScoreAdjustment;
	
	player.currentRoundWords = { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
	player.currentRoundScore = 0;
	player.manualScoreAdjustment = 0;
	player.penaltyApplied = false;

	if (player.totalScore >= state.scoreLimit) {
		state.winner = player;
		state.gameState = 'game_over';
		saveState();
		showPhase('game-over');
		renderGameOver();
		showStandings();
	} else {
		const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
		state.currentPlayerIndex = nextPlayerIndex;
		state.timer.secondsRemaining = parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME;
		state.timer.isRunning = false;
		state.timer.intervalId = null;
		state.gameState = 'playing';
		state.diceRolled = false;
		state.selectedDiceOrder = [];
		saveState();
		showPhase('playing');
		showWordEntryMode();
		renderCurrentPlayer();
		renderCurrentWords();
		updateTimerDisplay();
		updateTimerButtons();
		showStandings();

		if (state.diceMode === 'virtual') {
			rollDiceForRound();
		}
	}
}

function getLongestWord() {
	let longest: { word: string; length: number; player: string } = { word: '', length: 0, player: '' };
	
	for (const player of state.players) {
		for (const word of player.allWordsPlayed) {
			if (word.length > longest.length) {
				longest = { word, length: word.length, player: player.name };
			}
		}
	}
	
	return longest.word ? longest : null;
}

function getHighestRound() {
	let highest: { score: number; player: string; round: number } = { score: 0, player: '', round: 0 };
	
	for (const player of state.players) {
		for (const round of player.roundHistory) {
			if (round.score > highest.score) {
				highest = { score: round.score, player: player.name, round: round.roundNumber };
			}
		}
	}
	
	return highest.score > 0 ? highest : null;
}

function generateShareText() {
	const winner = state.winner;
	const totalRounds = Math.max(...state.players.map(p => p.roundHistory.length), 0);
	const longest = getLongestWord();
	const highestRound = getHighestRound();
	const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	
	let shareText = `🎮 Perquackey Results - ${today}\n\n`;
	
	if (winner) {
		shareText += `🏆 Winner: ${winner.name}\n`;
		shareText += `⭐ Score: ${winner.totalScore}\n`;
	} else {
		const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
		shareText += `🤝 Tie Game!\n`;
		shareText += `⭐ Top Score: ${sorted[0].totalScore}\n`;
	}
	
	shareText += `🔢 Rounds: ${totalRounds}\n\n`;
	
	shareText += `📊 Final Scores:\n`;
	const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
	sorted.forEach((player, index) => {
		shareText += `${index + 1}. ${player.name}: ${player.totalScore}\n`;
	});
	
	if (longest) {
		shareText += `\n📝 Longest Word: "${longest.word}" (${longest.length} letters) by ${longest.player}\n`;
	}
	
	if (highestRound) {
		shareText += `🎯 Best Round: ${highestRound.score} pts by ${highestRound.player} (Round ${highestRound.round})\n`;
	}
	
	shareText += `\nPlay at: https://www.arguelles.me/tools/perquackey/`;
	
	return shareText;
}

async function shareResults() {
	const shareText = generateShareText();
	
	if (navigator.share) {
		try {
			await navigator.share({
				text: shareText
			});
		} catch (err) {
			if (err instanceof Error && err.name !== 'AbortError') {
				console.error('Share failed:', err);
			}
		}
	} else {
		try {
			await navigator.clipboard.writeText(shareText);
			const shareBtn = $id('share-recap-btn');
			const originalText = shareBtn.textContent;
			shareBtn.textContent = '✅ Copied!';
			setTimeout(() => {
				shareBtn.textContent = originalText;
			}, 2000);
		} catch (err) {
			console.error('Clipboard copy failed:', err);
			alert('Could not copy to clipboard. Please manually copy results.');
		}
	}
}

function renderSetup() {
	const playersList = $id('players-list');
	const startBtn = $id<HTMLButtonElement>('start-game-btn');
	
	playersList.innerHTML = state.players.map((player, index) => `
		<div class="player-item">
			<span>${player.name}</span>
			<div>
				<button class="retro-button" onclick="movePlayer(${index}, -1)">↑</button>
				<button class="retro-button" onclick="movePlayer(${index}, 1)">↓</button>
				<button class="retro-button retro-button--danger" onclick="removePlayer(${index})">✕</button>
			</div>
		</div>
	`).join('');
	
	startBtn.disabled = state.players.length < 1;
}

function renderCurrentPlayer() {
	const player = getCurrentPlayer();
	const nameEl = $id('current-player-name');
	nameEl.textContent = `${player.name}'s Turn`;
}

function renderCurrentWords() {
	const player = getCurrentPlayer();
	const container = $id('current-words');
	
	container.innerHTML = '';
	
	for (let length = 3; length <= 8; length++) {
		const words = player.currentRoundWords[length] || [];
		if (words.length > 0) {
			const group = document.createElement('div');
			group.className = 'word-length-group';
			
			const header = document.createElement('div');
			header.className = 'word-length-header';
			header.textContent = `${length}-letter words (${words.length}/5)`;
			group.appendChild(header);
			
			words.forEach((word, index) => {
				const wordEl = document.createElement('div');
				wordEl.className = 'word-item';
				wordEl.innerHTML = `
					<span>${word}</span>
					<button class="retro-button retro-button--danger" onclick="removeWord(${length}, ${index})">✕</button>
				`;
				group.appendChild(wordEl);
			});
			
			container.appendChild(group);
		}
	}
	
	if (container.children.length === 0) {
		container.innerHTML = '<div class="info-message">No words added yet</div>';
	}
}

function renderRoundSummary() {
	const player = getCurrentPlayer();
	const container = $id('round-summary');
	const { totalScore, bonuses } = calculateScore(player.currentRoundWords);
	
	let html = '<h3>Score Breakdown</h3>';
	
	for (let length = 3; length <= 8; length++) {
		const words = player.currentRoundWords[length] || [];
		if (words.length > 0) {
			const score = SCORING_TABLE[length][words.length];
			html += `<div class="score-row">
				<span>${length}-letter (${words.length}/5)</span>
				<span>+${score}</span>
			</div>`;
		}
	}
	
	if (bonuses.length > 0) {
		html += '<div style="margin-top: 1rem;">';
		bonuses.forEach(bonus => {
			html += `<div class="bonus-highlight">${bonus}</div>`;
		});
		html += '</div>';
	}
	
	if (player.manualScoreAdjustment !== 0) {
		html += `<div class="score-row">
			<span>Manual Adjustment</span>
			<span>${player.manualScoreAdjustment > 0 ? '+' : ''}${player.manualScoreAdjustment}</span>
		</div>`;
	}
	
	html += `<div class="total-score">Round Total: ${totalScore + player.manualScoreAdjustment}</div>`;
	html += `<div style="margin-top: 1rem;">Game Total: ${player.totalScore + totalScore + player.manualScoreAdjustment}</div>`;
	
	if (player.vulnerable) {
		html += '<div class="red-dice-badge">RED DICE ACTIVE</div>';
		if (player.penaltyApplied) {
			html += `<div class="vulnerability-badge">Penalty Applied: ${PENALTY_AMOUNT}</div>`;
		}
	}
	
	container.innerHTML = html;
}

function renderStandings() {
	const container = $id('standings-list');
	const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
	
	container.innerHTML = sorted.map((player, index) => {
		const isVulnerable = player.vulnerable ? '<span class="vulnerability-badge">VULNERABLE</span>' : '';
		const isRedDice = player.redDice ? '<span class="red-dice-badge">RED DICE</span>' : '';
		return `
		<div class="standing-item">
			<span>${index + 1}. ${player.name}</span>
			<span>
				${player.totalScore}
				${isVulnerable}
				${isRedDice}
			</span>
		</div>
	`;
	}).join('');
}

function renderGameOver() {
	const winnerEl = $id('recap-winner');
	const statsEl = $id('recap-stats');
	const scoresEl = $id('recap-scores');
	const longestWordEl = $id('recap-longest-word');
	const bestRoundEl = $id('recap-best-round');
	
	const totalRounds = Math.max(...state.players.map(p => p.roundHistory.length), 0);
	const longest = getLongestWord();
	const highestRound = getHighestRound();
	
	if (state.winner) {
		winnerEl.innerHTML = `
			<div class="winner-text">🎉 ${state.winner.name} Wins! 🎉</div>
			<div class="recap-value" style="text-align: center;">Score: ${state.winner.totalScore}</div>
		`;
	} else {
		const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
		const topScores = sorted.filter(p => p.totalScore === sorted[0].totalScore);
		winnerEl.innerHTML = `
			<div class="winner-text">🤝 Tie: ${topScores.map(p => p.name).join(' & ')} 🤝</div>
			<div class="recap-value" style="text-align: center;">Score: ${sorted[0].totalScore}</div>
		`;
	}
	
	statsEl.innerHTML = `
		<div class="recap-label">🔢 Rounds Played</div>
		<div class="recap-value">${totalRounds}</div>
	`;
	
	const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
	scoresEl.innerHTML = `
		<div class="recap-label">📊 Final Scores</div>
		${sorted.map((player, index) => `
			<div class="standing-item">
				<span>${index + 1}. ${player.name}</span>
				<span>${player.totalScore}</span>
			</div>
		`).join('')}
	`;
	
	if (longest) {
		longestWordEl.innerHTML = `
			<div class="recap-label">📝 Longest Word</div>
			<div class="recap-value">"${longest.word}" (${longest.length} letters) by ${longest.player}</div>
		`;
	} else {
		longestWordEl.innerHTML = '';
	}
	
	if (highestRound) {
		bestRoundEl.innerHTML = `
			<div class="recap-label">🎯 Best Single Round</div>
			<div class="recap-value">${highestRound.score} points by ${highestRound.player} (Round ${highestRound.round})</div>
		`;
	} else {
		bestRoundEl.innerHTML = '';
	}

	announce(state.winner ? `Game over! ${state.winner.name} wins with ${state.winner.totalScore} points.` : 'Game over! The game ends in a tie.');
}

function showPhase(phase: string) {
	document.querySelectorAll<HTMLElement>('.phase').forEach((el) => (el.style.display = 'none'));
	$id(`${phase}-phase`).style.display = 'flex';
	
	if (phase === 'playing' || phase === 'round-complete' || phase === 'game-over') {
		$id('standings-window').style.display = 'block';
	} else {
		$id('standings-window').style.display = 'none';
	}
}

function showStandings() {
	if (state.gameState !== 'setup') {
		renderStandings();
	}
}

function resetGame() {
	state = {
		gameState: 'setup',
		players: state.players.map(p => ({
			...p,
			name: p.name,
			id: p.id,
			totalScore: 0,
			currentRoundScore: 0,
			manualScoreAdjustment: 0,
			words: { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
			currentRoundWords: { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
			vulnerable: false,
			redDice: false,
			penaltyApplied: false,
			roundHistory: [],
			allWordsPlayed: []
		})),
		currentPlayerIndex: 0,
		timer: {
			secondsRemaining: parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME,
			isRunning: false,
			intervalId: null
		},
		winner: null,
		dictionaryLoaded: state.dictionaryLoaded,
		dictionary: state.dictionary,
		soundEnabled: state.soundEnabled,
		diceMode: state.diceMode,
		diceSet: state.diceSet,
		currentDice: [],
		diceRolled: false,
		diceSoundEnabled: state.diceSoundEnabled,
		selectedDiceOrder: [],
		roundTime: state.roundTime,
		scoreLimit: state.scoreLimit,
		reorderMode: { active: false, sourceIndex: null }
	};
}

window.addPlayer = () => {
	const input = $id<HTMLInputElement>('player-name');
	const name = input.value.trim();
	if (name && !state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
		state.players.push({
			id: Date.now().toString(),
			name,
			totalScore: 0,
			currentRoundScore: 0,
			manualScoreAdjustment: 0,
			words: { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
			currentRoundWords: { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
			vulnerable: false,
			redDice: false,
			penaltyApplied: false,
			roundHistory: [],
			allWordsPlayed: []
		});
		input.value = '';
		saveState();
		renderSetup();
	}
};

window.removePlayer = (index) => {
	state.players.splice(index, 1);
	saveState();
	renderSetup();
};

window.movePlayer = (index, direction) => {
	const newIndex = index + direction;
	if (newIndex >= 0 && newIndex < state.players.length) {
		[state.players[index], state.players[newIndex]] = [state.players[newIndex], state.players[index]];
		saveState();
		renderSetup();
	}
};

window.removeWord = removeWord;
window.toggleDiceSelection = toggleDiceSelection;
window.addDiceWord = addDiceWord;
window.clearDiceSelection = clearDiceSelection;
window.clearAllDice = clearAllDice;
window.undoLastDie = undoLastDie;
window.handleDicePointerDown = handleDicePointerDown;

window.handleDiceKeyDown = (event: KeyboardEvent, index: number) => {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		handleDicePointerDown(event, index);
	}
};

window.startGame = () => {
	if (state.players.length > 0) {
		state.gameState = 'playing';
		state.currentPlayerIndex = 0;
		state.timer.secondsRemaining = parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME;
		state.diceRolled = false;
		state.selectedDiceOrder = [];
		saveState();
		showPhase('playing');
		showWordEntryMode();
		renderCurrentPlayer();
		renderCurrentWords();
		updateTimerDisplay();
		showStandings();
		loadDictionary();

		if (state.diceMode === 'virtual' && !state.diceRolled) {
			rollDiceForRound();
		}

		if (state.timer.isRunning) {
			startTimer();
		}
	}
};

window.endRound = endRound;

window.startTimer = () => {
	startTimer();
	updateTimerButtons();
	saveState();
};

window.pauseTimer = () => {
	stopTimer();
	updateTimerButtons();
	saveState();
};

function updateTimerButtons() {
	const startBtn = document.getElementById('start-timer-btn');
	const pauseBtn = document.getElementById('pause-timer-btn');
	if (startBtn && pauseBtn) {
		if (state.timer.isRunning) {
			startBtn.style.display = 'none';
			pauseBtn.style.display = 'inline-block';
		} else {
			startBtn.style.display = 'inline-block';
			pauseBtn.style.display = 'none';
		}
	}
}

window.restartRound = () => {
	const player = getCurrentPlayer();
	player.currentRoundWords = { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
	state.timer.secondsRemaining = parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME;
	stopTimer();
	saveState();
	renderCurrentWords();
	updateTimerDisplay();
};

window.forfeitRound = () => {
	const player = getCurrentPlayer();
	stopTimer();

	player.currentRoundWords = { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
	applyPenalty(player);
	player.currentRoundScore = 0;
	player.manualScoreAdjustment = 0;
	player.penaltyApplied = false;

	advanceToNextPlayer();
};

window.editWords = () => {
	state.gameState = 'playing';
	saveState();
	showPhase('playing');
	renderCurrentPlayer();
	renderCurrentWords();
	updateTimerDisplay();
};

window.confirmRound = confirmRound;

window.applyManualAdjustment = () => {
	const input = $id<HTMLInputElement>('manual-adjustment');
	const player = getCurrentPlayer();
	player.manualScoreAdjustment = parseInt(input.value) || 0;
	saveState();
	renderRoundSummary();
};

	window.playAgain = resetGame;

	window.toggleSound = () => {
		state.soundEnabled = !state.soundEnabled;
		saveState();
		
		const btn = $id('toggle-sound-btn');
		if (state.soundEnabled) {
			btn.textContent = '🔊 Sound On';
			btn.classList.remove('muted');
		} else {
			btn.textContent = '🔇 Muted';
			btn.classList.add('muted');
		}
	};

	function updateSoundButton() {
		const btn = document.getElementById('toggle-sound-btn');
		if (btn) {
			if (state.soundEnabled) {
				btn.textContent = '🔊 Sound On';
				btn.classList.remove('muted');
			} else {
				btn.textContent = '🔇 Muted';
				btn.classList.add('muted');
			}
		}
	}

	window.shareResults = shareResults;

	function makeDraggable(element: HTMLElement, handle: HTMLElement) {
	let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

	handle.onmousedown = dragMouseDown;

	function dragMouseDown(e: MouseEvent) {
		e.preventDefault();
		pos3 = e.clientX;
		pos4 = e.clientY;
		document.onmouseup = closeDragElement;
		document.onmousemove = elementDrag;
	}

	function elementDrag(e: MouseEvent) {
		e.preventDefault();
		pos1 = pos3 - e.clientX;
		pos2 = pos4 - e.clientY;
		pos3 = e.clientX;
		pos4 = e.clientY;
		element.style.top = (element.offsetTop - pos2) + "px";
		element.style.left = (element.offsetLeft - pos1) + "px";
	}

	function closeDragElement() {
		document.onmouseup = null;
		document.onmousemove = null;
	}
}

export function initPerquackeyApp(): void {
// Mark user as interacted on first click/touch anywhere on page
const enableUserInteraction = () => {
	userInteracted = true;
	document.removeEventListener('click', enableUserInteraction);
	document.removeEventListener('touchstart', enableUserInteraction);
};
document.addEventListener('click', enableUserInteraction);
document.addEventListener('touchstart', enableUserInteraction);

loadState();

if (state.gameState === 'setup') {
	showPhase('setup');
	renderSetup();
	$id<HTMLInputElement>('round-time').value = String(state.roundTime || DEFAULT_ROUND_TIME);
	$id<HTMLInputElement>('score-limit').value = String(state.scoreLimit || DEFAULT_SCORE_LIMIT);

	$id<HTMLInputElement>(`mode-${state.diceMode}`).checked = true;
	$id<HTMLInputElement>(`set-${state.diceSet}`).checked = true;
	const virtualSettings = $id('virtual-dice-settings');
	virtualSettings.style.display = state.diceMode === 'virtual' ? 'block' : 'none';
} else if (state.gameState === 'playing') {
	showPhase('playing');
	showWordEntryMode();
	renderCurrentPlayer();
	renderCurrentWords();
	updateTimerDisplay();
	showStandings();
	loadDictionary();
	updateTimerButtons();
	updateSoundButton();

	if (state.diceMode === 'virtual' && !state.diceRolled) {
		rollDiceForRound();
	}

	if (state.timer.isRunning) {
		startTimer();
	}
} else if (state.gameState === 'round_complete') {
	showPhase('round-complete');
	renderRoundSummary();
	showStandings();
} else if (state.gameState === 'game_over') {
	showPhase('game-over');
	renderGameOver();
	showStandings();
}

$id('add-player-btn').addEventListener('click', window.addPlayer);
$id('start-game-btn').addEventListener('click', window.startGame);

$id('round-time').addEventListener('input', () => {
	const input = $id<HTMLInputElement>('round-time');
	state.roundTime = parseInt(input.value) || DEFAULT_ROUND_TIME;
	saveState();
});
$id('score-limit').addEventListener('input', () => {
	const input = $id<HTMLInputElement>('score-limit');
	state.scoreLimit = parseInt(input.value) || DEFAULT_SCORE_LIMIT;
	saveState();
});

document.querySelectorAll('input[name="dice-mode"]').forEach(radio => {
	radio.addEventListener('change', (e) => {
		state.diceMode = (e.target as HTMLInputElement).value as 'manual' | 'virtual';
		saveState();
		const virtualSettings = $id('virtual-dice-settings');
		virtualSettings.style.display = state.diceMode === 'virtual' ? 'block' : 'none';
	});
});

document.querySelectorAll('input[name="dice-set"]').forEach(radio => {
	radio.addEventListener('change', (e) => {
		state.diceSet = (e.target as HTMLInputElement).value;
		saveState();
	});
});
$id('start-timer-btn').addEventListener('click', window.startTimer);
$id('pause-timer-btn').addEventListener('click', window.pauseTimer);
$id('end-round-btn').addEventListener('click', window.endRound);
$id('restart-round-btn').addEventListener('click', window.restartRound);
$id('forfeit-round-btn').addEventListener('click', window.forfeitRound);
$id('edit-words-btn').addEventListener('click', window.editWords);
$id('confirm-round-btn').addEventListener('click', window.confirmRound);
$id('apply-adjustment-btn').addEventListener('click', window.applyManualAdjustment);
$id('toggle-sound-btn').addEventListener('click', window.toggleSound);
$id('play-again-btn').addEventListener('click', window.playAgain);
$id('share-recap-btn').addEventListener('click', window.shareResults);
$id('end-game-btn').addEventListener('click', () => {
	const confirmed = confirm('End entire game? This will reset all progress.');
	if (confirmed) {
		const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
		if (sorted.length > 0 && sorted[0].totalScore > 0) {
			state.winner = sorted[0];
			state.gameState = 'game_over';
			saveState();
			showPhase('game-over');
			renderGameOver();
			showStandings();
		} else {
			stopTimer();
			state = {
				...state,
				gameState: 'setup',
				players: [],
				currentPlayerIndex: 0,
				timer: {
					...state.timer,
					secondsRemaining: parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME,
					isRunning: false,
					intervalId: null
				},
				winner: null,
				currentDice: [],
				diceRolled: false,
				selectedDiceOrder: []
			};
			saveState();
			showPhase('setup');
			renderSetup();
			updateTimerDisplay();
			showStandings();
		}
	}
});
$id('new-game-btn').addEventListener('click', () => {
	const confirmed = confirm('Start new game? Current settings will be preserved.');
	if (confirmed) {
		stopTimer();
		state.gameState = 'setup';
		state.currentPlayerIndex = 0;
		state.timer.secondsRemaining = parseInt(String(state.roundTime)) || DEFAULT_ROUND_TIME;
		state.timer.isRunning = false;
		state.timer.intervalId = null;
		state.players = state.players.map(p => ({
			name: p.name,
			id: p.id,
			totalScore: 0,
			currentRoundScore: 0,
			manualScoreAdjustment: 0,
			words: { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
			currentRoundWords: { 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
			vulnerable: false,
			redDice: false,
			penaltyApplied: false,
			roundHistory: [],
			allWordsPlayed: []
		}));
		saveState();
		showPhase('setup');
		renderSetup();
		updateTimerDisplay();
		showStandings();
	}
});

const standingsWindow = $id('standings-window');
const toggleStandingsBtn = $id('toggle-standings-btn');
let standingsCollapsed = false;

toggleStandingsBtn.addEventListener('click', () => {
	standingsCollapsed = !standingsCollapsed;
	standingsWindow.classList.toggle('collapsed');
	toggleStandingsBtn.textContent = standingsCollapsed ? '+' : '−';
});

makeDraggable(standingsWindow, toggleStandingsBtn);

window.toggleStandings = () => {
	standingsCollapsed = !standingsCollapsed;
	standingsWindow.classList.toggle('collapsed');
	toggleStandingsBtn.textContent = standingsCollapsed ? '+' : '−';
};

const wordInput = $id<HTMLInputElement>('word-input');
const validationMsg = $id<HTMLElement>('validation-message');
const overrideBtn = $id<HTMLElement>('override-btn');
let lastValidation: { valid: boolean; message: string } | null = null;
let currentWord = '';

async function validateAndUpdate() {
	currentWord = wordInput.value.trim().toUpperCase();
	validationMsg.className = 'validation-message info';
	overrideBtn.style.display = 'none';
	
	if (currentWord) {
		await loadDictionary();
		lastValidation = validateWord(currentWord);
		validationMsg.textContent = lastValidation.message;
		validationMsg.className = `validation-message ${lastValidation.valid ? 'success' : 'error'}`;
		
		if (!lastValidation.valid && lastValidation.message === 'Not in dictionary') {
			overrideBtn.style.display = 'inline-block';
		}
	} else {
		validationMsg.textContent = '';
		lastValidation = null;
	}
}

wordInput.addEventListener('input', validateAndUpdate);

wordInput.addEventListener('keydown', async (e) => {
	if (e.key === 'Enter') {
		if (currentWord) {
			if (!lastValidation) {
				await validateAndUpdate();
			}
			
			if (lastValidation && lastValidation.valid) {
				addWord(currentWord);
				wordInput.value = '';
				currentWord = '';
				validationMsg.textContent = '';
				lastValidation = null;
				overrideBtn.style.display = 'none';
			} else if (lastValidation) {
				validationMsg.textContent = lastValidation.message;
				validationMsg.className = 'validation-message error';
			}
		}
	}
});

overrideBtn.addEventListener('click', () => {
	if (currentWord && lastValidation && !lastValidation.valid) {
		addWord(currentWord);
		wordInput.value = '';
		currentWord = '';
		validationMsg.textContent = '';
		lastValidation = null;
		overrideBtn.style.display = 'none';
	}
});

const playerNameInput = $id('player-name');
playerNameInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		window.addPlayer();
	}
});

const rollDiceBtn = document.getElementById('roll-dice-btn');
const clearSelectionBtn = document.getElementById('clear-all-btn');
const addWordBtn = $id<HTMLButtonElement>('add-word-btn');
const undoBtn = document.getElementById('undo-last-die-btn') as HTMLButtonElement | null;

rollDiceBtn?.addEventListener('click', () => {
	rollDiceForRound();
});

clearSelectionBtn?.addEventListener('click', () => {
	clearAllDice();
});

addWordBtn?.addEventListener('click', () => {
	addDiceWord();
});

undoBtn?.addEventListener('click', window.undoLastDie);

const diceSoundCheckbox = document.getElementById('dice-sound-checkbox') as HTMLInputElement | null;
if (diceSoundCheckbox) {
	diceSoundCheckbox.checked = state.diceSoundEnabled;
	diceSoundCheckbox.addEventListener('change', (e) => {
		state.diceSoundEnabled = (e.target as HTMLInputElement).checked;
		saveState();
	});
}
}
