import { describe, it, expect } from 'vitest';
import links from '../../content/links.json';

describe('Links data', () => {
  it('has categories with valid links', () => {
    expect(links.categories.length).toBeGreaterThan(0);
    for (const category of links.categories) {
      expect(category.name).toBeTruthy();
      expect(category.links.length).toBeGreaterThan(0);
      for (const link of category.links) {
        expect(link.title.trim()).toBeTruthy();
        expect(link.description.trim()).toBeTruthy();
        expect(link.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it('has cool finds with dates and tags', () => {
    expect(links.coolFinds.length).toBeGreaterThan(0);
    for (const item of links.coolFinds) {
      expect(item.title.trim()).toBeTruthy();
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.tags.length).toBeGreaterThan(0);
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
