/**
 * Theme Toggle Script
 * Handles theme initialization, persistence, and switching
 */

export type Theme = 'neon-night' | 'mall-pastel';

const THEMES: Theme[] = ['neon-night', 'mall-pastel'];
const STORAGE_KEY = 'theme';
const DEFAULT_THEME: Theme = 'neon-night';

/**
 * Get the saved theme from localStorage
 */
export function getSavedTheme(): Theme | null {
	if (typeof localStorage === 'undefined') return null;
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved && THEMES.includes(saved as Theme)) {
		return saved as Theme;
	}
	return null;
}

/**
 * Save theme to localStorage
 */
export function saveTheme(theme: Theme): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Get the initial theme based on saved preference or system preference
 */
export function getInitialTheme(): Theme {
	// First check localStorage
	const saved = getSavedTheme();
	if (saved) return saved;

	// Then check system preference
	if (typeof window !== 'undefined' && window.matchMedia) {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		return prefersDark ? 'neon-night' : 'mall-pastel';
	}

	// Default theme
	return DEFAULT_THEME;
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Get the current theme index
 */
function getThemeIndex(theme: Theme): number {
	return THEMES.indexOf(theme);
}

/**
 * Get the next theme in the cycle
 */
export function getNextTheme(currentTheme: Theme): Theme {
	const currentIndex = getThemeIndex(currentTheme);
	const nextIndex = (currentIndex + 1) % THEMES.length;
	return THEMES[nextIndex];
}

/**
 * Toggle to the next theme
 */
export function toggleTheme(): void {
	const currentTheme = document.documentElement.getAttribute('data-theme') as Theme;
	const nextTheme = getNextTheme(currentTheme);
	applyTheme(nextTheme);
	saveTheme(nextTheme);
}

/**
 * Initialize theme on page load
 */
export function initTheme(): void {
	const theme = getInitialTheme();
	applyTheme(theme);
}
