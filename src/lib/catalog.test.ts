import { describe, expect, test } from 'bun:test';
import data from '../data/catalog.json';
import source from '../data/source.json';
import { calculate } from './calculator';
import type { Catalog } from './types';

const catalog: Catalog = data;
const amounts = (rows: { itemId: string; missing: number }[]) => Object.fromEntries(rows.map((row) => [row.itemId, row.missing]));

describe('bundled source recipes', () => {
  test('records the verified workbench refresh separately from retained cooking', () => {
    expect(catalog.recipes.filter((recipe) => recipe.station !== 'Cooking')).toHaveLength(238);
    expect(source).toMatchObject({
      page: 'https://raiddex.com/en/archeage-chronicles/recipes',
      source: 'https://raiddex.com/en/archeage-chronicles/crafting',
      sha256: '67ea915cdcdada79354ab3ae60d84403a595e9bc2af9d6679458fefa278860d6',
      recipes: 355, items: 414, workbenchRecipes: 238, retainedCookingRecipes: 117,
    });
    expect(source.retainedCookingAndItemDetailsFrom.sha256).toBe('7839d2d63129e086ac91556dfc40d169dff2eea2f35650aac8659bd032d4f3b2');
  });
  test('preserves all 117 cooking records exactly as before the workbench refresh', () => {
    // Digest of the original catalog's complete, ordered cooking records, not the new import.
    const cooking = catalog.recipes.filter((recipe) => recipe.station === 'Cooking');
    expect(cooking).toHaveLength(117);
    expect(new Bun.CryptoHasher('sha256').update(JSON.stringify(cooking)).digest('hex'))
      .toBe('367a1a0b150bdb989a1f756966e85c214b35c069786b7a13c82b5904a44b1f91');
  });
  test('applies the five source-confirmed renames without changing item identities', () => {
    const renames = [
      ['12701101', "Golden Tree Warden's Hat", "Golden Tree Warden's Hood"],
      ['12703401', "Garden's Mirage Shoes", "Garden's Mirage Slippers"],
      ['13102202', "Rift Defender's Longbow", "Rift Defender's Crossbow"],
      ['70300001', 'Wind Blade Claw', 'Wind Blade Claws'],
      ['70402004', 'Bellflower Dewdrop', 'Evening Dewdrop'],
    ];
    expect(source.itemRenames.map(({ itemId, formerName, name }) => [itemId, formerName, name])).toEqual(renames);
    for (const [id, formerName, name] of renames) {
      expect(catalog.items.filter((item) => item.id === id).map((item) => item.name)).toEqual([name]);
      expect(catalog.items.some((item) => item.name === formerName)).toBe(false);
      for (const recipe of catalog.recipes.filter((recipe) => recipe.itemId === id)) expect(recipe.name).toBe(name);
    }
  });
  test('keeps ordinary, bulk and Master lumber variants distinct after refresh', () => {
    expect(catalog.recipes.filter((recipe) => recipe.itemId === '70207001').map(({ id, output, materials }) => ({ id, output, materials }))).toEqual([
      { id: '60207101', output: 1, materials: [{ itemId: '70107001', count: 3 }] },
      { id: '60207131', output: 6, materials: [{ itemId: '70107001', count: 18 }] },
      { id: '60307111', output: 30, materials: [{ itemId: '70107001', count: 90 }] },
      { id: '60307121', output: 30, materials: [{ itemId: '70107006', count: 1 }] },
    ]);
  });
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
  test('Fine Lumber expands the refreshed lumber and additive inputs to Log and Wild Petal', () => {
    const result = calculate(catalog, '60207111', 1);
    expect(amounts(result.raw)).toEqual({
      '70107001': 54, '70102003': 27,
    });
  });
  test('crafted and raw stock reduce a realistic Fine Lumber plan', () => {
    const result = calculate(catalog, '60207111', 1, { '70207001': 10, '70202003': 5, '70107001': 10 });
    expect(amounts(result.raw)).toEqual({
      '70107001': 14, '70102003': 12,
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
