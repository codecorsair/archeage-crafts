import { describe, expect, it } from 'bun:test';
import catalogData from '../data/catalog.json';
import type { Catalog } from './types';
import { calculate } from './calculator';
import { craftingTargets, DEFAULT_MASTER, MASTER_RECIPE_IDS, PROFESSIONS } from './recipe-policy';
const catalog: Catalog = catalogData;
const options = { master: { ...DEFAULT_MASTER, Wildcraft: true } };
const recipe = craftingTargets(catalog).find((recipe) => recipe.itemId === '70207001')!;
describe('Master recipe policy', () => {
  it('uses all six explicit routes only under their real station profession', () => {
    for (const id of MASTER_RECIPE_IDS) {
      const route = catalog.recipes.find((recipe) => recipe.id === id)!;
      const owned = Object.fromEntries(route.materials.map((material) => [material.itemId, material.count]));
      for (const profession of PROFESSIONS) {
        const result = calculate(catalog, id, 5, owned, { master: { ...DEFAULT_MASTER, [profession]: true } });
        expect(result.steps[0].methods.some((method) => method.recipeId === id)).toBe(profession === route.station);
      }
    }
  });
  it('reserves real annex direct rare stone demand before Master', () => {
    const master = { ...DEFAULT_MASTER, Smelting: true };
    const reserved = calculate(catalog, '89000012', 1, { '70103005': 3 }, { master });
    expect(reserved.steps.find((step) => step.itemId === '70203001')?.methods.some((method) => method.recipeId === '60303121')).toBe(false);
    const spare = calculate(catalog, '89000012', 1, { '70103005': 4 }, { master });
    expect(spare.steps.find((step) => step.itemId === '70203001')?.methods[0].recipeId).toBe('60303121');
    expect(spare.raw.find((need) => need.itemId === '70103005')).toMatchObject({ required: 4, used: 4, missing: 0 });
  });
  it('uses ordinary fallback with Master disabled or without owned rare stock', () => {
    for (const result of [calculate(catalog, recipe.id, 35, { '70107006': 1 }), calculate(catalog, recipe.id, 35, {}, options)]) {
      expect(result.steps[0].methods).toHaveLength(1);
      expect(result.steps[0].methods[0].recipeId).not.toBe('60307121');
      expect(result.steps[0].produced).toBe(35);
    }
  });
  it('starts with every profession off and ordinary canonical targets', () => {
    expect(Object.values(DEFAULT_MASTER)).toEqual([false, false, false, false]);
    expect(craftingTargets(catalog).some((recipe) => recipe.id === '60307121')).toBe(false);
  });
  it('aggregates shared Master output demand before rounding', () => {
    const local: Catalog = {
      ...catalog,
      recipes: [...catalog.recipes,
        { id: 'shared-root', itemId: 'shared-root', name: 'Shared root', station: 'Engineering', output: 1, materials: [{ itemId: 'shared-a', count: 1 }, { itemId: 'shared-b', count: 1 }] },
        { id: 'shared-a', itemId: 'shared-a', name: 'Shared A', station: 'Engineering', output: 1, materials: [{ itemId: recipe.itemId, count: 20 }] },
        { id: 'shared-b', itemId: 'shared-b', name: 'Shared B', station: 'Engineering', output: 1, materials: [{ itemId: recipe.itemId, count: 15 }] },
      ],
    };
    const result = calculate(local, 'shared-root', 1, { '70107006': 1 }, options);
    expect(result.steps.filter((step) => step.itemId === recipe.itemId)).toHaveLength(1);
    expect(result.steps.find((step) => step.itemId === recipe.itemId)?.methods.map((method) => method.produced)).toEqual([30, 5]);
  });
  it('mixes spare owned rare inputs with ordinary production', () => {
    const step = calculate(catalog, recipe.id, 35, { '70107006': 1 }, options).steps.find((step) => step.itemId === recipe.itemId)!;
    expect(step.produced).toBe(35);
    expect(step.methods.map((method) => method.produced)).toEqual([30, 5]);
  });
  it('allows Master surplus and consumes owned output first', () => {
    const step = calculate(catalog, recipe.id, 5, { '70107006': 1 }, options).steps[0];
    expect(step.produced).toBe(30);
    expect(step.leftover).toBe(25);
    expect(calculate(catalog, recipe.id, 5, { '70107006': 1, [recipe.itemId]: 5 }, options).steps).toEqual([]);
  });
});
