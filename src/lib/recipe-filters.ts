import type { Recipe } from './types';

export type RecipeFilter = { station: string; group: string; search: string };

export function recipeGroups(recipes: Recipe[], station: string): string[] {
  if (station === 'All recipes') return [];
  return [...new Set(recipes
    .filter((recipe) => recipe.station === station)
    .map((recipe) => recipe.group)
    .filter((group): group is string => Boolean(group)))];
}

export function filterRecipes(recipes: Recipe[], filter: RecipeFilter): Recipe[] {
  const search = filter.search.trim().toLowerCase();
  return recipes.filter((recipe) =>
    (filter.station === 'All recipes' || recipe.station === filter.station) &&
    (filter.group === 'All' || recipe.group === filter.group) &&
    recipe.name.toLowerCase().includes(search));
}
