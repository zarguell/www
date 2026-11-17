import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import rawCategories from '../../content/tools.json';

interface Tool {
  title: string;
  slug?: string;
  url?: string;
  description: string;
  badge: string;
  features: string[];
  lastModified: string;
}

interface Category {
  id: string;
  tools: Tool[];
}

const categories = rawCategories as Category[];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const allTools = categories.flatMap((category) =>
  category.tools.map((tool) => ({ ...tool, category: category.id }))
);
const localTools = allTools.filter((tool) => tool.slug);

describe('tools registry', () => {
  it('has categories and tools', () => {
    expect(categories.length).toBeGreaterThan(0);
    expect(allTools.length).toBeGreaterThanOrEqual(20);
  });

  it('has unique category ids', () => {
    const ids = categories.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tool has required metadata', () => {
    for (const tool of allTools) {
      expect(tool.title).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.badge).toBeTruthy();
      expect(tool.features.length).toBeGreaterThan(0);
      expect(tool.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every local tool has a template and an entry script', () => {
    for (const tool of localTools) {
      expect(existsSync(join(root, 'templates/tools', `${tool.slug}.html`))).toBe(true);
      const template = readFileSync(join(root, 'templates/tools', `${tool.slug}.html`), 'utf8');
      const entry = template.includes('type="py"') ? 'py-tools.ts' : `${tool.slug}.ts`;
      expect(existsSync(join(root, 'assets/js/tools', entry)), entry).toBe(true);
    }
  });
});
