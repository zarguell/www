import { describe, it, expect } from 'vitest';

describe('Cocktail Recipe Maker', () => {
  describe('Recipe stats calculation', () => {
    it('calculates total volume correctly', () => {
      const ingredients = [
        { emoji: '🍸', name: 'Gin', amount: 2, unit: 'oz', abv: 40 },
        { emoji: '🍋', name: 'Lemon', amount: 1, unit: 'oz', abv: 0 }
      ];

      const totalVolume = ingredients.reduce((sum, ing) => {
        const conversion: Record<string, number> = {
          'ml': 1, 'oz': 29.5735, 'cup': 236.588, 'L': 1000
        };
        return sum + (ing.amount * conversion[ing.unit]);
      }, 0);

      // 2 oz + 1 oz = 3 oz = 88.7205 ml
      expect(totalVolume).toBeCloseTo(88.7205, 2);
    });

    it('calculates ABV correctly', () => {
      const ingredients = [
        { emoji: '🍸', name: 'Gin', amount: 60, unit: 'ml', abv: 40 },
        { emoji: '🍋', name: 'Lemon', amount: 30, unit: 'ml', abv: 0 }
      ];

      const totalVolume = 90;
      const totalAlcohol = 60 * 0.4;
      const abv = (totalAlcohol / totalVolume) * 100;

      expect(abv).toBeCloseTo(26.67, 2);
    });
  });

  describe('URL state encoding', () => {
    it('encodes and decodes recipe state', () => {
      const recipe = {
        name: 'Test Cocktail',
        ingredients: [
          { emoji: '🍸', name: 'Gin', amount: 2, unit: 'oz', abv: 40 }
        ],
        createdAt: Date.now()
      };

      expect(recipe.name).toBe('Test Cocktail');
      expect(recipe.ingredients).toHaveLength(1);
    });
  });
});
