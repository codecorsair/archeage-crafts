import { describe, expect, test } from 'bun:test';
import { attachTradePlan, createPlan, MAX_PLANS_CHARS, parsePlans, projectPlanStock, setTradeBonus, toggleCraftComplete, toggleGatheringComplete, toggleRunComplete, updatePlanInputs, type CraftPlan } from './plans';
import type { Catalog } from './types';
import { planTrades, type TradeCatalog, type TradePlan } from './trading';
import realCatalog from '../data/catalog.json';
import { availableTradeData, tradeData } from '../data/trading';
import { buildFineArcheumPreset } from './trade-presets';
import { craftingPlan, gatheringPlan } from './crafting-plan';
import { calculate } from './calculator';
import { MASTER_RECIPE_IDS } from './recipe-policy';

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
    expect(projectPlanStock(checked).craft).toEqual({ ore: 0, wood: 6 }); expect(checked.updatedAt).toBe(100);
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
    expect(projectPlanStock(checked).craft).toEqual(projectPlanStock(plan).craft);
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
      expect(projectPlanStock(edited).craft).toEqual(edited.inventory);
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
      expect(projectPlanStock(next).craft).toEqual({ ore: 0, wood: 6 });
    }
    expect(updatePlanInputs(plan, { inventory: { ore: 3 } }).trade!.stale).toBe(true);
  });
  test('rebuild captures current baseline and resets all execution progress', () => {
    const old = toggleGatheringComplete(toggleCraftComplete(toggleRunComplete(built(), 0), 'old'), 'gather:ore:3');
    const edited = updatePlanInputs(old, { inventory: { ore: 9 } });
    const next = attachTradePlan(edited, trade, data);
    expect(next.completedGathering).toEqual([]); expect(next.completedCrafts).toEqual([]); expect(next.trade!.completedRuns).toEqual([]);
    expect(old.completedGathering).toEqual(['gather:ore:3']);
    expect(next.trade!.inventorySnapshot).toEqual({ ore: 9 }); expect(projectPlanStock(next).craft).toEqual({ ore: 7, wood: 6 });
    expect(old.trade!.inventorySnapshot).toEqual({ ore: 2 });
    expect(next.trade!.plan).not.toBe(trade);
  });
  test('projection debits owned funding before same-item rewards and never adds farm costs', () => {
    const plan = built();
    plan.trade!.plan.rewards = [{ itemId: 'ore', count: 3 }];
    expect(projectPlanStock(plan).craft).toEqual({ ore: 3 });
    plan.trade!.plan.inputs[0].owned = 3;
    expect(() => projectPlanStock(plan).craft).toThrow();
    plan.trade!.plan.inputs[0].owned = 0; plan.trade!.inventorySnapshot.ore = Number.MAX_SAFE_INTEGER;
    expect(() => projectPlanStock(plan).craft).toThrow();
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


describe('trade bonus continuation', () => {
  function planned(quantity = 20, ore = 20): CraftPlan {
    const plan = updatePlanInputs(fresh(), { quantity, inventory: { ore }, settings: { farmable: ['ore'] } });
    return attachTradePlan(plan, planTrades(catalog, data, plan.recipeId, plan.quantity, plan.inventory, new Set(['ore'])), data);
  }
  test('same-value edits preserve identity without protecting another run or extending history', () => {
    const original = planned(30);
    expect(setTradeBonus(catalog, data, original, 0, 0, 0)).toBe(original);
    expect(original.trade!.bonus).toBeNull();
    const bonus = setTradeBonus(catalog, data, original, 0, 0, 3);
    const completed = toggleRunComplete(bonus, 2);
    expect(setTradeBonus(catalog, data, completed, 0, 0, 3)).toBe(completed);
    expect(setTradeBonus(catalog, data, completed, 1, 0, 0)).toBe(completed);
    expect(completed.trade!.bonus!.protectedRunCount).toBe(1);
    const cleared = setTradeBonus(catalog, data, completed, 0, 0, 0);
    expect(cleared).not.toBe(completed);
    expect(cleared.trade!.bonus!.protectedRunCount).toBe(3);
    expect(cleared.trade!.bonus!.extras).toEqual([]);
    expect(setTradeBonus(catalog, data, cleared, 0, 0, 0)).toBe(cleared);
  });
  test('extra count changes future pack and farm demand without changing the protected base or inventory', () => {
    const original = planned();
    const before = structuredClone(original);
    const next = setTradeBonus(catalog, data, original, 0, 0, 3);
    expect(next.trade!.plan.runs[0]).toEqual(original.trade!.plan.runs[0]);
    expect(next.trade!.plan.runs.flatMap(run => run.loads).reduce((sum, load) => sum + load.packs, 0)).toBe(19);
    expect(next.trade!.plan.rewards).toEqual([{ itemId: 'wood', count: 60 }]);
    expect(next.trade!.plan.inputs).toEqual([{ itemId: 'ore', required: 76, owned: 20, farm: 56 }]);
    expect(next.inventory).toEqual(original.inventory);
    expect(next.trade!.inventorySnapshot).toEqual(original.inventory);
    expect(original).toEqual(before);
    expect(parse([next])).toEqual([next]);
  });
  test('completed later runs and unchecked intervening runs are frozen permanently', () => {
    const original = toggleRunComplete(planned(30), 2);
    const next = setTradeBonus(catalog, data, original, 0, 0, 30);
    expect(next.trade!.bonus!.protectedRunCount).toBe(3);
    expect(next.trade!.plan.runs.slice(0, 3)).toEqual(original.trade!.plan.runs.slice(0, 3));
    expect(next.trade!.completedRuns).toEqual([2]);
    const cleared = setTradeBonus(catalog, data, toggleRunComplete(next, 2), 0, 0, 0);
    expect(cleared.trade!.bonus!.protectedRunCount).toBe(3);
    expect(cleared.trade!.bonus!.extras).toEqual([]);
    expect(cleared.trade!.plan.runs.slice(0, 3)).toEqual(original.trade!.plan.runs.slice(0, 3));
  });
  test('reservation funding survives clear, reentry and reload', () => {
    let plan = planned(30, 37);
    plan = setTradeBonus(catalog, data, plan, 0, 0, 15);
    const reservation = structuredClone(plan.trade!.bonus!.protectedInputs);
    for (const amount of [0, 15, 0, 15]) {
      plan = parse([setTradeBonus(catalog, data, plan, 0, 0, amount)])[0];
      expect(plan.trade!.bonus!.protectedInputs).toEqual(reservation);
    }
    expect(reservation).toEqual([{ itemId: 'ore', required: 28, owned: 28, farm: 0 }]);
  });
  test('old v2 defaults bonus to null, including stale historical inventory', () => {
    const plan = updatePlanInputs(planned(), { inventory: {} });
    const legacy = structuredClone(plan) as unknown as { trade: Record<string, unknown> };
    delete legacy.trade.bonus;
    expect(parse([legacy])[0].trade!.bonus).toBeNull();
    const bonus = setTradeBonus(catalog, data, planned(), 0, 0, 3);
    expect(parse([updatePlanInputs(bonus, { inventory: {}, quantity: 1 })])[0].trade!.stale).toBe(true);
  });
  test('rejects invalid edits atomically and validates persisted reservations, extras and effective totals', () => {
    const plan = planned(), before = structuredClone(plan);
    for (const [run, load, amount] of [[-1, 0, 1], [999, 0, 1], [0, 1, 1], [0, 0, -1], [0, 0, 0.5], [0, 0, Number.MAX_SAFE_INTEGER]]) {
      expect(() => setTradeBonus(catalog, data, plan, run, load, amount)).toThrow();
    }
    expect(() => setTradeBonus(catalog, data, updatePlanInputs(plan, { quantity: 1 }), 0, 0, 1)).toThrow();
    expect(plan).toEqual(before);
    const next = setTradeBonus(catalog, data, plan, 0, 0, 3);
    const mutations: ((plan: CraftPlan) => void)[] = [
      p => { p.trade!.bonus!.extras.push({ ...p.trade!.bonus!.extras[0] }); },
      p => { p.trade!.bonus!.extras[0].runIndex = 1; },
      p => { p.trade!.bonus!.extras[0].count = 0; },
      p => { p.trade!.bonus!.protectedInputs[0].required += 1; },
      p => { p.trade!.bonus!.protectedInputs[0].owned = 1; },
      p => { p.trade!.plan.rewards[0].count += 1; },
      p => { p.trade!.bonus!.extras[0].count = Number.MAX_SAFE_INTEGER; },
    ];
    for (const mutate of mutations) { const bad = structuredClone(next); mutate(bad); expect(() => parse([bad])).toThrow(); }
  });
  test('hidden completion marks cannot resurrect when quantities return', () => {
    const plan = planned();
    const stock = projectPlanStock(plan);
    const result = calculate(catalog, plan.recipeId, plan.quantity, stock.craft, { master: plan.settings.master, masterInventory: stock.owned });
    plan.completedGathering = gatheringPlan(result, plan.trade!.plan).map(action => action.key);
    plan.completedCrafts = [...craftingPlan(catalog, result).map(action => action.key), 'hidden'];
    const changed = setTradeBonus(catalog, data, plan, 0, 0, 3);
    expect(changed.completedGathering).toEqual([]);
    expect(changed.completedCrafts).not.toContain('hidden');
    const cleared = setTradeBonus(catalog, data, changed, 0, 0, 0);
    expect(cleared.completedGathering).toEqual([]);
  });

});


test('real Wrathful Tyrants Scale continuation reduces one future Fine Lumber pack and clearing restores it', () => {
  const original = buildFineArcheumPreset(realCatalog, createPlan(realCatalog, '60211405'), false);
  const eligible = availableTradeData(original.settings.tradeAccess);
  const packs = (plan: CraftPlan) => plan.trade!.plan.runs.flatMap(run => run.loads).reduce((total, load) => total + load.packs, 0);
  expect([packs(original), original.trade!.plan.runs.length, original.trade!.plan.days]).toEqual([85, 13, 5]);
  expect(original.trade!.plan.inputs.find(input => input.itemId === '70303004')!.farm).toBe(255);
  const next = setTradeBonus(realCatalog, eligible, original, 0, 0, 3);
  expect([packs(next), next.trade!.plan.runs.length, next.trade!.plan.days]).toEqual([84, 12, 4]);
  expect(next.trade!.plan.runs[0]).toEqual(original.trade!.plan.runs[0]);
  expect(next.trade!.plan.runs[0].loads[0].received).toBe(21);
  expect(next.trade!.plan.inputs.find(input => input.itemId === '70303004')!.farm).toBe(252);
  const lumber = next.trade!.plan.runs[0].loads[0].rewardItemId;
  expect(next.trade!.plan.rewards.find(reward => reward.itemId === lumber)!.count).toBe(90);
  const clear = setTradeBonus(realCatalog, eligible, parsePlans(JSON.stringify([next]), realCatalog)[0], 0, 0, 0);
  expect([packs(clear), clear.trade!.plan.runs.length, clear.trade!.plan.days]).toEqual([85, 13, 5]);
  expect(clear.trade!.plan.inputs.find(input => input.itemId === '70303004')!.farm).toBe(255);
  expect(clear.trade!.bonus!.protectedInputs).toEqual(next.trade!.bonus!.protectedInputs);
});


test('bonus projection preserves legitimate owned Master stock but does not promote rewards to ownership', () => {
  const target: Catalog = { ...realCatalog, items: [...realCatalog.items, { id: 'master-project', name: 'Master project' }], recipes: [...realCatalog.recipes, { id: 'master-project', itemId: 'master-project', name: 'Master project', station: '', output: 1, materials: [{ itemId: '70207001', count: 35 }] }] };
  const plan = updatePlanInputs(createPlan(target, 'master-project'), { inventory: { '70107006': 1 }, settings: { master: { Wildcraft: true, Cloth: false, Refining: false, Smelting: false }, farmable: ['70203004'] } });
  const original = attachTradePlan(plan, planTrades(target, tradeData, plan.recipeId, 1, plan.inventory, new Set(plan.settings.farmable), { master: plan.settings.master }), tradeData);
  const next = setTradeBonus(target, tradeData, original, 0, 0, 3);
  const stock = projectPlanStock(next);
  expect(stock.owned['70107006']).toBe(1);
  expect(stock.owned['70207001']).toBeUndefined();
  const result = calculate(target, plan.recipeId, 1, stock.craft, { master: plan.settings.master, masterInventory: stock.owned });
  expect(result.steps.some(step => step.methods.some(method => MASTER_RECIPE_IDS.has(method.recipeId)))).toBe(true);
});


test('mixed-load edits freeze the entire prefix and historical definitions win over live rates', () => {
  const original = buildFineArcheumPreset(realCatalog, createPlan(realCatalog, '60211405'), false);
  const live = structuredClone(availableTradeData(original.settings.tradeAccess));
  const selected = original.trade!.plan.runs[4].loads[1];
  expect(original.trade!.plan.runs[4].loads).toHaveLength(2);
  const changedPack = live.packs.find(pack => pack.id === selected.packId)!;
  for (const delivery of changedPack.deliveries) if (delivery.rewards.pve.kind === 'material') delivery.rewards.pve.count = 100;
  const next = setTradeBonus(realCatalog, live, original, 4, 1, 3);
  expect(next.trade!.plan.runs.slice(0, 5)).toEqual(original.trade!.plan.runs.slice(0, 5));
  expect(next.trade!.bonus!.extras).toEqual([{ runIndex: 4, loadIndex: 1, count: 3 }]);
  expect(next.trade!.data.packs.find(pack => pack.id === selected.packId)).toEqual(original.trade!.data.packs.find(pack => pack.id === selected.packId));
  expect(parsePlans(JSON.stringify([next]), realCatalog)).toEqual([next]);
  const restored = setTradeBonus(realCatalog, live, next, 4, 1, 0);
  expect(restored.trade!.data.packs.map(pack => pack.id)).toEqual(next.trade!.data.packs.map(pack => pack.id));
  expect(restored.trade!.plan.rewards).toEqual(original.trade!.plan.rewards);
});


test('bonus rare rewards cannot unlock Master crafting', () => {
  const target: Catalog = { ...realCatalog, items: [...realCatalog.items, { id: 'rare-project', name: 'Rare project' }], recipes: [...realCatalog.recipes, { id: 'rare-project', itemId: 'rare-project', name: 'Rare project', station: '', output: 1, materials: [{ itemId: '70207001', count: 5 }, { itemId: '70107006', count: 1 }] }] };
  const data: TradeCatalog = { sample: false, posts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], packs: [{ id: 'rare-pack', name: 'Rare pack', originId: 'a', materials: [{ itemId: '70203004', count: 1 }], deliveries: [{ destinationId: 'b', rewards: { pve: { kind: 'material', itemId: '70107006', count: 2 }, conflict: { kind: 'material', itemId: '70107006', count: 2 } } }] }] };
  const plan = updatePlanInputs(createPlan(target, 'rare-project'), { inventory: { '70203004': 1 }, settings: { master: { Wildcraft: true, Cloth: false, Refining: false, Smelting: false } } });
  const original = attachTradePlan(plan, planTrades(target, data, plan.recipeId, 1, plan.inventory, new Set(), { master: plan.settings.master }), data);
  const next = setTradeBonus(target, data, original, 0, 0, 3);
  const stock = projectPlanStock(next);
  expect(stock.craft['70107006']).toBe(5);
  expect(stock.owned['70107006']).toBeUndefined();
  const result = calculate(target, plan.recipeId, 1, stock.craft, { master: plan.settings.master, masterInventory: stock.owned });
  expect(result.steps.some(step => step.methods.some(method => MASTER_RECIPE_IDS.has(method.recipeId)))).toBe(false);
});
