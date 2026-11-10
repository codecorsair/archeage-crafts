import { describe, expect, test } from 'bun:test';
import { attachTradePlan, createPlan, MAX_PLANS_CHARS, parsePlans, projectPlanInventory, toggleCraftComplete, toggleGatheringComplete, toggleRunComplete, updatePlanInputs, type CraftPlan } from './plans';
import type { Catalog } from './types';
import type { TradeCatalog, TradePlan } from './trading';

export const catalog: Catalog = { items: ['ore', 'wood', 'sword'].map((id) => ({ id, name: id })), recipes: [
  { id: 'sword', itemId: 'sword', name: 'Sword', station: 'Forge', output: 1, materials: [{ itemId: 'wood', count: 3 }] },
  { id: 'swords', itemId: 'sword', name: 'Swords', station: 'Forge', output: 10, materials: [{ itemId: 'wood', count: 30 }] },
  { id: '60306221', itemId: 'sword', name: 'Master sword', station: 'Forge', output: 10, materials: [{ itemId: 'ore', count: 1 }] },
], sourceUrl: '', importedAt: '' };
const data: TradeCatalog = { sample: false, posts: [{ id: 'mine', name: 'Mine' }, { id: 'port', name: 'Port' }], packs: [
  { id: 'pack', name: 'Ore pack', originId: 'mine', materials: [{ itemId: 'ore', count: 4 }], deliveries: [{ destinationId: 'port', rewards: { pve: { kind: 'material', itemId: 'wood', count: 3 }, conflict: { kind: 'gold', min: 1, max: 3 } } }] },
] };
const trade: TradePlan = { requirements: [{ itemId: 'wood', required: 6, used: 0, missing: 6 }], runs: [{ day: 1, channel: 'pve', originId: 'mine', loads: [{ packId: 'pack', destinationId: 'port', rewardItemId: 'wood', packs: 2, received: 6 }] }], inputs: [{ itemId: 'ore', required: 8, owned: 2, farm: 6 }], rewards: [{ itemId: 'wood', count: 6 }], unresolved: [], days: 1 };
function fresh(id = 'one') { return createPlan(catalog, 'sword', { id, now: 100 }); }
function built() { return attachTradePlan(updatePlanInputs(fresh(), { inventory: { ore: 2 } }), trade, data); }
const parse = (plans: unknown) => parsePlans(JSON.stringify(plans), catalog);

describe('plan-local state', () => {
  test('fresh plans have no inherited domain state', () => {
    const first = fresh(), second = fresh('two');
    first.inventory.ore = 99; first.settings.master.Cloth = true; first.settings.tradeAccess.senior = true; first.settings.farmable.push('ore'); first.completedGathering.push('gather:ore:1');
    expect(second.inventory).toEqual({});
    expect(second.settings).toEqual({ master: { Wildcraft: false, Cloth: false, Refining: false, Smelting: false }, tradeAccess: { pioneer: false, senior: false }, farmable: [], includeConflict: false });
    expect(second.trade).toBeNull(); expect(second.completedGathering).toEqual([]); expect(second.completedCrafts).toEqual([]);
  });
  test('ordinary aliases normalize, Master routes cannot unlock themselves', () => {
    expect(createPlan(catalog, 'swords').recipeId).toBe('sword');
    expect(() => createPlan(catalog, '60306221')).toThrow();
    expect(() => createPlan(catalog, 'missing')).toThrow();
    expect(() => createPlan(catalog, 'sword', { quantity: 0 })).toThrow();
  });
  test('progress is immutable checklist-only and never changes projection or timestamps', () => {
    const plan = built(), checked = toggleCraftComplete(toggleRunComplete(plan, 0), 'wood:6:ordinary');
    expect(plan.trade!.completedRuns).toEqual([]); expect(checked.trade!.completedRuns).toEqual([0]);
    expect(checked.inventory).toEqual({ ore: 2 }); expect(checked.trade!.stale).toBe(false);
    expect(projectPlanInventory(checked)).toEqual({ ore: 0, wood: 6 }); expect(checked.updatedAt).toBe(100);
    expect(toggleRunComplete(checked, 0).trade!.completedRuns).toEqual([]);
    expect(toggleCraftComplete(checked, 'wood:6:ordinary').completedCrafts).toEqual([]);
    expect(() => toggleRunComplete(plan, 1)).toThrow();
  });
  test('gathering progress is independent, immutable and saved without changing stock or projection', () => {
    const plan = built();
    const before = structuredClone(plan);
    const checked = toggleGatheringComplete(plan, '["gather","ore",3]');
    expect(checked.completedGathering).toEqual(['["gather","ore",3]']);
    expect(checked.inventory).toEqual(plan.inventory);
    expect(checked.completedCrafts).toEqual([]);
    expect(checked.trade!.stale).toBe(false);
    expect(projectPlanInventory(checked)).toEqual(projectPlanInventory(plan));
    expect(checked.updatedAt).toBe(plan.updatedAt);
    expect(parse([checked])).toEqual([checked]);
    expect(toggleGatheringComplete(checked, '["gather","ore",3]').completedGathering).toEqual([]);
    expect(plan).toEqual(before);
  });
  test('edits retain historical instructions and keys but pause projected rewards', () => {
    const plan = toggleCraftComplete(toggleRunComplete(built(), 0), 'wood:6:ordinary');
    for (const patch of [{ inventory: { ore: 7 } }, { quantity: 2 }, { recipeId: 'swords' }, { settings: { includeConflict: true } }]) {
      const edited = updatePlanInputs(plan, patch);
      expect(edited.trade!.stale).toBe(true); expect(edited.trade!.completedRuns).toEqual([0]);
      expect(edited.completedCrafts).toEqual(['wood:6:ordinary']); expect(edited.trade!.plan).toEqual(plan.trade!.plan);
      expect(projectPlanInventory(edited)).toEqual(edited.inventory);
    }
    expect(plan.trade!.stale).toBe(false);
  });
  test('semantic no-op inputs preserve identity, progress and current projection', () => {
    const plan = toggleRunComplete(built(), 0);
    plan.settings.farmable = ['ore', 'wood'];
    const patches = [
      {}, { recipeId: plan.recipeId }, { quantity: plan.quantity },
      { inventory: { wood: 0, ore: 2 } },
      { settings: { master: { ...plan.settings.master }, tradeAccess: { ...plan.settings.tradeAccess }, farmable: ['wood', 'ore'], includeConflict: false } },
    ];
    for (const patch of patches) {
      const next = updatePlanInputs(plan, patch);
      expect(next).toBe(plan);
      expect(next.trade!.stale).toBe(false);
      expect(next.trade!.completedRuns).toEqual([0]);
      expect(projectPlanInventory(next)).toEqual({ ore: 0, wood: 6 });
    }
    expect(updatePlanInputs(plan, { inventory: { ore: 3 } }).trade!.stale).toBe(true);
  });
  test('rebuild captures current baseline and resets all execution progress', () => {
    const old = toggleGatheringComplete(toggleCraftComplete(toggleRunComplete(built(), 0), 'old'), 'gather:ore:3');
    const edited = updatePlanInputs(old, { inventory: { ore: 9 } });
    const next = attachTradePlan(edited, trade, data);
    expect(next.completedGathering).toEqual([]); expect(next.completedCrafts).toEqual([]); expect(next.trade!.completedRuns).toEqual([]);
    expect(old.completedGathering).toEqual(['gather:ore:3']);
    expect(next.trade!.inventorySnapshot).toEqual({ ore: 9 }); expect(projectPlanInventory(next)).toEqual({ ore: 7, wood: 6 });
    expect(old.trade!.inventorySnapshot).toEqual({ ore: 2 });
    expect(next.trade!.plan).not.toBe(trade);
  });
  test('projection debits owned funding before same-item rewards and never adds farm costs', () => {
    const plan = built();
    plan.trade!.plan.rewards = [{ itemId: 'ore', count: 3 }];
    expect(projectPlanInventory(plan)).toEqual({ ore: 3 });
    plan.trade!.plan.inputs[0].owned = 3;
    expect(() => projectPlanInventory(plan)).toThrow();
    plan.trade!.plan.inputs[0].owned = 0; plan.trade!.inventorySnapshot.ore = Number.MAX_SAFE_INTEGER;
    expect(() => projectPlanInventory(plan)).toThrow();
  });
});

describe('bounded snapshot parsing', () => {
  test('round trips independent plans and stale historical progress', () => {
    const plan = updatePlanInputs(toggleCraftComplete(toggleRunComplete(built(), 0), 'action:quantity:methods'), { quantity: 2 });
    expect(parse([fresh(), { ...plan, id: 'two' }])).toEqual([fresh(), { ...plan, id: 'two' }]);
    expect(parsePlans(null, catalog)).toEqual([]);
    expect(parse([createPlan(catalog, 'swords', { id: 'alias', now: 0 })])[0].recipeId).toBe('sword');
  });
  test('existing v2 plans without gathering progress load without losing inventory or other progress', () => {
    const plan = toggleCraftComplete(toggleRunComplete(built(), 0), 'craft:wood:6');
    const existing: Record<string, unknown> = { ...plan };
    delete existing.completedGathering;
    expect(parse([existing])).toEqual([{ ...plan, completedGathering: [] }]);
    expect(() => parse([{ ...plan, completedGathering: null }])).toThrow();
    expect(() => parse([{ ...plan, completedGathering: ['same', 'same'] }])).toThrow();
  });
  test('rejects malformed, oversized, duplicate and invalid domain records', () => {
    expect(() => parsePlans('{', catalog)).toThrow();
    expect(() => parsePlans(' '.repeat(MAX_PLANS_CHARS + 1), catalog)).toThrow();
    for (const value of [{}, null, [null], Array.from({ length: 101 }, (_, i) => fresh(String(i))), [fresh(), fresh()]]) expect(() => parse(value)).toThrow();
    const mutations: ((plan: CraftPlan) => void)[] = [
      (p) => { p.quantity = 0; }, (p) => { p.inventory.unknown = 1; }, (p) => { p.inventory.ore = -1; },
      (p) => { p.settings.farmable = ['ore', 'ore']; }, (p) => { p.recipeId = '60306221'; }, (p) => { p.updatedAt = 99; },
      (p) => { p.trade!.completedRuns = [1]; }, (p) => { p.completedCrafts = ['key', 'key']; },
      (p) => { p.trade!.plan.runs[0].loads[0].received = 7; }, (p) => { p.trade!.plan.inputs[0].required = 9; },
      (p) => { p.trade!.plan.rewards[0].count = 9; }, (p) => { p.trade!.inventorySnapshot.ore = 0; },
      (p) => { p.trade!.plan.days = 2; }, (p) => { p.trade!.plan.runs[0].loads[0].packs = 8; },
      (p) => { p.trade!.data.packs[0].materials[0].count = Number.MAX_SAFE_INTEGER; },
      (p) => { p.trade!.inventorySnapshot.wood = Number.MAX_SAFE_INTEGER; p.trade!.stale = true; },
    ];
    for (const mutate of mutations) { const plan = built(); mutate(plan); expect(() => parse([plan])).toThrow(); }
  });
});
