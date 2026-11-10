import { describe, expect, test } from 'bun:test';
import {
  calculate,
  type Catalog,
  type Recipe,
  type Requirement,
} from './calculator';

const item = (id: string): { id: string; name: string } => ({ id, name: id });

const catalog = (recipes: Recipe[]): Catalog => ({
  items: [...new Set(recipes.flatMap((recipe) => [recipe.itemId, ...recipe.materials.map((material) => material.itemId)]))].map(item),
  recipes,
  sourceUrl: 'test://catalog',
  importedAt: '2026-01-01T00:00:00.000Z',
});

const recipe = (
  id: string,
  itemId: string,
  output: number,
  materials: [string, number][] = [],
): Recipe => ({
  id,
  itemId,
  name: id,
  station: 'workbench',
  output,
  materials: materials.map(([materialId, count]) => ({ itemId: materialId, count })),
});

const requirement = (requirements: Requirement[], itemId: string): Requirement => {
  const result = requirements.find((entry) => entry.itemId === itemId);
  if (!result) {
    throw new Error(`Missing requirement ${itemId}`);
  }
  return result;
};

describe('external acquisition boundaries', () => {
  const recipes = [
    recipe('tool', 'tool', 1, [['lumber', 5]]),
    recipe('lumber', 'lumber', 2, [['logs', 3]]),
  ];

  test('stops intermediate expansion and uses on-hand stock at the boundary', () => {
    const result = calculate(catalog(recipes), 'tool', 2, { lumber: 4 }, { externalItems: new Set(['lumber', 'tool']) });
    expect(result.raw).toEqual([{ itemId: 'lumber', required: 10, used: 4, missing: 6 }]);
    expect(result.steps.map((step) => step.itemId)).toEqual(['tool']);
  });

  test('empty boundaries preserve existing behavior and root always expands', () => {
    const baseline = calculate(catalog(recipes), 'tool', 2);
    expect(calculate(catalog(recipes), 'tool', 2, {}, { externalItems: new Set() })).toEqual(baseline);
    expect(calculate(catalog(recipes), 'tool', 2, {}, { externalItems: new Set(['tool']) })).toEqual(baseline);
    expect(baseline.raw).toEqual([{ itemId: 'logs', required: 15, used: 0, missing: 15 }]);
  });
});

describe('calculate', () => {
  test('aggregates a shared intermediary before rounding batches', () => {
    const recipes = [
      recipe('final', 'final', 1, [['a', 1], ['c', 1]]),
      recipe('a-recipe', 'a', 1, [['shared', 1]]),
      recipe('c-recipe', 'c', 1, [['b', 1]]),
      recipe('b-recipe', 'b', 1, [['shared', 1]]),
      recipe('shared-recipe', 'shared', 2, [['ore', 1]]),
    ];

    const result = calculate(catalog(recipes), 'final', 3);

    expect(requirement(result.crafted, 'shared')).toEqual({
      itemId: 'shared',
      required: 6,
      used: 0,
      missing: 6,
    });
    expect(result.steps.find((step) => step.itemId === 'shared')).toMatchObject({
      itemId: 'shared',
      recipeId: 'shared-recipe',
      batches: 3,
      produced: 6,
      leftover: 0,
    });
    expect(requirement(result.raw, 'ore').required).toBe(3);
  });

  test('keeps stocked branches visible without expanding their demand', () => {
    const recipes = [
      recipe('final', 'final', 1, [['intermediate', 2]]),
      recipe('intermediate-recipe', 'intermediate', 1, [['ore', 5]]),
    ];

    const result = calculate(catalog(recipes), 'final', 1, { intermediate: 2 });

    expect(requirement(result.crafted, 'intermediate')).toEqual({
      itemId: 'intermediate',
      required: 2,
      used: 2,
      missing: 0,
    });
    expect(requirement(result.raw, 'ore')).toEqual({
      itemId: 'ore',
      required: 0,
      used: 0,
      missing: 0,
    });
    expect(result.steps.map(({ itemId }) => itemId)).toEqual(['final']);
  });

  test('rounds whole batches and reports leftovers', () => {
    const recipes = [recipe('potion', 'potion', 3, [['herb', 2]])];

    const result = calculate(catalog(recipes), 'potion', 7);

    expect(result.steps).toEqual([
      expect.objectContaining({ itemId: 'potion', recipeId: 'potion', batches: 3, produced: 9, leftover: 2 }),
    ]);
    expect(requirement(result.raw, 'herb')).toEqual({
      itemId: 'herb',
      required: 6,
      used: 0,
      missing: 6,
    });
  });

  test('uses inventory for the root item before expanding it', () => {
    const recipes = [recipe('sword', 'sword', 2, [['ore', 2]])];

    const result = calculate(catalog(recipes), 'sword', 5, { sword: 1 });

    expect(requirement(result.crafted, 'sword')).toEqual({
      itemId: 'sword',
      required: 5,
      used: 1,
      missing: 4,
    });
    expect(result.steps).toEqual([
      expect.objectContaining({ itemId: 'sword', recipeId: 'sword', batches: 2, produced: 4, leftover: 0 }),
    ]);
    expect(requirement(result.raw, 'ore').required).toBe(4);
  });

  test('normalizes proportional batches regardless of selected source recipe', () => {
    const recipes = [
      recipe('final', 'final', 1, [['alloy', 1]]),
      recipe('alloy-first', 'alloy', 1, [['iron', 2]]),
      recipe('alloy-second', 'alloy', 5, [['iron', 10]]),
    ];
    const source = catalog(recipes);

    expect(calculate(source, 'final', 1).steps.map(({ recipeId }) => recipeId)).toEqual([
      'final',
      'alloy-first',
    ]);
    const selected = calculate(source, 'alloy-second', 3);
    expect(selected.steps.map(({ recipeId }) => recipeId)).toEqual(['alloy-first']);
    expect(selected.steps[0].produced).toBe(3);
  });

  test('detects reachable cycles even when inventory covers the root', () => {
    const recipes = [
      recipe('root-recipe', 'root', 1, [['loop', 1]]),
      recipe('loop-recipe', 'loop', 1, [['root', 1]]),
    ];

    expect(() => calculate(catalog(recipes), 'root-recipe', 1, { root: 10, loop: 10 })).toThrow(
      'Crafting recipe cycle detected',
    );
  });

  test('uses raw inventory once and ignores irrelevant inventory keys', () => {
    const recipes = [recipe('meal', 'meal', 1, [['grain', 5]])];

    const result = calculate(catalog(recipes), 'meal', 3, { grain: 2, unrelated: -1 });

    expect(requirement(result.raw, 'grain')).toEqual({
      itemId: 'grain',
      required: 15,
      used: 2,
      missing: 13,
    });
  });

  test('rejects reachable recipes with unavailable ingredient data', () => {
    const source = catalog([recipe('unknown-food', 'food', 1)]);

    expect(() => calculate(source, 'unknown-food', 1)).toThrow(
      'Ingredient data unavailable for unknown-food',
    );
  });

  test('rejects invalid quantities, relevant inventory, and arithmetic overflow', () => {
    const source = catalog([recipe('meal', 'meal', 1, [['grain', 1]])]);

    expect(() => calculate(source, 'meal', 0)).toThrow('positive integer');
    expect(() => calculate(source, 'meal', 1.5)).toThrow('safe integer');
    expect(() => calculate(source, 'meal', Number.MAX_SAFE_INTEGER + 1)).toThrow('safe integer');
    expect(() => calculate(source, 'meal', 1, { grain: -1 })).toThrow('non-negative');

    const overflowing = catalog([
      recipe('meal', 'meal', 1, [['grain', Number.MAX_SAFE_INTEGER]]),
    ]);
    expect(() => calculate(overflowing, 'meal', 2)).toThrow('maximum safe integer');
  });
});
