import { expect, test } from 'bun:test';
import data from '../data/catalog.json';
import { calculate } from './calculator';
import { craftingPlan, gatheringPlan } from './crafting-plan';
import { DEFAULT_MASTER } from './recipe-policy';

test('shows only positive actions and total output quantities', () => {
  const result = calculate(data, '60207111', 1, { '70207001': 10, '70202003': 5 });
  const rows = craftingPlan(data, result);
  expect(rows.every((row) => row.produced > 0)).toBe(true);
  const lumber = rows.find((row) => row.itemId === '70207001')!;
  expect(lumber.produced).toBe(8);
  expect(lumber.surplus).toBe(0);
  expect(lumber.methods).toHaveLength(1);
  expect(craftingPlan(data, calculate(data, '60207111', 1, { '70307001': 1 }))).toEqual([]);
});

test('puts every crafted dependency before its consumer in a deep equipment recipe', () => {
  const rows = craftingPlan(data, calculate(data, '60211204', 1, { '70403002': 2, '70403004': 1 }));
  const positions = new Map(rows.map((row, index) => [row.itemId, index]));
  for (const [index, row] of rows.entries()) for (const input of row.inputs) {
    const dependencyIndex = positions.get(input.itemId);
    if (dependencyIndex !== undefined) expect(dependencyIndex).toBeLessThan(index);
  }
  expect(rows.at(-1)?.methods[0].recipeId).toBe('60211204');
});

test('keys distinguish quantity and allocated methods', () => {
  const normal = craftingPlan(data, calculate(data, '60207111', 1));
  const larger = craftingPlan(data, calculate(data, '60207111', 2));
  expect(normal.at(-1)?.key).not.toBe(larger.at(-1)?.key);
  const master = craftingPlan(data, calculate(data, '60207111', 1, { '70107006': 1 }, { master: { ...DEFAULT_MASTER, Wildcraft: true } }));
  expect(normal.find((row) => row.itemId === '70207001')?.key).not.toBe(master.find((row) => row.itemId === '70207001')?.key);
  expect(craftingPlan(data, calculate(data, '60207111', 1))).toEqual(normal);
});

test('gathering separates pack farming from crafting shortages with quantity-specific keys', () => {
  const result = { raw: [
    { itemId: '70203004', required: 5, used: 2, missing: 3 },
    { itemId: '70102003', required: 2, used: 2, missing: 0 },
  ] };
  const trade = { inputs: [
    { itemId: '70203004', required: 3, owned: 0, farm: 3 },
    { itemId: '70102003', required: 2, owned: 2, farm: 0 },
  ] };
  const before = structuredClone({ result, trade });
  const actions = gatheringPlan(result, trade);
  expect(actions.map(({ kind, itemId, count }) => ({ kind, itemId, count }))).toEqual([
    { kind: 'farm', itemId: '70203004', count: 3 },
    { kind: 'gather', itemId: '70203004', count: 3 },
  ]);
  expect(actions[0].key).not.toBe(actions[1].key);
  expect(gatheringPlan(result, trade)).toEqual(actions);
  expect(gatheringPlan({ raw: [{ ...result.raw[0], required: 6, missing: 4 }] })[0].key).not.toBe(actions[1].key);
  expect({ result, trade }).toEqual(before);
  expect(gatheringPlan({ raw: [] })).toEqual([]);
});

test('gathering uses actual missing raw quantities after plan inventory', () => {
  const actions = gatheringPlan(calculate(data, '60207111', 1, { '70107001': 10 }));
  expect(actions.find(action => action.itemId === '70107001')?.count).toBe(44);
  expect(actions.every(action => action.kind === 'gather' && action.count > 0)).toBe(true);
});

test('includes a final craft that uses only raw ingredients', () => {
  const rows = craftingPlan(data, calculate(data, '900002', 2));
  expect(rows).toHaveLength(1);
  expect(rows[0].inputs).toEqual([{ itemId: '79000001', count: 2 }]);
  expect(rows[0].produced).toBe(2);
});
