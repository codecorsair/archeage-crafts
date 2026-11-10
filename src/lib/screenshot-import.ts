import type { Inventory } from './types';

export type ScreenshotObservation = {
  id: string;
  container: 'bag' | 'storage';
  itemId: string | null;
  count: number | null;
  dismissed?: boolean;
};

export type ScreenshotReviewState = {
  id: string;
  itemId: string | null;
  dismissed: boolean;
  reviewed: boolean;
  corrected: boolean;
  sessionMatched: boolean;
};

export function isSessionReconciliationCandidate(slot: ScreenshotReviewState): boolean {
  return !slot.dismissed && !slot.corrected && (!slot.reviewed || !slot.itemId || slot.sessionMatched);
}

/** Revoke stale automatic identities, but never alter explicit choices or quantity fields. */
export function applySessionReconciliation<T extends ScreenshotReviewState>(slots: readonly T[], matches: ReadonlyMap<string, string>): T[] {
  return slots.map(slot => {
    if (!isSessionReconciliationCandidate(slot)) return slot;
    const itemId = matches.get(slot.id);
    if (itemId) return { ...slot, itemId, reviewed: true, sessionMatched: true };
    if (slot.sessionMatched) return { ...slot, itemId: null, reviewed: false, sessionMatched: false };
    return slot;
  });
}

export type ScreenshotMergeResult = {
  inventory: Inventory;
  conflicts: { container: ScreenshotObservation['container']; itemId: string; counts: number[] }[];
  unresolved: {
    observationId: string;
    reason: 'unknown-item' | 'unreadable-count' | 'invalid-count' | 'total-overflow';
  }[];
};

/**
 * Merge one unchanged session, deduplicating each item's stack within each container.
 * The inventory is a replacement preview, never an increment. Callers must block apply
 * while conflicts/unresolved remain and separately confirm empty/destructive replacement.
 * Malformed observation structure or duplicate observation IDs throws; recognition
 * uncertainties remain actionable unresolved entries. Dismissal explicitly excludes a slot.
 */
export function mergeScreenshotObservations(
  observations: readonly ScreenshotObservation[],
  validIds: ReadonlySet<string>,
): ScreenshotMergeResult {
  const result: ScreenshotMergeResult = { inventory: {}, conflicts: [], unresolved: [] };
  const seen = new Set<string>();
  const items = new Map<string, Map<ScreenshotObservation['container'], ScreenshotObservation[]>>();

  if (!Array.isArray(observations)) throw new Error('Invalid screenshot observations.');
  for (const observation of observations) {
    if (!observation || typeof observation !== 'object'
      || typeof observation.id !== 'string' || !observation.id.trim() || seen.has(observation.id)
      || (observation.container !== 'bag' && observation.container !== 'storage')
      || (observation.itemId !== null && typeof observation.itemId !== 'string')
      || (observation.count !== null && typeof observation.count !== 'number')
      || (observation.dismissed !== undefined && typeof observation.dismissed !== 'boolean')) {
      throw new Error('Invalid screenshot observation or duplicate observation ID.');
    }
    seen.add(observation.id);
    if (observation.dismissed) continue;

    if (observation.itemId === null || !validIds.has(observation.itemId)) {
      result.unresolved.push({ observationId: observation.id, reason: 'unknown-item' });
    }
    if (observation.count === null) {
      result.unresolved.push({ observationId: observation.id, reason: 'unreadable-count' });
    } else if (!Number.isSafeInteger(observation.count) || observation.count < 0) {
      result.unresolved.push({ observationId: observation.id, reason: 'invalid-count' });
    }
    if (observation.itemId === null || !validIds.has(observation.itemId)
      || observation.count === null || !Number.isSafeInteger(observation.count) || observation.count < 0) continue;

    const containers = items.get(observation.itemId)
      ?? new Map<ScreenshotObservation['container'], ScreenshotObservation[]>();
    const stack = containers.get(observation.container) ?? [];
    stack.push(observation);
    containers.set(observation.container, stack);
    items.set(observation.itemId, containers);
  }

  for (const [itemId, containers] of items) {
    let total = 0;
    let conflicted = false;
    for (const [container, stack] of containers) {
      const counts = [...new Set(stack.map(observation => observation.count!))].sort((a, b) => a - b);
      if (counts.length > 1) {
        result.conflicts.push({ container, itemId, counts });
        conflicted = true;
      } else {
        total += counts[0]!;
      }
    }
    // Never present a partial cross-container total for a conflicting item.
    if (conflicted) continue;
    if (!Number.isSafeInteger(total)) {
      for (const stack of containers.values()) {
        for (const observation of stack) {
          result.unresolved.push({ observationId: observation.id, reason: 'total-overflow' });
        }
      }
    } else if (total > 0) {
      Object.defineProperty(result.inventory, itemId, { value: total, enumerable: true, configurable: true, writable: true });
    }
  }
  return result;
}
