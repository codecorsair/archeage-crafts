import { expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { droppedTradeMaterialIds } from '../data/trading';
import { addDroppedFarming } from './farming-selection';

const selected = ['70303004', '70405111'] as const; // Fine Archeum and an existing boss-material choice.
const brutalNightmare = catalog.items.find(item => item.name === 'Brutal Nightmare')!.id;

test('dropped setup preserves all existing selections, even when removal is proposed', () => {
  expect(addDroppedFarming(selected, selected)).toEqual([...selected]);
  expect(addDroppedFarming(selected, [])).toEqual([...selected]);
  expect(addDroppedFarming(selected, [selected[0]])).toEqual([...selected]);
});

test('supported dropped additions retain existing farming choices without duplicates or mutation', () => {
  expect(droppedTradeMaterialIds.has(brutalNightmare)).toBe(true);
  expect(addDroppedFarming(selected, [...selected, brutalNightmare, brutalNightmare])).toEqual([...selected, brutalNightmare]);
  expect(selected).toEqual(['70303004', '70405111']);
});

test('dropped setup cannot introduce unsupported inputs', () => {
  expect(addDroppedFarming(selected, ['70100005', 'not-a-catalog-item', brutalNightmare])).toEqual([...selected, brutalNightmare]);
});
