import { expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { farmableTradeMaterialIds } from '../data/trading';
import { addFarmableInputs } from './farming-selection';

const selected = ['70303004', '70405111'] as const; // Fine Archeum and an existing boss-material choice.
const brutalNightmare = catalog.items.find(item => item.name === 'Brutal Nightmare')!.id;

test('additive setup preserves all existing selections, even when removal is proposed', () => {
  expect(addFarmableInputs(selected, selected)).toEqual([...selected]);
  expect(addFarmableInputs(selected, [])).toEqual([...selected]);
  expect(addFarmableInputs(selected, [selected[0]])).toEqual([...selected]);
});

test('supported boss additions retain existing farming choices without duplicates or mutation', () => {
  expect(farmableTradeMaterialIds.has(brutalNightmare)).toBe(true);
  expect(addFarmableInputs(selected, [...selected, brutalNightmare, brutalNightmare])).toEqual([...selected, brutalNightmare]);
  expect(selected).toEqual(['70303004', '70405111']);
});

test('all basic material families and tiers can be added without losing existing choices', () => {
  for (const tier of ['Standard', 'Fine', 'Superior']) {
    for (const family of ['Lumber', 'Additive', 'Ingot', 'Leather', 'Textile', 'Archeum', 'Stone']) {
      const item = catalog.items.find(item => item.name === `${tier} ${family}`)!;
      const next = addFarmableInputs(selected, [item.id]);
      expect(next).toEqual(selected.some(id => id === item.id) ? [...selected] : [...selected, item.id]);
    }
  }
});

test('additive setup cannot introduce unsupported inputs', () => {
  expect(addFarmableInputs(selected, ['70100005', 'not-a-catalog-item', brutalNightmare])).toEqual([...selected, brutalNightmare]);
});
