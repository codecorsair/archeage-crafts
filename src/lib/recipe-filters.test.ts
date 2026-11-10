import { expect, test } from 'bun:test';
import data from '../data/catalog.json';
import { filterRecipes, recipeGroups } from './recipe-filters';

const recipes = data.recipes;

test('exposes every source-defined subtype in its category', () => {
  expect(recipeGroups(recipes, 'Smithing')).toEqual(['Warrior', 'Ranger', 'Mage', 'Berserker']);
  expect(recipeGroups(recipes, 'Tailoring')).toEqual(['Light Armor', 'Heavy Armor', 'Cloth Armor']);
  expect(recipeGroups(recipes, 'Engineering')).toEqual(['Utility Tools', 'Gliders', 'Rucksacks', 'Houses', 'Annexes', 'Stations']);
  expect(recipeGroups(recipes, 'Alchemy')).toEqual(['Food', 'Throwing Weapon', 'Accessories']);
  expect(recipeGroups(recipes, 'Wildcraft')).toEqual(['Mixtures', 'Lumber']);
  expect(recipeGroups(recipes, 'Cloth')).toEqual(['Textiles', 'Leather']);
  expect(recipeGroups(recipes, 'Refining')).toEqual(['Gems', 'Bones']);
  expect(recipeGroups(recipes, 'Smelting')).toEqual(['Stone', 'Metal']);
  expect(recipeGroups(recipes, 'Cooking')).toEqual(['Boil', 'Roast', 'Raw']);
  expect(recipeGroups(recipes, 'Food')).toEqual(['Food']);
  expect(recipeGroups(recipes, 'All recipes')).toEqual([]);
});

test('combines category, class and case-insensitive recipe search', () => {
  const result = filterRecipes(recipes, { station: 'Smithing', group: 'Mage', search: '  STAFF ' });
  expect(result).toHaveLength(5);
  expect(result.every((recipe) => recipe.station === 'Smithing' && recipe.group === 'Mage')).toBe(true);
  expect(filterRecipes(recipes, { station: 'Engineering', group: 'Gliders', search: '' })).toHaveLength(3);
  expect(filterRecipes(recipes, { station: 'Cooking', group: 'Raw', search: '' })).toHaveLength(39);
});

test('all recipes search includes every category and handles no matches', () => {
  expect(filterRecipes(recipes, { station: 'All recipes', group: 'All', search: '' })).toHaveLength(355);
  expect(filterRecipes(recipes, { station: 'Food', group: 'All', search: 'lumber' })).toEqual([]);
});
