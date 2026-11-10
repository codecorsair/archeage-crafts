import type { Catalog, Inventory, Recipe } from './types';
import { craftingTargets, DEFAULT_MASTER, masterRecipes, type MasterProfessions } from './recipe-policy';
export type { Catalog, Inventory, Item, Recipe } from './types';

export type Requirement = { itemId: string; required: number; used: number; missing: number };
export type CraftMethod = {
  recipeId: string;
  batches: number;
  produced: number;
  inputs: { itemId: string; count: number }[];
};
export type CraftStep = {
  itemId: string;
  recipeId: string;
  batches: number;
  produced: number;
  leftover: number;
  inputs: { itemId: string; count: number }[];
  methods: CraftMethod[];
};
export type Calculation = { raw: Requirement[]; crafted: Requirement[]; steps: CraftStep[] };
export type CalculationOptions = {
  master?: Readonly<MasterProfessions>;
  externalItems?: ReadonlySet<string>;
  /** Internal trade ceiling: acquired rewards are not owned Master inputs. */
  masterInventory?: Readonly<Inventory>;
};

function safe(value: number, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds the maximum safe integer or is not a safe integer`);
  if (value < minimum) throw new Error(`${label} must be a ${minimum ? 'positive integer' : 'non-negative safe integer'}`);
  return value;
}
function add(left: number, right: number): number { return safe(left + right, 'Required quantity'); }
function multiply(left: number, right: number): number { return safe(left * right, 'Material quantity'); }
/** Aggregate shared demand before rounding; reserve direct rare inputs before Master allocation. */
export function calculate(catalog: Catalog, recipeId: string, quantity: number, inventory: Inventory = {}, options: CalculationOptions = {}): Calculation {
  safe(quantity, 'quantity', 1);
  const ids = new Set<string>();
  for (const recipe of catalog.recipes) {
    if (ids.has(recipe.id)) throw new Error(`Duplicate recipe id: ${recipe.id}`);
    ids.add(recipe.id);
  }
  const requested = catalog.recipes.find((recipe) => recipe.id === recipeId);
  if (!requested) throw new Error(`Unknown recipe: ${recipeId}`);
  const recipes = new Map(craftingTargets(catalog).map((recipe) => [recipe.itemId, recipe]));
  const masters = masterRecipes(catalog, options.master ?? DEFAULT_MASTER);
  const rareIds = new Set([...masters.values()].flatMap((recipe) => recipe.materials.map((material) => material.itemId)));
  const root = requested.itemId;
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const dependencyOrder: string[] = [];
  const visit = (itemId: string): void => {
    if (visiting.has(itemId)) throw new Error(`Crafting recipe cycle detected: ${itemId}`);
    if (visited.has(itemId)) return;
    visiting.add(itemId);
    const ordinary = itemId !== root && options.externalItems?.has(itemId) ? undefined : recipes.get(itemId);
    for (const recipe of [ordinary, masters.get(itemId)]) {
      if (!recipe) continue;
      safe(recipe.output, `Recipe ${recipe.id} output`, 1);
      if (!Array.isArray(recipe.materials) || !recipe.materials.length) throw new Error(`Ingredient data unavailable for ${recipe.name}`);
      for (const material of recipe.materials) {
        safe(material.count, `Material ${material.itemId} count`, 1);
        visit(material.itemId);
      }
    }
    visiting.delete(itemId);
    visited.add(itemId);
    dependencyOrder.push(itemId);
  };
  visit(root);
  for (const itemId of visited) safe(inventory[itemId] ?? 0, `Inventory for ${itemId}`);
  const order = [...dependencyOrder].reverse();
  const allocate = (reserved: Map<string, number>, enableMaster: boolean): { calculation: Calculation; direct: Map<string, number> } => {
    const required = new Map<string, number>([[root, quantity]]);
    const direct = new Map<string, number>();
    const spare = new Map([...rareIds].map((id) => [id, Math.max(0, ((options.masterInventory ?? inventory)[id] ?? 0) - (reserved.get(id) ?? 0))]));
    const raw: Requirement[] = [];
    const crafted: Requirement[] = [];
    const steps: CraftStep[] = [];
    for (const itemId of order) {
      const demand = required.get(itemId) ?? 0;
      const used = Math.min(demand, inventory[itemId] ?? 0);
      const missing = demand - used;
      const recipe = recipes.get(itemId);
      const external = itemId !== root && options.externalItems?.has(itemId);
      const methods: CraftMethod[] = [];
      const append = (methodRecipe: Recipe, batches: number, isMaster: boolean): void => {
        if (!batches) return;
        const inputs = methodRecipe.materials.map((material) => ({ itemId: material.itemId, count: multiply(material.count, batches) }));
        methods.push({ recipeId: methodRecipe.id, batches, produced: multiply(batches, methodRecipe.output), inputs });
        for (const input of inputs) {
          required.set(input.itemId, add(required.get(input.itemId) ?? 0, input.count));
          if (!isMaster && rareIds.has(input.itemId)) direct.set(input.itemId, add(direct.get(input.itemId) ?? 0, input.count));
        }
      };
      let residual = missing;
      const master = enableMaster ? masters.get(itemId) : undefined;
      if (master && residual) {
        const available = Math.min(...master.materials.map((material) => Math.floor((spare.get(material.itemId) ?? 0) / material.count)));
        const batches = Math.min(available, Math.ceil(residual / master.output));
        append(master, batches, true);
        for (const material of master.materials) spare.set(material.itemId, (spare.get(material.itemId) ?? 0) - multiply(batches, material.count));
        residual = Math.max(0, residual - multiply(batches, master.output));
      }
      if (recipe && !external && residual) append(recipe, Math.ceil(residual / recipe.output), false);
      const produced = methods.reduce((total, method) => add(total, method.produced), 0);
      const acquisition = external ? Math.max(0, demand - produced) : demand;
      const acquiredUsed = external ? Math.min(acquisition, inventory[itemId] ?? 0) : used;
      const requirement = { itemId, required: acquisition, used: acquiredUsed, missing: acquisition - acquiredUsed };
      if (external || !recipe) raw.push(requirement); else crafted.push(requirement);
      if (produced) {
        const inputs = new Map<string, number>();
        for (const method of methods) for (const input of method.inputs) inputs.set(input.itemId, add(inputs.get(input.itemId) ?? 0, input.count));
        steps.push({
          itemId,
          recipeId: methods[0].recipeId,
          batches: methods.reduce((total, method) => add(total, method.batches), 0),
          produced,
          leftover: Math.max(0, produced - missing),
          inputs: [...inputs].map(([itemId, count]) => ({ itemId, count })),
          methods,
        });
      }
    }
    return { calculation: { raw, crafted, steps }, direct };
  };
  // Start conservatively, then release reservations for ordinary branches removed by Master.
  let reserved = allocate(new Map(), false).direct;
  let result = allocate(reserved, true);
  for (let iteration = 0; iteration < order.length; iteration += 1) {
    if ([...rareIds].every((id) => (reserved.get(id) ?? 0) === (result.direct.get(id) ?? 0))) break;
    reserved = result.direct;
    result = allocate(reserved, true);
  }
  return result.calculation;
}
