import type { Inventory } from './types';

export function parseInventory(value: string | null, validIds: ReadonlySet<string>): Inventory {
  if (value === null) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid saved inventory.');
  const inventory: Inventory = {};
  for (const [id, count] of Object.entries(parsed)) {
    if (!validIds.has(id)) continue;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid saved inventory quantity.');
    if (count > 0) inventory[id] = count;
  }
  return inventory;
}
