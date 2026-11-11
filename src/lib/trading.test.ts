import { describe, expect, test } from 'bun:test';
import { planTrades, type TradeCatalog, type TradeReward } from './trading';
import type { Catalog } from './types';
import { tradeData } from '../data/trading';
import realCatalog from '../data/catalog.json';
import { DEFAULT_MASTER } from './recipe-policy';

const catalog: Catalog = {
  items: ['tool', 'lumber', 'ingot', 'stone', 'bone', 'logs'].map((id) => ({ id, name: id })),
  recipes: [
    { id: 'tool', itemId: 'tool', name: 'Tool', station: '', output: 1, materials: [{ itemId: 'lumber', count: 45 }, { itemId: 'ingot', count: 25 }, { itemId: 'bone', count: 2 }] },
    { id: 'lumber', itemId: 'lumber', name: 'Lumber', station: '', output: 1, materials: [{ itemId: 'logs', count: 3 }] },
  ],
  sourceUrl: '', importedAt: '',
};
const material = (itemId: string, count = 10): TradeReward => ({ kind: 'material', itemId, count });
function network(): TradeCatalog {
  return {
    sample: true,
    posts: [{ id: 'quarry', name: 'Quarry' }, { id: 'forest', name: 'Forest' }, { id: 'forge', name: 'Forge' }],
    packs: [{ id: 'stone-pack', name: 'Stone pack', originId: 'quarry', materials: [{ itemId: 'stone', count: 10 }], deliveries: [
      { destinationId: 'forest', rewards: { pve: material('lumber'), conflict: material('lumber', 20) } },
      { destinationId: 'forge', rewards: { pve: material('ingot'), conflict: material('ingot', 20) } },
    ] }],
  };
}
const plan = (inventory = {}, farmable: ReadonlySet<string> = new Set(), conflict = false, quantity = 1) => planTrades(catalog, network(), 'tool', quantity, inventory, farmable, { includeConflict: conflict });

describe('Master trade residuals', () => {
  const master = { ...DEFAULT_MASTER, Wildcraft: true };
  const target = (count: number): Catalog => ({
    ...realCatalog,
    items: [...realCatalog.items, { id: 'master-tool', name: 'Master tool' }],
    recipes: [...realCatalog.recipes, { id: 'master-tool', itemId: 'master-tool', name: 'Master tool', station: 'Engineering', output: 1, materials: [{ itemId: '70207001', count }] }],
  });
  test('trades only the residual after owned output and eligible Master', () => {
    const result = planTrades(target(35), tradeData, 'master-tool', 1, { '70107006': 1 }, new Set(['70203004']), { master });
    expect(result.rewards).toEqual([{ itemId: '70207001', count: 9 }]);
    expect(result.inputs).toEqual([{ itemId: '70203004', required: 9, owned: 0, farm: 9 }]);
    expect(result.requirements.find((need) => need.itemId === '70207001')).toEqual({ itemId: '70207001', required: 5, used: 0, missing: 5 });
    expect(result.unresolved).toEqual([]);
    const covered = planTrades(target(35), tradeData, 'master-tool', 1, { '70107006': 1, '70207001': 5 }, new Set(['70203004']), { master });
    expect(covered.runs).toEqual([]);
    const surplus = planTrades(target(5), tradeData, 'master-tool', 1, { '70107006': 1 }, new Set(['70203004']), { master });
    expect(surplus.runs).toEqual([]);
  });
  test('reserves direct rare inputs instead of spending them for Master', () => {
    const local = target(35);
    local.recipes.at(-1)!.materials.push({ itemId: '70107006', count: 1 });
    const result = planTrades(local, tradeData, 'master-tool', 1, { '70107006': 1 }, new Set(['70203004']), { master });
    expect(result.rewards).toEqual([{ itemId: '70207001', count: 36 }]);
    expect(result.unresolved).toEqual([]);
  });
  test('acquired rare rewards are not eligible owned Master inputs', () => {
    const local = target(5);
    local.recipes.at(-1)!.materials.push({ itemId: '70107006', count: 1 });
    const data: TradeCatalog = { sample: true, posts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], packs: [{ id: 'rare', name: 'Rare', originId: 'a', materials: [{ itemId: '70203004', count: 1 }], deliveries: [{ destinationId: 'b', rewards: { pve: material('70107006', 2), conflict: material('70107006', 2) } }] }] };
    const result = planTrades(local, data, 'master-tool', 1, { '70203004': 1 }, new Set(), { master });
    expect(result.rewards).toEqual([{ itemId: '70107006', count: 2 }]);
    expect(result.unresolved.some((need) => need.itemId === '70107001' && need.count > 0)).toBe(true);
    expect(result.requirements.find((need) => need.itemId === '70107006')?.required).toBe(1);
  });
  test('planned parent rewards release Master stock reservations without funding packs from rewards', () => {
    const local = target(35);
    local.recipes.push({ id: 'nested-master', itemId: 'nested-master', name: 'Nested Master', station: 'Engineering', output: 1, materials: [{ itemId: 'master-tool', count: 1 }, { itemId: '70207001', count: 5 }] });
    local.items.push({ id: 'nested-master', name: 'Nested Master' });
    const data: TradeCatalog = { sample: true, posts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], packs: [{ id: 'parent', name: 'Parent', originId: 'a', materials: [{ itemId: '70203004', count: 1 }], deliveries: [{ destinationId: 'b', rewards: { pve: material('master-tool', 1), conflict: material('master-tool', 1) } }] }] };
    const result = planTrades(local, data, 'nested-master', 1, { '70107006': 1, '70203004': 1 }, new Set(), { master });
    expect(result.rewards).toEqual([{ itemId: 'master-tool', count: 1 }]);
    expect(result.unresolved).toEqual([]);
  });
});

describe('direct trade planning', () => {
  test('groups mixed deliveries into seven-slot carts, counts actual batches, leaves bone unresolved', () => {
    const result = plan({}, new Set(['stone']));
    expect(result.runs).toHaveLength(2);
    expect(result.days).toBe(1);
    expect(result.runs[0].loads).toHaveLength(2);
    expect(result.runs[0].loads.reduce((sum, load) => sum + load.packs, 0)).toBe(7);
    expect(result.inputs).toEqual([{ itemId: 'stone', required: 80, owned: 0, farm: 80 }]);
    expect(result.rewards).toEqual([{ itemId: 'lumber', count: 50 }, { itemId: 'ingot', count: 30 }]);
    expect(result.unresolved).toEqual([{ itemId: 'bone', count: 2 }]);
    expect(result.requirements.some((need) => need.itemId === 'logs')).toBe(false);
  });

  test('without selected farming or surplus stock, returns shortages, not fake completion', () => {
    const result = plan();
    expect(result.runs).toHaveLength(0);
    expect(result.days).toBe(0);
    expect(result.unresolved).toEqual([{ itemId: 'bone', count: 2 }, { itemId: 'ingot', count: 25 }, { itemId: 'logs', count: 135 }]);
  });

  test('shares stock across deliveries and reports only the funded portion', () => {
    const inventory = { stone: 30 };
    const result = plan(inventory);
    expect(result.inputs).toEqual([{ itemId: 'stone', required: 30, owned: 30, farm: 0 }]);
    expect(result.rewards.reduce((sum, reward) => sum + reward.count, 0)).toBe(30);
    expect(result.unresolved).toEqual([{ itemId: 'bone', count: 2 }, { itemId: 'ingot', count: 25 }, { itemId: 'logs', count: 45 }]);
    expect(inventory.stone).toBe(30);
  });

  test('reserves raw and intermediate crafting stock before pack funding', () => {
    const local = structuredClone(catalog);
    local.recipes[0].materials.push({ itemId: 'stone', count: 20 });
    const result = planTrades(local, network(), 'tool', 1, { stone: 30, lumber: 45 }, new Set());
    expect(result.inputs).toEqual([{ itemId: 'stone', required: 10, owned: 10, farm: 0 }]);
    expect(result.rewards).toEqual([{ itemId: 'ingot', count: 10 }]);
    expect(result.requirements.find((need) => need.itemId === 'lumber')?.used).toBe(45);
  });

  test('uses each channel payout and three daily pickups per channel', () => {
    const pve = plan({}, new Set(['stone']), false, 10);
    const both = plan({}, new Set(['stone']), true, 10);
    expect(pve.days).toBe(4);
    expect(both.days).toBe(2);
    expect(both.runs.some((pickup) => pickup.channel === 'conflict')).toBe(true);
    for (const channel of ['pve', 'conflict']) for (let day = 1; day <= both.days; day += 1) {
      expect(both.runs.filter((pickup) => pickup.day === day && pickup.channel === channel).length).toBeLessThanOrEqual(3);
    }
    for (const pickup of both.runs) for (const load of pickup.loads) expect(load.received).toBe(load.packs * (pickup.channel === 'conflict' ? 20 : 10));
  });

  test('does not recursively craft inputs or chain acquired rewards', () => {
    const data = network();
    data.packs.push({ id: 'chain', name: 'Chain', originId: 'forest', materials: [{ itemId: 'lumber', count: 10 }], deliveries: [{ destinationId: 'forge', rewards: { pve: material('ingot'), conflict: material('ingot') } }] });
    const result = planTrades(catalog, data, 'tool', 1, {}, new Set(['stone']));
    expect(result.runs.every((pickup) => pickup.originId === 'quarry')).toBe(true);
    expect(plan({ logs: 1000 }).runs).toHaveLength(0);
  });

  test('ignores gold and other placeholders as acquisition routes', () => {
    const data = network();
    data.packs[0].deliveries[0].rewards = { pve: { kind: 'gold', min: 1, max: 2 }, conflict: { kind: 'other', label: 'Token' } };
    const result = planTrades(catalog, data, 'tool', 1, {}, new Set(['stone']), { includeConflict: true });
    expect(result.rewards).toEqual([{ itemId: 'ingot', count: 30 }]);
    expect(result.requirements.some((need) => need.itemId === 'logs')).toBe(true);
  });

  test('validates unsafe values, malformed routes, and computation limits', () => {
    expect(() => plan({ stone: -1 })).toThrow('safe integer');
    expect(() => plan({}, new Set(['stone']), false, Number.MAX_SAFE_INTEGER)).toThrow('safe integer');
    const data = network();
    data.packs[0].materials[0].count = 0;
    expect(() => planTrades(catalog, data, 'tool', 1, {}, new Set())).toThrow('positive safe integer');
    data.packs[0].materials[0].count = 10;
    data.packs[0].deliveries[0].destinationId = 'missing';
    expect(() => planTrades(catalog, data, 'tool', 1, {}, new Set())).toThrow('destination');
    expect(() => plan({}, new Set(['stone']), false, 100000)).toThrow('exceeds');
  });

  test('real Fine Lumber scenario reserves owned archeum and exposes soul fragment shortage', () => {
    const inventory = { '70203004': 40 };
    const farmable = new Set(['70203004']);
    const pve = planTrades(realCatalog, tradeData, '60207111', 10, inventory, farmable);
    const both = planTrades(realCatalog, tradeData, '60207111', 10, inventory, farmable, { includeConflict: true });
    expect(pve.runs).toHaveLength(5);
    expect(pve.days).toBe(2);
    expect(both.runs).toHaveLength(5);
    expect(both.days).toBe(1);
    expect(pve.runs.flatMap((pickup) => pickup.loads).reduce((total, load) => total + load.packs, 0)).toBe(30);
    expect(pve.inputs).toEqual([{ itemId: '70203004', required: 270, owned: 40, farm: 230 }]);
    expect(pve.unresolved).toEqual([{ itemId: '70200010', count: 30 }]);
    expect(inventory).toEqual({ '70203004': 40 });
  });

  test('expanded network supports a large normal craft without exceeding work limits', () => {
    const result = planTrades(realCatalog, tradeData, '60207111', 1000, { '70203004': 40 }, new Set(['70203004']));
    expect(result.runs).toHaveLength(429);
    expect(result.days).toBe(143);
    expect(result.inputs).toEqual([{ itemId: '70203004', required: 27000, owned: 40, farm: 26960 }]);
    expect(result.unresolved).toEqual([{ itemId: '70200010', count: 3000 }]);
  });

  test('Rare and Heroic boss routes use confirmed 3-for-3 and 1-for-1 packs', () => {
    const local: Catalog = {
      ...realCatalog,
      items: [...realCatalog.items, { id: 'boss-craft', name: 'Boss craft' }],
      recipes: [...realCatalog.recipes, { id: 'boss-craft', itemId: 'boss-craft', name: 'Boss craft', station: '', output: 1, materials: [{ itemId: '70300003', count: 6 }, { itemId: '70405104', count: 2 }] }],
    };
    const result = planTrades(local, tradeData, 'boss-craft', 1, {}, new Set(['70300001', '74045203']));
    expect(result.runs).toHaveLength(2);
    expect(result.inputs).toEqual([
      { itemId: '70300001', required: 6, owned: 0, farm: 6 },
      { itemId: '74045203', required: 2, owned: 0, farm: 2 },
    ]);
    expect(result.unresolved).toEqual([]);
    expect(result.runs.flatMap((pickup) => pickup.loads).map((load) => ({ packs: load.packs, received: load.received }))).toEqual([{ packs: 2, received: 6 }, { packs: 2, received: 2 }]);
  });

  test('user-confirmed posts and rates preserve tier and family boundaries', () => {
    expect(tradeData.sample).toBe(false);
    expect(tradeData.posts.map((post) => post.name)).toEqual(['Seaglass Harbor', "Watcher's", 'Waterdrift', 'Jubilant Village', 'Stargazer', 'Shadowpath Temple']);
    const byId = new Map(realCatalog.items.map((item) => [item.id, item]));
    const tier = (name: string) => /^(Standard|Fine|Superior) /.exec(name)?.[1];
    const sources = new Set<string>();
    for (const pack of tradeData.packs) {
      const item = byId.get(pack.materials[0].itemId)!;
      const count = item.grade === 'Grand' ? 9 : item.grade === 'Rare' ? 3 : 1;
      expect(pack.materials[0].count).toBe(count);
      sources.add(item.id);
      expect(item.name.includes('Bone')).toBe(false);
      for (const delivery of pack.deliveries) {
        expect(delivery.destinationId).not.toBe(pack.originId);
        for (const channel of ['pve', 'conflict'] as const) {
          const reward = delivery.rewards[channel];
          if (reward.kind !== 'material') throw new Error('Expected material reward');
          expect(reward.count).toBe(count);
          const destination = byId.get(reward.itemId)!;
          expect(destination.name.includes('Bone')).toBe(false);
          expect(tier(destination.name)).toBe(tier(item.name));
          if (!tier(item.name)) expect(destination.grade).toBe(item.grade);
        }
      }
    }
    expect(sources.size).toBe(36); // 21 basic items and 15 boss drops.
    const route = (source: string, target: string) => tradeData.packs.find((pack) => byId.get(pack.materials[0].itemId)?.name === source && pack.deliveries.some((delivery) => delivery.rewards.pve.kind === 'material' && byId.get(delivery.rewards.pve.itemId)?.name === target));
    expect(route('Wind Blade Claw', 'Undying Flame')?.originId).toBe('waterdrift');
    expect(route('Brutal Nightmare', 'Constellation Horn')?.originId).toBe('shadowpath-temple');
    expect(route('Fine Lumber', 'Wind Blade Claw')).toBeUndefined();
    expect(route('Standard Lumber', 'Fine Additive')).toBeUndefined();
    expect(route('Standard Archeum', 'Standard Stone')).toBeUndefined();
    expect(route('Wind Blade Claw', 'Brutal Nightmare')).toBeUndefined();
    expect(route('Superior Lumber', 'Superior Ingot')?.originId).toBe('seaglass-harbor');
    const result = planTrades(realCatalog, tradeData, realCatalog.recipes[0].id, 1, {}, new Set());
    expect(result.runs).toHaveLength(0);
  });
});


test('Thunder Dash keeps direct Superior deliveries and trades Fine ingredients for uncovered crafts', () => {
  const inventory = { '70403004': 10, '70400001': 15, '70405104': 6 };
  const result = planTrades(realCatalog, tradeData, '60211413', 1, inventory, new Set(['70303004']));
  expect(result.rewards.find((reward) => reward.itemId === '70407001')?.count).toBe(4);
  expect(result.inputs.some((input) => input.itemId === '70303004' && input.farm > 0)).toBe(true);
  expect(result.unresolved.some((need) => ['70407001', '70402003'].includes(need.itemId))).toBe(false);
  expect(result.requirements.find((need) => need.itemId === '70307001')?.required).toBe(36);
  expect(result.requirements.find((need) => need.itemId === '70302003')?.required).toBe(42);
});


test('Standard Archeum funds shared canonical Standard ingredients across Fine and Superior crafts', () => {
  const inventory = { '70403004': 10, '70400001': 15, '70405104': 6, '70202003': 9 };
  const before = structuredClone(inventory);
  const result = planTrades(realCatalog, tradeData, '60211413', 1, inventory, new Set(['70203004']), { includeConflict: true });
  expect(inventory).toEqual(before);
  expect(result.requirements.find((need) => need.itemId === '70207001')).toEqual({ itemId: '70207001', required: 648, used: 0, missing: 648 });
  // Fine Lumber's 324 + Fine Additive's 756 + Fine Bonecraft's 108.
  expect(result.requirements.find((need) => need.itemId === '70202003')).toEqual({ itemId: '70202003', required: 1188, used: 9, missing: 1179 });
  expect(result.rewards.find((reward) => reward.itemId === '70202003')?.count).toBeGreaterThanOrEqual(1179);
  expect(result.unresolved.some((need) => ['70407001', '70402003', '70307001', '70302003', '70207001', '70202003'].includes(need.itemId))).toBe(false);
  expect(result.unresolved.length).toBeGreaterThan(0);
  for (const channel of ['pve', 'conflict']) for (let day = 1; day <= result.days; day += 1) {
    expect(result.runs.filter((pickup) => pickup.channel === channel && pickup.day === day).length).toBeLessThanOrEqual(3);
  }
});

test('coalesces direct and expanded tier loads at the same origin without reward-funded inputs', () => {
  const local: Catalog = {
    ...catalog,
    recipes: [
      { ...catalog.recipes[0], materials: [{ itemId: 'lumber', count: 2 }] },
      { ...catalog.recipes[1], materials: [{ itemId: 'ingot', count: 2 }] },
    ],
  };
  const data = network();
  data.packs[0].materials = [{ itemId: 'stone', count: 1 }];
  data.packs[0].deliveries[0].rewards = { pve: material('lumber', 1), conflict: material('lumber', 2) };
  data.packs[0].deliveries.pop();
  data.packs.push({ id: 'lower', name: 'Lower', originId: 'quarry', materials: [{ itemId: 'bone', count: 1 }], deliveries: [
    { destinationId: 'forge', rewards: { pve: material('ingot', 2), conflict: material('ingot', 4) } },
  ] });
  const result = planTrades(local, data, 'tool', 1, { stone: 1 }, new Set(['bone']));
  expect(result.runs).toHaveLength(1);
  expect(result.runs[0].loads).toHaveLength(2);
  expect(result.runs[0].loads.map((load) => load.received)).toEqual([1, 2]);
  expect(result.requirements.find((need) => need.itemId === 'lumber')?.missing).toBe(2);
  expect(result.unresolved).toEqual([]);
  expect(planTrades(local, data, 'tool', 1, { lumber: 2 }, new Set()).runs).toHaveLength(0);
});

test('normalizes proportional batches and preserves shared stock before lower-tier trades', () => {
  const local: Catalog = {
    ...catalog,
    recipes: [
      { ...catalog.recipes[0], materials: [{ itemId: 'lumber', count: 2 }, { itemId: 'logs', count: 1 }] },
      { ...catalog.recipes[1], materials: [{ itemId: 'logs', count: 1 }] },
      { ...catalog.recipes[1], id: 'alternate', output: 3, materials: [{ itemId: 'logs', count: 3 }] },
      { ...catalog.recipes[1], id: 'logs', itemId: 'logs', output: 3, materials: [{ itemId: 'ingot', count: 2 }] },
    ],
  };
  const data = network();
  data.packs[0].deliveries[0].rewards = { pve: material('ingot', 1), conflict: material('ingot', 2) };
  data.packs[0].deliveries.pop();
  const result = planTrades(local, data, 'tool', 1, { logs: 1 }, new Set(['stone']));
  // Canonical Lumber uses two Logs, plus one direct Log. After owned stock,
  // a single three-output Log batch requires two Ingots.
  expect(result.requirements.find((need) => need.itemId === 'ingot')?.required).toBe(2);
  expect(result.rewards).toEqual([{ itemId: 'ingot', count: 2 }]);
  expect(result.unresolved).toEqual([]);
});


describe('protected trade continuations', () => {
  test('keeps mixed prefix loads intact and starts both channels at the global last day', () => {
    const original = plan({}, new Set(['stone']), true, 30);
    const prefix = structuredClone(original.runs.slice(0, 13));
    expect(prefix.at(-1)!.day).toBe(3);
    const costs = prefix.reduce((total, run) => total + run.loads.reduce((slots, load) => slots + load.packs * 10, 0), 0);
    const inputs = [{ itemId: 'stone', required: costs, owned: 0, farm: costs }];
    const continued = planTrades(catalog, network(), 'tool', 30, {}, new Set(['stone']), {
      includeConflict: true, continuation: { runs: prefix, inputs, bonusRewards: [{ itemId: 'lumber', count: 1 }] },
    });
    expect(continued.runs.slice(0, prefix.length)).toEqual(prefix);
    expect(continued.runs.slice(prefix.length).every(run => run.day >= 3)).toBe(true);
    const occupancy = new Map<string, number>();
    for (const run of continued.runs) {
      expect(run.loads.reduce((total, load) => total + load.packs, 0)).toBeLessThanOrEqual(7);
      const key = `${run.day}:${run.channel}`;
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
    }
    expect([...occupancy.values()].every(count => count <= 3)).toBe(true);
    expect(continued.rewards.find(reward => reward.itemId === 'lumber')!.count).toBe(
      continued.runs.flatMap(run => run.loads).filter(load => load.rewardItemId === 'lumber').reduce((total, load) => total + load.received, 0) + 1,
    );
  });
  test('bonus craft stock cannot fund a pack even when it is the required material', () => {
    const result = planTrades(catalog, network(), 'tool', 1, {}, new Set(), {
      continuation: { runs: [], inputs: [], bonusRewards: [{ itemId: 'stone', count: 1000 }] },
    });
    expect(result.runs).toEqual([]);
    expect(result.inputs).toEqual([]);
    expect(result.unresolved.some(need => need.itemId === 'logs')).toBe(true);
  });
  test('rejects overflow when a protected day seeds channel budgets', () => {
    const original = plan({}, new Set(['stone']));
    for (const day of [Number.MAX_SAFE_INTEGER, Math.floor(Number.MAX_SAFE_INTEGER / 3) + 1]) {
      const run = { ...original.runs[0], day };
      expect(() => planTrades(catalog, network(), 'tool', 2, {}, new Set(['stone']), {
        continuation: { runs: [run], inputs: original.inputs, bonusRewards: [] },
      })).toThrow('safe integer');
    }
  });
  test('prefix packs count toward the 10000 limit', () => {
    const run = plan({}, new Set(['stone'])).runs[0];
    expect(() => planTrades(catalog, network(), 'tool', 1, {}, new Set(['stone']), {
      continuation: { runs: Array.from({ length: 1429 }, () => run), inputs: [], bonusRewards: [] },
    })).toThrow('10000');
  });
});
