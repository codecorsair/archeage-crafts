import { describe, expect, test } from 'bun:test';
import catalog from './catalog.json';
import { availableTradeData, tradeData } from './trading';
import { planTrades } from '../lib/trading';

const items = new Map(catalog.items.map((item) => [item.id, item]));
const basicNames = new Set(['Standard', 'Fine', 'Superior'].flatMap((tier) =>
  ['Lumber', 'Additive', 'Ingot', 'Leather', 'Textile', 'Archeum', 'Stone'].map((material) => `${tier} ${material}`)));
const basicIds = new Set(catalog.items.filter((item) => basicNames.has(item.name)).map((item) => item.id));

describe('company rank trade availability', () => {
  for (const pioneer of [false, true]) for (const senior of [false, true]) {
    test(`Pioneer ${pioneer}, Senior ${senior} filters complete basic packs independently`, () => {
      const data = availableTradeData({ pioneer, senior });
      const allowedGrades = new Set(['Grand', ...(pioneer ? ['Rare'] : []), ...(senior ? ['Heroic'] : [])]);
      const expected = tradeData.packs.filter((pack) => {
        const item = items.get(pack.materials[0].itemId)!;
        return !basicIds.has(item.id) || allowedGrades.has(item.grade);
      });
      expect(data.packs).toEqual(expected);
      expect(data.posts).toEqual(tradeData.posts);
      expect(data.sample).toBe(false);
      for (const grade of ['Grand', 'Rare', 'Heroic']) {
        const packs = data.packs.filter((pack) => basicIds.has(pack.materials[0].itemId) && items.get(pack.materials[0].itemId)?.grade === grade);
        expect(packs.length).toBe(allowedGrades.has(grade) ? 40 : 0);
      }
      const bossPacks = tradeData.packs.filter((pack) => !basicIds.has(pack.materials[0].itemId));
      expect(bossPacks.length).toBeGreaterThan(0);
      expect(data.packs.filter((pack) => !basicIds.has(pack.materials[0].itemId))).toEqual(bossPacks);
    });
  }

  test('filtering does not mutate the full catalog or earlier results', () => {
    const before = structuredClone(tradeData);
    const access = { pioneer: false, senior: false };
    const locked = availableTradeData(access);
    const lockedBefore = structuredClone(locked);
    availableTradeData({ pioneer: true, senior: true });
    expect(tradeData).toEqual(before);
    expect(locked).toEqual(lockedBefore);
    expect(access).toEqual({ pioneer: false, senior: false });
    expect(locked.packs).not.toBe(tradeData.packs);
  });

  test('Thunder Dash crafts locked Superior and Fine materials while keeping Standard trades', () => {
    const inventory = { '70403004': 10, '70400001': 15, '70405104': 6, '70202003': 9 };
    const result = planTrades(catalog, availableTradeData({ pioneer: false, senior: false }), '60211413', 1, inventory, new Set(['70203004']), { includeConflict: true });
    for (const itemId of ['70407001', '70402003', '70307001', '70302003']) {
      // Crafted intermediates are expanded into ingredients, not direct trade requirements.
      expect(result.requirements.some((need) => need.itemId === itemId)).toBe(false);
      expect(result.rewards.some((reward) => reward.itemId === itemId)).toBe(false);
      expect(result.unresolved.some((need) => need.itemId === itemId)).toBe(false);
    }
    expect(result.requirements.find((need) => need.itemId === '70207001')?.required).toBe(1296);
    expect(result.requirements.find((need) => need.itemId === '70202003')?.required).toBe(1944);
    expect(result.rewards.find((reward) => reward.itemId === '70207001')?.count).toBeGreaterThan(0);
    expect(result.inputs.some((input) => input.itemId === '70203004' && input.farm > 0)).toBe(true);
  });
});
