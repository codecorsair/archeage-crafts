import { availableTradeData } from '../data/trading';
import { attachTradePlan, updatePlanInputs, type CraftPlan } from './plans';
import { planTrades } from './trading';
import type { Catalog } from './types';

/** Build a candidate snapshot; the caller confirms progress replacement before assigning it. */
export function buildFineArcheumPreset(catalog: Catalog, plan: CraftPlan, includeConflict: boolean): CraftPlan {
  const fineArcheumId = '70303004';
  if (!catalog.items.some((item) => item.id === fineArcheumId)) throw new Error('Missing Fine Archeum in catalog (70303004)');
  const candidate = updatePlanInputs(plan, { settings: {
    farmable: [fineArcheumId],
    tradeAccess: { ...plan.settings.tradeAccess, pioneer: true },
    includeConflict,
  } });
  const data = availableTradeData(candidate.settings.tradeAccess);
  const trade = planTrades(catalog, data, candidate.recipeId, candidate.quantity, candidate.inventory,
    new Set(candidate.settings.farmable), { master: candidate.settings.master, includeConflict });
  return attachTradePlan(candidate, trade, data);
}
