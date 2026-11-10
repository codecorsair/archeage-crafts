import { expect, test } from 'bun:test';
import builtInReferences from '../data/screenshot-references.json';
import { ICON_VECTOR_LENGTH, parseVisualReferences, rememberVisualReference, serializeVisualReferences, type VisualReference } from './screenshot-references';

const validIds = new Set(['70200008', '70207001']);
const reference: VisualReference = {
  itemId: '70200008',
  vector: Array.from({ length: ICON_VECTOR_LENGTH }, () => 1 / Math.sqrt(ICON_VECTOR_LENGTH)),
  thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXcAAAAASUVORK5CYII=',
};
const record = (value: unknown) => JSON.stringify({ version: 1, references: [value] });

test('corrected artwork round-trips separately from inventory', () => {
  expect(parseVisualReferences(null, validIds)).toEqual([]);
  expect(parseVisualReferences(serializeVisualReferences([reference], validIds), validIds)).toEqual([reference]);
});

test('player-confirmed in-game Gnoll Fur reference satisfies the cache contract', () => {
  expect(parseVisualReferences(serializeVisualReferences(builtInReferences, validIds), validIds)[0].itemId).toBe('70200008');
});

test('relearning an item replaces only its prior visual reference', () => {
  const lumber = { ...reference, itemId: '70207001' };
  const corrected = { ...reference, vector: [...reference.vector].reverse() };
  expect(rememberVisualReference([reference, lumber], corrected)).toEqual([lumber, corrected]);
});

test('rejects corrupt, unsupported, duplicate, external, and oversized cached references', () => {
  for (const value of [
    'not json',
    JSON.stringify({ version: 2, references: [] }),
    record({ ...reference, itemId: 'unsupported:lycaon-battalion-mark' }),
    record({ ...reference, vector: [] }),
    record({ ...reference, vector: reference.vector.map(() => 0) }),
    record({ ...reference, vector: reference.vector.map(() => 2) }),
    record({ ...reference, thumbnail: 'https://example.com/icon.png' }),
    record({ ...reference, thumbnail: `data:image/png;base64,${'A'.repeat(24_000)}` }),
    JSON.stringify({ version: 1, references: [reference, reference] }),
    ' '.repeat(2_000_001),
  ]) expect(() => parseVisualReferences(value, validIds)).toThrow();
  expect(() => serializeVisualReferences([{ ...reference, vector: reference.vector.map(() => NaN) }], validIds)).toThrow();
});
