import type { Calculation, CraftMethod } from './calculator';
import type { Catalog } from './types';
import type { TradePlan } from './trading';

export type GatheringPlanRow = {
  key: string;
  kind: 'farm' | 'gather';
  itemId: string;
  count: number;
};

/** Keep pack farming separate from crafting shortages, even for the same material. */
export function gatheringPlan(result: Pick<Calculation, 'raw'>, trade: Pick<TradePlan, 'inputs'> | null = null): GatheringPlanRow[] {
  const actions: Omit<GatheringPlanRow, 'key'>[] = [
    ...(trade?.inputs ?? []).filter(input => input.farm > 0).map(input => ({ kind: 'farm' as const, itemId: input.itemId, count: input.farm })),
    ...result.raw.filter(need => need.missing > 0).map(need => ({ kind: 'gather' as const, itemId: need.itemId, count: need.missing })),
  ];
  return actions.map(action => ({ ...action, key: JSON.stringify([action.kind, action.itemId, action.count]) }));
}

export type CraftingPlanRow = {
  key: string;
  itemId: string;
  produced: number;
  surplus: number;
  inputs: { itemId: string; count: number }[];
  methods: CraftMethod[];
};

/** Calculation aggregates parent demand first; execution reverses that order. */
export function craftingPlan(_catalog: Catalog, result: Calculation): CraftingPlanRow[] {
  return [...result.steps].reverse().filter((step) => step.produced > 0).map((step) => ({
    key: JSON.stringify([step.itemId, step.produced, step.methods.map((method) => [method.recipeId, method.batches, method.inputs])]),
    itemId: step.itemId,
    produced: step.produced,
    surplus: step.leftover,
    inputs: step.inputs,
    methods: step.methods,
  }));
}
