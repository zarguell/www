/**
 * Theme utility tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getSavedTheme,
	saveTheme,
	getInitialTheme,
	applyTheme,
	getNextTheme,
	toggleTheme,
	initTheme,
	type Theme,
} from '../theme';

describe('Theme Utilities', () => {
	// Mock localStorage
	const localStorageMock = (() => {
		let store: Record<string, string> = {};
		return {
			getItem: (key: string) => store[key] || null,
			setItem: (key: string, value: string) => {
				store[key] = value.toString();
			},
			removeItem: (key: string) => {
				delete store[key];
			},
			clear: () => {
				store = {};
			},
		};
	})();

	// Mock window.matchMedia
	const matchMediaMock = vi.fn();

	beforeEach(() => {
		// Setup localStorage mock
		Object.defineProperty(global, 'localStorage', {
			value: localStorageMock,
			writable: true,
		});

		// Setup window.matchMedia mock
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: (query: string) => ({
				matches: query === '(prefers-color-scheme: dark)',
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}),
		});

		// Clear localStorage before each test
		localStorageMock.clear();

		// Reset document theme
		document.documentElement.removeAttribute('data-theme');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getSavedTheme', () => {
		it('should return null when no theme is saved', () => {
			const result = getSavedTheme();
			expect(result).toBeNull();
		});

		it('should return saved theme if valid', () => {
			localStorageMock.setItem('theme', 'neon-night');
			const result = getSavedTheme();
			expect(result).toBe('neon-night');
		});

		it('should return null for invalid theme', () => {
			localStorageMock.setItem('theme', 'invalid-theme');
			const result = getSavedTheme();
			expect(result).toBeNull();
		});

		it('should return both valid themes', () => {
			localStorageMock.setItem('theme', 'mall-pastel');
			const result = getSavedTheme();
			expect(result).toBe('mall-pastel');
		});
	});

	describe('saveTheme', () => {
		it('should save theme to localStorage', () => {
			saveTheme('neon-night');
			expect(localStorageMock.getItem('theme')).toBe('neon-night');
		});

		it('should save mall-pastel theme', () => {
			saveTheme('mall-pastel');
			expect(localStorageMock.getItem('theme')).toBe('mall-pastel');
		});
	});

	describe('getInitialTheme', () => {
		it('should return saved theme if exists', () => {
			localStorageMock.setItem('theme', 'mall-pastel');
			const result = getInitialTheme();
			expect(result).toBe('mall-pastel');
		});

		it('should return neon-night for dark system preference', () => {
			const result = getInitialTheme();
			expect(result).toBe('neon-night');
		});

		it('should return mall-pastel for light system preference', () => {
			Object.defineProperty(window, 'matchMedia', {
				writable: true,
				value: vi.fn().mockImplementation((query) => ({
					matches: false,
					media: query,
				})),
			});
			const result = getInitialTheme();
			expect(result).toBe('mall-pastel');
		});

		it('should return default theme when no preference available', () => {
			// @ts-ignore - testing undefined case
			Object.defineProperty(window, 'matchMedia', {
				writable: true,
				value: undefined,
			});
			const result = getInitialTheme();
			expect(result).toBe('neon-night');
		});
	});

	describe('applyTheme', () => {
		it('should set data-theme attribute on document', () => {
			applyTheme('neon-night');
			expect(document.documentElement.getAttribute('data-theme')).toBe('neon-night');
		});

		it('should apply mall-pastel theme', () => {
			applyTheme('mall-pastel');
			expect(document.documentElement.getAttribute('data-theme')).toBe('mall-pastel');
		});

		it('should replace existing theme', () => {
			applyTheme('neon-night');
			applyTheme('mall-pastel');
			expect(document.documentElement.getAttribute('data-theme')).toBe('mall-pastel');
		});
	});

	describe('getNextTheme', () => {
		it('should return mall-pastel after neon-night', () => {
			const result = getNextTheme('neon-night');
			expect(result).toBe('mall-pastel');
		});

		it('should return neon-night after mall-pastel', () => {
			const result = getNextTheme('mall-pastel');
			expect(result).toBe('neon-night');
		});

		it('should cycle through themes', () => {
			const first = getNextTheme('neon-night');
			const second = getNextTheme(first);
			expect(second).toBe('neon-night');
		});
	});

	describe('toggleTheme', () => {
		it('should toggle from neon-night to mall-pastel', () => {
			document.documentElement.setAttribute('data-theme', 'neon-night');
			toggleTheme();
			expect(document.documentElement.getAttribute('data-theme')).toBe('mall-pastel');
		});

		it('should toggle from mall-pastel to neon-night', () => {
			document.documentElement.setAttribute('data-theme', 'mall-pastel');
			toggleTheme();
			expect(document.documentElement.getAttribute('data-theme')).toBe('neon-night');
		});

		it('should save new theme to localStorage', () => {
			document.documentElement.setAttribute('data-theme', 'neon-night');
			toggleTheme();
			expect(localStorageMock.getItem('theme')).toBe('mall-pastel');
		});
	});

	describe('initTheme', () => {
		it('should apply saved theme on initialization', () => {
			localStorageMock.setItem('theme', 'mall-pastel');
			initTheme();
			expect(document.documentElement.getAttribute('data-theme')).toBe('mall-pastel');
		});

		it('should apply system preference when no saved theme', () => {
			initTheme();
			expect(document.documentElement.getAttribute('data-theme')).toBe('neon-night');
		});

		it('should apply default theme when no preference', () => {
			// @ts-ignore
			Object.defineProperty(window, 'matchMedia', {
				writable: true,
				value: undefined,
			});
			initTheme();
			expect(document.documentElement.getAttribute('data-theme')).toBe('neon-night');
		});
	});
});
