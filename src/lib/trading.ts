import { calculate, type Requirement } from './calculator';
import type { Catalog, Inventory } from './types';
import type { MasterProfessions } from './recipe-policy';

export type TradeChannel = 'pve' | 'conflict';
export type TradeReward =
  | { kind: 'material'; itemId: string; count: number }
  | { kind: 'gold'; min: number; max: number }
  | { kind: 'other'; label: string };
export type TradePack = {
  id: string;
  name: string;
  originId: string;
  materials: { itemId: string; count: number }[];
  deliveries: { destinationId: string; rewards: Record<TradeChannel, TradeReward> }[];
};
export type TradeCatalog = {
  sample: boolean;
  posts: { id: string; name: string }[];
  packs: TradePack[];
};
export type TradeRun = {
  day: number;
  channel: TradeChannel;
  originId: string;
  loads: { packId: string; destinationId: string; rewardItemId: string; packs: number; received: number }[];
};
export type TradePlan = {
  requirements: Requirement[];
  runs: TradeRun[];
  inputs: { itemId: string; required: number; owned: number; farm: number }[];
  unresolved: { itemId: string; count: number }[];
  rewards: { itemId: string; count: number }[];
  days: number;
};

const channels: TradeChannel[] = ['pve', 'conflict'];
function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
}
function sum(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error('Trade quantity exceeds the maximum safe integer');
  return result;
}

function validate(catalog: Catalog, data: TradeCatalog): void {
  if (typeof data.sample !== 'boolean' || !Array.isArray(data.posts) || !Array.isArray(data.packs)) {
    throw new Error('Invalid trade catalog');
  }
  if (data.posts.length > 100 || data.packs.length > 500) throw new Error('Trade catalog exceeds planning limits');
  const items = new Set(catalog.items.map((item) => item.id));
  const posts = new Set<string>();
  for (const post of data.posts) {
    if (!post.id || !post.name || posts.has(post.id)) throw new Error('Invalid or duplicate trade post');
    posts.add(post.id);
  }
  const packs = new Set<string>();
  let deliveries = 0;
  for (const pack of data.packs) {
    if (!pack.id || !pack.name || packs.has(pack.id) || !posts.has(pack.originId)) throw new Error('Invalid or duplicate trade pack');
    packs.add(pack.id);
    if (!Array.isArray(pack.materials) || !pack.materials.length || pack.materials.length > 100 || !Array.isArray(pack.deliveries)) throw new Error('Invalid trade pack ingredients or deliveries');
    const ingredients = new Set<string>();
    for (const material of pack.materials) {
      if (!items.has(material.itemId) || ingredients.has(material.itemId)) throw new Error('Unknown or duplicate trade ingredient');
      ingredients.add(material.itemId);
      positive(material.count, 'Trade ingredient count');
    }
    const destinations = new Set<string>();
    for (const delivery of pack.deliveries) {
      deliveries += 1;
      if (deliveries > 3000) throw new Error('Trade catalog exceeds planning limits');
      if (!posts.has(delivery.destinationId) || delivery.destinationId === pack.originId || destinations.has(delivery.destinationId)) throw new Error('Invalid or duplicate trade destination');
      destinations.add(delivery.destinationId);
      for (const channel of channels) {
        const reward = delivery.rewards?.[channel];
        if (!reward) throw new Error('Missing trade channel reward');
        if (reward.kind === 'material') {
          if (!items.has(reward.itemId)) throw new Error('Unknown trade reward item');
          positive(reward.count, 'Trade reward count');
        } else if (reward.kind === 'gold') {
          if (!Number.isSafeInteger(reward.min) || !Number.isSafeInteger(reward.max) || reward.min < 0 || reward.max < reward.min) throw new Error('Invalid gold reward');
        } else if (reward.kind !== 'other' || !reward.label) throw new Error('Invalid trade reward');
      }
    }
  }
}

/**
 * Use direct exchanges first, then expand uncovered crafting needs. Fill carts by
 * useful reward count, then choose
 * the earliest-day cart with the most useful output. Ties preserve catalog order.
 * This does not minimize global pickups or farming cost. Rewards never fund packs.
 * Fail visibly above 10,000 packs or 2,000,000 delivery evaluations.
 */
export function planTrades(
  catalog: Catalog,
  tradeData: TradeCatalog,
  recipeId: string,
  quantity: number,
  inventory: Inventory,
  farmable: ReadonlySet<string>,
  options: { master?: Readonly<MasterProfessions>; includeConflict?: boolean; continuation?: { runs: TradeRun[]; inputs: TradePlan['inputs']; bonusRewards: TradePlan['rewards'] } } = {},
): TradePlan {
  validate(catalog, tradeData);
  for (const [id, count] of Object.entries(inventory)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Inventory for ${id} must be a non-negative safe integer`);
  }
  const availableChannels = options.includeConflict ? channels : channels.slice(0, 1);
  const external = new Set<string>();
  for (const pack of tradeData.packs) for (const delivery of pack.deliveries) for (const channel of availableChannels) {
    const reward = delivery.rewards[channel];
    if (reward.kind === 'material') external.add(reward.itemId);
  }
  const prefix = structuredClone(options.continuation?.runs ?? []);
  const prefixDay = Math.max(1, ...prefix.map(run => run.day));
  const initialCharges = (channel: TradeChannel) => sum((prefixDay - 1) * 3, prefix.filter(run => run.day === prefixDay && run.channel === channel).length);
  const owned = new Map(Object.entries(inventory));
  for (const input of options.continuation?.inputs ?? []) {
    const available = owned.get(input.itemId) ?? 0;
    if (input.owned > available) throw new Error('Protected costs exceed snapshot');
    owned.set(input.itemId, available - input.owned);
  }
  let calculation = calculate(catalog, recipeId, quantity, inventory, { master: options.master, externalItems: external });
  let stock = new Map<string, number>();
  let remaining = new Map<string, number>();
  const packsByOrigin = new Map<string, TradePack[]>();
  for (const pack of tradeData.packs) {
    const packs = packsByOrigin.get(pack.originId) ?? [];
    packs.push(pack);
    packsByOrigin.set(pack.originId, packs);
  }
  const pickups: TradeRun[] = [];
  const inputs = new Map((options.continuation?.inputs ?? []).map(input => [input.itemId, { ...input }]));
  const rewards = new Map<string, number>();
  for (const run of prefix) for (const load of run.loads) rewards.set(load.rewardItemId, sum(rewards.get(load.rewardItemId) ?? 0, load.received));
  for (const reward of options.continuation?.bonusRewards ?? []) rewards.set(reward.itemId, sum(rewards.get(reward.itemId) ?? 0, reward.count));
  const chargeCounts: Record<TradeChannel, number> = { pve: initialCharges('pve'), conflict: initialCharges('conflict') };
  // Recalculate the whole graph to aggregate shared demands before batch rounding.
  // Only owned stock can fund packs; acquired rewards exist only in craft stock.
  const refresh = (): void => {
    const craftStock: Inventory = Object.fromEntries(owned);
    for (const [itemId, count] of rewards) craftStock[itemId] = sum(craftStock[itemId] ?? 0, count);
    calculation = calculate(catalog, recipeId, quantity, craftStock, { master: options.master, externalItems: external, masterInventory: Object.fromEntries(owned) });
    stock = new Map(owned);
    for (const need of [...calculation.raw, ...calculation.crafted]) {
      stock.set(need.itemId, Math.max(0, (owned.get(need.itemId) ?? 0) - need.required));
    }
    remaining = new Map(calculation.raw.filter((need) => need.missing > 0).map((need) => [need.itemId, need.missing]));
  };
  refresh();
  let work = 0;
  let totalPacks = prefix.reduce((total, run) => sum(total, run.loads.reduce((slots, load) => sum(slots, load.packs), 0)), 0);
  if (totalPacks > 10_000) throw new Error('Trade plan exceeds 10000 packs; reduce the requested quantity');
  while (true) {
    let best: { pickup: TradeRun; stock: Map<string, number>; remaining: Map<string, number>; inputs: { itemId: string; required: number; owned: number; farm: number }[]; useful: number } | undefined;
    for (const channel of availableChannels) for (const post of tradeData.posts) {
      const candidateStock = new Map(stock);
      const candidateRemaining = new Map(remaining);
      const candidateInputs: { itemId: string; required: number; owned: number; farm: number }[] = [];
      const pickup: TradeRun = { day: Math.floor(chargeCounts[channel] / 3) + 1, channel, originId: post.id, loads: [] };
      let useful = 0;
      for (let slot = 0; slot < 7; slot += 1) {
        let selected: { pack: TradePack; destinationId: string; itemId: string; count: number; useful: number } | undefined;
        for (const pack of packsByOrigin.get(post.id) ?? []) {
          for (const delivery of pack.deliveries) {
            if (++work > 2_000_000) throw new Error('Trade plan exceeds computation limits; reduce the requested quantity');
            const reward = delivery.rewards[channel];
            if (reward.kind !== 'material') continue;
            const needed = candidateRemaining.get(reward.itemId) ?? 0;
            if (!needed || pack.materials.some((material) => !farmable.has(material.itemId) && (candidateStock.get(material.itemId) ?? 0) < material.count)) continue;
            const benefit = Math.min(needed, reward.count);
            if (!selected || benefit > selected.useful) selected = { pack, destinationId: delivery.destinationId, itemId: reward.itemId, count: reward.count, useful: benefit };
          }
        }
        if (!selected) break;
        useful = sum(useful, selected.useful);
        candidateRemaining.set(selected.itemId, (candidateRemaining.get(selected.itemId) ?? 0) - selected.useful);
        for (const material of selected.pack.materials) {
          const owned = Math.min(candidateStock.get(material.itemId) ?? 0, material.count);
          candidateStock.set(material.itemId, (candidateStock.get(material.itemId) ?? 0) - owned);
          candidateInputs.push({ itemId: material.itemId, required: material.count, owned, farm: material.count - owned });
        }
        const load = pickup.loads.find((entry) => entry.packId === selected.pack.id && entry.destinationId === selected.destinationId);
        if (load) { load.packs += 1; load.received = sum(load.received, selected.count); }
        else pickup.loads.push({ packId: selected.pack.id, destinationId: selected.destinationId, rewardItemId: selected.itemId, packs: 1, received: selected.count });
      }
      // Prefer the earliest available channel day, then useful output per pickup.
      if (useful > 0 && (!best || pickup.day < best.pickup.day || (pickup.day === best.pickup.day && useful > best.useful))) best = { pickup, stock: candidateStock, remaining: candidateRemaining, inputs: candidateInputs, useful };
    }
    if (!best) {
      let expanded = false;
      for (const need of calculation.raw) {
        if (need.missing > 0 && external.has(need.itemId) && !farmable.has(need.itemId)
          && catalog.recipes.some((recipe) => recipe.itemId === need.itemId)) {
          external.delete(need.itemId);
          expanded = true;
        }
      }
      if (!expanded) break;
      refresh();
      continue;
    }
    totalPacks += best.pickup.loads.reduce((total, load) => total + load.packs, 0);
    if (totalPacks > 10_000) throw new Error('Trade plan exceeds 10000 packs; reduce the requested quantity');
    for (const input of best.inputs) owned.set(input.itemId, (owned.get(input.itemId) ?? 0) - input.owned);
    stock = best.stock;
    remaining = best.remaining;
    pickups.push(best.pickup);
    chargeCounts[best.pickup.channel] = sum(chargeCounts[best.pickup.channel], 1);
    for (const input of best.inputs) {
      const previous = inputs.get(input.itemId) ?? { itemId: input.itemId, required: 0, owned: 0, farm: 0 };
      inputs.set(input.itemId, { itemId: input.itemId, required: sum(previous.required, input.required), owned: sum(previous.owned, input.owned), farm: sum(previous.farm, input.farm) });
    }
    for (const load of best.pickup.loads) rewards.set(load.rewardItemId, sum(rewards.get(load.rewardItemId) ?? 0, load.received));
    refresh();
  }
  // Stages are a planning heuristic, not pickup dependencies. Repack all loads
  // by origin/channel so mixed tiers share seven-slot carts and daily budgets.
  const grouped = new Map<string, TradeRun[]>();
  for (const pickup of pickups) {
    const key = `${pickup.channel}:${pickup.originId}`;
    const carts = grouped.get(key) ?? [];
    for (const load of pickup.loads) {
      const perPack = load.received / load.packs;
      let left = load.packs;
      while (left > 0) {
        let cart = carts.at(-1);
        let filled = cart?.loads.reduce((total, entry) => total + entry.packs, 0) ?? 0;
        if (!cart || filled === 7) {
          cart = { ...pickup, loads: [] };
          carts.push(cart);
          filled = 0;
        }
        const packs = Math.min(left, 7 - filled);
        const existing = cart.loads.find((entry) => entry.packId === load.packId && entry.destinationId === load.destinationId);
        if (existing) { existing.packs += packs; existing.received = sum(existing.received, packs * perPack); }
        else cart.loads.push({ ...load, packs, received: packs * perPack });
        left -= packs;
      }
    }
    grouped.set(key, carts);
  }
  pickups.length = 0;
  chargeCounts.pve = initialCharges('pve');
  chargeCounts.conflict = initialCharges('conflict');
  for (const carts of grouped.values()) for (const cart of carts) {
    cart.day = Math.floor(chargeCounts[cart.channel] / 3) + 1;
    chargeCounts[cart.channel] = sum(chargeCounts[cart.channel], 1);
    pickups.push(cart);
  }
  pickups.sort((left, right) => left.day - right.day);
  pickups.unshift(...prefix);
  // Keep delivery demand before acquired rewards, so consumers can calculate
  // true reward surplus even when an intermediate is partly traded and crafted.
  const requirements = [...calculation.raw, ...calculation.crafted.filter((need) => rewards.has(need.itemId))]
    .map((need) => {
      const used = Math.min(need.required, owned.get(need.itemId) ?? 0);
      return { ...need, used, missing: need.required - used };
    });
  return {
    requirements, runs: pickups, inputs: [...inputs.values()],
    unresolved: [...remaining].filter(([, count]) => count > 0).map(([itemId, count]) => ({ itemId, count })),
    rewards: [...rewards].map(([itemId, count]) => ({ itemId, count })),
    days: Math.max(0, ...pickups.map((pickup) => pickup.day)),
  };
}
