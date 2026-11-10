import type { TradeAccess } from '../data/trading';
import { craftingTargets, DEFAULT_MASTER, MASTER_RECIPE_IDS, PROFESSIONS, type MasterProfessions } from './recipe-policy';
import type { Catalog, Inventory } from './types';
import type { TradeCatalog, TradePlan, TradeReward } from './trading';

export const MAX_PLANS = 100;
export const MAX_PLANS_CHARS = 2_000_000;
export type PlanSettings = { master: MasterProfessions; tradeAccess: TradeAccess; farmable: string[]; includeConflict: boolean };
export type CraftPlan = {
  id: string; name: string; recipeId: string; quantity: number; inventory: Inventory; settings: PlanSettings;
  trade: null | { plan: TradePlan; data: TradeCatalog; inventorySnapshot: Inventory; stale: boolean; completedRuns: number[] };
  completedGathering: string[]; completedCrafts: string[]; createdAt: number; updatedAt: number;
};
function invalid(label: string): never { throw new Error(`Invalid plan: ${label}`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('expected object');
  return value as Record<string, unknown>;
}
function fields(row: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(row).some((key) => !allowed.includes(key))) invalid('unexpected field');
}
function list(value: unknown, max = 5000): unknown[] {
  if (!Array.isArray(value) || value.length > max) return invalid('array limit');
  return value;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return invalid('text');
  return value;
}
function count(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return invalid('safe integer');
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') return invalid('boolean'); return value; }
function unique<T>(values: T[], key: (value: T) => string | number): T[] {
  if (new Set(values.map(key)).size !== values.length) return invalid('duplicate entries');
  return values;
}
function add(a: number, b: number): number { return count(a + b); }
function multiply(a: number, b: number): number { return count(a * b); }
function canonicalTarget(catalog: Catalog, id: string): string {
  const recipe = catalog.recipes.find((recipe) => recipe.id === id);
  const target = craftingTargets(catalog).find((target) => target.itemId === recipe?.itemId);
  if (!recipe || !target || MASTER_RECIPE_IDS.has(id)) return invalid('target');
  // Source batch aliases are accepted only when their material ratios really match.
  const totals = (materials: typeof recipe.materials) => {
    const result = new Map<string, number>();
    for (const material of materials) result.set(material.itemId, add(result.get(material.itemId) ?? 0, count(material.count, 1)));
    return result;
  };
  const source = totals(recipe.materials), ordinary = totals(target.materials);
  if (source.size !== ordinary.size || [...source].some(([item, amount]) => multiply(amount, target.output) !== multiply(ordinary.get(item) ?? 0, recipe.output))) return invalid('non-ordinary target');
  return target.id;
}
export function createPlan(catalog: Catalog, recipeId: string, options: { id?: string; now?: number; name?: string; quantity?: number } = {}): CraftPlan {
  const now = count(options.now ?? Date.now());
  const target = canonicalTarget(catalog, recipeId);
  return { id: text(options.id ?? crypto.randomUUID()), name: text(options.name ?? catalog.recipes.find((recipe) => recipe.id === target)!.name), recipeId: target,
    quantity: count(options.quantity ?? 1, 1), inventory: {}, settings: { master: { ...DEFAULT_MASTER }, tradeAccess: { pioneer: false, senior: false }, farmable: [], includeConflict: false },
    trade: null, completedGathering: [], completedCrafts: [], createdAt: now, updatedAt: now };
}
export type PlanInputPatch = { recipeId?: string; quantity?: number; inventory?: Inventory; settings?: Partial<PlanSettings> };
/** Input edits retain the old instructions and checkmarks, but pause trade projection. */
export function updatePlanInputs(plan: CraftPlan, patch: PlanInputPatch): CraftPlan {
  if (patch.quantity !== undefined) count(patch.quantity, 1);
  if (patch.recipeId !== undefined) text(patch.recipeId);
  if (patch.inventory) for (const amount of Object.values(patch.inventory)) count(amount);
  const settings = { ...plan.settings, ...patch.settings };
  for (const profession of PROFESSIONS) bool(settings.master[profession]);
  bool(settings.tradeAccess.pioneer); bool(settings.tradeAccess.senior); bool(settings.includeConflict);
  unique(settings.farmable.map((id) => text(id)), (id) => id);
  const inventory = patch.inventory ?? plan.inventory;
  const unchanged = (patch.recipeId ?? plan.recipeId) === plan.recipeId
    && (patch.quantity ?? plan.quantity) === plan.quantity
    && [...new Set([...Object.keys(inventory), ...Object.keys(plan.inventory)])].every((id) => (inventory[id] ?? 0) === (plan.inventory[id] ?? 0))
    && PROFESSIONS.every((profession) => settings.master[profession] === plan.settings.master[profession])
    && settings.tradeAccess.pioneer === plan.settings.tradeAccess.pioneer
    && settings.tradeAccess.senior === plan.settings.tradeAccess.senior
    && settings.includeConflict === plan.settings.includeConflict
    && settings.farmable.length === plan.settings.farmable.length
    && settings.farmable.every((id) => plan.settings.farmable.includes(id));
  if (unchanged) return plan;
  return { ...plan, ...patch, inventory: { ...(patch.inventory ?? plan.inventory) }, settings: { ...settings, master: { ...settings.master }, tradeAccess: { ...settings.tradeAccess }, farmable: [...settings.farmable] },
    trade: plan.trade ? { ...plan.trade, stale: true } : null };
}
/** Parent obtains rebuild confirmation before calling. Snapshot only used packs and their posts. */
export function attachTradePlan(plan: CraftPlan, trade: TradePlan, data: TradeCatalog): CraftPlan {
  const used = new Set(trade.runs.flatMap((run) => run.loads.map((load) => load.packId)));
  const packs = data.packs.filter((pack) => used.has(pack.id));
  const posts = new Set(packs.flatMap((pack) => [pack.originId, ...pack.deliveries.map((delivery) => delivery.destinationId)]));
  const next: CraftPlan = { ...plan, completedGathering: [], completedCrafts: [], trade: { plan: structuredClone(trade), data: structuredClone({ ...data, packs, posts: data.posts.filter((post) => posts.has(post.id)) }), inventorySnapshot: { ...plan.inventory }, stale: false, completedRuns: [] } };
  projectPlanInventory(next);
  return next;
}
/** Frozen all-run preview. Farmed pack costs do not become new inventory. */
export function projectPlanInventory(plan: CraftPlan): Inventory {
  if (!plan.trade || plan.trade.stale) return { ...plan.inventory };
  const result = { ...plan.trade.inventorySnapshot };
  for (const input of plan.trade.plan.inputs) {
    const available = count(result[input.itemId] ?? 0);
    if (count(input.owned) > available) return invalid('owned costs exceed snapshot');
    result[input.itemId] = available - input.owned;
  }
  for (const reward of plan.trade.plan.rewards) result[reward.itemId] = add(result[reward.itemId] ?? 0, count(reward.count, 1));
  return result;
}
export function toggleRunComplete(plan: CraftPlan, index: number): CraftPlan {
  count(index);
  if (!plan.trade || index >= plan.trade.plan.runs.length) return invalid('run index');
  const completed = plan.trade.completedRuns;
  return { ...plan, trade: { ...plan.trade, completedRuns: completed.includes(index) ? completed.filter((value) => value !== index) : [...completed, index] } };
}
export function toggleGatheringComplete(plan: CraftPlan, key: string): CraftPlan {
  text(key, 10000);
  return { ...plan, completedGathering: plan.completedGathering.includes(key) ? plan.completedGathering.filter(value => value !== key) : [...plan.completedGathering, key] };
}
export function toggleCraftComplete(plan: CraftPlan, key: string): CraftPlan {
  text(key, 10000);
  return { ...plan, completedCrafts: plan.completedCrafts.includes(key) ? plan.completedCrafts.filter((value) => value !== key) : [...plan.completedCrafts, key] };
}

/** Bounded self-contained snapshots. Never read live trade rates or browser storage. */
export function parsePlans(value: string | null, catalog: Catalog): CraftPlan[] {
  if (value === null) return [];
  if (value.length > MAX_PLANS_CHARS) return invalid('storage size');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return invalid('malformed JSON'); }
  const items = new Set(catalog.items.map((item) => item.id));
  const ref = (value: unknown, ids = items) => { const id = text(value); if (!ids.has(id)) return invalid(`unknown reference ${id}`); return id; };
  const inventory = (value: unknown): Inventory => {
    const entries = Object.entries(object(value));
    if (entries.length > 5000) return invalid('inventory limit');
    return Object.fromEntries(entries.map(([id, amount]) => [ref(id), count(amount)]));
  };
  const amounts = (value: unknown) => unique(list(value).map((value) => { const row = object(value); return { itemId: ref(row.itemId), count: count(row.count, 1) }; }), (row) => row.itemId);
  const reward = (value: unknown): TradeReward => {
    const row = object(value);
    if (row.kind === 'material') return { kind: 'material', itemId: ref(row.itemId), count: count(row.count, 1) };
    if (row.kind === 'other') return { kind: 'other', label: text(row.label) };
    if (row.kind === 'gold') { const min = count(row.min), max = count(row.max); if (min > max) return invalid('gold range'); return { kind: 'gold', min, max }; }
    return invalid('reward kind');
  };
  return unique(list(parsed, MAX_PLANS).map((value): CraftPlan => {
    const row = object(value), settings = object(row.settings), master = object(settings.master), access = object(settings.tradeAccess);
    fields(row, ['id', 'name', 'recipeId', 'quantity', 'inventory', 'settings', 'trade', 'completedGathering', 'completedCrafts', 'createdAt', 'updatedAt']);
    fields(settings, ['master', 'tradeAccess', 'farmable', 'includeConflict']);
    fields(master, PROFESSIONS); fields(access, ['pioneer', 'senior']);
    const createdAt = count(row.createdAt), updatedAt = count(row.updatedAt);
    if (updatedAt < createdAt) return invalid('timestamps');
    const plan: CraftPlan = {
      id: text(row.id), name: text(row.name), recipeId: canonicalTarget(catalog, text(row.recipeId)), quantity: count(row.quantity, 1), inventory: inventory(row.inventory),
      settings: { master: Object.fromEntries(PROFESSIONS.map((key) => [key, bool(master[key])])) as MasterProfessions, tradeAccess: { pioneer: bool(access.pioneer), senior: bool(access.senior) }, farmable: unique(list(settings.farmable).map((id) => ref(id)), (id) => id), includeConflict: bool(settings.includeConflict) },
      trade: null, completedGathering: unique(list(row.completedGathering === undefined ? [] : row.completedGathering).map(key => text(key, 10000)), key => key), completedCrafts: unique(list(row.completedCrafts).map((key) => text(key, 10000)), (key) => key), createdAt, updatedAt,
    };
    if (row.trade === null) return plan;
    const snapshot = object(row.trade), raw = object(snapshot.plan), data = object(snapshot.data);
    fields(snapshot, ['plan', 'data', 'inventorySnapshot', 'stale', 'completedRuns']);
    fields(raw, ['requirements', 'runs', 'inputs', 'unresolved', 'rewards', 'days']);
    fields(data, ['sample', 'posts', 'packs']);
    const posts = unique(list(data.posts, 100).map((value) => { const post = object(value); return { id: text(post.id), name: text(post.name) }; }), (post) => post.id);
    const postIds = new Set(posts.map((post) => post.id));
    let deliveryCount = 0;
    const packs = unique(list(data.packs, 500).map((value) => {
      const pack = object(value), originId = ref(pack.originId, postIds), materials = amounts(pack.materials);
      if (!materials.length || materials.length > 100) return invalid('pack materials');
      return { id: text(pack.id), name: text(pack.name), originId, materials, deliveries: unique(list(pack.deliveries, 100).map((value) => {
        if (++deliveryCount > 3000) return invalid('delivery limit');
        const delivery = object(value), destinationId = ref(delivery.destinationId, postIds), rewards = object(delivery.rewards);
        if (originId === destinationId) return invalid('delivery origin');
        return { destinationId, rewards: { pve: reward(rewards.pve), conflict: reward(rewards.conflict) } };
      }), (delivery) => delivery.destinationId) };
    }), (pack) => pack.id);
    const packMap = new Map(packs.map((pack) => [pack.id, pack]));
    const inputTotals = new Map<string, number>(), rewardTotals = new Map<string, number>();
    let totalPacks = 0;
    const runs: TradePlan['runs'] = list(raw.runs, 10000).map((value) => {
      const run = object(value), channel = run.channel;
      if (channel !== 'pve' && channel !== 'conflict') return invalid('channel');
      if (channel === 'conflict' && !plan.settings.includeConflict && snapshot.stale === false) return invalid('disabled conflict run');
      const originId = ref(run.originId, postIds);
      let slots = 0;
      const loads = unique(list(run.loads, 7).map((value) => {
        const load = object(value), packId = text(load.packId), pack = packMap.get(packId);
        const destinationId = ref(load.destinationId, postIds), rewardItemId = ref(load.rewardItemId), packs = count(load.packs, 1), received = count(load.received, 1);
        const payout = pack?.deliveries.find((delivery) => delivery.destinationId === destinationId)?.rewards[channel];
        if (!pack || pack.originId !== originId || !payout || payout.kind !== 'material' || payout.itemId !== rewardItemId || multiply(payout.count, packs) !== received) return invalid('snapshot payout');
        slots = add(slots, packs); totalPacks = add(totalPacks, packs);
        for (const material of pack.materials) inputTotals.set(material.itemId, add(inputTotals.get(material.itemId) ?? 0, multiply(material.count, packs)));
        rewardTotals.set(rewardItemId, add(rewardTotals.get(rewardItemId) ?? 0, received));
        return { packId, destinationId, rewardItemId, packs, received };
      }), (load) => `${load.packId}:${load.destinationId}`);
      if (!loads.length || slots > 7 || totalPacks > 10000) return invalid('run capacity');
      return { day: count(run.day, 1), channel, originId, loads };
    });
    const requirements = unique(list(raw.requirements).map((value) => {
      const need = object(value), required = count(need.required), used = count(need.used), missing = count(need.missing);
      if (add(used, missing) !== required) return invalid('requirements');
      return { itemId: ref(need.itemId), required, used, missing };
    }), (need) => need.itemId);
    const inputs = unique(list(raw.inputs).map((value) => {
      const input = object(value), required = count(input.required), owned = count(input.owned), farm = count(input.farm);
      if (add(owned, farm) !== required) return invalid('input totals');
      return { itemId: ref(input.itemId), required, owned, farm };
    }), (input) => input.itemId);
    const rewards = amounts(raw.rewards), days = count(raw.days);
    if (days !== Math.max(0, ...runs.map((run) => run.day)) || inputs.length !== inputTotals.size || inputs.some((input) => inputTotals.get(input.itemId) !== input.required) || rewards.length !== rewardTotals.size || rewards.some((reward) => rewardTotals.get(reward.itemId) !== reward.count)) return invalid('snapshot totals');
    const completedRuns = unique(list(snapshot.completedRuns, runs.length).map((value) => { const index = count(value); if (index >= runs.length) return invalid('run progress'); return index; }), (index) => index);
    plan.trade = { plan: { requirements, runs, inputs, unresolved: amounts(raw.unresolved), rewards, days }, data: { sample: bool(data.sample), posts, packs }, inventorySnapshot: inventory(snapshot.inventorySnapshot), stale: bool(snapshot.stale), completedRuns };
    // Validate even paused historical previews, including arithmetic overflow.
    projectPlanInventory({ ...plan, trade: { ...plan.trade, stale: false } });
    return plan;
  }), (plan) => plan.id);
}
