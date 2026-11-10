import { describe, expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { availableTradeData } from '../data/trading';
import { attachTradePlan, createPlan, updatePlanInputs } from './plans';
import { buildFineArcheumPreset } from './trade-presets';
import { planTrades } from './trading';

function thunderDash(senior = false) {
  return updatePlanInputs(createPlan(catalog, '60211413', { id: 'thunder', name: 'My Thunder Dash', quantity: 10, now: 100 }), {
    inventory: { '70403004': 100, '70400001': 150, '70405104': 60, '70303004': 2 },
    settings: { tradeAccess: { pioneer: false, senior }, farmable: ['70203004', '70403004'], includeConflict: true },
  });
}

describe('Fine Archeum preset with the real catalog and trade network', () => {
  test('PvE-only and PvE + conflict spend at most three charges per channel per day', () => {
    const original = thunderDash();
    const before = structuredClone(original);
    const pve = buildFineArcheumPreset(catalog, original, false);
    const both = buildFineArcheumPreset(catalog, original, true);
    for (const candidate of [pve, both]) {
      const trade = candidate.trade!;
      expect(candidate.settings.farmable).toEqual(['70303004']);
      expect(candidate.settings.tradeAccess.pioneer).toBe(true);
      expect(trade.stale).toBe(false);
      expect(trade.data.sample).toBe(false);
      expect(trade.plan.runs.length).toBeGreaterThan(3);
      expect(trade.plan.inputs.filter((input) => input.farm > 0).map((input) => input.itemId)).toEqual(['70303004']);
      for (const channel of ['pve', 'conflict']) for (let day = 1; day <= trade.plan.days; day += 1) {
        expect(trade.plan.runs.filter((run) => run.channel === channel && run.day === day).length).toBeLessThanOrEqual(3);
      }
    }
    expect(pve.settings.includeConflict).toBe(false);
    expect(pve.trade!.plan.runs.every((run) => run.channel === 'pve')).toBe(true);
    expect(pve.trade!.plan.days).toBeGreaterThan(1);
    expect(both.settings.includeConflict).toBe(true);
    expect(both.trade!.plan.runs.some((run) => run.channel === 'conflict')).toBe(true);
    expect(both.trade!.plan.days).toBeLessThan(pve.trade!.plan.days);
    expect(original).toEqual(before);
  });

  for (const senior of [false, true]) test(`preserves Senior=${senior}, Master settings and all unrelated plan fields`, () => {
    const original = thunderDash(senior);
    original.settings.master = { Wildcraft: true, Cloth: false, Refining: true, Smelting: false };
    original.updatedAt = 200;
    const before = structuredClone(original);
    const candidate = buildFineArcheumPreset(catalog, original, false);
    expect(candidate).not.toBe(original);
    expect(candidate).toEqual({ ...original, settings: {
      ...original.settings, tradeAccess: { pioneer: true, senior }, farmable: ['70303004'], includeConflict: false,
    }, trade: candidate.trade });
    const data = availableTradeData({ pioneer: true, senior });
    const expected = attachTradePlan(candidate, planTrades(catalog, data, original.recipeId, original.quantity,
      original.inventory, new Set(['70303004']), { master: original.settings.master, includeConflict: false }), data);
    expect(candidate.trade).toEqual(expected.trade);
    expect(candidate.trade!.inventorySnapshot).toEqual(original.inventory);
    expect(original).toEqual(before);
  });

  test('rebuilds an already matching preset, resetting old progress without touching the source or timestamps', () => {
    const original = buildFineArcheumPreset(catalog, thunderDash(), false);
    original.completedGathering = ['gathered'];
    original.completedCrafts = ['crafted'];
    original.trade!.completedRuns = [0];
    original.trade!.data.sample = true;
    const before = structuredClone(original);
    const rebuilt = buildFineArcheumPreset(catalog, original, false);
    expect(rebuilt).not.toBe(original);
    expect(rebuilt.trade).not.toBe(original.trade);
    expect(rebuilt.trade!.data.sample).toBe(false);
    expect(rebuilt.trade!.stale).toBe(false);
    expect(rebuilt.trade!.completedRuns).toEqual([]);
    expect(rebuilt.completedGathering).toEqual([]);
    expect(rebuilt.completedCrafts).toEqual([]);
    expect(rebuilt.createdAt).toBe(original.createdAt);
    expect(rebuilt.updatedAt).toBe(original.updatedAt);
    expect(original).toEqual(before);
  });

  test('rejects a catalog missing the stable Fine Archeum ID', () => {
    const missing = { ...catalog, items: catalog.items.filter((item) => item.id !== '70303004') };
    expect(() => buildFineArcheumPreset(missing, thunderDash(), false)).toThrow('Missing Fine Archeum');
  });
});
