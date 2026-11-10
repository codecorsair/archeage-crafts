import { describe, expect, test } from 'bun:test';
import { parseInventory } from './inventory';

const ids = new Set(['70107001', '70207001']);
describe('saved inventory', () => {
  test('restores known items and discards stale IDs and zeroes', () => {
    expect(parseInventory('{"70107001":120,"70207001":0,"old-id":50}', ids)).toEqual({ '70107001': 120 });
    expect(parseInventory(null, ids)).toEqual({});
  });
  test('rejects corrupted storage instead of calculating with it', () => {
    for (const value of ['{', '[]', 'null', '{"70107001":-1}', '{"70107001":1.5}', '{"70107001":"12"}']) {
      expect(() => parseInventory(value, ids)).toThrow();
    }
  });
});
