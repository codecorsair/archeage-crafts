import { expect, test } from 'bun:test';
import { calculate } from './calculator';
import { craftingPlan, gatheringPlan } from './crafting-plan';
import { attachTradePlan, changeTaskProgress, clearTaskProgress, createPlan, hasTaskProgress, parsePlans, projectPlanStock, setTradeBonus, taskProgress, updatePlanInputs } from './plans';
import type { Catalog } from './types';
import { planTrades, type TradeCatalog } from './trading';
import real from '../data/catalog.json';

const catalog: Catalog = { items: ['ore', 'wood', 'sword'].map(id => ({ id, name: id })), recipes: [
  { id: 'sword', itemId: 'sword', name: 'Sword', station: 'Forge', output: 1, materials: [{ itemId: 'wood', count: 3 }] },
], sourceUrl: '', importedAt: '' };
const fresh = () => createPlan(catalog, 'sword', { quantity: 1000, now: 100 });
const rows = (plan: ReturnType<typeof fresh>) => {
  const stock = projectPlanStock(plan);
  const result = calculate(catalog, plan.recipeId, plan.quantity, stock.craft, { master: plan.settings.master, masterInventory: stock.owned });
  return [...gatheringPlan(result, plan.trade && !plan.trade.stale ? plan.trade.plan : null), ...craftingPlan(catalog, result)];
};

test('batches count units, cap, reset and never mutate stock, graph or timestamps', () => {
  const plan = fresh(), task = rows(plan)[0], snapshot = structuredClone(plan);
  let next = changeTaskProgress(catalog, plan, task.progressKey, { add: 1000 });
  expect(taskProgress(next, task)).toEqual({ done: 1000, remaining: 2000, complete: false });
  next = changeTaskProgress(catalog, next, task.progressKey, { add: 3000 });
  expect(taskProgress(next, task)).toEqual({ done: 3000, remaining: 0, complete: true });
  expect(changeTaskProgress(catalog, next, task.progressKey, 'complete')).toBe(next);
  expect(changeTaskProgress(catalog, next, task.progressKey, { add: 1 })).toBe(next);
  expect(next.inventory).toBe(plan.inventory); expect(next.settings).toBe(plan.settings);
  expect(rows(next)).toEqual(rows(plan)); expect(next.updatedAt).toBe(plan.updatedAt);
  expect(plan).toEqual(snapshot);
  next = changeTaskProgress(catalog, next, task.progressKey, { set: 0 });
  expect(taskProgress(next, task).done).toBe(0);
  for (const add of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => changeTaskProgress(catalog, next, task.progressKey, { add })).toThrow();
  for (const set of [-1, 0.5, NaN, 3001]) expect(() => changeTaskProgress(catalog, next, task.progressKey, { set })).toThrow();
  expect(() => changeTaskProgress(catalog, next, '["farm","wood"]', 'complete')).toThrow();
});

test('exact legacy marks materialize only when edited; explicit zero wins', () => {
  const plan = fresh(), [gather, craft] = rows(plan);
  plan.completedGathering = [gather.key, 'unmatched']; plan.completedCrafts = [craft.key];
  expect(taskProgress(plan, gather).done).toBe(3000);
  expect(changeTaskProgress(catalog, plan, gather.progressKey, 'complete')).toBe(plan);
  const next = changeTaskProgress(catalog, plan, gather.progressKey, { set: 0 });
  expect(next.completedGathering).toEqual(['unmatched']); expect(next.completedCrafts).toEqual([craft.key]);
  expect(taskProgress({ ...plan, progress: { [gather.progressKey]: 0 } }, gather).done).toBe(0);
  expect(hasTaskProgress(next)).toBe(true);
  expect(hasTaskProgress(clearTaskProgress(next))).toBe(false);
});

test('all baseline categories reset work; semantic no-ops retain identity', () => {
  const plan = fresh(); plan.progress = { '["gather","wood"]': 1000 }; plan.completedCrafts = ['old'];
  const patches = [{ quantity: 2 }, { inventory: { ore: 1 } }, { recipeId: 'other' }, { settings: { master: { ...plan.settings.master, Cloth: true } } }, { settings: { tradeAccess: { pioneer: true, senior: false } } }, { settings: { farmable: ['ore'] } }, { settings: { includeConflict: true } }];
  for (const patch of patches) expect(hasTaskProgress(updatePlanInputs(plan, patch))).toBe(false);
  expect(updatePlanInputs(plan, { inventory: { wood: 0 } })).toBe(plan);
  plan.settings.farmable = ['ore', 'wood'];
  expect(updatePlanInputs(plan, { settings: { farmable: ['wood', 'ore'] } })).toBe(plan);
});

test('parser defaults old v2, validates canonical bounded counters, and round trips excess', () => {
  const plan = fresh(); const { progress: _, ...old } = plan;
  expect(parsePlans(JSON.stringify([old]), catalog)[0].progress).toEqual({});
  plan.progress = { '["gather","wood"]': 99999 };
  expect(parsePlans(JSON.stringify([plan]), catalog)[0]).toEqual(plan);
  const invalid = [null, [], { bad: 1 }, { '["wrong","wood"]': 1 }, { '[ "gather", "wood" ]': 1 }, { '["gather","unknown"]': 1 }, ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(n => ({ '["gather","wood"]': n })), Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [String(i), 1]))];
  for (const progress of invalid) expect(() => parsePlans(JSON.stringify([{ ...plan, progress }]), catalog)).toThrow();
});

const data: TradeCatalog = { sample: false, posts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], packs: [{ id: 'pack', name: 'Pack', originId: 'a', materials: [{ itemId: 'ore', count: 4 }], deliveries: [{ destinationId: 'b', rewards: { pve: { kind: 'material', itemId: 'wood', count: 3 }, conflict: { kind: 'gold', min: 1, max: 2 } } }] }] };
test('bonus reconciles stable counts and prunes vanished identities without changing historical flags', () => {
  const baseline = updatePlanInputs(fresh(), { quantity: 10, settings: { farmable: ['ore'] } });
  let plan = attachTradePlan(baseline, planTrades(catalog, data, 'sword', 10, {}, new Set(['ore'])), data);
  const farm = rows(plan).find(row => row.progressKey === '["farm","ore"]')!;
  plan = changeTaskProgress(catalog, plan, farm.progressKey, 'complete');
  plan.trade!.completedRuns = [0];
  const next = setTradeBonus(catalog, data, plan, 0, 0, 3);
  expect(taskProgress(next, rows(next).find(row => row.progressKey === farm.progressKey)!).done).toBe(taskProgress(plan, farm).done);
  expect(next.trade!.completedRuns).toEqual([0]); expect(next.inventory).toBe(plan.inventory);
  const shrunk = rows(next).find(row => row.progressKey === farm.progressKey)!;
  expect('count' in shrunk && shrunk.count).toBeLessThan('count' in farm ? farm.count : 0);
  const restored = setTradeBonus(catalog, data, next, 0, 0, 0);
  expect(taskProgress(restored, rows(restored).find(row => row.progressKey === farm.progressKey)!).done).toBe(taskProgress(plan, farm).done);
  // A hidden record is not resurrected by a bonus change, even when the identity returns.
  const legacy = { ...plan, progress: { '["gather","wood"]': 123 }, completedGathering: [farm.key] };
  const reconciled = setTradeBonus(catalog, data, legacy, 0, 0, 3);
  expect(reconciled.progress['["gather","wood"]']).toBeUndefined();
  expect(reconciled.completedGathering).toEqual([]);
  expect(taskProgress(reconciled, shrunk).done).toBe('count' in farm ? farm.count : 0);
});

test('same-item farm and gather are independent; disappearing tasks never resurrect', () => {
  const localData: TradeCatalog = { ...data, packs: [{ ...data.packs[0], materials: [{ itemId: 'wood', count: 1 }] }] };
  let plan = attachTradePlan(updatePlanInputs(fresh(), { quantity: 10 }), {
    requirements: [{ itemId: 'wood', required: 30, used: 0, missing: 30 }],
    runs: [{ day: 1, channel: 'pve', originId: 'a', loads: [{ packId: 'pack', destinationId: 'b', rewardItemId: 'wood', packs: 1, received: 3 }] }],
    inputs: [{ itemId: 'wood', required: 1, owned: 0, farm: 1 }], rewards: [{ itemId: 'wood', count: 3 }], unresolved: [{ itemId: 'wood', count: 27 }], days: 1,
  }, localData);
  const farm = rows(plan).find(row => row.progressKey === '["farm","wood"]')!;
  const gather = rows(plan).find(row => row.progressKey === '["gather","wood"]')!;
  plan = changeTaskProgress(catalog, plan, gather.progressKey, { add: 10 });
  expect(taskProgress(plan, farm).done).toBe(0);
  plan = changeTaskProgress(catalog, plan, farm.progressKey, 'complete');
  const hidden = setTradeBonus(catalog, localData, plan, 0, 0, 27);
  expect(hidden.progress[gather.progressKey]).toBeUndefined();
  expect(taskProgress(hidden, farm).done).toBe(1);
  const returned = setTradeBonus(catalog, localData, hidden, 0, 0, 0);
  // Replanning may fill all demand via future packs; neither form can revive the hidden count.
  expect(returned.progress[gather.progressKey]).toBeUndefined();
  expect(() => changeTaskProgress(catalog, { ...plan, trade: { ...plan.trade!, stale: true } }, farm.progressKey, 'complete')).toThrow();
});

test('same item farming and crafting counters are independent', () => {
  const local: Catalog = { ...catalog, recipes: [...catalog.recipes, { id: 'wood', itemId: 'wood', name: 'Wood', station: 'Mill', output: 2, materials: [{ itemId: 'ore', count: 1 }] }] };
  const plan = fresh();
  const result = calculate(local, plan.recipeId, plan.quantity, {});
  const farm = gatheringPlan(result, { inputs: [{ itemId: 'wood', required: 10, owned: 0, farm: 10 }] })[0];
  const craft = craftingPlan(local, result).find(row => row.itemId === 'wood')!;
  expect(farm.progressKey).not.toBe(craft.progressKey);
  plan.progress = { [farm.progressKey]: 10 };
  expect(taskProgress(plan, craft).done).toBe(0);
});

test('real ordinary and mixed Master progress uses produced units and stable identities', () => {
  const plan = createPlan(real, '60207111', { now: 100 });
  const result = calculate(real, plan.recipeId, plan.quantity, {});
  const task = craftingPlan(real, result).find(row => row.itemId === '70207001')!;
  expect(task.produced).toBeGreaterThan(1);
  const next = changeTaskProgress(real, plan, task.progressKey, 'complete');
  expect(taskProgress(next, task).done).toBe(task.produced);
  const master = calculate(real, plan.recipeId, plan.quantity, { '70107006': 1 }, { master: { ...plan.settings.master, Wildcraft: true } });
  const mixed = craftingPlan(real, master).find(row => row.itemId === task.itemId)!;
  expect(mixed.progressKey).toBe(task.progressKey);
  expect(mixed.key).not.toBe(task.key);
});
