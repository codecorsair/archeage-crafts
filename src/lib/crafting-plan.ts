import type { Calculation, CraftMethod } from './calculator';
import type { Catalog } from './types';
import type { TradePlan } from './trading';

export type GatheringPlanRow = {
  key: string;
  progressKey: string;
  kind: 'farm' | 'gather';
  itemId: string;
  count: number;
};

/** Combine selected direct farming with pack costs; keep other shortages separate. */
export function gatheringPlan(result: Pick<Calculation, 'raw'>, trade: Pick<TradePlan, 'inputs'> | null = null, farmable: ReadonlySet<string> = new Set()): GatheringPlanRow[] {
  const actions: Omit<GatheringPlanRow, 'key' | 'progressKey'>[] = [
    ...(trade?.inputs ?? []).filter(input => input.farm > 0).map(input => ({ kind: 'farm' as const, itemId: input.itemId, count: input.farm })),
    ...result.raw.filter(need => need.missing > 0).map(need => ({ kind: 'gather' as const, itemId: need.itemId, count: need.missing })),
  ];
  for (const action of actions) {
    if (farmable.has(action.itemId)) action.kind = 'farm';
  }
  const combined = new Map<string, typeof actions[number]>();
  for (const action of actions) {
    const key = JSON.stringify([action.kind, action.itemId]);
    const existing = combined.get(key);
    if (existing) existing.count += action.count;
    else combined.set(key, { ...action });
  }
  return [...combined.values()].map(action => ({ ...action, progressKey: JSON.stringify([action.kind, action.itemId]), key: JSON.stringify([action.kind, action.itemId, action.count]) }));
}

export type CraftingPlanRow = {
  key: string;
  progressKey: string;
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
    progressKey: JSON.stringify(['craft', step.itemId]),
    itemId: step.itemId,
    produced: step.produced,
    surplus: step.leftover,
    inputs: step.inputs,
    methods: step.methods,
  }));
}
