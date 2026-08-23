import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { toolsData, type Tool } from '../tools';

// <repo>/src/src/data/__tests__ -> <repo>/src/src/pages/tools
const toolsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../pages/tools');

const allTools: Array<Tool & { category: string }> = toolsData.flatMap((c) =>
	c.tools.map((t) => ({ ...t, category: c.id }))
);
const localTools = allTools.filter((t) => t.slug !== undefined);

function pageExists(slug: string): boolean {
	return existsSync(join(toolsDir, `${slug}.astro`));
}

function pagesOnDisk(): string[] {
	return readdirSync(toolsDir)
		.filter((f) => f.endsWith('.astro') && f !== 'index.astro' && !f.includes('.test.'))
		.map((f) => f.replace(/\.astro$/, ''));
}

describe('tools registry', () => {
	it('has at least one category with tools', () => {
		expect(toolsData.length).toBeGreaterThan(0);
		expect(allTools.length).toBeGreaterThanOrEqual(15);
	});

	it('has unique category ids', () => {
		const ids = toolsData.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every tool has required metadata', () => {
		for (const t of allTools) {
			expect(t.title, `${t.slug ?? t.url}: title`).toBeTruthy();
			expect(t.description.length, `${t.slug}: description`).toBeGreaterThan(10);
			expect(t.badge, `${t.slug}: badge`).toBeTruthy();
			expect(t.features.length, `${t.slug}: features`).toBeGreaterThan(0);
			expect(t.lastModified, `${t.slug}: lastModified`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('lastModified values parse as real dates', () => {
		for (const t of allTools) {
			const d = new Date(t.lastModified);
			expect(Number.isNaN(d.getTime()), `${t.slug}: bad date ${t.lastModified}`).toBe(false);
		}
	});

	it('slugs are unique and kebab-case', () => {
		const slugs = localTools.map((t) => t.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const s of slugs) {
			expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});

	it('every registered slug has a page file', () => {
		const missing = localTools.filter((t) => !pageExists(t.slug!)).map((t) => t.slug);
		expect(missing, `registry entries without pages: ${missing.join(', ')}`).toEqual([]);
	});

	it('every tool page on disk is registered', () => {
		const registered = new Set(localTools.map((t) => t.slug));
		const orphans = pagesOnDisk().filter((s) => !registered.has(s));
		expect(orphans, `pages missing from registry: ${orphans.join(', ')}`).toEqual([]);
	});

	it('external-url tools do not also carry a slug', () => {
		const external = allTools.filter((t) => t.url !== undefined);
		expect(external.length).toBeGreaterThan(0);
		for (const t of external) {
			expect(t.url).toMatch(/^https:\/\//);
			expect(t.slug).toBeUndefined();
		}
	});
});
