import { expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { availableTradeData } from '../data/trading';
import { calculate } from './calculator';
import { craftingPlan, gatheringPlan } from './crafting-plan';
import { attachTradePlan, changeTaskProgress, createPlan, updatePlanInputs } from './plans';
import { planTrades } from './trading';

const fineArcheum = '70303004';
const farmable = new Set([fineArcheum]);

test('weapon farming includes direct Fine Archeum plus pack costs, never crafting it', () => {
  const data = availableTradeData({ pioneer: true, senior: false });
  const inventory = { [fineArcheum]: 2 };
  const trade = planTrades(catalog, data, '60211413', 1, inventory, farmable);
  const result = calculate(catalog, '60211413', 1, inventory, { farmableItems: farmable });
  expect(result.steps.some(step => step.itemId === fineArcheum)).toBe(false);
  const direct = result.raw.find(row => row.itemId === fineArcheum)!;
  expect(direct.missing).toBeGreaterThan(0);
  expect(trade.rewards.some(row => row.itemId === fineArcheum)).toBe(false);
  const actions = gatheringPlan(result, trade, farmable);
  const farming = actions.filter(row => row.itemId === fineArcheum);
  expect(farming).toHaveLength(1);
  expect(farming[0].kind).toBe('farm');
  expect(farming[0].count).toBe(direct.missing + (trade.inputs.find(row => row.itemId === fineArcheum)?.farm ?? 0));
  let plan = createPlan(catalog, '60211413');
  plan = updatePlanInputs(plan, { inventory, settings: { ...plan.settings, farmable: [...farmable], tradeAccess: { pioneer: true, senior: false } } });
  plan = attachTradePlan(plan, trade, data);
  expect(() => changeTaskProgress(catalog, plan, farming[0].progressKey, 'complete')).not.toThrow();
  expect(craftingPlan(catalog, result).at(-1)?.methods[0].recipeId).toBe('60211413');
});

test('farming never bypasses an explicitly requested target', () => {
  const recipe = catalog.recipes.find(row => row.itemId === fineArcheum)!;
  const result = calculate(catalog, recipe.id, 1, {}, { farmableItems: farmable });
  expect(result.steps.some(step => step.itemId === fineArcheum)).toBe(true);
});
