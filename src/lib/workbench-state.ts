import { MAX_PLANS_CHARS, parsePlans, type CraftPlan } from './plans';
import type { Catalog } from './types';

export const WORKBENCH_STATE_KEY = 'archeage-craft.plans.v2';
export const LEGACY_STATE_KEYS = ['archeage-craft.workbench.v1', 'archeage-craft.inventory.v1'] as const;
export type WorkbenchState = { version: 2; plans: CraftPlan[] };

/** Only the v2 record is accepted. Storage access and authorized legacy cleanup belong to the caller. */
export function parseWorkbenchState(value: string | null, catalog: Catalog): WorkbenchState {
  if (value === null) return { version: 2, plans: [] };
  if (value.length > MAX_PLANS_CHARS) throw new Error('Invalid workbench: storage size');
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('version' in parsed) || parsed.version !== 2 || !('plans' in parsed)
    || Object.keys(parsed).some((key) => key !== 'version' && key !== 'plans')) throw new Error('Invalid workbench: expected v2 plans');
  return { version: 2, plans: parsePlans(JSON.stringify(parsed.plans), catalog) };
}

export function serializeWorkbenchState(state: WorkbenchState): string {
  const value = JSON.stringify({ version: 2, plans: state.plans });
  if (value.length > MAX_PLANS_CHARS) throw new Error('Invalid workbench: storage size');
  return value;
}
