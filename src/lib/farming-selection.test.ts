import { expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { farmableTradeMaterialIds } from '../data/trading';
import { updateFarmableInputs } from './farming-selection';

const selected = ['70303004', '70405111'] as const;
const brutalNightmare = catalog.items.find(item => item.name === 'Brutal Nightmare')!.id;

test('explicit removals keep only the remaining choices, including removing the final item', () => {
  expect(updateFarmableInputs(selected, selected)).toEqual([...selected]);
  expect(updateFarmableInputs(selected, [selected[0]])).toEqual([selected[0]]);
  expect(updateFarmableInputs(selected, [])).toEqual([]);
  expect(updateFarmableInputs(['70403004'], [])).toEqual([]); // Superior Archeum from the reported case.
  expect(selected).toEqual(['70303004', '70405111']);
});

test('adding a supported boss drop retains other choices without duplicates or mutation', () => {
  expect(farmableTradeMaterialIds.has(brutalNightmare)).toBe(true);
  expect(updateFarmableInputs(selected, [...selected, brutalNightmare, brutalNightmare])).toEqual([...selected, brutalNightmare]);
  expect(selected).toEqual(['70303004', '70405111']);
});

test('all basic material families and tiers can be added without losing other choices', () => {
  for (const tier of ['Standard', 'Fine', 'Superior']) {
    for (const family of ['Lumber', 'Additive', 'Ingot', 'Leather', 'Textile', 'Archeum', 'Stone']) {
      const item = catalog.items.find(item => item.name === `${tier} ${family}`)!;
      const next = updateFarmableInputs(selected, [...selected, item.id]);
      expect(next).toEqual(selected.some(id => id === item.id) ? [...selected] : [...selected, item.id]);
    }
  }
});

test('selection changes reject unsupported new inputs', () => {
  expect(updateFarmableInputs(selected, [...selected, '70100005', 'not-a-catalog-item', brutalNightmare])).toEqual([...selected, brutalNightmare]);
});
