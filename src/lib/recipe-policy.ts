import type { Catalog, Recipe } from './types';

export const PROFESSIONS = ['Wildcraft', 'Cloth', 'Refining', 'Smelting'] as const;
export type MasterProfessions = Record<(typeof PROFESSIONS)[number], boolean>;
export const DEFAULT_MASTER: Readonly<MasterProfessions> = Object.freeze({ Wildcraft: false, Cloth: false, Refining: false, Smelting: false });
export const MASTER_RECIPE_IDS: ReadonlySet<string> = new Set(['60306221', '60307121', '60302221', '60403301', '60303121', '60303221']);

/** Ordinary proportional batches share a canonical smallest-output target. */
export function craftingTargets(catalog: Catalog): Recipe[] {
  const targets = new Map<string, Recipe>();
  for (const recipe of catalog.recipes) {
    if (MASTER_RECIPE_IDS.has(recipe.id)) continue;
    const previous = targets.get(recipe.itemId);
    if (!previous || recipe.output < previous.output) targets.set(recipe.itemId, recipe);
  }
  return [...targets.values()];
}

export function masterRecipes(catalog: Catalog, master: Readonly<MasterProfessions>): Map<string, Recipe> {
  return new Map(catalog.recipes.filter((recipe) => MASTER_RECIPE_IDS.has(recipe.id)
    && PROFESSIONS.some((profession) => profession === recipe.station && master[profession]))
    .map((recipe) => [recipe.itemId, recipe]));
}
