/**
 * Links data validation tests
 */

import { describe, it, expect } from 'vitest';
import { linksData, type Link, type LinkCategory } from '../links';

describe('Links Data Validation', () => {
	describe('Data Structure', () => {
		it('should be an array', () => {
			expect(Array.isArray(linksData)).toBe(true);
		});

		it('should have at least one category', () => {
			expect(linksData.length).toBeGreaterThan(0);
		});
	});

	describe('Link Categories', () => {
		linksData.forEach((category: LinkCategory, index: number) => {
			describe(`Category ${index}: ${category.name}`, () => {
				it('should have a name', () => {
					expect(category.name).toBeTruthy();
					expect(typeof category.name).toBe('string');
				});

				it('should have a links array', () => {
					expect(Array.isArray(category.links)).toBe(true);
				});

				it('should have at least one link', () => {
					expect(category.links.length).toBeGreaterThan(0);
				});

				describe('Links', () => {
					category.links.forEach((link: Link, linkIndex: number) => {
						describe(`Link ${linkIndex}: ${link.title}`, () => {
							it('should have a title', () => {
								expect(link.title).toBeTruthy();
								expect(typeof link.title).toBe('string');
								expect(link.title.length).toBeGreaterThan(0);
							});

							it('should have a URL', () => {
								expect(link.url).toBeTruthy();
								expect(typeof link.url).toBe('string');
								expect(link.url.length).toBeGreaterThan(0);
							});

							it('should have a valid URL format', () => {
								expect(link.url).toMatch(/^https?:\/\//);
							});

							it('should have a description', () => {
								expect(link.description).toBeTruthy();
								expect(typeof link.description).toBe('string');
								expect(link.description.length).toBeGreaterThan(0);
							});
						});
					});
				});
			});
		});
	});

	describe('Content Validation', () => {
		it('should not have duplicate category names', () => {
			const categoryNames = linksData.map((c) => c.name);
			const uniqueNames = new Set(categoryNames);
			expect(categoryNames.length).toBe(uniqueNames.size);
		});

		it('should have unique URLs within each category', () => {
			linksData.forEach((category) => {
				const urls = category.links.map((l) => l.url);
				const uniqueUrls = new Set(urls);
				expect(urls.length).toBe(uniqueUrls.size);
			});
		});

		it('should have valid link titles (not empty strings)', () => {
			linksData.forEach((category) => {
				category.links.forEach((link) => {
					expect(link.title.trim().length).toBeGreaterThan(0);
				});
			});
		});

		it('should have valid descriptions (not empty strings)', () => {
			linksData.forEach((category) => {
				category.links.forEach((link) => {
					expect(link.description.trim().length).toBeGreaterThan(0);
				});
			});
		});
	});

	describe('Expected Categories', () => {
		it('should have Social category', () => {
			const socialCategory = linksData.find((c) => c.name === 'Social');
			expect(socialCategory).toBeDefined();
		});

		it('should have Code category', () => {
			const codeCategory = linksData.find((c) => c.name === 'Code');
			expect(codeCategory).toBeDefined();
		});

		it('should have Writing category', () => {
			const writingCategory = linksData.find((c) => c.name === 'Writing');
			expect(writingCategory).toBeDefined();
		});

		it('should have Other category', () => {
			const otherCategory = linksData.find((c) => c.name === 'Other');
			expect(otherCategory).toBeDefined();
		});
	});

	describe('Total Links Count', () => {
		it('should have at least 10 total links', () => {
			const totalLinks = linksData.reduce((sum, category) => sum + category.links.length, 0);
			expect(totalLinks).toBeGreaterThanOrEqual(10);
		});
	});
});
