import catalog from './catalog.json';
import type { TradeCatalog } from '../lib/trading';

// Post assignments and pack rates were supplied and confirmed by the user.
// Grand: 9-for-9, Rare: 3-for-3, Heroic: 1-for-1 on either channel.
const packCounts = { Grand: 9, Rare: 3, Heroic: 1 };
const assignments = [
  { id: 'seaglass-harbor', name: 'Seaglass Harbor', basic: ['Lumber'], boss: ['Crackling War Club', "Old Gladiator's Legacy", "Shatigon's Hammer"] },
  { id: 'watchers', name: "Watcher's", basic: ['Additive'], boss: ['Shattered Armor Plate', 'Vanguard Armor'] },
  { id: 'waterdrift', name: 'Waterdrift', basic: ['Ingot'], boss: ['Wind Blade Claw', 'Howling Sandstorm'] },
  { id: 'jubilant-village', name: 'Jubilant Village', basic: ['Leather'], boss: ['Undying Flame', "Gyldenlord's Curse", 'Constellation Horn'] },
  { id: 'stargazer', name: 'Stargazer', basic: ['Textile'], boss: ['Frostbound Serpent Scale', 'Foundations of Elven Meditation', 'Dark Sorcery Catalyst'] },
  { id: 'shadowpath-temple', name: 'Shadowpath Temple', basic: ['Archeum', 'Stone'], boss: ['Tainted Flesh', 'Brutal Nightmare'] },
];
const tiers = ['Standard', 'Fine', 'Superior'];
const itemsByName = new Map(catalog.items.map((item) => [item.name, item]));
function assignedItem(name: string, postId: string, family: 'basic' | 'boss', group: string) {
  const item = itemsByName.get(name);
  if (!item) throw new Error(`Missing assigned trade item: ${name}`);
  const grade = item.grade;
  if (grade !== 'Grand' && grade !== 'Rare' && grade !== 'Heroic') throw new Error(`Unsupported trade grade: ${name}`);
  return { itemId: item.id, name, postId, family, group, count: packCounts[grade] };
}
const materials = assignments.flatMap((post) => [
  ...post.basic.flatMap((name) => tiers.map((tier) => assignedItem(`${tier} ${name}`, post.id, 'basic', tier))),
  ...post.boss.map((name) => {
    const grade = itemsByName.get(name)?.grade;
    if (grade !== 'Rare' && grade !== 'Heroic') throw new Error(`Unsupported boss trade grade: ${name}`);
    return assignedItem(name, post.id, 'boss', grade);
  }),
]);

export type TradeAccess = { pioneer: boolean; senior: boolean };

export const droppedTradeMaterialIds: ReadonlySet<string> = new Set(materials
  .filter(material => material.family === 'boss')
  .map(material => material.itemId));

export function availableTradeData(access: TradeAccess): TradeCatalog {
  const availableItems = new Set(materials
    .filter((material) => material.family === 'boss' || material.group === 'Standard'
      || (material.group === 'Fine' && access.pioneer)
      || (material.group === 'Superior' && access.senior))
    .map((material) => material.itemId));
  return {
    ...tradeData,
    packs: tradeData.packs.filter((pack) => pack.materials.every((material) => availableItems.has(material.itemId))),
  };
}

export const tradeData: TradeCatalog = {
  sample: false,
  posts: assignments.map(({ id, name }) => ({ id, name })),
  // A pack variant per direct reward keeps multiple items at one destination
  // representable without changing the destination/channel public contract.
  // Deliveries must leave the origin post, including Archeum/Stone at Shadowpath.
  packs: materials.flatMap((origin) => materials
    .filter((destination) => destination.postId !== origin.postId && destination.family === origin.family && destination.group === origin.group)
    .map((destination) => ({
      id: `${origin.itemId}-to-${destination.itemId}`,
      name: `${origin.name} for ${destination.name}`,
      originId: origin.postId,
      materials: [{ itemId: origin.itemId, count: origin.count }],
      deliveries: [{
        destinationId: destination.postId,
        rewards: {
          pve: { kind: 'material' as const, itemId: destination.itemId, count: destination.count },
          conflict: { kind: 'material' as const, itemId: destination.itemId, count: destination.count },
        },
      }],
    }))),
};
