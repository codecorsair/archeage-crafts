import { expect, test } from 'bun:test';
import { createPlan } from './plans';
import { LEGACY_STATE_KEYS, parseWorkbenchState, serializeWorkbenchState, WORKBENCH_STATE_KEY } from './workbench-state';
import type { Catalog } from './types';
const catalog: Catalog = { items: [{ id: 'wood', name: 'Wood' }], recipes: [{ id: 'wood', itemId: 'wood', name: 'Wood', station: 'Forest', output: 1, materials: [] }], sourceUrl: '', importedAt: '' };

test('clean v2 storage has no shared stock, capabilities, or legacy migration', () => {
  expect(WORKBENCH_STATE_KEY).toBe('archeage-craft.plans.v2');
  expect(LEGACY_STATE_KEYS).toEqual(['archeage-craft.workbench.v1', 'archeage-craft.inventory.v1']);
  expect(parseWorkbenchState(null, catalog)).toEqual({ version: 2, plans: [] });
  const state = { version: 2 as const, plans: [createPlan(catalog, 'wood', { id: 'one', now: 0 })] };
  expect(parseWorkbenchState(serializeWorkbenchState(state), catalog)).toEqual(state);
});

test('strictly rejects other formats instead of importing shared or legacy state', () => {
  for (const value of [null, [], { version: 1, plans: [], inventory: {} }, { version: 2 }, { version: 2, plans: [], inventory: {} }, { version: 2, plans: {} }, { version: 2, plans: [null] }]) {
    expect(() => parseWorkbenchState(JSON.stringify(value), catalog)).toThrow();
  }
  expect(() => parseWorkbenchState('{', catalog)).toThrow();
  expect(() => parseWorkbenchState(' '.repeat(2_000_001), catalog)).toThrow();
});
