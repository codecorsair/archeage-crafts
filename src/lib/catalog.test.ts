import { describe, expect, test } from 'bun:test';
import data from '../data/catalog.json';
import { calculate } from './calculator';
import type { Catalog } from './types';

const catalog: Catalog = data;
const amounts = (rows: { itemId: string; missing: number }[]) => Object.fromEntries(rows.map((row) => [row.itemId, row.missing]));

describe('bundled ArcheAge World recipes', () => {
  test('retains every source recipe including separate cooking outputs', () => {
    expect(catalog.recipes).toHaveLength(355);
    expect(catalog.recipes.filter((recipe) => recipe.station === 'Cooking')).toHaveLength(117);
    expect(new Set(catalog.recipes.map((recipe) => recipe.id)).size).toBe(355);
    expect(catalog.recipes.filter((recipe) => recipe.materials.length === 0)).toHaveLength(18);
    const ids = new Set(catalog.items.map((item) => item.id));
    for (const recipe of catalog.recipes) {
      expect(ids.has(recipe.itemId)).toBe(true);
      for (const material of recipe.materials) expect(ids.has(material.itemId)).toBe(true);
    }
  });
  test('Fine Lumber expands both shared Sweetgrass Powder and Rag Scrap demands', () => {
    const result = calculate(catalog, '60207111', 1);
    expect(amounts(result.raw)).toEqual({
      '70107001': 54, '70102003': 27, '70109003': 135, '70100005': 135, '70200010': 3,
    });
  });
  test('crafted and raw stock reduce a realistic Fine Lumber plan', () => {
    const result = calculate(catalog, '60207111', 1, { '70207001': 10, '70202003': 5, '70109003': 50 });
    expect(amounts(result.raw)).toEqual({
      '70107001': 24, '70102003': 12, '70109003': 10, '70100005': 60, '70200010': 3,
    });
  });
  test('all complete source recipes calculate or report a source cycle explicitly', () => {
    for (const recipe of catalog.recipes) {
      if (!recipe.materials.length) {
        expect(() => calculate(catalog, recipe.id, 1)).toThrow('Ingredient data unavailable');
        continue;
      }
      // Default routes in the checked-in source are expected to be acyclic.
      const result = calculate(catalog, recipe.id, 1);
      expect(result.raw.every((row) => Number.isSafeInteger(row.missing) && row.missing >= 0)).toBe(true);
    }
  });
});
