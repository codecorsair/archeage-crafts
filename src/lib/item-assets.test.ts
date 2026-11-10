import { expect, test } from 'bun:test';
import data from '../data/catalog.json';

const iconDirectory = new URL('../../public/icons/', import.meta.url);

test('every catalog item and category references a bundled image', async () => {
  expect(data.items.every((item) => Boolean(item.icon))).toBe(true);
  expect(data.recipes.every((recipe) => Boolean(recipe.stationIcon))).toBe(true);
  const icons = [...new Set([
    ...data.items.flatMap(item => item.icon ? [item.icon] : []),
    ...data.recipes.flatMap(recipe => recipe.stationIcon ? [recipe.stationIcon] : []),
  ])];
  expect(icons.length).toBeGreaterThan(270);
  for (const icon of icons) {
    const file = Bun.file(new URL(icon, iconDirectory));
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeGreaterThan(12);
  }
});
