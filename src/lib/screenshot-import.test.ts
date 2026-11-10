import { describe, expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { applySessionReconciliation, mergeScreenshotObservations, type ScreenshotObservation, type ScreenshotReviewState } from './screenshot-import';
import { ICON_VECTOR_LENGTH } from './screenshot-references';
import { rankScreenshotArtwork } from './screenshot-vision';

const sandstorm = '74045201';
const blade = '72000016';
const fur = '70200008';
const validIds = new Set(catalog.items.map(item => item.id));
const sample: ScreenshotObservation[] = [
  { id: 'bag-1', container: 'bag', itemId: sandstorm, count: 3 },
  { id: 'storage-1', container: 'storage', itemId: sandstorm, count: 11 },
  { id: 'bag-2', container: 'bag', itemId: blade, count: 60 },
  { id: 'storage-2', container: 'storage', itemId: blade, count: 560 },
  { id: 'bag-3', container: 'bag', itemId: fur, count: 8 },
  { id: 'storage-3', container: 'storage', itemId: fur, count: 61 },
];
const merge = (observations: readonly ScreenshotObservation[]) => mergeScreenshotObservations(observations, validIds);

type ReviewSighting = ScreenshotReviewState & { count: number | null; countUncertain: boolean };

describe('session identity reconciliation', () => {
  test('conflicting manual identities revoke a third automatic assignment without changing counts', () => {
    const hornA = '70405110';
    const hornB = '70405104';
    const sharedIcon = catalog.items.find(item => item.id === hornA)?.icon;
    expect(sharedIcon).toBeTruthy();
    expect(sharedIcon).toBe(catalog.items.find(item => item.id === hornB)?.icon);
    const vector = Array.from({ length: ICON_VECTOR_LENGTH }, () => 1 / Math.sqrt(ICON_VECTOR_LENGTH));
    const initial: ReviewSighting[] = ['first', 'second', 'third'].map(id => ({ id, itemId: null, dismissed: false, reviewed: false, corrected: false, sessionMatched: false, count: 7, countUncertain: false }));
    const manualFirst = initial.map((slot, index) => index === 0 ? { ...slot, itemId: hornA, reviewed: true, corrected: true } : slot);
    const propagated = applySessionReconciliation(manualFirst, new Map([['second', hornA], ['third', hornA]]));
    expect(propagated.slice(1).map(slot => [slot.itemId, slot.reviewed, slot.sessionMatched])).toEqual([[hornA, true, true], [hornA, true, true]]);

    const manualSecond = propagated.map((slot, index) => index === 1 ? { ...slot, itemId: hornB, reviewed: true, corrected: true, sessionMatched: false } : slot);
    const ranking = rankScreenshotArtwork([vector], [
      { itemIds: [hornA], vector, kind: 'learned' },
      { itemIds: [hornB], vector, kind: 'learned' },
    ]);
    expect(ranking.candidates[0].score - ranking.candidates[1].score).toBe(0);
    const resolved = applySessionReconciliation(manualSecond, new Map<string, string>());
    expect(resolved[0]).toMatchObject({ itemId: hornA, corrected: true, reviewed: true });
    expect(resolved[1]).toMatchObject({ itemId: hornB, corrected: true, reviewed: true });
    expect(resolved[2]).toMatchObject({ itemId: null, reviewed: false, sessionMatched: false, count: 7, countUncertain: false });
    expect(initial.every(slot => slot.itemId === null)).toBe(true);
  });

  test('missing evidence clears only automatic identities and preserves dismissal and quantity uncertainty', () => {
    const base: ReviewSighting = { id: 'auto', itemId: fur, dismissed: false, reviewed: true, corrected: false, sessionMatched: true, count: 61, countUncertain: true };
    const manual = { ...base, id: 'manual', corrected: true, sessionMatched: false };
    const dismissed = { ...base, id: 'dismissed', dismissed: true, count: null };
    const bundled = { ...base, id: 'bundled', sessionMatched: false };
    const result = applySessionReconciliation([base, manual, dismissed, bundled], new Map<string, string>());
    expect(result[0]).toMatchObject({ itemId: null, reviewed: false, sessionMatched: false, count: 61, countUncertain: true });
    expect(result.slice(1)).toEqual([manual, dismissed, bundled]);
    const rematched = applySessionReconciliation(result, new Map([['auto', fur], ['manual', blade], ['dismissed', blade]]));
    expect(rematched[0]).toMatchObject({ itemId: fur, reviewed: true, count: 61, countUncertain: true });
    expect(rematched.slice(1)).toEqual([manual, dismissed, bundled]);
  });
});

describe('screenshot batch replacement preview', () => {
  test('sums real catalog stacks across Bag and Storage without mutating input', () => {
    const frozen = sample.map(observation => Object.freeze({ ...observation }));
    expect(merge(Object.freeze(frozen))).toEqual({
      inventory: { [sandstorm]: 14, [blade]: 620, [fur]: 69 }, conflicts: [], unresolved: [],
    });
    expect(catalog.items.find(item => item.id === sandstorm)?.name).toBe('Howling Sandstorm');
    expect(catalog.items.find(item => item.id === blade)?.name).toBe('Shattered Blade');
  });

  test('repeated screenshots and overlapping scroll subsets do not increase counts', () => {
    const repeats = [...sample, ...sample.slice(2), sample[0]!].map((observation, index) => ({ ...observation, id: `slot-${index}` }));
    expect(merge(repeats)).toEqual(merge(sample));
  });

  test('different same-side counts conflict even with a matching third repeat', () => {
    const result = merge([
      ...sample,
      { id: 'changed', container: 'bag', itemId: sandstorm, count: 4 },
      { id: 'repeat', container: 'bag', itemId: sandstorm, count: 3 },
    ]);
    expect(result.conflicts).toEqual([{ container: 'bag', itemId: sandstorm, counts: [3, 4] }]);
    expect(result.inventory).toEqual({ [blade]: 620, [fur]: 69 });
    expect(merge([
      ...sample,
      { id: 'changed', container: 'storage', itemId: fur, count: 62 },
    ]).conflicts).toEqual([{ container: 'storage', itemId: fur, counts: [61, 62] }]);
  });

  test('unknown items need explicit dismissal and unreadable counts never become one', () => {
    const observations: ScreenshotObservation[] = [
      { id: 'unsupported', container: 'bag', itemId: 'lycaon-unsupported', count: 5 },
      { id: 'unidentified', container: 'storage', itemId: null, count: 8 },
      { id: 'unreadable', container: 'bag', itemId: fur, count: null },
    ];
    expect(merge(observations)).toEqual({ inventory: {}, conflicts: [], unresolved: [
      { observationId: 'unsupported', reason: 'unknown-item' },
      { observationId: 'unidentified', reason: 'unknown-item' },
      { observationId: 'unreadable', reason: 'unreadable-count' },
    ] });
    expect(merge(observations.map(observation => ({ ...observation, dismissed: true })))).toEqual({ inventory: {}, conflicts: [], unresolved: [] });
  });

  test('rejects invalid quantities and cross-container overflow', () => {
    for (const count of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(merge([{ id: 'bad', container: 'bag', itemId: fur, count }])).toEqual({
        inventory: {}, conflicts: [], unresolved: [{ observationId: 'bad', reason: 'invalid-count' }],
      });
    }
    expect(merge([
      { id: 'large', container: 'bag', itemId: fur, count: Number.MAX_SAFE_INTEGER },
      { id: 'extra', container: 'storage', itemId: fur, count: 1 },
    ])).toEqual({ inventory: {}, conflicts: [], unresolved: [
      { observationId: 'large', reason: 'total-overflow' },
      { observationId: 'extra', reason: 'total-overflow' },
    ] });
    expect(merge([{ id: 'safe', container: 'bag', itemId: fur, count: Number.MAX_SAFE_INTEGER }]).inventory[fur]).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('allows an empty or zero preview, not implicit permission to clear inventory', () => {
    expect(merge([])).toEqual({ inventory: {}, conflicts: [], unresolved: [] });
    expect(merge([{ id: 'zero', container: 'bag', itemId: fur, count: 0 }]).inventory).toEqual({});
  });

  test('fails closed on malformed runtime observations and duplicate observation IDs', () => {
    const malformed: unknown[] = [null, {}, { ...sample[0], container: 'bank' },
      { ...sample[0], id: '' }, { ...sample[0], count: '3' },
      { ...sample[0], itemId: 123 }, { ...sample[0], dismissed: 'yes' }];
    for (const observation of malformed) {
      expect(() => merge([observation as ScreenshotObservation])).toThrow();
    }
    expect(() => merge([sample[0]!, sample[0]!])).toThrow();
    expect(() => merge(null as unknown as ScreenshotObservation[])).toThrow();
  });
});
